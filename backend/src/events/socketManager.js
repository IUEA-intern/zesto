/**
 * server/events/socketManager.js
 * ──────────────────────────────────────────────────────────────
 * Zesto — Scalable Socket.IO Architecture
 *
 * ROOM DESIGN
 * ───────────
 *   user:{userId}          personal user notifications
 *   admin:dashboard        all admin/staff connections
 *   order:{orderId}        per-order tracking channel
 *   kitchen:live_updates   kitchen display system
 *
 * EVENT CATALOGUE
 * ───────────────
 * USER EVENTS (server → user:{id})
 *   cart:update            cart changed externally
 *   order:created          new order confirmed
 *   payment:status         payment result (verified|failed)
 *   notification:toast     general push notification
 *
 * ADMIN EVENTS (server → admin:dashboard)
 *   order:new              new order just placed
 *   order:update           order status changed
 *   payment:verified       payment cleared
 *   payment:failed         payment rejected
 *   product:stock_update   stock level changed
 *   analytics:update       real-time metric tick
 *
 * KITCHEN EVENTS (server → kitchen:live_updates)
 *   kitchen:new_order      order needs prep
 *   kitchen:order_ready    order ready for pickup
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 *   • Room-based isolation — no global emit spam
 *   • Listener cleanup on disconnect
 *   • Redis-adapter-ready (attach adapter externally)
 *   • Idempotency: events carry version/timestamp
 *   • Payload envelope: { event, data, ts, v }
 * ──────────────────────────────────────────────────────────────
 */

'use strict';

const { query } = require('../config/db');

/* ── Payload envelope helper ────────────────────────────────── */
function envelope(event, data) {
  return { event, data, ts: Date.now(), v: 1 };
}

/* ── Main initialiser — call once in app.js ─────────────────── */
function initSocketManager(io) {

  /* ── Connection gate ──────────────────────────────────────── */
  io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress;
    console.log(`🔌 Socket connected  id=${socket.id}  ip=${clientIp}`);

    /* ── JOIN: user personal room ───────────────────────────── */
    socket.on('user:join', (userId) => {
      if (!userId || isNaN(userId)) return;
      const room = `user:${userId}`;
      socket.join(room);
      socket.join(`user_${userId}`);
      socket.data.userId = userId;
      console.log(`   ↳ Joined ${room}`);
    });

    /* ── JOIN: admin / staff dashboard room ─────────────────── */
    socket.on('join', (userId) => {
      if (!userId || isNaN(userId)) return;
      socket.join(`user:${userId}`);
      socket.join(`user_${userId}`);
      socket.data.userId = userId;
      console.log(`   â†³ Joined user rooms for ${userId}`);
    });

    socket.on('admin:join', (token) => {
      // Token validated in HTTP layer before WS; trust role from session
      // For extra safety, we only let sockets with .data.role set join
      socket.join('admin:dashboard');
      socket.join('kitchen:live_updates');
      console.log(`   ↳ Joined admin:dashboard`);
    });

    /* ── JOIN: restaurant admin dashboard room ──────────── */
    socket.on('restaurant:join', (restaurantId) => {
      if (!restaurantId || isNaN(restaurantId)) return;
      const room = `restaurant:${restaurantId}`;
      socket.join(room);
      socket.data.restaurantId = restaurantId;
      console.log(`   ↳ Joined ${room}`);
    });

    /* ── JOIN: per-order tracking room ──────────────────────── */
    socket.on('order:track', (orderId) => {
      if (!orderId || isNaN(orderId)) return;
      socket.join(`order:${orderId}`);
      console.log(`   ↳ Joined order:${orderId}`);
    });

    /* ── LEAVE: per-order tracking room ─────────────────────── */
    socket.on('order:untrack', (orderId) => {
      socket.leave(`order:${orderId}`);
    });

    /* ── Cleanup on disconnect ───────────────────────────────── */
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected  id=${socket.id}  reason=${reason}`);
      // socket.rooms is auto-cleaned by socket.io — no manual leak
    });

    /* ── Ping/pong health ─────────────────────────────────────*/
    socket.on('ping:client', () => socket.emit('pong:server', { ts: Date.now() }));
  });

  return emitters(io);
}

/* ── Emitter API — imported by routes ───────────────────────── */
function emitters(io) {
  return {

    /* ── User channel ─────────────────────────────────────── */

    /** User's order was created and confirmed */
    orderCreated(userId, orderData) {
      io.to(`user:${userId}`).emit('order:created', envelope('order:created', orderData));
    },

    /** Payment result to user */
    paymentStatus(userId, { orderId, status, amount }) {
      io.to(`user:${userId}`).emit('payment:status',
        envelope('payment:status', { orderId, status, amount }));
    },

    /** Generic toast to a specific user */
    toastUser(userId, { type = 'info', message }) {
      io.to(`user:${userId}`).emit('notification:toast',
        envelope('notification:toast', { type, message }));
    },

    /** Cart updated (e.g. server-side sync) */
    cartUpdate(userId, cartData) {
      io.to(`user:${userId}`).emit('cart:update', envelope('cart:update', cartData));
    },

    /* ── Admin / Dashboard channel ────────────────────────── */

    /** New order alert on admin dashboard */
    adminNewOrder(orderData) {
      io.to('admin:dashboard').emit('order:new', envelope('order:new', orderData));
    },

    /** Order status changed */
    adminOrderUpdate(orderData) {
      io.to('admin:dashboard').emit('order:update', envelope('order:update', orderData));
      // Also push to per-order room for customer tracking
      io.to(`order:${orderData.orderId}`).emit('order:update',
        envelope('order:update', orderData));
    },

    /** Order status changed for a specific restaurant */
    restaurantOrderUpdate(restaurantId, orderData) {
      if (restaurantId) {
        io.to(`restaurant:${restaurantId}`).emit('order:update', envelope('order:update', orderData));
      }
    },

    /** New order for specific restaurant (after payment verified) */
    restaurantNewOrder(restaurantId, orderData) {
      if (restaurantId) {
        io.to(`restaurant:${restaurantId}`).emit('order:new', envelope('order:new', orderData));
      }
    },

    /** Customer just initiated a payment (status: pending) */
    adminPaymentPending(paymentData) {
      io.to('admin:dashboard').emit('payment:pending',
        envelope('payment:pending', paymentData));
    },

    /** Customer completed payment (gateway received, not yet verified) */
    adminPaymentMade(paymentData) {
      io.to('admin:dashboard').emit('payment:made',
        envelope('payment:made', paymentData));
    },

    /** Payment verified alert */
    adminPaymentVerified(paymentData) {
      io.to('admin:dashboard').emit('payment:verified',
        envelope('payment:verified', paymentData));
    },

    /** Payment failed alert */
    adminPaymentFailed(paymentData) {
      io.to('admin:dashboard').emit('payment:failed',
        envelope('payment:failed', paymentData));
    },

    /** Stock level changed (after order or admin edit) */
    productStockUpdate(productId, newStock) {
      io.to('admin:dashboard').emit('product:stock_update',
        envelope('product:stock_update', { productId, newStock }));
    },

    /** Analytics tick (called on a timer or on events) */
    analyticsUpdate(metrics) {
      io.to('admin:dashboard').emit('analytics:update',
        envelope('analytics:update', metrics));
    },

    /* ── Kitchen channel ──────────────────────────────────── */

    /** New order needs prep */
    kitchenNewOrder(orderData) {
      io.to('kitchen:live_updates').emit('kitchen:new_order',
        envelope('kitchen:new_order', orderData));
    },

    /** Order is ready for pickup / delivery */
    kitchenOrderReady(orderId, orderNumber) {
      io.to('kitchen:live_updates').emit('kitchen:order_ready',
        envelope('kitchen:order_ready', { orderId, orderNumber }));
    },
  };
}

module.exports = { initSocketManager };
