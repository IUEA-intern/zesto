// routes/categories.js
const express = require('express');
const db      = require('../db');
const { auth, requireAdmin } = require('../middleware/auth');
const router  = express.Router();

// Public: list active categories
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, icon_url FROM categories WHERE is_active = TRUE ORDER BY sort_order, name'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Admin: create category
router.post('/', auth, requireAdmin, async (req, res, next) => {
  try {
    const { name, icon_url, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [result] = await db.query(
      'INSERT INTO categories (name, icon_url, sort_order) VALUES (?,?,?)',
      [name, icon_url || null, sort_order || 0]
    );
    res.status(201).json({ id: result.insertId, name });
  } catch (err) { next(err); }
});

// Admin: toggle active
router.patch('/:id', auth, requireAdmin, async (req, res, next) => {
  try {
    const { is_active } = req.body;
    await db.query('UPDATE categories SET is_active = ? WHERE id = ?', [is_active, req.params.id]);
    res.json({ message: 'Category updated' });
  } catch (err) { next(err); }
});

module.exports = router;
