'use strict';

/**
 * routes/auth.js
 * Public auth endpoints — no authentication required.
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/authController');
const onController = require('../controllers/onboardingController');
const emailVerificationController = require('../controllers/emailVerificationController');
const { optionalAuth, requireAuth } = require('../middleware/auth');

router.post('/register/customer', controller.registerCustomer);
router.post('/login',             controller.login);
router.post('/send-code',         emailVerificationController.sendCode);
router.post('/verify-code',       emailVerificationController.verifyCode);
// optionalAuth attaches req.user (from cookie or Bearer token) if present,
// so logout can flip a rider's is_available flag off without blocking
// logout for callers that aren't authenticated (logout stays idempotent).
router.post('/logout',            optionalAuth, controller.logout);
router.get('/me',                 controller.getMe);
router.post('/mobile-token',      controller.mobileToken);

// ── Account settings — any authenticated user ────────────────────
router.get('/profile',            requireAuth, controller.getProfile);
router.patch('/profile',          requireAuth, controller.updateProfile);
router.post('/change-password',   requireAuth, controller.changePassword);

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
