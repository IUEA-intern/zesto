'use strict';

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'zesto_token';
const JWT_SECRET  = process.env.JWT_SECRET || 'zesto_jwt_secret';

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, cookiePair) => {
    const [rawName, rawValue] = cookiePair.split('=');
    if (!rawName || !rawValue) return cookies;
    cookies[rawName.trim()] = decodeURIComponent(rawValue.trim());
    return cookies;
  }, {});
}

function getToken(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[COOKIE_NAME] || null;
}

function verifyToken(req) {
  const token = getToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  req.user = payload;
  return next();
}

function requireAdmin(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  if (payload.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  req.user = payload;
  return next();
}

function optionalAuth(req, res, next) {
  const payload = verifyToken(req);
  if (payload) {
    req.user = payload;
  }
  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth };