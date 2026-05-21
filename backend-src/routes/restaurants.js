// routes/restaurants.js
const express          = require('express');
const { auth, requireAdmin } = require('../middleware/auth');
const restaurantRepo   = require('../repos/restaurantRepo');
const AppError         = require('../utils/AppError');
const router           = express.Router();

function parsePagination(query) {
  const limit  = Math.min(Math.max(parseInt(query.limit)  || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset) || 0, 0);
  return { limit, offset };
}

// ── Public routes ────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const rows = await restaurantRepo.list({ ...req.query, limit, offset });
    res.json({ data: rows, limit, offset });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const restaurant = await restaurantRepo.findById(req.params.id);
    if (!restaurant) throw new AppError('Restaurant not found', 404);
    res.json(restaurant);
  } catch (err) { next(err); }
});

router.get('/:id/menu', async (req, res, next) => {
  try {
    const restaurant = await restaurantRepo.findById(req.params.id);
    if (!restaurant) throw new AppError('Restaurant not found', 404);
    const menu = await restaurantRepo.getMenu(req.params.id);
    res.json({ restaurant, menu });
  } catch (err) { next(err); }
});

// ── Admin routes ─────────────────────────────────────────────────────────────

router.post('/', auth, requireAdmin, async (req, res, next) => {
  try {
    const { category_id, name, address } = req.body;
    if (!category_id || !name || !address) {
      throw new AppError('category_id, name and address are required');
    }
    const id = await restaurantRepo.create(req.body);
    res.status(201).json({ id, message: 'Restaurant created' });
  } catch (err) { next(err); }
});

router.patch('/:id', auth, requireAdmin, async (req, res, next) => {
  try {
    await restaurantRepo.update(req.params.id, req.body);
    res.json({ message: 'Restaurant updated' });
  } catch (err) { next(err); }
});

// Menu item management (admin only)
router.post('/:id/menu', auth, requireAdmin, async (req, res, next) => {
  try {
    const { name, price } = req.body;
    if (!name || price === undefined) throw new AppError('name and price are required');
    const itemId = await restaurantRepo.createMenuItem({ ...req.body, restaurant_id: req.params.id });
    res.status(201).json({ id: itemId, message: 'Menu item created' });
  } catch (err) { next(err); }
});

router.patch('/:id/menu/:itemId', auth, requireAdmin, async (req, res, next) => {
  try {
    await restaurantRepo.updateMenuItem(req.params.itemId, req.body);
    res.json({ message: 'Menu item updated' });
  } catch (err) { next(err); }
});

router.delete('/:id/menu/:itemId', auth, requireAdmin, async (req, res, next) => {
  try {
    await restaurantRepo.deleteMenuItem(req.params.itemId);
    res.json({ message: 'Menu item deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
