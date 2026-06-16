'use strict';

/**
 * middleware/auth.js
 * FILE: khalas/backend/src/middleware/auth.js  (REPLACE existing)
 *
 * Fix: requireAdmin now accepts 'super_admin' so existing /api/admin/*
 * routes keep working after the migration promotes admin@zesto.ug to super_admin.
 */

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'zesto_token';
const JWT_SECRET  = process.env.JWT_SECRET || 'zesto_jwt_secret';

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return cookies;
    const name  = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    try { cookies[name] = decodeURIComponent(value); } catch { cookies[name] = value; }
    return cookies;
  }, {});
}

function verifyToken(req) {
  // Support both cookie and Authorization header
  let token = null;
  if (req.headers.cookie) {
    token = parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
  }
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  }
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Any authenticated user */
function requireAuth(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  req.user = payload;
  return next();
}

/**
 * Legacy admin guard — accepts admin, staff, AND super_admin.
 * Keeps all existing /api/admin/* routes working after migration.
 * BUG FIX: original only checked role === 'admin', locking out super_admin.
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

/** Strict: super_admin only (new marketplace routes) */
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

/** Attach user if logged in, continue either way */
function optionalAuth(req, res, next) {
  const payload = verifyToken(req);
  if (payload) req.user = payload;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,       // legacy — used by /api/admin/* (accepts admin|staff|super_admin)
  requireSuperAdmin,  // strict — used by /api/super-admin/*
  requireRestaurantAdmin,
  requireRider,
  optionalAuth,
};