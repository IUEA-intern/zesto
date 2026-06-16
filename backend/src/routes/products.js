/**
 * server/routes/products.js
 * GET /api/products        — list all active products (with optional category filter)
 * GET /api/products/:id    — single product by ID
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');

/* ── GET /api/products ─────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let sql    = 'SELECT * FROM products WHERE is_active = 1';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY category, product_id';

    const products = await query(sql, params);
    return res.json({ success: true, data: products });
  } catch (err) {
    console.error('[GET /api/products]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
});

/* ── GET /api/products/:id ─────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id || id < 1) {
      return res.status(400).json({ success: false, message: 'Invalid product ID.' });
    }

    const rows = await query(
      'SELECT * FROM products WHERE product_id = ? AND is_active = 1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[GET /api/products/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch product.' });
  }
});

module.exports = router;