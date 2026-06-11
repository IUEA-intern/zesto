/**
 * server/routes/orders.js
 * POST /api/orders           — place a new order
 * GET  /api/orders           — list current user's orders
 * GET  /api/orders/:id       — single order with items
 * POST /api/orders/:id/verify — verify Flutterwave payment
 */

'use strict';

const express = require('express');
const router  = express.Router();
const https   = require('https');
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

require('dotenv').config({ path: __dirname + '/../.env' });

const DELIVERY_FEE = parseFloat(process.env.DELIVERY_FEE) || 5000;

router.use(requireAuth);

/* ── POST /api/orders ──────────────────────────────────────── */
router.post('/', async (req, res) => {
  try {
    const { items, delivery_address, payment_method, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must contain at least one item.' });
    }
    if (!delivery_address) {
      return res.status(400).json({ success: false, message: 'Delivery address is required.' });
    }

    // Fetch product prices (never trust client prices)
    const ids          = items.map(i => parseInt(i.product_id));
    const placeholders = ids.map(() => '?').join(',');
    const products     = await query(
      `SELECT product_id, name, price, stock FROM products WHERE product_id IN (${placeholders}) AND is_active = 1`,
      ids
    );

    const productMap = {};
    products.forEach(p => { productMap[p.product_id] = p; });

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const pid = parseInt(item.product_id);
      const qty = parseInt(item.qty);
      const p   = productMap[pid];

      if (!p) {
        return res.status(400).json({ success: false, message: `Product ${pid} not found.` });
      }
      if (qty < 1) {
        return res.status(400).json({ success: false, message: 'All quantities must be >= 1.' });
      }
      if (p.stock < qty) {
        return res.status(400).json({ success: false, message: `"${p.name}" has insufficient stock.` });
      }

      const lineTotal = parseFloat(p.price) * qty;
      subtotal += lineTotal;

      validatedItems.push({ product_id: pid, name: p.name, price: p.price, qty, lineTotal });
    }

    const total = subtotal + DELIVERY_FEE;

    // Insert order row
    const orderResult = await query(
      `INSERT INTO orders
         (user_id, status, subtotal, delivery_fee, total, delivery_address, payment_method, notes)
       VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [req.user.user_id, subtotal, DELIVERY_FEE, total, delivery_address,
       payment_method || 'mobile_money', notes || null]
    );

    const orderId = Number(orderResult.insertId);

    // Insert order items & decrement stock
    for (const item of validatedItems) {
      await query(
        'INSERT INTO order_items (order_id, product_id, name, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, item.product_id, item.name, item.price, item.qty, item.lineTotal]
      );
      await query(
        'UPDATE products SET stock = stock - ? WHERE product_id = ?',
        [item.qty, item.product_id]
      );
    }

    // Clear server-side cart
    await query('DELETE FROM cart_items WHERE user_id = ?', [req.user.user_id]);

    // Emit real-time order event via Socket.IO (attached to app)
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user.user_id}`).emit('order:new', {
        order_id: orderId, status: 'pending', total
      });
    }

    return res.status(201).json({
      success:  true,
      message:  'Order placed successfully!',
      order_id: orderId,
      total
    });
  } catch (err) {
    console.error('[POST /api/orders]', err);
    return res.status(500).json({ success: false, message: 'Failed to place order.' });
  }
});

/* ── GET /api/orders ───────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const orders = await query(
      `SELECT order_id, status, subtotal, delivery_fee, total,
              payment_method, payment_status, created_at
       FROM orders WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error('[GET /api/orders]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
});

/* ── GET /api/orders/:id ───────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const orders = await query(
      `SELECT * FROM orders WHERE order_id = ? AND user_id = ?`,
      [orderId, req.user.user_id]
    );

    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const items = await query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orderId]
    );

    return res.json({ success: true, data: { ...orders[0], items } });
  } catch (err) {
    console.error('[GET /api/orders/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch order.' });
  }
});

/* ── POST /api/orders/:id/verify ───────────────────────────── */
/**
 * Called after Flutterwave redirect to verify payment and update order.
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const orderId  = parseInt(req.params.id);
    const { transaction_id, tx_ref } = req.body;

    if (!transaction_id) {
      return res.status(400).json({ success: false, message: 'transaction_id is required.' });
    }

    // Verify with Flutterwave API
    const flwRes = await flutterwaveVerify(transaction_id);

    if (!flwRes || flwRes.status !== 'success' || flwRes.data.status !== 'successful') {
      return res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }

    // Update order payment status
    const [order] = await query(
      `SELECT user_id, total FROM orders WHERE order_id = ? AND user_id = ?`,
      [orderId, req.user.user_id]
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const expectedAmount = parseFloat(order.total);
    const actualAmount   = parseFloat(flwRes.data.amount);
    if (Number.isNaN(actualAmount) || actualAmount !== expectedAmount) {
      return res.status(400).json({ success: false, message: 'Payment amount does not match order total.' });
    }

    if (tx_ref && tx_ref !== flwRes.data.tx_ref) {
      return res.status(400).json({ success: false, message: 'Transaction reference mismatch.' });
    }

    await query(
      `UPDATE orders
       SET payment_status = 'paid', flw_tx_ref = ?, flw_tx_id = ?, status = 'paid',
           updated_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND user_id = ?`,
      [tx_ref || flwRes.data.tx_ref, String(transaction_id), orderId, req.user.user_id]
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user.user_id}`).emit('order:status', {
        order_id: orderId, status: 'paid', payment_status: 'paid'
      });
    }

    return res.json({ success: true, message: 'Payment verified. Order confirmed!' });
  } catch (err) {
    console.error('[POST /api/orders/:id/verify]', err);
    return res.status(500).json({ success: false, message: 'Verification error.' });
  }
});

/* ── Flutterwave verification helper ───────────────────────── */
function flutterwaveVerify(transactionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.flutterwave.com',
      path:     `/v3/transactions/${transactionId}/verify`,
      method:   'GET',
      headers: {
        'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type':  'application/json'
      }
    };

    const req = https.request(options, (r) => {
      let body = '';
      r.on('data', chunk => { body += chunk; });
      r.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = router;