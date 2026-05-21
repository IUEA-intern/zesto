// middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Verifies the Bearer token in the Authorization header.
 * On success, attaches the decoded payload to req.user.
 * The payload shape is: { id, email, role }
 */
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const token = header.slice(7); // strip "Bearer "
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired' });
    }
    return res.status(401).json({ error: 'Invalid access token' });
  }
}

/**
 * Must be used AFTER auth middleware.
 * Blocks any request where the authenticated user is not an admin.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { auth, requireAdmin };
