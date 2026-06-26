/**
 * server/routes/payments.js
 * POST /api/payments/initiate        — create pending payment row
 * POST /api/payments/verify          — server-to-server FLW verify
 * POST /api/payments/webhook         — Flutterwave webhook (no auth)
 * GET  /api/payments/order/:orderId  — payment status for an order
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const { requireAuth } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const {
  initiatePayment,
  verifyPayment,
  webhookCallback,
  initiatePesapalPayment,
  pesapalCallback,
  pesapalIpn,
  registerPesapalIpn,
} = require('../controllers/paymentController');

// Webhook must come first (no auth, raw body needed)
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Parse raw buffer back to object for our handler
  if (Buffer.isBuffer(req.body)) {
    try { req.body = JSON.parse(req.body.toString()); } catch { req.body = {}; }
  }
  next();
}, webhookCallback);

// Pesapal routes
router.post('/pesapal/ipn', express.json(), pesapalIpn);
router.get('/pesapal/callback', pesapalCallback);
router.post('/pesapal/callback', express.json(), pesapalCallback);
router.post('/pesapal/register-ipn', requireAuth, paymentLimiter, registerPesapalIpn);

// Authenticated payment routes with rate limiting
router.post('/pesapal/initiate', requireAuth, paymentLimiter, initiatePesapalPayment);
router.post('/initiate', requireAuth, paymentLimiter, initiatePesapalPayment);
router.post('/verify',   requireAuth, paymentLimiter, verifyPayment);

// GET payment status
router.get('/order/:orderId', requireAuth, async (req, res) => {
  const { query } = require('../config/db');
  try {
    const rows = await query(
      `SELECT payment_id, method, status, amount, currency, verified_at, created_at
       FROM payments WHERE order_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [parseInt(req.params.orderId), req.user?.user_id || req.user?.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'No payment found.' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch payment.' });
  }
});

module.exports = router;