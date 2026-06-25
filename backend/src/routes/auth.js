"use strict";

/**
 * routes/auth.js
 * FILE: khalas/backend/src/routes/auth.js  (REPLACE existing)
 * ─────────────────────────────────────────────────────────────────────
 * Customer-only auth routes. No restaurant or rider registration here
 * — those have their own dedicated pages and controllers.
 *
 * All logic lives in controllers/authController.js.
 * This file is intentionally thin: mount → delegate → done.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Routes:
 *   POST  /api/auth/register/customer   → controller.registerCustomer
 *   POST  /api/auth/login               → controller.login
 *   POST  /api/auth/logout              → controller.logout
 *   GET   /api/auth/me                  → controller.getMe
 */

const express = require("express");
const router = express.Router();
const controller = require("../controllers/authController");
const onController = require("../controllers/onboardingController")

router.post("/register/customer", controller.registerCustomer);
router.post("/login", controller.login);
router.post("/logout", controller.logout);
router.get("/me", controller.getMe);

router.post("/register/restaurant", onController.registerRestaurantAdmin);
router.post("/restaurant", onController.registerRestaurantAdmin);
router.post("/register/rider", onController.registerRider);
router.post("/rider", onController.registerRider);

module.exports = router;
