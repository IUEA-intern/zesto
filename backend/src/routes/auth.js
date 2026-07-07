'use strict';

/**
 * routes/auth.js
 * Public auth endpoints — no authentication required.
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/authController');
const onController = require('../controllers/onboardingController');

router.post('/register/customer', controller.registerCustomer);
router.post('/login',             controller.login);
router.post('/logout',            controller.logout);
router.get('/me',                 controller.getMe);
router.post('/mobile-token',      controller.mobileToken);

// ── Rider registration with OTP email verification ──────────────
router.post('/rider/send-otp',    controller.riderSendOtp);
router.post('/rider/verify-otp',  controller.riderVerifyOtp);
router.post('/rider/register',    controller.riderRegister);

// ── Restaurant onboarding ───────────────────────────────────────
router.post('/register/restaurant', onController.registerRestaurantAdmin);
router.post('/restaurant',          onController.registerRestaurantAdmin);
router.post('/register/rider',      onController.registerRider);
router.post('/rider',               onController.registerRider);

module.exports = router;
