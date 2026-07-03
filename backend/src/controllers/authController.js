'use strict';

/**
 * controllers/authController.js
 * FILE: khalas/backend/src/controllers/authController.js
 * ─────────────────────────────────────────────────────────────────────
 * Handles all customer authentication:
 *   registerCustomer — validates, hashes password, inserts into users table
 *   login            — validates, checks hash, issues JWT cookie
 *   logout           — clears cookie
 *   getMe            — reads JWT cookie and returns current session
 *
 * Server-side validation mirrors the frontend so that direct API calls
 * (e.g. Postman, curl) are also protected.
 * ─────────────────────────────────────────────────────────────────────
 */

const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const { query }   = require('../config/db');
const { consumeEmailVerification } = require('./emailVerificationController');

// ── Constants ──────────────────────────────────────────────────────
const COOKIE_NAME   = 'zesto_token';
const JWT_SECRET    = process.env.JWT_SECRET || 'zesto_jwt_secret';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const BCRYPT_ROUNDS = 10;

// RFC-5321 friendly email regex
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Ugandan phone: 07XXXXXXXX or +2567XXXXXXXX (spaces stripped before test)
const PHONE_RE = /^(\+?256|0)7\d{8}$/;

// ── JWT / cookie helpers ───────────────────────────────────────────

function createToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      name:    user.name,
      email:   user.email,
      role:    user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function buildUserPayload(user) {
  return {
    user_id: user.user_id,
    name:    user.name,
    email:   user.email,
    role:    user.role,
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   TOKEN_MAX_AGE,
    path:     '/',
  });
}

function clearAuthCookie(res) {
  res.cookie(COOKIE_NAME, '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires:  new Date(0),
    path:     '/',
  });
}

// ── Server-side validators ─────────────────────────────────────────
// These run in the controller even when the frontend has already
// validated, because any HTTP client can bypass the browser.

/**
 * Validates all registration fields.
 * Returns the first error message string, or null if everything is fine.
 */
function validateRegistrationInput({ name, email, phone, password }) {
  if (!name || !name.trim()) return 'Full name is required.';
  if (name.trim().length < 2)   return 'Name must be at least 2 characters.';
  if (name.trim().length > 120) return 'Name must be 120 characters or fewer.';

  if (!email || !email.trim())     return 'Email address is required.';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address (e.g. you@example.com).';
  if (email.trim().length > 180)   return 'Email address is too long.';

  // Phone is optional — only validate format when provided
  if (phone && phone.trim()) {
    const stripped = phone.trim().replace(/\s/g, '');
    if (!PHONE_RE.test(stripped)) {
      return 'Enter a valid Ugandan phone number (e.g. 0712345678 or +256712345678).';
    }
  }

  if (!password)              return 'Password is required.';
  if (password.length < 6)   return 'Password must be at least 6 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';

  return null; // all good
}

/**
 * Validates login fields.
 * Returns first error string, or null if fine.
 */
function validateLoginInput({ email, password }) {
  if (!email || !email.trim())      return 'Email address is required.';
  if (!EMAIL_RE.test(email.trim()))  return 'Enter a valid email address.';
  if (!password)                     return 'Password is required.';
  return null;
}

// ── Default admin seed ─────────────────────────────────────────────
// Schema already seeds admin@zesto.ug, but this guard ensures the row
// is present even if someone runs the app against a half-initialised DB.
const DEFAULT_ADMIN = {
  email:        'admin@zesto.ug',
  name:         'Zesto Admin',
  role:         'super_admin',
  // bcrypt hash of 'Admin@123' — matches the schema seed
  passwordHash: '$2a$12$BFul7quywglSAzuEVzuHHOi.1BlFA4bAAzMelZJwS.XsrNQQeWS0W',
};

async function ensureDefaultAdmin() {
  try {
    const rows = await query('SELECT user_id FROM users WHERE email = ?', [DEFAULT_ADMIN.email]);
    if (rows && rows.length > 0) return;

    await query(
      `INSERT INTO users (name, email, password, role)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [DEFAULT_ADMIN.name, DEFAULT_ADMIN.email, DEFAULT_ADMIN.passwordHash, DEFAULT_ADMIN.role]
    );

    try {
      await query(
        `INSERT IGNORE INTO admin_users (user_id)
         SELECT user_id FROM users WHERE email = ?`,
        [DEFAULT_ADMIN.email]
      );
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  } catch (err) {
    console.error('[ensureDefaultAdmin] Seed failed:', err.message);
  }
}

// ── Controller functions ───────────────────────────────────────────

/**
 * POST /api/auth/register/customer
 *
 * Body: { name, email, phone?, password }
 *
 * Flow:
 *   1. Server-side validation
 *   2. Duplicate email check
 *   3. bcrypt hash the password
 *   4. INSERT INTO users (role = 'customer')
 *   5. SELECT the new row back (never trust INSERT body)
 *   6. Sign JWT → set httpOnly cookie
 *   7. Return { success, message, user }
 */
async function registerCustomer(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    // ── 1. Validate ────────────────────────────────────────────────
    const validationError = validateRegistrationInput({ name, email, phone, password });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanName       = name.trim();
    const cleanPhone      = phone && phone.trim()
      ? phone.trim().replace(/\s/g, '')
      : null;

    // ── 2. Duplicate email ─────────────────────────────────────────
    const existing = await query(
      'SELECT user_id FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please log in instead.',
      });
    }

    // ── 2.5 Require verified email ─────────────────────────────────
    const emailVerified = await consumeEmailVerification(normalizedEmail);
    if (!emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your email before creating an account.',
      });
    }

    // ── 3. Hash password ───────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // ── 4. INSERT user as customer ─────────────────────────────────
    const insertResult = await query(
      `INSERT INTO users (name, email, phone, password, role)
       VALUES (?, ?, ?, ?, 'customer')`,
      [cleanName, normalizedEmail, cleanPhone, hashedPassword]
    );

    if (!insertResult?.insertId) {
      console.error('[registerCustomer] INSERT returned no insertId');
      return res.status(500).json({
        success: false,
        message: 'Account creation failed. Please try again.',
      });
    }

    // ── 5. Fetch the created row ───────────────────────────────────
    const rows = await query(
      'SELECT user_id, name, email, role FROM users WHERE user_id = ?',
      [insertResult.insertId]
    );
    const user = rows?.[0] ?? null;

    if (!user) {
      return res.status(500).json({
        success: false,
        message: 'Account was created but could not be loaded. Please log in.',
      });
    }

    // ── 6. Issue token ─────────────────────────────────────────────
    const token = createToken(user);
    setAuthCookie(res, token);

    console.info(`[registerCustomer] New customer: ${normalizedEmail} (id=${user.user_id})`);

    // ── 7. Respond ─────────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: 'Welcome to Zesto! Your account has been created.',
      user:    buildUserPayload(user),
    });
  } catch (err) {
    console.error('[registerCustomer] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again later.',
    });
  }
}

/**
 * POST /api/auth/login
 *
 * Body: { email, password }
 *
 * Flow:
 *   1. Server-side validation
 *   2. Seed default admin if that email is used (safety net)
 *   3. Fetch user by email
 *   4. Check is_active flag
 *   5. bcrypt.compare password
 *   6. Fire-and-forget last_login update
 *   7. Sign JWT → set httpOnly cookie
 *   8. Return { success, message, user }
 *
 * Note: "not found" and "wrong password" both return 401 with the same
 * message to avoid leaking whether an email is registered.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // ── 1. Validate ────────────────────────────────────────────────
    const validationError = validateLoginInput({ email, password });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── 2. Seed default admin on first use ─────────────────────────
    if (normalizedEmail === DEFAULT_ADMIN.email) {
      await ensureDefaultAdmin();
    }

    // ── 3. Fetch user ──────────────────────────────────────────────
    const rows = await query(
      'SELECT user_id, name, email, password, role, is_active FROM users WHERE email = ?',
      [normalizedEmail]
    );
    const user = rows?.[0] ?? null;

    const GENERIC_ERROR = 'Invalid email or password.';

    if (!user) {
      return res.status(401).json({ success: false, message: GENERIC_ERROR });
    }

    // ── 4. Active check ────────────────────────────────────────────
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support@zesto.ug.',
      });
    }

    // ── 5. Password check ──────────────────────────────────────────
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: GENERIC_ERROR });
    }

    // ── 6. Update last_login (non-blocking) ────────────────────────
    query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id])
      .catch(err => console.warn('[login] last_login update failed:', err.message));

    // ── 7. Issue token ─────────────────────────────────────────────
    const token = createToken(user);
    setAuthCookie(res, token);

    console.info(`[login] ${normalizedEmail} logged in (role=${user.role})`);

    // ── 8. Respond ─────────────────────────────────────────────────
    return res.json({
      success: true,
      message: 'Logged in successfully.',
      user:    buildUserPayload(user),
    });
  } catch (err) {
    console.error('[login] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again later.',
    });
  }
}

/**
 * POST /api/auth/logout
 *
 * Clears the auth cookie. No auth required — idempotent.
 */
function logout(req, res) {
  clearAuthCookie(res);
  return res.json({ success: true, message: 'You have been logged out.' });
}

/**
 * GET /api/auth/me
 *
 * Returns the current session user from the JWT cookie.
 * Always responds 200 — returns { user: null } when not logged in.
 * The frontend uses this on every page load to restore session state.
 */
function getMe(req, res) {
  try {
    const token = req.cookies?.[COOKIE_NAME] ?? null;
    if (!token) {
      return res.status(200).json({ success: true, user: null });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({
      success: true,
      user:    buildUserPayload(payload),
    });
  } catch {
    // Token expired or tampered — expire the cookie and return empty session
    clearAuthCookie(res);
    return res.status(200).json({ success: true, user: null });
  }
}

// ── Exports ────────────────────────────────────────────────────────
module.exports = {
  registerCustomer,
  login,
  logout,
  getMe,
};