// routes/cart.js
const express     = require('express');
const { auth }    = require('../middleware/auth');
const cartService = require('../services/cartService');
const router      = express.Router();

router.use(auth);

const EMPTY = { items: [], subtotal: 0, total: 0 };

router.get('/', async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.user.id);
    res.json(cart || EMPTY);
  } catch (err) { next(err); }
});

router.post('/items', async (req, res, next) => {
  try {
    const cart = await cartService.addOrUpdateItem(req.user.id, req.body);
    res.json(cart || EMPTY);
  } catch (err) { next(err); }
});

router.delete('/', async (req, res, next) => {
  try {
    await cartService.clearCart(req.user.id);
    res.json({ message: 'Cart cleared' });
  } catch (err) { next(err); }
});

module.exports = router;
