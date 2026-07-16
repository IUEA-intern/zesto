'use strict';

const { query } = require('../config/db');
const { log } = require('../config/audit');

function safeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => {
    const out = {};
    for (const key of Object.keys(r || {})) {
      out[key] = typeof r[key] === 'bigint' ? Number(r[key]) : r[key];
    }
    return out;
  });
}

function page(req) {
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const current = Math.max(1, parseInt(req.query.page) || 1);
  return { limit, current, offset: (current - 1) * limit };
}

async function getPlatformStats(req, res) {
  try {
    const [restaurants, riders, customers, orders, revenue, failed] = await Promise.all([
      query('SELECT COUNT(*) AS cnt FROM restaurants'),
      query('SELECT COUNT(*) AS cnt FROM riders'),
      query("SELECT COUNT(*) AS cnt FROM users WHERE role='customer'"),
      query("SELECT COUNT(DISTINCT o.order_id) AS cnt FROM orders o JOIN payments p ON p.order_id=o.order_id WHERE p.status='verified'").catch(() => [{ cnt: 0 }]),
      query("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='verified'").catch(() => [{ total: 0 }]),
      query("SELECT COUNT(*) AS cnt FROM payments WHERE status IN ('failed','expired')").catch(() => [{ cnt: 0 }]),
    ]);
    return res.json({ success: true, data: {
      totalRestaurants: Number(safeRows(restaurants)[0]?.cnt || 0),
      totalRiders: Number(safeRows(riders)[0]?.cnt || 0),
      totalCustomers: Number(safeRows(customers)[0]?.cnt || 0),
      totalOrders: Number(safeRows(orders)[0]?.cnt || 0),
      totalRevenue: Number(safeRows(revenue)[0]?.total || 0),
      failedPayments: Number(safeRows(failed)[0]?.cnt || 0),
    } });
  } catch (err) {
    console.error('[superAdmin] getPlatformStats', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch platform stats.' });
  }
}

async function getRestaurants(req, res) {
  try {
    const { limit, current, offset } = page(req);
    const status = req.query.status || null;
    let sql = `SELECT r.*, u.name AS owner_name, u.email AS owner_email,
              (SELECT COUNT(DISTINCT o.order_id) FROM orders o JOIN payments p ON p.order_id=o.order_id WHERE o.restaurant_id=r.restaurant_id AND p.status='verified') AS total_orders,
              (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN orders o ON o.order_id=p.order_id WHERE o.restaurant_id=r.restaurant_id AND p.status='verified') AS total_revenue
       FROM restaurants r JOIN users u ON u.user_id=r.owner_user_id`;
    const params = [];
    if (status) { sql += ' WHERE r.status = ?'; params.push(status); }
    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = safeRows(await query(sql, params));

    const countSql = `SELECT COUNT(*) AS total FROM restaurants${status ? ' WHERE status = ?' : ''}`;
    const total = safeRows(await query(countSql, status ? [status] : []));
    return res.json({ success: true, data: rows, meta: { page: current, limit, total: Number(total[0]?.total || 0) } });
  } catch (err) {
    console.error('[superAdmin] getRestaurants', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurants.' });
  }
}

async function getRestaurantById(req, res) {
  try {
    const id = parseInt(req.params.id);
    const rows = safeRows(await query('SELECT * FROM restaurants WHERE restaurant_id=?', [id]));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    const orders = safeRows(await query("SELECT COUNT(DISTINCT o.order_id) AS cnt FROM orders o JOIN payments p ON p.order_id=o.order_id WHERE o.restaurant_id=? AND p.status='verified'", [id]).catch(() => [{ cnt: 0 }]));
    const revenue = safeRows(await query("SELECT COALESCE(SUM(p.amount),0) AS total FROM payments p JOIN orders o ON o.order_id=p.order_id WHERE o.restaurant_id=? AND p.status='verified'", [id]).catch(() => [{ total: 0 }]));
    return res.json({ success: true, data: { ...rows[0], order_count: Number(orders[0]?.cnt || 0), total_revenue: Number(revenue[0]?.total || 0) } });
  } catch (err) {
    console.error('[superAdmin] getRestaurantById', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurant.' });
  }
}

async function setRestaurantStatus(req, res, status) {
  const id = parseInt(req.params.id);
  await query('UPDATE restaurants SET status=? WHERE restaurant_id=?', [status, id]);
  await log({ actorId: req.user?.user_id || req.user?.id, actorRole: req.user?.role, action: `RESTAURANT_${status.toUpperCase()}`, entityType: 'restaurant', entityId: id, ip: req.ip });
  return res.json({ success: true, message: `Restaurant ${status}.` });
}

async function approveRestaurant(req, res) {
  try { return await setRestaurantStatus(req, res, 'approved'); }
  catch (err) { return res.status(500).json({ success: false, message: 'Failed to approve restaurant.' }); }
}

async function suspendRestaurant(req, res) {
  try { return await setRestaurantStatus(req, res, 'suspended'); }
  catch (err) { return res.status(500).json({ success: false, message: 'Failed to suspend restaurant.' }); }
}

async function getRiders(req, res) {
  try {
    const { limit, current, offset } = page(req);
    const status = req.query.status || null;
    // ONLINE_TIMEOUT_SECONDS: how long we keep showing a rider as
    // online after their last heartbeat (app open, availability toggle,
    // or socket rider:join/ping) before treating a stale connection as
    // offline. Riders app pings roughly every 15s while connected, so
    // 45s gives a couple of missed beats' worth of slack for normal
    // network jitter without showing a genuinely-gone rider as online.
    const ONLINE_TIMEOUT_SECONDS = 45;

    let sql = `SELECT r.*, u.name AS rider_name, u.email AS rider_email,
        (r.is_available = 1 AND r.last_seen_at IS NOT NULL
          AND r.last_seen_at >= DATE_SUB(NOW(), INTERVAL ${ONLINE_TIMEOUT_SECONDS} SECOND)) AS online,
        COALESCE(dstats.deliveries_completed, 0) AS deliveries_completed,
        COALESCE(dstats.deliveries_failed, 0)    AS deliveries_failed
      FROM riders r
      JOIN users u ON u.user_id = r.user_id
      LEFT JOIN (
        SELECT rider_id,
          SUM(status = 'delivered') AS deliveries_completed,
          SUM(status = 'failed')    AS deliveries_failed
        FROM deliveries
        GROUP BY rider_id
      ) dstats ON dstats.rider_id = r.rider_id`;
    const params = [];
    if (status) { sql += ' WHERE r.status = ?'; params.push(status); }
    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = safeRows(await query(sql, params));

    const countSql = `SELECT COUNT(*) AS total FROM riders${status ? ' WHERE status = ?' : ''}`;
    const total = safeRows(await query(countSql, status ? [status] : []));
    return res.json({ success: true, data: rows, meta: { page: current, limit, total: Number(total[0]?.total || 0) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch riders.' });
  }
}

async function approveRider(req, res) {
  try {
    await query("UPDATE riders SET status='approved' WHERE rider_id=?", [parseInt(req.params.id)]);
    return res.json({ success: true, message: 'Rider approved.' });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to approve rider.' }); }
}

async function suspendRider(req, res) {
  try {
    await query("UPDATE riders SET status='suspended', is_available=0 WHERE rider_id=?", [parseInt(req.params.id)]);
    return res.json({ success: true, message: 'Rider suspended.' });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to suspend rider.' }); }
}

async function getUsers(req, res) {
  try {
    const { limit, current, offset } = page(req);
    const role = req.query.role || null;
    let sql = `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
      (SELECT COUNT(DISTINCT o.order_id) FROM orders o JOIN payments p ON p.order_id=o.order_id WHERE o.user_id=u.user_id AND p.status='verified') AS order_count
      FROM users u`;
    const params = [];
    if (role) { sql += ' WHERE u.role = ?'; params.push(role); }
    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = safeRows(await query(sql, params));

    const countSql = `SELECT COUNT(*) AS total FROM users${role ? ' WHERE role = ?' : ''}`;
    const total = safeRows(await query(countSql, role ? [role] : []));
    return res.json({ success: true, data: rows, meta: { page: current, limit, total: Number(total[0]?.total || 0) } });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to fetch users.' }); }
}

async function getOrders(req, res) {
  try {
    const { limit, current, offset } = page(req);
    const status = req.query.status || null;
    let sql = `SELECT o.*, u.name AS customer_name, r.name AS restaurant_name, p.status AS payment_status, p.amount AS payment_amount
      FROM orders o
      JOIN users u ON u.user_id=o.user_id
      JOIN restaurants r ON r.restaurant_id=o.restaurant_id
      JOIN payments p ON p.order_id=o.order_id AND p.status='verified'`;
    const params = [];
    if (status) { sql += ' WHERE o.status = ?'; params.push(status); }
    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = safeRows(await query(sql, params));

    const countSql = `SELECT COUNT(DISTINCT o.order_id) AS total FROM orders o JOIN payments p ON p.order_id=o.order_id WHERE p.status='verified'${status ? ' AND o.status = ?' : ''}`;
    const total = safeRows(await query(countSql, status ? [status] : []));
    return res.json({ success: true, data: rows, meta: { page: current, limit, total: Number(total[0]?.total || 0) } });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to fetch orders.' }); }
}

async function getPlatformAnalytics(req, res) {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 30);

    const [ordersPerDay, topRestaurants, revenueByRestaurant, deliveryRows] = await Promise.all([
      safeRows(await query(`SELECT DATE(o.created_at) AS date, COUNT(DISTINCT o.order_id) AS order_count, COALESCE(SUM(p.amount),0) AS revenue
        FROM orders o JOIN payments p ON p.order_id=o.order_id AND p.status='verified'
        WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(o.created_at) ORDER BY date ASC`, [days])),

      // Top restaurants by order volume in the selected window
      safeRows(await query(`SELECT r.name,
          COUNT(DISTINCT o.order_id) AS total_orders,
          COALESCE(SUM(p.amount),0) AS total_revenue
        FROM restaurants r
        JOIN orders o ON o.restaurant_id = r.restaurant_id
        JOIN payments p ON p.order_id = o.order_id AND p.status = 'verified'
        WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY r.restaurant_id, r.name
        ORDER BY total_orders DESC
        LIMIT 10`, [days])),

      // Same window, ranked by revenue instead of order count
      safeRows(await query(`SELECT r.name,
          COUNT(DISTINCT o.order_id) AS order_count,
          COALESCE(SUM(p.amount),0) AS revenue
        FROM restaurants r
        JOIN orders o ON o.restaurant_id = r.restaurant_id
        JOIN payments p ON p.order_id = o.order_id AND p.status = 'verified'
        WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY r.restaurant_id, r.name
        ORDER BY revenue DESC
        LIMIT 10`, [days])),

      // Delivery success/failure counts in the selected window
      safeRows(await query(`SELECT d.status, COUNT(*) AS cnt
        FROM deliveries d
        WHERE d.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY d.status`, [days])),
    ]);

    const delivered = Number(deliveryRows.find(r => r.status === 'delivered')?.cnt || 0);
    const failed    = Number(deliveryRows.find(r => r.status === 'failed')?.cnt || 0);
    const total     = deliveryRows.reduce((sum, r) => sum + Number(r.cnt || 0), 0);
    const resolved  = delivered + failed; // success rate only makes sense over completed deliveries
    const deliveryStats = {
      total,
      delivered,
      failed,
      successRate: resolved ? Math.round((delivered / resolved) * 100) : null,
    };

    return res.json({
      success: true,
      data: {
        ordersPerDay,
        topRestaurants: topRestaurants.map(r => ({ ...r, total_orders: Number(r.total_orders) || 0, total_revenue: Number(r.total_revenue) || 0 })),
        revenueByRestaurant: revenueByRestaurant.map(r => ({ ...r, order_count: Number(r.order_count) || 0, revenue: Number(r.revenue) || 0 })),
        deliveryStats,
      },
    });
  } catch (err) {
    console.error('[superAdmin] getPlatformAnalytics', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
}

async function getSettings(req, res) {
  try {
    const rows = safeRows(await query('SELECT setting_key, setting_value, setting_group, label FROM platform_settings ORDER BY setting_group, setting_key'));
    // Group by setting_group -> { [setting_key]: { value, label } }
    // (the admin dashboard's loadSettings() expects this nested shape so
    // saved values are correctly restored into the form after a refresh)
    const grouped = {};
    for (const row of rows) {
      const group = row.setting_group || 'general';
      if (!grouped[group]) grouped[group] = {};
      grouped[group][row.setting_key] = { value: row.setting_value, label: row.label };
    }
    return res.json({ success: true, data: grouped });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to fetch settings.' }); }
}

async function updateSettings(req, res) {
  try {
    for (const [key, value] of Object.entries(req.body || {})) {
      await query('UPDATE platform_settings SET setting_value=? WHERE setting_key=?', [String(value), key]);
    }
    return res.json({ success: true, message: 'Settings updated.' });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to update settings.' }); }
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
  getUsers,
  getOrders,
  getPlatformAnalytics,
  getSettings,
  updateSettings,
};
