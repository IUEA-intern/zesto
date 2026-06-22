'use strict';

/**
 * routes/restaurantAdmin.js
 * FILE: khalas/backend/src/routes/restaurantAdmin.js
 *
 * FIX: Added GET /orders/:id and GET /products/:id routes
 * that were missing in the previous version.
 */

const express = require('express');
const router  = express.Router();
const { requireRestaurantAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/restaurantAdminController');

router.use(requireRestaurantAdmin);

router.get('/dashboard',          ctrl.getDashboard);

router.get('/orders',             ctrl.getOrders);
router.get('/orders/:id',         ctrl.getOrderById);       // FIX: was missing
router.put('/orders/:id/status',  ctrl.updateOrderStatus);

router.get('/products',           ctrl.getProducts);
router.get('/products/:id',       ctrl.getProductById);     // FIX: was missing
router.post('/products',          ctrl.createProduct);
router.put('/products/:id',       ctrl.updateProduct);
router.delete('/products/:id',    ctrl.deleteProduct);

router.get('/analytics',          ctrl.getAnalytics);

router.get('/settings',           ctrl.getSettings);
router.put('/settings',           ctrl.updateSettings);

module.exports = router;