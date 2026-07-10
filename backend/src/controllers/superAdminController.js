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
    const [
      restaurants,
      riders,
      customers,
      orders,
      revenue,
      failed,
      deliveries,
      delivered,
      failedDeliveries
    ] = await Promise.all([
      query('SELECT COUNT(*) AS cnt FROM restaurants'),

      query('SELECT COUNT(*) AS cnt FROM riders'),

      query("SELECT COUNT(*) AS cnt FROM users WHERE role='customer'"),

      query(`
        SELECT COUNT(DISTINCT o.order_id) AS cnt 
        FROM orders o 
        JOIN payments p 
          ON p.order_id=o.order_id 
        WHERE p.status='verified'
      `).catch(() => [{ cnt: 0 }]),

      query(`
        SELECT COALESCE(SUM(amount),0) AS total 
        FROM payments 
        WHERE status='verified'
      `).catch(() => [{ total: 0 }]),

      query(`
        SELECT COUNT(*) AS cnt 
        FROM payments 
        WHERE status IN ('failed','expired')
      `).catch(() => [{ cnt: 0 }]),


      // DELIVERY STATS
      query(`
        SELECT COUNT(*) AS cnt 
        FROM deliveries
      `).catch(() => [{ cnt: 0 }]),


      query(`
        SELECT COUNT(*) AS cnt 
        FROM deliveries
        WHERE status='delivered'
      `).catch(() => [{ cnt: 0 }]),


      query(`
        SELECT COUNT(*) AS cnt 
        FROM deliveries
        WHERE status='failed'
      `).catch(() => [{ cnt: 0 }]),
    ]);


    const totalDeliveries  = Number(
      safeRows(deliveries)[0]?.cnt || 0
    );

    const totalDelivered = Number(
      safeRows(delivered)[0]?.cnt || 0
    );

    const totalFailedDeliveries = Number(
      safeRows(failedDeliveries)[0]?.cnt || 0
    );


    const successRate = totalDeliveries > 0
      ? Number(((totalDelivered / totalDeliveries) * 100).toFixed(1))
      : 0;


    return res.json({
      success: true,
      data: {

        totalRestaurants: Number(
          safeRows(restaurants)[0]?.cnt || 0
        ),

        totalRiders: Number(
          safeRows(riders)[0]?.cnt || 0
        ),

        totalCustomers: Number(
          safeRows(customers)[0]?.cnt || 0
        ),

        totalOrders: Number(
          safeRows(orders)[0]?.cnt || 0
        ),

        totalRevenue: Number(
          safeRows(revenue)[0]?.total || 0
        ),

        failedPayments: Number(
          safeRows(failed)[0]?.cnt || 0
        ),


        // NEW DELIVERY STATS
        deliveryStats: {
          totalDeliveries,
          delivered: totalDelivered,
          failed: totalFailedDeliveries,
          successRate
        }

      }
    });

  } catch (err) {
    console.error('[superAdmin] getPlatformStats', err);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch platform stats.'
    });
  }
}

async function getRestaurants(req, res) {
  try {
    const { limit, current, offset } = page(req);

    const status = String(req.query.status || "").trim().toLowerCase();

    const validStatuses = ["pending", "approved", "suspended"];

    let where = "";
    let params = [];

    if (validStatuses.includes(status)) {
      where = " WHERE r.status = ?";
      params.push(status);
    }

    params.push(limit, offset);

    const rows = safeRows(await query(
      `
      SELECT
        r.*,
        u.name AS owner_name,
        u.email AS owner_email,

        (
          SELECT COUNT(DISTINCT o.order_id)
          FROM orders o
          JOIN payments p
            ON p.order_id=o.order_id
          WHERE o.restaurant_id=r.restaurant_id
            AND p.status='verified'
        ) AS total_orders,

        (
          SELECT COALESCE(SUM(p.amount),0)
          FROM payments p
          JOIN orders o
            ON o.order_id=p.order_id
          WHERE o.restaurant_id=r.restaurant_id
            AND p.status='verified'
        ) AS total_revenue

      FROM restaurants r
      JOIN users u
        ON u.user_id=r.owner_user_id

      ${where}

      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
      `,
      params
    ));

    const total = safeRows(await query(
      `
      SELECT COUNT(*) AS total
      FROM restaurants r
      ${where}
      `,
      validStatuses.includes(status) ? [status] : []
    ));

    return res.json({
      success: true,
      data: rows,
      meta: {
        page: current,
        limit,
        total: Number(total[0]?.total || 0)
      }
    });

  } catch (err) {
    console.error("[superAdmin] getRestaurants", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch restaurants."
    });
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

    const status = String(req.query.status || "").trim().toLowerCase();

    const validStatuses = ["pending", "approved", "suspended"];

    let where = "";
    let params = [];

    if (validStatuses.includes(status)) {
      where = " WHERE r.status = ?";
      params.push(status);
    }

    params.push(limit, offset);

    const rows = safeRows(await query(
      `
      SELECT
        r.*,
        u.name AS rider_name,
        u.email AS rider_email
      FROM riders r
      JOIN users u
        ON u.user_id = r.user_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
      `,
      params
    ));

    const total = safeRows(await query(
      `
      SELECT COUNT(*) AS total
      FROM riders r
      ${where}
      `,
      validStatuses.includes(status) ? [status] : []
    ));

    return res.json({
      success: true,
      data: rows,
      meta: {
        page: current,
        limit,
        total: Number(total[0]?.total || 0)
      }
    });

  } catch (err) {
    console.error("[superAdmin] getRiders", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch riders."
    });
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

    const role = String(req.query.role || "").trim().toLowerCase();

    const validRoles = [
      "customer",
      "restaurant_admin",
      "rider",
      "admin",
      "super_admin"
    ];

    let where = "";
    let params = [];

    if (validRoles.includes(role)) {
      where = " WHERE u.role = ?";
      params.push(role);
    }

    params.push(limit, offset);

    const rows = safeRows(await query(
      `
      SELECT
        u.user_id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.is_active,
        u.created_at,

        (
          SELECT COUNT(DISTINCT o.order_id)
          FROM orders o
          JOIN payments p
            ON p.order_id=o.order_id
          WHERE o.user_id=u.user_id
            AND p.status='verified'
        ) AS order_count

      FROM users u

      ${where}

      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
      `,
      params
    ));

    const total = safeRows(await query(
      `
      SELECT COUNT(*) AS total
      FROM users u
      ${where}
      `,
      validRoles.includes(role) ? [role] : []
    ));

    return res.json({
      success: true,
      data: rows,
      meta: {
        page: current,
        limit,
        total: Number(total[0]?.total || 0)
      }
    });

  } catch (err) {
    console.error("[superAdmin] getUsers", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users."
    });
  }
}

async function getOrders(req, res) {
  try {
    const { limit, current, offset } = page(req);
    const rows = safeRows(await query(`SELECT o.*, u.name AS customer_name, r.name AS restaurant_name, p.status AS payment_status, p.amount AS payment_amount
      FROM orders o
      JOIN users u ON u.user_id=o.user_id
      JOIN restaurants r ON r.restaurant_id=o.restaurant_id
      JOIN payments p ON p.order_id=o.order_id AND p.status='verified'
      ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, [limit, offset]));
    const total = safeRows(await query("SELECT COUNT(DISTINCT o.order_id) AS total FROM orders o JOIN payments p ON p.order_id=o.order_id WHERE p.status='verified'"));
    return res.json({ success: true, data: rows, meta: { page: current, limit, total: Number(total[0]?.total || 0) } });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to fetch orders.' }); }
}

async function getPlatformAnalytics(req, res) {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 30);
    const ordersPerDay = safeRows(await query(`SELECT DATE(o.created_at) AS date, COUNT(DISTINCT o.order_id) AS order_count, COALESCE(SUM(p.amount),0) AS revenue
      FROM orders o JOIN payments p ON p.order_id=o.order_id AND p.status='verified'
      WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(o.created_at) ORDER BY date ASC`, [days]));
    return res.json({ success: true, data: { ordersPerDay } });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to fetch analytics.' }); }
}

async function getSettings(req, res) {
  try {
    return res.json({ success: true, data: safeRows(await query('SELECT setting_key, setting_value, setting_group, label FROM platform_settings ORDER BY setting_group, setting_key')) });
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
