'use strict';

/**
 * routes/superAdmin.js
 * All routes require super_admin (or legacy admin) role.
 *
 * GET  /api/super-admin/stats
 * GET  /api/super-admin/restaurants
 * GET  /api/super-admin/restaurants/:id
 * PUT  /api/super-admin/restaurants/:id/approve
 * PUT  /api/super-admin/restaurants/:id/suspend
 * GET  /api/super-admin/riders
 * PUT  /api/super-admin/riders/:id/approve
 * PUT  /api/super-admin/riders/:id/suspend
 * GET  /api/super-admin/users
 * GET  /api/super-admin/analytics
 * GET  /api/super-admin/settings
 * PUT  /api/super-admin/settings
 */

const express = require('express');
const router  = express.Router();
const { requireSuperAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/superAdminController');

router.use(requireSuperAdmin);

router.get('/stats',                        ctrl.getPlatformStats);

router.get('/restaurants',                  ctrl.getRestaurants);
router.get('/restaurants/:id',              ctrl.getRestaurantById);
router.put('/restaurants/:id/approve',      ctrl.approveRestaurant);
router.put('/restaurants/:id/suspend',      ctrl.suspendRestaurant);

router.get('/riders',                       ctrl.getRiders);
router.put('/riders/:id/approve',           ctrl.approveRider);
router.put('/riders/:id/suspend',           ctrl.suspendRider);

router.get('/users',                        ctrl.getUsers);

router.get('/analytics',                    ctrl.getPlatformAnalytics);

router.get('/settings',                     ctrl.getSettings);
router.put('/settings',                     ctrl.updateSettings);

module.exports = router;