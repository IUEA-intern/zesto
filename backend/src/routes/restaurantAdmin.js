'use strict';

/**
 * routes/restaurantAdmin.js
 * FILE: khalas/backend/src/routes/restaurantAdmin.js
 *
 * FIX: Added GET /orders/:id and GET /products/:id routes
 * that were missing in the previous version.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { query } = require('../config/db');
const multer = require('multer');
const router  = express.Router();
const { requireRestaurantAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/restaurantAdminController');

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const rid = req.restaurantId || req.params.restaurantId || null;
		if (!rid) return cb(new Error('Restaurant ID missing'), null);
		// Save uploads to backend/uploads/restaurants/:rid so it matches app static serving
		const uploadPath = path.join(__dirname, '../../uploads/restaurants', String(rid));
		fs.mkdirSync(uploadPath, { recursive: true });
		cb(null, uploadPath);
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		cb(null, `logo_${Date.now()}${ext}`);
	},
});

const upload = multer({ storage });

async function maybeUploadLogo(req, res, next) {
	if (!req.is('multipart/form-data')) return next();
	const userId = req.user?.user_id || req.user?.id;
	if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
	try {
		const rows = await query('SELECT restaurant_id FROM restaurants WHERE owner_user_id=? LIMIT 1', [userId]);
		if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ success: false, message: 'Restaurant not found.' });
		req.restaurantId = rows[0].restaurant_id;
		upload.single('logo')(req, res, next);
	} catch (err) {
		next(err);
	}
}

router.use(requireRestaurantAdmin);

router.get('/dashboard',          ctrl.getDashboard);

router.get('/orders',             ctrl.getOrders);
router.get('/orders/:id',         ctrl.getOrderById);       // FIX: was missing
router.put('/orders/:id/status',  ctrl.updateOrderStatus);
router.post('/orders/:id/confirm-delivery', ctrl.confirmDelivery);

router.get('/products',           ctrl.getProducts);
router.get('/products/:id',       ctrl.getProductById);     // FIX: was missing
router.post('/products',          ctrl.createProduct);
router.put('/products/:id',       ctrl.updateProduct);
router.delete('/products/:id',    ctrl.deleteProduct);

router.get('/analytics',          ctrl.getAnalytics);

router.get('/settings',           ctrl.getSettings);
router.put('/settings',           maybeUploadLogo, ctrl.updateSettings);

module.exports = router;