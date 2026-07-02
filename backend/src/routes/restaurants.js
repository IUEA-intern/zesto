'use strict';

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');

/**
 * GET /api/restaurants
 * List all approved and active restaurants.
 */
router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT
        restaurant_id, name, slug, logo_url, description, status,
        phone, email, address, commission_pct
      FROM restaurants
      WHERE status = 'approved'
      ORDER BY name ASC`;

    const rows = await query(sql);

    // Map rows to match the frontend expectations if needed,
    // though we'll update the frontend to match the DB schema.
    const restaurants = rows.map(r => ({
      ...r,
      id: r.restaurant_id, // alias for frontend
      bannerBg: '#F5F5F5', // Default bg
      rating: 4.5,         // Placeholder as not in schema
      deliveryTime: '20-30 min', // Placeholder
      deliveryFee: '5,000 UGX',  // Placeholder
      minOrder: 'Min. 10,000 UGX', // Placeholder
      tags: ['Restaurant'] // Placeholder
    }));

    return res.json({ success: true, data: restaurants });
  } catch (err) {
    console.error('[GET /api/restaurants]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurants.' });
  }
});

/**
 * GET /api/restaurants/:id
 * Get details for a single restaurant.
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const rows = await query(
      'SELECT * FROM restaurants WHERE restaurant_id = ? AND status = "approved"',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Restaurant not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[GET /api/restaurants/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurant.' });
  }
});

module.exports = router;
