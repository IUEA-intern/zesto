/**
 * server/middleware/rateLimit.js
 * Simple in-process rate limiter (no Redis dependency).
 * For production multi-instance, swap store for Redis.
 */

'use strict';

const store = new Map(); // ip → { count, resetAt }

/**
 * createLimiter(options)
 * @param {number} windowMs   — window in milliseconds
 * @param {number} max        — max requests per window per IP
 * @param {string} message    — error message to return
 */
function createLimiter({ windowMs = 60_000, max = 60, message = 'Too many requests.' } = {}) {
  return function rateLimiter(req, res, next) {
    const ip  = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
    } else {
      entry.count++;
    }

    store.set(ip, entry);

    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset',     Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      return res.status(429).json({ success: false, message });
    }
    next();
  };
}

// Preset limiters
const authLimiter    = createLimiter({ windowMs: 15 * 60_000, max: 20,  message: 'Too many login attempts. Try again in 15 minutes.' });
const paymentLimiter = createLimiter({ windowMs: 10 * 60_000, max: 10,  message: 'Too many payment requests.' });
const apiLimiter     = createLimiter({ windowMs:      60_000, max: 120, message: 'Request limit exceeded.' });

// Cleanup old entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(ip);
  }
}, 5 * 60_000);

module.exports = { createLimiter, authLimiter, paymentLimiter, apiLimiter };