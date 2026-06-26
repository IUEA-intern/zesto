/**
 * server/controllers/paymentController.js
 * ──────────────────────────────────────────────────────────────
 * Zesto — Secure Flutterwave Payment Verification
 *
 * ANTI-FRAUD CHECKS (all must pass):
 *   ① transaction_id exists in DB (not fabricated)
 *   ② idempotency key has never been processed (replay attack guard)
 *   ③ FLW API status === 'successful'
 *   ④ amount matches order total EXACTLY (±0.00)
 *   ⑤ currency matches expected (UGX)
 *   ⑥ tx_ref matches our DB record (not swapped)
 *   ⑦ payment row still in 'pending' (prevent double-credit)
 *
 * Server-to-server ONLY — frontend data never trusted for amounts.
 * ──────────────────────────────────────────────────────────────
 */

'use strict';

require('dotenv').config({ path: __dirname + '/../.env' });

const https         = require('https');
const pesapal      = require('../services/pesapalService');
const { query }     = require('../config/db');
const { log, ACTIONS } = require('../config/audit');

const EXPECTED_CURRENCY = 'UGX';

/* ============================================================
   STEP 1 — Initiate payment (creates pending payment row)
   ============================================================ */
async function initiatePayment(req, res) {
  const io     = req.app.get('io');
  const socket = req.app.get('socketEmitters');

  try {
    const { order_id } = req.body;
    const userId       = req.user?.user_id || req.user?.id;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'order_id is required.' });
    }

    // Fetch order — must belong to this user
    const orders = await query(
      'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
      [order_id, userId]
    );
    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orders[0];

    // Check no verified payment exists already
    const existing = await query(
      "SELECT payment_id FROM payments WHERE order_id = ? AND status = 'verified'",
      [order_id]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Order already paid.' });
    }

    // Generate unique references
    const txRef          = `ZST-${Date.now()}-${userId}-${order_id}`;
    const idempotencyKey = `pay-${order_id}-${userId}-${Date.now()}`;

    // Insert pending payment row
    const result = await query(
      `INSERT INTO payments
         (order_id, user_id, method, status, amount, currency, flw_tx_ref, idempotency_key)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [order_id, userId, req.body.method || 'mobile_money',
       order.total, EXPECTED_CURRENCY, txRef, idempotencyKey]
    );

    await log({
      actorId:    userId,
      actorRole:  'customer',
      action:     ACTIONS.PAYMENT_INITIATED,
      entityType: 'payment',
      entityId:   Number(result.insertId),
      newValue:   { order_id, amount: order.total, txRef },
      ip:         req.ip,
      userAgent:  req.headers['user-agent'],
    });

    return res.json({
      success:   true,
      tx_ref:    txRef,
      amount:    order.total,
      currency:  EXPECTED_CURRENCY,
      public_key: process.env.FLW_PUBLIC_KEY,
    });
  } catch (err) {
    console.error('[initiatePayment]', err);
    return res.status(500).json({ success: false, message: 'Failed to initiate payment.' });
  }
}

/* ============================================================
   STEP 2+3 — Verify payment (server-to-server, anti-fraud)
   ============================================================ */
async function verifyPayment(req, res) {
  const socket = req.app.get('socketEmitters');
  const userId = req.user?.user_id || req.user?.id;

  const { transaction_id, tx_ref, order_id } = req.body;

  if (!transaction_id || !tx_ref || !order_id) {
    return res.status(400).json({ success: false, message: 'transaction_id, tx_ref and order_id are required.' });
  }

  // ── CHECK ①: payment row must exist in pending state ────────
  const payments = await query(
    "SELECT * FROM payments WHERE flw_tx_ref = ? AND order_id = ? AND user_id = ? AND status = 'pending'",
    [tx_ref, order_id, userId]
  );

  if (!payments.length) {
    // Could be replay attack or double-submission
    await log({
      actorId:    userId,
      actorRole:  'customer',
      action:     ACTIONS.PAYMENT_REPLAY_BLOCKED,
      entityType: 'payment',
      notes:      `tx_ref=${tx_ref} order_id=${order_id} transaction_id=${transaction_id}`,
      ip:         req.ip,
      userAgent:  req.headers['user-agent'],
    });
    return res.status(409).json({ success: false, message: 'Payment already processed or not found.' });
  }

  const payment = payments[0];

  // ── CHECK ②: idempotency guard (replay attack) ───────────────
  const replayCheck = await query(
    "SELECT payment_id FROM payments WHERE idempotency_key = ? AND status != 'pending'",
    [payment.idempotency_key]
  );
  if (replayCheck.length) {
    await log({
      actorId:    userId,
      actorRole:  'customer',
      action:     ACTIONS.PAYMENT_REPLAY_BLOCKED,
      entityType: 'payment',
      entityId:   payment.payment_id,
      notes:      `Replay blocked. idempotency_key=${payment.idempotency_key}`,
      ip:         req.ip,
    });
    return res.status(409).json({ success: false, message: 'Duplicate payment attempt blocked.' });
  }

  // ── STEP 3: Server-to-server Flutterwave API verify ─────────
  let flwData;
  try {
    flwData = await flutterwaveVerifyAPI(transaction_id);
  } catch (err) {
    console.error('[verifyPayment] FLW API error:', err);
    return res.status(502).json({ success: false, message: 'Payment gateway unreachable. Try again shortly.' });
  }

  const flwTx = flwData?.data;

  // ── CHECK ③: FLW status must be successful ───────────────────
  if (!flwTx || flwData.status !== 'success' || flwTx.status !== 'successful') {
    await _markFailed(payment, userId, tx_ref, flwData, 'FLW status not successful', req, socket, order_id);
    return res.status(400).json({ success: false, message: 'Payment was not completed successfully.' });
  }

  // ── CHECK ④: amount must match EXACTLY ──────────────────────
  const flwAmount   = parseFloat(flwTx.amount);
  const orderAmount = parseFloat(payment.amount);
  if (Math.abs(flwAmount - orderAmount) > 0.001) {
    await _markFailed(payment, userId, tx_ref, flwData,
      `Amount mismatch: expected ${orderAmount} got ${flwAmount}`, req, socket, order_id);
    return res.status(400).json({ success: false, message: 'Payment amount does not match order total.' });
  }

  // ── CHECK ⑤: currency must be correct ───────────────────────
  if (flwTx.currency !== EXPECTED_CURRENCY) {
    await _markFailed(payment, userId, tx_ref, flwData,
      `Currency mismatch: expected ${EXPECTED_CURRENCY} got ${flwTx.currency}`, req, socket, order_id);
    return res.status(400).json({ success: false, message: 'Invalid payment currency.' });
  }

  // ── CHECK ⑥: tx_ref must match ──────────────────────────────
  if (flwTx.tx_ref !== tx_ref) {
    await _markFailed(payment, userId, tx_ref, flwData,
      `tx_ref mismatch: expected ${tx_ref} got ${flwTx.tx_ref}`, req, socket, order_id);
    return res.status(400).json({ success: false, message: 'Transaction reference mismatch.' });
  }

  // ── ALL CHECKS PASSED — STEP 4: Finalize ────────────────────
  try {
    await query(
      `UPDATE payments
       SET status='verified', flw_tx_id=?, flw_raw_response=?, verified_at=CURRENT_TIMESTAMP,
           updated_at=CURRENT_TIMESTAMP
       WHERE payment_id=?`,
      [String(transaction_id), JSON.stringify(flwData), payment.payment_id]
    );

    await query(
      `UPDATE orders SET status='processing', updated_at=CURRENT_TIMESTAMP WHERE order_id=?`,
      [order_id]
    );

    // Audit
    await log({
      actorId:    userId,
      actorRole:  'customer',
      action:     ACTIONS.PAYMENT_VERIFIED,
      entityType: 'payment',
      entityId:   payment.payment_id,
      newValue:   { status: 'verified', transaction_id, amount: orderAmount },
      ip:         req.ip,
      userAgent:  req.headers['user-agent'],
    });

    // ── Real-time notifications ──────────────────────────────
    if (socket) {
      // Notify user
      socket.paymentStatus(userId, { orderId: order_id, status: 'verified', amount: orderAmount });
      socket.toastUser(userId, { type: 'success', message: 'Payment confirmed! Your order is being prepared.' });
      socket.orderCreated(userId, { orderId: order_id, orderNumber: flwTx.tx_ref });

      // Notify admin dashboard
      socket.adminPaymentVerified({
        paymentId:  payment.payment_id,
        orderId:    order_id,
        userId,
        amount:     orderAmount,
        method:     payment.method,
        flwTxId:    String(transaction_id),
      });
      socket.adminOrderUpdate({ orderId: order_id, status: 'processing' });

      // Notify kitchen
      const orderRows = await query('SELECT * FROM orders WHERE order_id=?', [order_id]);
      if (orderRows.length) {
        socket.kitchenNewOrder({
          orderId:     order_id,
          orderNumber: orderRows[0].order_number,
          total:       orderRows[0].total,
        });
      }
    }

    return res.json({ success: true, message: 'Payment verified! Order is being prepared.' });
  } catch (err) {
    console.error('[verifyPayment] Finalization error:', err);
    return res.status(500).json({ success: false, message: 'Payment verified but order update failed. Contact support.' });
  }
}

/* ============================================================
   INTERNAL HELPERS
   ============================================================ */

/** Mark a payment as failed, emit events, write audit log */
async function _markFailed(payment, userId, txRef, flwData, reason, req, socket, orderId) {
  try {
    await query(
      `UPDATE payments
       SET status='failed', flw_raw_response=?, failure_reason=?, updated_at=CURRENT_TIMESTAMP
       WHERE payment_id=?`,
      [JSON.stringify(flwData), reason, payment.payment_id]
    );

    await log({
      actorId:    userId,
      actorRole:  'customer',
      action:     ACTIONS.PAYMENT_FAILED,
      entityType: 'payment',
      entityId:   payment.payment_id,
      notes:      reason,
      ip:         req.ip,
      userAgent:  req.headers['user-agent'],
    });

    if (socket) {
      socket.paymentStatus(userId, { orderId, status: 'failed', amount: payment.amount });
      socket.toastUser(userId, { type: 'error', message: 'Payment failed. Please try again.' });
      socket.adminPaymentFailed({ paymentId: payment.payment_id, orderId, reason });
    }
  } catch (err) {
    console.error('[_markFailed]', err);
  }
}

/** Server-to-server Flutterwave transaction verify */
function flutterwaveVerifyAPI(transactionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.flutterwave.com',
      path:     `/v3/transactions/${transactionId}/verify`,
      method:   'GET',
      headers: {
        Authorization:  `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (r) => {
      let body = '';
      r.on('data',  chunk => { body += chunk; });
      r.on('end',   ()    => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON from Flutterwave')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('FLW API timeout')); });
    req.end();
  });
}

/* ============================================================
   Webhook callback (Flutterwave → your server, server-initiated)
   ============================================================ */

/* ============================================================
   PESAPAL - Initiate payment and redirect customer
   ============================================================ */
async function initiatePesapalPayment(req, res) {
  const userId = req.user?.user_id || req.user?.id;

  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'order_id is required.' });
    }

    const orders = await query(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
       FROM orders o
       JOIN users u ON u.user_id = o.user_id
       WHERE o.order_id = ? AND o.user_id = ?`,
      [order_id, userId]
    );

    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orders[0];
    const existing = await query(
      "SELECT payment_id FROM payments WHERE order_id = ? AND status = 'verified'",
      [order_id]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Order already paid.' });
    }

    const merchantReference = `ZST-${Date.now()}-${userId}-${order_id}`;
    const idempotencyKey = `pesapal-${order_id}-${userId}-${Date.now()}`;
    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const callbackUrl = `${appUrl}/api/payments/pesapal/callback`;
    const notificationId = process.env.PESAPAL_NOTIFICATION_ID || process.env.PESAPAL_IPN_ID || '';

    if (!notificationId) {
      return res.status(500).json({
        success: false,
        message: 'Pesapal notification id is not configured. Register an IPN first and set PESAPAL_NOTIFICATION_ID.',
      });
    }

    const result = await query(
      `INSERT INTO payments
         (order_id, user_id, method, status, amount, currency, flw_tx_ref, idempotency_key)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [order_id, userId, req.body.method || 'mobile_money', order.total, EXPECTED_CURRENCY, merchantReference, idempotencyKey]
    );

    const [firstName, ...restName] = String(order.customer_name || 'Zesto Customer').trim().split(/\s+/);
    const lastName = restName.join(' ') || firstName;
    const pesapalOrder = {
      id: merchantReference,
      currency: EXPECTED_CURRENCY,
      amount: Number(order.total),
      description: `Zesto order ${order.order_number || order_id}`,
      callback_url: callbackUrl,
      notification_id: notificationId,
      billing_address: {
        email_address: order.customer_email || 'customer@zesto.ug',
        phone_number: order.customer_phone || req.body.phone || '',
        country_code: process.env.PESAPAL_COUNTRY_CODE || 'UG',
        first_name: firstName,
        last_name: lastName,
      },
    };

    const pesapalResponse = await pesapal.submitOrderRequest(pesapalOrder);
    const paymentId = Number(result.insertId) || null;

    await query(
      `UPDATE payments
       SET flw_tx_id = ?, flw_raw_response = ?, updated_at = CURRENT_TIMESTAMP
       WHERE flw_tx_ref = ? AND order_id = ? AND user_id = ?`,
      [pesapalResponse.order_tracking_id || null, JSON.stringify(pesapalResponse), merchantReference, order_id, userId]
    );

    await log({
      actorId: userId,
      actorRole: 'customer',
      action: ACTIONS.PAYMENT_INITIATED,
      entityType: 'payment',
      entityId: paymentId,
      newValue: { order_id, amount: order.total, merchantReference, gateway: 'pesapal' },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      success: true,
      gateway: 'pesapal',
      order_id,
      merchant_reference: merchantReference,
      order_tracking_id: pesapalResponse.order_tracking_id,
      redirect_url: pesapalResponse.redirect_url,
      data: pesapalResponse,
    });
  } catch (err) {
    console.error('[initiatePesapalPayment]', err.data || err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to initiate Pesapal payment.' });
  }
}

async function pesapalCallback(req, res) {
  const orderTrackingId = req.query.OrderTrackingId || req.query.orderTrackingId || req.body?.OrderTrackingId;
  const merchantReference = req.query.OrderMerchantReference || req.query.orderMerchantReference || req.body?.OrderMerchantReference;

  if (!orderTrackingId && !merchantReference) {
    return res.redirect('/cart.html?payment=missing');
  }

  try {
    const rows = await query(
      `SELECT * FROM payments
       WHERE (flw_tx_id = ? OR flw_tx_ref = ?) AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [orderTrackingId || '', merchantReference || '']
    );
    if (!rows.length) {
      return res.redirect('/cart.html?payment=already-processed');
    }

    const payment = rows[0];
    const status = orderTrackingId ? await pesapal.getTransactionStatus(orderTrackingId) : null;
    const paymentStatus = String(status?.payment_status_description || status?.status || '').toUpperCase();

    if (paymentStatus === 'COMPLETED' || paymentStatus === 'PAID') {
      await finalizePesapalPayment(payment, status || {}, req);
      return res.redirect(`/cart.html?payment=success&order_id=${payment.order_id}`);
    }

    if (paymentStatus === 'FAILED' || paymentStatus === 'INVALID') {
      await _markFailed(payment, payment.user_id, payment.flw_tx_ref, status, `Pesapal status: ${paymentStatus}`, req, req.app.get('socketEmitters'), payment.order_id);
      return res.redirect(`/cart.html?payment=failed&order_id=${payment.order_id}`);
    }

    await query(
      `UPDATE payments SET flw_raw_response = ?, updated_at = CURRENT_TIMESTAMP WHERE payment_id = ?`,
      [JSON.stringify(status || { orderTrackingId, merchantReference }), payment.payment_id]
    );
    return res.redirect(`/cart.html?payment=pending&order_id=${payment.order_id}`);
  } catch (err) {
    console.error('[pesapalCallback]', err.data || err);
    return res.redirect('/cart.html?payment=error');
  }
}

async function pesapalIpn(req, res) {
  res.status(200).json({ received: true });
  setImmediate(async () => {
    try {
      const orderTrackingId = req.body?.OrderTrackingId || req.query.OrderTrackingId || req.body?.order_tracking_id;
      if (!orderTrackingId) return;
      const rows = await query(
        "SELECT * FROM payments WHERE flw_tx_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
        [orderTrackingId]
      );
      if (!rows.length) return;
      const status = await pesapal.getTransactionStatus(orderTrackingId);
      const paymentStatus = String(status?.payment_status_description || status?.status || '').toUpperCase();
      if (paymentStatus === 'COMPLETED' || paymentStatus === 'PAID') {
        await finalizePesapalPayment(rows[0], status, req);
      } else if (paymentStatus === 'FAILED' || paymentStatus === 'INVALID') {
        await _markFailed(rows[0], rows[0].user_id, rows[0].flw_tx_ref, status, `Pesapal status: ${paymentStatus}`, req, req.app.get('socketEmitters'), rows[0].order_id);
      }
    } catch (err) {
      console.error('[pesapalIpn async]', err.data || err);
    }
  });
}

async function registerPesapalIpn(req, res) {
  try {
    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const url = req.body?.url || `${appUrl}/api/payments/pesapal/ipn`;
    const data = await pesapal.registerIpn(url, req.body?.ipn_notification_type || 'POST');
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[registerPesapalIpn]', err.data || err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to register Pesapal IPN.' });
  }
}

async function finalizePesapalPayment(payment, pesapalData, req) {
  const socket = req.app.get('socketEmitters');
  const amount = parseFloat(payment.amount);
  await query(
    `UPDATE payments
     SET status = 'verified', flw_raw_response = ?, verified_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE payment_id = ? AND status = 'pending'`,
    [JSON.stringify(pesapalData), payment.payment_id]
  );
  await query(
    `UPDATE orders SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
    [payment.order_id]
  );
  await log({
    actorId: payment.user_id,
    actorRole: 'customer',
    action: ACTIONS.PAYMENT_VERIFIED,
    entityType: 'payment',
    entityId: payment.payment_id,
    newValue: { status: 'verified', gateway: 'pesapal', amount },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  if (socket) {
    socket.paymentStatus(payment.user_id, { orderId: payment.order_id, status: 'verified', amount });
    socket.toastUser(payment.user_id, { type: 'success', message: 'Payment confirmed! Your order is being prepared.' });
    socket.adminPaymentVerified({
      paymentId: payment.payment_id,
      orderId: payment.order_id,
      userId: payment.user_id,
      amount,
      method: payment.method,
      flwTxId: payment.flw_tx_id,
    });
    socket.adminOrderUpdate({ orderId: payment.order_id, status: 'processing' });
  }
}

async function webhookCallback(req, res) {
  // Validate secret hash header
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature  = req.headers['verif-hash'];

  if (!secretHash || signature !== secretHash) {
    console.warn('[Webhook] Invalid signature — rejected');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const payload = req.body;
  res.status(200).json({ received: true }); // Respond immediately

  // Process async
  setImmediate(async () => {
    try {
      if (payload.event === 'charge.completed' && payload.data?.status === 'successful') {
        const txRef       = payload.data.tx_ref;
        const txId        = payload.data.id;
        const flwAmount   = parseFloat(payload.data.amount);

        const rows = await query(
          "SELECT * FROM payments WHERE flw_tx_ref=? AND status='pending'",
          [txRef]
        );
        if (!rows.length) return; // Already processed or doesn't exist

        const payment = rows[0];
        if (Math.abs(flwAmount - parseFloat(payment.amount)) > 0.001) {
          console.warn(`[Webhook] Amount mismatch for tx_ref=${txRef}`);
          return;
        }

        await query(
          `UPDATE payments
           SET status='verified', flw_tx_id=?, flw_raw_response=?, verified_at=CURRENT_TIMESTAMP
           WHERE payment_id=?`,
          [String(txId), JSON.stringify(payload), payment.payment_id]
        );
        await query(
          "UPDATE orders SET status='processing' WHERE order_id=?",
          [payment.order_id]
        );
        console.log(`[Webhook] Payment verified for order ${payment.order_id}`);
      }
    } catch (err) {
      console.error('[Webhook] Processing error:', err);
    }
  });
}

module.exports = {
  initiatePayment,
  verifyPayment,
  webhookCallback,
  initiatePesapalPayment,
  pesapalCallback,
  pesapalIpn,
  registerPesapalIpn,
};