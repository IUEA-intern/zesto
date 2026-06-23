'use strict';

/**
 * middleware/auth.js
 * FILE: khalas/backend/src/middleware/auth.js  (REPLACE existing)
 * ─────────────────────────────────────────────────────────────────────
 * JWT verification and route guards.
 *
 * Guards exported:
 *   requireAuth          — any authenticated user (all roles)
 *   requireAdmin         — admin | staff | super_admin  (legacy /api/admin/*)
 *   requireSuperAdmin    — super_admin only             (/api/super-admin/*)
 *   requireRestaurantAdmin — restaurant_admin only
 *   requireRider         — rider only
 *   optionalAuth         — attaches req.user if logged in, never blocks
 *
 * Token is read from the httpOnly cookie first, then the Authorization
 * header as a fallback (useful for API clients / Postman testing).
 * ─────────────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'zesto_token';
const JWT_SECRET  = process.env.JWT_SECRET || 'zesto_jwt_secret';

// ── Internal: parse cookies from raw header string ─────────────────
function parseCookies(header = '') {
  return header.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return acc;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try { acc[key] = decodeURIComponent(val); } catch { acc[key] = val; }
    return acc;
  }, {});
}

// ── Internal: extract and verify the JWT from the request ──────────
function verifyToken(req) {
  let token = null;

  // 1. Cookie (preferred — httpOnly, safe from XSS)
  if (req.headers.cookie) {
    token = parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
  }

  // 2. Authorization: Bearer <token> fallback
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  }

  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    // Expired, tampered, or wrong secret — treat as unauthenticated
    return null;
  }
}

// ── Guards ─────────────────────────────────────────────────────────

/** Any authenticated user (customer, staff, admin, restaurant_admin, rider, super_admin) */
function requireAuth(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  req.user = payload;
  return next();
}

/**
 * Admin guard — accepts admin | staff | super_admin.
 * Used by existing /api/admin/* routes so they keep working after
 * admin@zesto.ug was promoted to super_admin in the schema seed.
 */
function requireAdmin(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  if (!['admin', 'staff', 'super_admin'].includes(payload.role)) {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  req.user = payload;
  return next();
}

/** Strict super-admin guard — used by /api/super-admin/* routes */
function requireSuperAdmin(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  if (!['admin', 'super_admin'].includes(payload.role)) {
    return res.status(403).json({ success: false, message: 'Super admin access required.' });
  }
  req.user = payload;
  return next();
}

/** Restaurant admin only */
function requireRestaurantAdmin(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  if (payload.role !== 'restaurant_admin') {
    return res.status(403).json({ success: false, message: 'Restaurant admin access required.' });
  }
  req.user = payload;
  return next();
}

/** Rider only */
function requireRider(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  if (payload.role !== 'rider') {
    return res.status(403).json({ success: false, message: 'Rider access required.' });
  }
  req.user = payload;
  return next();
}

/** Attaches req.user if logged in, but never blocks the request */
function optionalAuth(req, res, next) {
  const payload = verifyToken(req);
  if (payload) req.user = payload;
  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  requireRestaurantAdmin,
  requireRider,
  optionalAuth,
};