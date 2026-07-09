'use strict';

/**
 * routes/rider.js
 * All endpoints require rider role (requireRider middleware).
 *
 * GET  /api/rider/profile              — rider profile + approval status
 * PUT  /api/rider/availability         — toggle online/offline
 * GET  /api/rider/available-orders     — open pool of ready_for_pickup orders
 * POST /api/rider/accept-order/:id     — atomically claim a delivery
 * GET  /api/rider/active-delivery      — current assigned delivery
 * POST /api/rider/orders/:id/pickup    — mark order as picked up
 * POST /api/rider/orders/:id/confirm-delivery — confirm delivery with 6-digit code
 * GET  /api/rider/history              — completed/failed deliveries
 */

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');
const { requireRider } = require('../middleware/auth');
const { log }   = require('../config/audit');

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

router.use(requireRider);

/* ── GET /api/rider/profile ─────────────────────────────────── */
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const rows = safeRows(await query(
      `SELECT r.rider_id, r.vehicle_type, r.vehicle_number, r.national_id,
              r.is_available, r.status, r.created_at,
              u.name, u.email, u.phone, u.avatar_url
       FROM riders r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.user_id = ?`,
      [userId]
    ));
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Rider profile not found.' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[rider] GET /profile', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
});

/* ── PUT /api/rider/availability ───────────────────────────── */
router.put('/availability', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { is_available } = req.body;

    if (typeof is_available !== 'boolean' && is_available !== 0 && is_available !== 1) {
      return res.status(400).json({ success: false, message: 'is_available must be true or false.' });
    }

    // Only approved riders can go online
    const rows = safeRows(await query(
      'SELECT rider_id, status FROM riders WHERE user_id = ?',
      [userId]
    ));
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Rider not found.' });
    }
    const rider = rows[0];
    if (rider.status !== 'approved' && is_available) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval. You cannot go online yet.',
      });
    }

    const val = is_available ? 1 : 0;
    await query('UPDATE riders SET is_available = ? WHERE user_id = ?', [val, userId]);

    // Emit rider availability change to admin dashboard
    const se = req.app.get('socketEmitters');
    if (se) {
      se.adminOrderUpdate({ type: 'rider:availability', riderId: rider.rider_id, is_available: !!val });
    }

    return res.json({
      success: true,
      message: val ? 'You are now online and can receive deliveries.' : 'You are now offline.',
      data: { is_available: !!val },
    });
  } catch (err) {
    console.error('[rider] PUT /availability', err);
    return res.status(500).json({ success: false, message: 'Failed to update availability.' });
  }
});

/* ── GET /api/rider/available-orders ────────────────────────── */
router.get('/available-orders', async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Verify rider is approved and online
    const riderRows = safeRows(await query(
      'SELECT rider_id, status, is_available FROM riders WHERE user_id = ?',
      [userId]
    ));
    if (!riderRows.length) {
      return res.status(404).json({ success: false, message: 'Rider not found.' });
    }
    const rider = riderRows[0];
    if (rider.status !== 'approved') {
      return res.status(403).json({ success: false, message: 'Account not approved yet.' });
    }
    if (!rider.is_available) {
      return res.json({ success: true, data: [], message: 'You are offline. Go online to see available orders.' });
    }

    // Open pool: ready_for_pickup orders NOT yet assigned to a delivery
    const orders = safeRows(await query(
      `SELECT o.order_id, o.order_number, o.status, o.delivery_address,
              o.delivery_lat, o.delivery_lng, o.total, o.delivery_fee,
              o.notes, o.created_at,
              r.name AS restaurant_name, r.address AS restaurant_address,
              r.latitude AS restaurant_lat, r.longitude AS restaurant_lng,
              u.name AS customer_name, u.phone AS customer_phone,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count
       FROM orders o
       JOIN restaurants r ON r.restaurant_id = o.restaurant_id
       JOIN users u ON u.user_id = o.user_id
       WHERE o.status = 'ready_for_pickup'
         AND NOT EXISTS (
           SELECT 1 FROM deliveries d
           WHERE d.order_id = o.order_id
             AND d.status NOT IN ('failed')
         )
       ORDER BY o.updated_at DESC
       LIMIT 50`,
      []
    ));

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error('[rider] GET /available-orders', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch available orders.' });
  }
});

/* ── POST /api/rider/accept-order/:id ──────────────────────── */
router.post('/accept-order/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const userId  = req.user.user_id;

  if (!orderId) return res.status(400).json({ success: false, message: 'Invalid order ID.' });

  let conn;
  try {
    // Use a transaction to atomically claim the delivery
    // We use raw pool connection for transactions
    const pool = require('../config/db').pool;
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Lock the order row
    const orderRows = await conn.query(
      `SELECT o.order_id, o.status, o.restaurant_id, o.delivery_address,
              r.address AS restaurant_address
       FROM orders o
       JOIN restaurants r ON r.restaurant_id = o.restaurant_id
       WHERE o.order_id = ? AND o.status = 'ready_for_pickup'
       FOR UPDATE`,
      [orderId]
    );

    if (!orderRows || !orderRows.length) {
      await conn.rollback();
      conn.release();
      return res.status(409).json({
        success: false,
        message: 'This order is no longer available. It may have been taken by another rider.',
      });
    }

    // Check not already assigned
    const existing = await conn.query(
      `SELECT delivery_id FROM deliveries WHERE order_id = ? AND status NOT IN ('failed')`,
      [orderId]
    );
    if (existing && existing.length) {
      await conn.rollback();
      conn.release();
      return res.status(409).json({
        success: false,
        message: 'This order has already been accepted by another rider.',
      });
    }

    // Get rider_id
    const riderRows = await conn.query(
      'SELECT rider_id, status, is_available FROM riders WHERE user_id = ?',
      [userId]
    );
    if (!riderRows || !riderRows.length || riderRows[0].status !== 'approved') {
      await conn.rollback();
      conn.release();
      return res.status(403).json({ success: false, message: 'Your account is not approved.' });
    }
    const rider = riderRows[0];
    if (!rider.is_available) {
      await conn.rollback();
      conn.release();
      return res.status(403).json({ success: false, message: 'You must be online to accept deliveries.' });
    }

    // Check rider doesn't already have an active delivery
    const activeDelivery = await conn.query(
      `SELECT d.delivery_id FROM deliveries d
       WHERE d.rider_id = ? AND d.status IN ('assigned','picked_up','on_the_way')`,
      [rider.rider_id]
    );
    if (activeDelivery && activeDelivery.length) {
      await conn.rollback();
      conn.release();
      return res.status(409).json({
        success: false,
        message: 'You already have an active delivery. Complete it first.',
      });
    }

    // Create delivery record
    await conn.query(
      `INSERT INTO deliveries (order_id, rider_id, pickup_address, delivery_address, status, assigned_at)
       VALUES (?, ?, ?, ?, 'assigned', NOW())`,
      [orderId, rider.rider_id, orderRows[0].restaurant_address || '', orderRows[0].delivery_address]
    );

    // Update order status to out_for_delivery
    await conn.query(
      `UPDATE orders SET status = 'out_for_delivery', assigned_staff_id = ?, updated_at = NOW()
       WHERE order_id = ?`,
      [userId, orderId]
    );

    await conn.commit();
    conn.release();

    // Emit real-time events
    const se = req.app.get('socketEmitters');
    if (se) {
      // Notify all riders — this order is gone from the pool
      if (typeof se.riderOrderClaimed === 'function') {
        se.riderOrderClaimed(orderId, rider.rider_id);
      }
      // Notify admin dashboard
      if (typeof se.adminOrderUpdate === 'function') {
        se.adminOrderUpdate({ orderId, status: 'out_for_delivery' });
      }
      // Notify restaurant dashboard
      if (typeof se.restaurantOrderUpdate === 'function') {
        se.restaurantOrderUpdate(orderRows[0].restaurant_id, { orderId, status: 'out_for_delivery' });
      }
    }

    await log({
      actorId: userId, actorRole: 'rider',
      action: 'DELIVERY_ACCEPTED', entityType: 'order', entityId: orderId,
      newValue: { riderId: rider.rider_id, status: 'out_for_delivery' }, ip: req.ip,
    });

    return res.json({ success: true, message: 'Delivery accepted! Navigate to the restaurant.' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); conn.release(); } catch {} }
    console.error('[rider] POST /accept-order', err);
    return res.status(500).json({ success: false, message: 'Failed to accept order.' });
  }
});

/* ── GET /api/rider/active-delivery ─────────────────────────── */
router.get('/active-delivery', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const rows = safeRows(await query(
      `SELECT d.delivery_id, d.order_id, d.status AS delivery_status,
              d.assigned_at, d.picked_up_at,
              o.order_number, o.status AS order_status, o.delivery_address,
              o.delivery_lat, o.delivery_lng, o.total, o.delivery_fee,
              o.notes, o.delivery_confirmation_code,
              r.name AS restaurant_name, r.address AS restaurant_address,
              r.latitude AS restaurant_lat, r.longitude AS restaurant_lng,
              r.phone AS restaurant_phone,
              u.name AS customer_name, u.phone AS customer_phone,
              (SELECT JSON_ARRAYAGG(
                JSON_OBJECT('name', oi.name, 'qty', oi.qty, 'price', oi.price)
              ) FROM order_items oi WHERE oi.order_id = o.order_id) AS items
       FROM deliveries d
       JOIN orders o ON o.order_id = d.order_id
       JOIN restaurants r ON r.restaurant_id = o.restaurant_id
       JOIN users u ON u.user_id = o.user_id
       JOIN riders ri ON ri.rider_id = d.rider_id
       WHERE ri.user_id = ? AND d.status IN ('assigned', 'picked_up', 'on_the_way')
       LIMIT 1`,
      [userId]
    ));

    if (!rows.length) {
      return res.json({ success: true, data: null });
    }

    // Parse JSON items safely
    const delivery = rows[0];
    if (delivery.items && typeof delivery.items === 'string') {
      try { delivery.items = JSON.parse(delivery.items); } catch { delivery.items = []; }
    }

    return res.json({ success: true, data: delivery });
  } catch (err) {
    console.error('[rider] GET /active-delivery', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch active delivery.' });
  }
});

/* ── POST /api/rider/orders/:id/pickup ─────────────────────── */
router.post('/orders/:id/pickup', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const userId  = req.user.user_id;
  const { code } = req.body;

  if (!code || !/^\d{6}$/.test(String(code).trim())) {
    return res.status(400).json({
      success: false,
      message: 'A valid 6-digit pickup code from the restaurant is required.',
    });
  }

  try {
    // Verify this delivery belongs to this rider
    const rows = safeRows(await query(
      `SELECT d.delivery_id, d.status, d.rider_id, o.restaurant_id,
              o.pickup_confirmation_code
       FROM deliveries d
       JOIN orders o ON o.order_id = d.order_id
       JOIN riders ri ON ri.rider_id = d.rider_id
       WHERE d.order_id = ? AND ri.user_id = ? AND d.status = 'assigned'`,
      [orderId, userId]
    ));

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Active delivery not found or already picked up.',
      });
    }

    const delivery = rows[0];

    // Verify the restaurant's pickup handoff code — prevents a rider from
    // marking an order picked up without actually collecting it, and
    // prevents disputes between the restaurant and rider over handoff.
    if (!delivery.pickup_confirmation_code ||
        String(delivery.pickup_confirmation_code).trim() !== String(code).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect code. Please ask restaurant staff for the pickup code.',
      });
    }

    await query(
      `UPDATE deliveries SET status = 'picked_up', picked_up_at = NOW(), updated_at = NOW()
       WHERE delivery_id = ?`,
      [delivery.delivery_id]
    );

    // Single-use — clear it once redeemed (order.status is already
    // 'out_for_delivery', set when the rider accepted the order)
    await query(
      `UPDATE orders SET pickup_confirmation_code = NULL, updated_at = NOW() WHERE order_id = ?`,
      [orderId]
    );

    // Notify admin and restaurant
    const se = req.app.get('socketEmitters');
    if (se) {
      se.adminOrderUpdate({ orderId, status: 'out_for_delivery', delivery_status: 'picked_up' });
      se.restaurantOrderUpdate(delivery.restaurant_id, { orderId, status: 'out_for_delivery', delivery_status: 'picked_up' });
    }

    await log({
      actorId: userId, actorRole: 'rider',
      action: 'DELIVERY_PICKED_UP', entityType: 'order', entityId: orderId,
      newValue: { status: 'picked_up', code_used: true }, ip: req.ip,
    });

    return res.json({ success: true, message: 'Order marked as picked up. Head to the customer.' });
  } catch (err) {
    console.error('[rider] POST /orders/:id/pickup', err);
    return res.status(500).json({ success: false, message: 'Failed to mark pickup.' });
  }
});

/* ── POST /api/rider/orders/:id/confirm-delivery ────────────── */
router.post('/orders/:id/confirm-delivery', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const userId  = req.user.user_id;
  const { code } = req.body;

  if (!code || !/^\d{6}$/.test(String(code).trim())) {
    return res.status(400).json({ success: false, message: 'A valid 6-digit confirmation code is required.' });
  }

  try {
    // Verify this delivery belongs to this rider and is in correct state
    const rows = safeRows(await query(
      `SELECT d.delivery_id, d.status AS delivery_status, o.status AS order_status,
              o.delivery_confirmation_code, o.user_id AS customer_id, o.restaurant_id
       FROM deliveries d
       JOIN orders o ON o.order_id = d.order_id
       JOIN riders ri ON ri.rider_id = d.rider_id
       WHERE d.order_id = ? AND ri.user_id = ? AND d.status IN ('assigned','picked_up','on_the_way')`,
      [orderId, userId]
    ));

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Active delivery not found.' });
    }

    const delivery = rows[0];

    // Verify confirmation code
    if (!delivery.delivery_confirmation_code ||
        String(delivery.delivery_confirmation_code).trim() !== String(code).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect code. Please ask the customer for their 6-digit delivery code.',
      });
    }

    // Mark delivery and order as delivered
    await query(
      `UPDATE deliveries SET status = 'delivered', delivered_at = NOW(), updated_at = NOW()
       WHERE delivery_id = ?`,
      [delivery.delivery_id]
    );

    await query(
      `UPDATE orders SET status = 'delivered', delivery_confirmation_code = NULL,
              updated_at = NOW() WHERE order_id = ?`,
      [orderId]
    );

    // Notify customer, admin, restaurant
    const se = req.app.get('socketEmitters');
    if (se) {
      se.orderCreated(delivery.customer_id, { orderId, status: 'delivered' });
      se.toastUser(delivery.customer_id, { type: 'success', message: '🎉 Your order has been delivered! Enjoy!' });
      se.adminOrderUpdate({ orderId, status: 'delivered' });
      se.restaurantOrderUpdate(delivery.restaurant_id, { orderId, status: 'delivered' });
    }

    await log({
      actorId: userId, actorRole: 'rider',
      action: 'DELIVERY_CONFIRMED', entityType: 'order', entityId: orderId,
      newValue: { status: 'delivered', code_used: true }, ip: req.ip,
    });

    return res.json({ success: true, message: '🎉 Delivery confirmed! Order marked as delivered.' });
  } catch (err) {
    console.error('[rider] POST /orders/:id/confirm-delivery', err);
    return res.status(500).json({ success: false, message: 'Failed to confirm delivery.' });
  }
});

/* ── GET /api/rider/history ─────────────────────────────────── */
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const rows = safeRows(await query(
      `SELECT d.delivery_id, d.order_id, d.status AS delivery_status,
              d.assigned_at, d.picked_up_at, d.delivered_at,
              o.order_number, o.total, o.delivery_fee, o.delivery_address,
              r.name AS restaurant_name
       FROM deliveries d
       JOIN orders o ON o.order_id = d.order_id
       JOIN restaurants r ON r.restaurant_id = o.restaurant_id
       JOIN riders ri ON ri.rider_id = d.rider_id
       WHERE ri.user_id = ? AND d.status IN ('delivered','failed')
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    ));

    const countRow = safeRows(await query(
      `SELECT COUNT(*) AS total FROM deliveries d
       JOIN riders ri ON ri.rider_id = d.rider_id
       WHERE ri.user_id = ? AND d.status IN ('delivered','failed')`,
      [userId]
    ));

    return res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number(countRow[0]?.total || 0) },
    });
  } catch (err) {
    console.error('[rider] GET /history', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch delivery history.' });
  }
});

module.exports = router;
