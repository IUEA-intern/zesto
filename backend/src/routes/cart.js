/**
 * server/routes/cart.js
 * GET    /api/cart         — fetch current user's cart (with product details)
 * POST   /api/cart         — add / upsert item
 * PUT    /api/cart/:id     — update qty
 * DELETE /api/cart/:id     — remove item
 * DELETE /api/cart         — clear entire cart
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// All cart endpoints require a logged-in session
router.use(requireAuth);

/* ── GET /api/cart ─────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT
        ci.cart_id,
        ci.qty,
        ci.added_at,
        p.product_id,
        p.name,
        p.category_id,
        p.type,
        p.image_url,
        p.price,
        p.stock
      FROM cart_items ci
      JOIN products p ON p.product_id = ci.product_id
      WHERE ci.user_id = ? AND p.is_active = 1
      ORDER BY ci.added_at DESC`,
      [req.user.user_id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /api/cart]', err);
    return res.status(500).json({ success: false, message: 'Failed to load cart.' });
  }
});

/* ── POST /api/cart ────────────────────────────────────────── */
router.post('/', async (req, res) => {
  try {
    const { product_id, qty = 1 } = req.body;
    if (!product_id) {
      return res.status(400).json({ success: false, message: 'product_id is required.' });
    }

    const parsedQty = parseInt(qty);
    if (parsedQty < 1) {
      return res.status(400).json({ success: false, message: 'qty must be at least 1.' });
    }

    // Verify product exists and has stock
    const products = await query(
      'SELECT product_id, stock FROM products WHERE product_id = ? AND is_active = 1',
      [product_id]
    );
    if (!products.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    if (products[0].stock < parsedQty) {
      return res.status(400).json({ success: false, message: 'Insufficient stock.' });
    }

    // Upsert: increase qty if already in cart
    await query(
      `INSERT INTO cart_items (user_id, product_id, qty)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty), updated_at = CURRENT_TIMESTAMP`,
      [req.user.user_id, product_id, parsedQty]
    );

    return res.status(201).json({ success: true, message: 'Item added to cart.' });
  } catch (err) {
    console.error('[POST /api/cart]', err);
    return res.status(500).json({ success: false, message: 'Failed to add item.' });
  }
});

/* ── PUT /api/cart/:id ─────────────────────────────────────── */
router.put('/:id', async (req, res) => {
  try {
    const cartId = parseInt(req.params.id);
    const qty    = parseInt(req.body.qty);

    if (!cartId || qty < 1) {
      return res.status(400).json({ success: false, message: 'Valid cart_id and qty >= 1 required.' });
    }

    const result = await query(
      `UPDATE cart_items SET qty = ?, updated_at = CURRENT_TIMESTAMP
       WHERE cart_id = ? AND user_id = ?`,
      [qty, cartId, req.user.user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    return res.json({ success: true, message: 'Cart updated.' });
  } catch (err) {
    console.error('[PUT /api/cart/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to update cart.' });
  }
});

/* ── DELETE /api/cart/:id ──────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const cartId = parseInt(req.params.id);
    if (!cartId) {
      return res.status(400).json({ success: false, message: 'Invalid cart ID.' });
    }

    const result = await query(
      'DELETE FROM cart_items WHERE cart_id = ? AND user_id = ?',
      [cartId, req.user.user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    return res.json({ success: true, message: 'Item removed from cart.' });
  } catch (err) {
    console.error('[DELETE /api/cart/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to remove item.' });
  }
});

/* ── DELETE /api/cart (clear all) ──────────────────────────── */
router.delete('/', async (req, res) => {
  try {
    await query('DELETE FROM cart_items WHERE user_id = ?', [req.user.user_id]);
    return res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) {
    console.error('[DELETE /api/cart]', err);
    return res.status(500).json({ success: false, message: 'Failed to clear cart.' });
  }
});

module.exports = router;