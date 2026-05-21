// routes/orders.js
const express      = require('express');
const { auth, requireAdmin } = require('../middleware/auth');
const orderService = require('../services/orderService');
const orderRepo    = require('../repos/orderRepo');
const AppError     = require('../utils/AppError');
const router       = express.Router();

router.use(auth);

function parsePagination(query) {
  const limit  = Math.min(Math.max(parseInt(query.limit)  || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset) || 0, 0);
  return { limit, offset };
}

// Customer: place order from cart
router.post('/', async (req, res, next) => {
  try {
    const result = await orderService.createFromCart(req.user.id, req.body);
    res.status(201).json({ message: 'Order created — proceed to payment', ...result });
  } catch (err) { next(err); }
});

// Customer: list own orders
router.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const rows = await orderRepo.listByUser(req.user.id, { limit, offset });
    res.json({ data: rows, limit, offset });
  } catch (err) { next(err); }
});

// Customer: get single order
router.get('/:id', async (req, res, next) => {
  try {
    const order = await orderRepo.findByIdAndUser(req.params.id, req.user.id);
    if (!order) throw new AppError('Order not found', 404);
    const items = await orderRepo.getItems(order.id);
    res.json({ ...order, items });
  } catch (err) { next(err); }
});

// Customer: cancel own order
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    await orderService.cancelOrder(req.params.id, req.user.id);
    res.json({ message: 'Order cancelled' });
  } catch (err) { next(err); }
});

// ── Admin routes ─────────────────────────────────────────────────────────────

// Admin: list all orders (filterable by status)
router.get('/admin/all', requireAdmin, async (req, res, next) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const rows = await orderRepo.listAll({ status: req.query.status, limit, offset });
    res.json({ data: rows, limit, offset });
  } catch (err) { next(err); }
});

// Admin: advance order status
router.patch('/admin/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) throw new AppError('status is required');
    const updated = await orderService.advanceStatus(req.params.id, status);
    res.json(updated);
  } catch (err) { next(err); }
});

module.exports = router;
