'use strict';

/**
 * superAdminController.js
 * Handles platform-wide management: restaurants, riders, platform stats,
 * platform settings, and advanced analytics.
 */

const { query } = require('../config/db');
const { log, ACTIONS } = require('../config/audit');

const DB_NAME = process.env.DB_NAME || 'zesto_db_2';

function safeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => {
    if (!r || typeof r !== 'object') return r;
    const out = {};
    for (const k of Object.keys(r)) {
      const v = r[k];
      out[k] = typeof v === 'bigint' ? Number(v) : v;
    }
    return out;
  });
}

async function tableExists(name) {
  const rows = safeRows(await query(
    'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
    [DB_NAME, name]
  ));
  return Number(rows[0]?.cnt || 0) > 0;
}

/* ── Platform Stats ────────────────────────────────────────── */
async function getPlatformStats(req, res) {
  try {
    const [
      totalRestaurants, pendingRestaurants,
      totalRiders,      pendingRiders,
      totalCustomers,   totalOrders,
      revenueRows,      failedPayments,
    ] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM restaurants`),
      query(`SELECT COUNT(*) AS cnt FROM restaurants WHERE status='pending'`),
      query(`SELECT COUNT(*) AS cnt FROM riders`),
      query(`SELECT COUNT(*) AS cnt FROM riders WHERE status='pending'`),
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role='customer'`),
      query(`SELECT COUNT(*) AS cnt FROM orders`),
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='verified'`).catch(() => [{ total: 0 }]),
      query(`SELECT COUNT(*) AS cnt FROM payments WHERE status='failed'`).catch(() => [{ cnt: 0 }]),
    ]);

    const commissionRate = await getSettingValue('restaurant_commission', 15);
    const totalRevenue   = Number(safeRows(revenueRows)[0]?.total || 0);
    const commission     = (totalRevenue * Number(commissionRate)) / 100;

    return res.json({
      success: true,
      data: {
        totalRestaurants:  Number(safeRows(totalRestaurants)[0]?.cnt || 0),
        pendingRestaurants: Number(safeRows(pendingRestaurants)[0]?.cnt || 0),
        totalRiders:       Number(safeRows(totalRiders)[0]?.cnt || 0),
        pendingRiders:     Number(safeRows(pendingRiders)[0]?.cnt || 0),
        totalCustomers:    Number(safeRows(totalCustomers)[0]?.cnt || 0),
        totalOrders:       Number(safeRows(totalOrders)[0]?.cnt || 0),
        totalRevenue,
        failedPayments:    Number(safeRows(failedPayments)[0]?.cnt || 0),
        platformCommission: commission,
      },
    });
  } catch (err) {
    console.error('[superAdmin] getPlatformStats', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch platform stats.' });
  }
}

/* ── Restaurants ───────────────────────────────────────────── */
async function getRestaurants(req, res) {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;

    let sql = `
      SELECT r.*,
             u.name  AS owner_name,
             u.email AS owner_email,
             u.phone AS owner_phone,
             (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.restaurant_id) AS total_orders,
             (SELECT COALESCE(SUM(p.amount),0) FROM payments p
              JOIN orders o ON o.order_id = p.order_id
              WHERE o.restaurant_id = r.restaurant_id AND p.status='verified') AS total_revenue
      FROM restaurants r
      JOIN users u ON u.user_id = r.owner_user_id
      WHERE 1=1`;

    const params = [];
    if (status) { sql += ' AND r.status = ?'; params.push(status); }
    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const countSql = `SELECT COUNT(*) AS total FROM restaurants${status ? ' WHERE status=?' : ''}`;
    const [rows, countRow] = await Promise.all([
      safeRows(await query(sql, params)),
      safeRows(await query(countSql, status ? [status] : [])),
    ]);

    return res.json({
      success: true,
      data:    rows,
      meta:    { page, limit, total: Number(countRow[0]?.total || 0) },
    });
  } catch (err) {
    console.error('[superAdmin] getRestaurants', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurants.' });
  }
}

async function getRestaurantById(req, res) {
  try {
    const id = parseInt(req.params.id);
    const rows = safeRows(await query(`
      SELECT r.*, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
      FROM restaurants r
      JOIN users u ON u.user_id = r.owner_user_id
      WHERE r.restaurant_id = ?`, [id]));

    if (!rows.length) return res.status(404).json({ success: false, message: 'Restaurant not found.' });

    const [products, orders, revenue] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM products WHERE restaurant_id=?`, [id]),
      query(`SELECT COUNT(*) AS cnt FROM orders WHERE restaurant_id=?`, [id]),
      query(`SELECT COALESCE(SUM(p.amount),0) AS total FROM payments p
             JOIN orders o ON o.order_id=p.order_id
             WHERE o.restaurant_id=? AND p.status='verified'`, [id]).catch(() => [{ total: 0 }]),
    ]);

    return res.json({
      success: true,
      data: {
        ...rows[0],
        product_count:  Number(safeRows(products)[0]?.cnt || 0),
        order_count:    Number(safeRows(orders)[0]?.cnt  || 0),
        total_revenue:  Number(safeRows(revenue)[0]?.total || 0),
      },
    });
  } catch (err) {
    console.error('[superAdmin] getRestaurantById', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurant.' });
  }
}

async function approveRestaurant(req, res) {
  try {
    const id = parseInt(req.params.id);
    const rows = safeRows(await query('SELECT status FROM restaurants WHERE restaurant_id=?', [id]));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Restaurant not found.' });

    await query('UPDATE restaurants SET status=? WHERE restaurant_id=?', ['approved', id]);
    await log({
      actorId: req.user?.user_id || req.user?.id,
      actorRole: req.user?.role,
      action: 'RESTAURANT_APPROVED',
      entityType: 'restaurant', entityId: id,
      oldValue: { status: rows[0].status }, newValue: { status: 'approved' },
      ip: req.ip,
    });
    return res.json({ success: true, message: 'Restaurant approved.' });
  } catch (err) {
    console.error('[superAdmin] approveRestaurant', err);
    return res.status(500).json({ success: false, message: 'Failed to approve restaurant.' });
  }
}

async function suspendRestaurant(req, res) {
  try {
    const id = parseInt(req.params.id);
    const rows = safeRows(await query('SELECT status FROM restaurants WHERE restaurant_id=?', [id]));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Restaurant not found.' });

    await query('UPDATE restaurants SET status=? WHERE restaurant_id=?', ['suspended', id]);
    await log({
      actorId: req.user?.user_id || req.user?.id,
      actorRole: req.user?.role,
      action: 'RESTAURANT_SUSPENDED',
      entityType: 'restaurant', entityId: id,
      oldValue: { status: rows[0].status }, newValue: { status: 'suspended' },
      ip: req.ip,
    });
    return res.json({ success: true, message: 'Restaurant suspended.' });
  } catch (err) {
    console.error('[superAdmin] suspendRestaurant', err);
    return res.status(500).json({ success: false, message: 'Failed to suspend restaurant.' });
  }
}

/* ── Riders ────────────────────────────────────────────────── */
async function getRiders(req, res) {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;

    let sql = `
      SELECT r.*, u.name AS rider_name, u.email AS rider_email, u.phone AS rider_phone,
             (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.rider_id AND d.status='delivered') AS deliveries_completed,
             (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.rider_id AND d.status='failed') AS deliveries_failed
      FROM riders r
      JOIN users u ON u.user_id = r.user_id
      WHERE 1=1`;

    const params = [];
    if (status) { sql += ' AND r.status = ?'; params.push(status); }
    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const countSql = `SELECT COUNT(*) AS total FROM riders${status ? ' WHERE status=?' : ''}`;
    const [rows, countRow] = await Promise.all([
      safeRows(await query(sql, params)),
      safeRows(await query(countSql, status ? [status] : [])),
    ]);

    return res.json({
      success: true,
      data:    rows,
      meta:    { page, limit, total: Number(countRow[0]?.total || 0) },
    });
  } catch (err) {
    console.error('[superAdmin] getRiders', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch riders.' });
  }
}

async function approveRider(req, res) {
  try {
    const id = parseInt(req.params.id);
    const rows = safeRows(await query('SELECT status, user_id FROM riders WHERE rider_id=?', [id]));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Rider not found.' });

    await query('UPDATE riders SET status=? WHERE rider_id=?', ['approved', id]);
    await query('UPDATE users SET role=? WHERE user_id=?', ['rider', rows[0].user_id]);
    await log({
      actorId: req.user?.user_id || req.user?.id,
      actorRole: req.user?.role,
      action: 'RIDER_APPROVED',
      entityType: 'rider', entityId: id,
      oldValue: { status: rows[0].status }, newValue: { status: 'approved' },
      ip: req.ip,
    });
    return res.json({ success: true, message: 'Rider approved.' });
  } catch (err) {
    console.error('[superAdmin] approveRider', err);
    return res.status(500).json({ success: false, message: 'Failed to approve rider.' });
  }
}

async function suspendRider(req, res) {
  try {
    const id = parseInt(req.params.id);
    const rows = safeRows(await query('SELECT status FROM riders WHERE rider_id=?', [id]));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Rider not found.' });

    await query('UPDATE riders SET status=?, is_available=0 WHERE rider_id=?', ['suspended', id]);
    await log({
      actorId: req.user?.user_id || req.user?.id,
      actorRole: req.user?.role,
      action: 'RIDER_SUSPENDED',
      entityType: 'rider', entityId: id,
      oldValue: { status: rows[0].status }, newValue: { status: 'suspended' },
      ip: req.ip,
    });
    return res.json({ success: true, message: 'Rider suspended.' });
  } catch (err) {
    console.error('[superAdmin] suspendRider', err);
    return res.status(500).json({ success: false, message: 'Failed to suspend rider.' });
  }
}

/* ── Platform Analytics ────────────────────────────────────── */
async function getPlatformAnalytics(req, res) {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 30);

    const [
      revenueByRestaurant,
      topRestaurants,
      ordersPerDay,
      deliverySuccessRows,
    ] = await Promise.all([
      query(`
        SELECT r.name, r.restaurant_id,
               COUNT(o.order_id)         AS order_count,
               COALESCE(SUM(p.amount),0) AS revenue
        FROM restaurants r
        LEFT JOIN orders o ON o.restaurant_id = r.restaurant_id
                           AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        LEFT JOIN payments p ON p.order_id = o.order_id AND p.status='verified'
        GROUP BY r.restaurant_id, r.name
        ORDER BY revenue DESC LIMIT 10`, [days]),
      query(`
        SELECT r.name, r.restaurant_id,
               COUNT(o.order_id) AS total_orders,
               COALESCE(SUM(p.amount),0) AS total_revenue
        FROM restaurants r
        JOIN orders o ON o.restaurant_id = r.restaurant_id
        LEFT JOIN payments p ON p.order_id = o.order_id AND p.status='verified'
        WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY r.restaurant_id, r.name
        ORDER BY total_orders DESC LIMIT 5`, [days]),
      query(`
        SELECT DATE(created_at) AS date,
               COUNT(*) AS order_count,
               COALESCE(SUM(total),0) AS revenue
        FROM orders
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC`, [days]),
      query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN status='failed'    THEN 1 ELSE 0 END) AS failed
        FROM deliveries
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`, [days]).catch(() => [{ total: 0, delivered: 0, failed: 0 }]),
    ]);

    const ds = safeRows(deliverySuccessRows)[0] || { total: 0, delivered: 0, failed: 0 };
    const successRate = ds.total > 0 ? ((ds.delivered / ds.total) * 100).toFixed(1) : null;

    return res.json({
      success: true,
      data: {
        revenueByRestaurant: safeRows(revenueByRestaurant),
        topRestaurants:      safeRows(topRestaurants),
        ordersPerDay:        safeRows(ordersPerDay),
        deliveryStats: { ...ds, successRate },
      },
    });
  } catch (err) {
    console.error('[superAdmin] getPlatformAnalytics', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
}

/* ── Platform Settings ─────────────────────────────────────── */
async function getSettingValue(key, defaultVal = null) {
  try {
    const rows = safeRows(await query('SELECT setting_value FROM platform_settings WHERE setting_key=?', [key]));
    return rows[0]?.setting_value ?? defaultVal;
  } catch { return defaultVal; }
}

async function getSettings(req, res) {
  try {
    const rows = safeRows(await query(
      'SELECT setting_key, setting_value, setting_group, label FROM platform_settings ORDER BY setting_group, setting_key'
    ));
    // Group by setting_group
    const grouped = rows.reduce((acc, row) => {
      const g = row.setting_group || 'general';
      if (!acc[g]) acc[g] = {};
      acc[g][row.setting_key] = { value: row.setting_value, label: row.label };
      return acc;
    }, {});
    return res.json({ success: true, data: grouped });
  } catch (err) {
    console.error('[superAdmin] getSettings', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
}

async function updateSettings(req, res) {
  try {
    const settings = req.body; // { key: value, ... }
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'Settings object required.' });
    }

    const entries = Object.entries(settings);
    for (const [k, v] of entries) {
      await query(
        'UPDATE platform_settings SET setting_value=? WHERE setting_key=?',
        [String(v), k]
      );
    }

    await log({
      actorId: req.user?.user_id || req.user?.id,
      actorRole: req.user?.role,
      action: 'PLATFORM_SETTINGS_UPDATED',
      entityType: 'settings',
      newValue: settings,
      ip: req.ip,
    });

    return res.json({ success: true, message: 'Settings updated.' });
  } catch (err) {
    console.error('[superAdmin] updateSettings', err);
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
}

/* ── Users (platform-wide) ─────────────────────────────────── */
/**
 * NEW: Super Admin Orders endpoint
 * Platform-wide view of all orders with payment verification
 * Only shows paid orders to platform admins
 */
async function getOrders(req, res) {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;
    const restaurantId = req.query.restaurant_id || null;

    const paymentsAvailable = await tableExists('payments');
    
    // Only show orders with verified payments
    let sql = `SELECT DISTINCT o.*, 
                      u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
                      r.name AS restaurant_name`;
    if (paymentsAvailable) {
      sql += `, p.status AS payment_status, p.method AS payment_method, p.amount AS payment_amount`;
    }
    
    sql += ` FROM orders o 
             JOIN users u ON u.user_id = o.user_id
             JOIN restaurants r ON r.restaurant_id = o.restaurant_id`;
    
    if (paymentsAvailable) {
      sql += ` INNER JOIN payments p ON p.order_id = o.order_id AND p.status='verified'`;
    }
    
    sql += ` WHERE 1=1`;

    const params = [];
    if (status) { sql += ' AND o.status = ?'; params.push(status); }
    if (restaurantId) { sql += ' AND o.restaurant_id = ?'; params.push(parseInt(restaurantId)); }
    
    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    // Count query also filters by verified payments and restaurant
    let countQuery = paymentsAvailable
      ? `SELECT COUNT(DISTINCT o.order_id) AS total FROM orders o
         JOIN payments p ON o.order_id = p.order_id
         WHERE p.status='verified'`
      : `SELECT COUNT(*) AS total FROM orders WHERE 1=1`;
    
    if (status) countQuery += ` AND o.status=?`;
    if (restaurantId) countQuery += ` AND o.restaurant_id=?`;

    const [orders, countRow] = await Promise.all([
      safeRows(await query(sql, params)),
      safeRows(await query(countQuery, [status, restaurantId].filter(x => x))),
    ]);

    return res.json({
      success: true,
      data:    orders,
      meta:    { page, limit, total: Number(countRow[0]?.total) || 0 },
    });
  } catch (err) {
    console.error('[superAdmin] getOrders', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
}

async function getUsers(req, res) {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const role   = req.query.role || null;

    let sql = `SELECT user_id, name, email, phone,
                      role, is_active, last_login, created_at,
                      (SELECT COUNT(*) FROM orders o WHERE o.user_id = users.user_id) AS order_count
               FROM users WHERE 1=1`;
    const params = [];
    if (role) { sql += ' AND role=?'; params.push(role); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const countSql = `SELECT COUNT(*) AS total FROM users${role ? ' WHERE role=?' : ''}`;
    const [rows, countRow] = await Promise.all([
      safeRows(await query(sql, params)),
      safeRows(await query(countSql, role ? [role] : [])),
    ]);

    return res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number(countRow[0]?.total || 0) },
    });
  } catch (err) {
    console.error('[superAdmin] getUsers', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
}

module.exports = {
  getPlatformStats,
  getRestaurants,
  getRestaurantById,
  approveRestaurant,
  suspendRestaurant,
  getRiders,
  approveRider,
  suspendRider,
  getPlatformAnalytics,
  getSettings,
  updateSettings,
  getOrders,
  getUsers,
};
