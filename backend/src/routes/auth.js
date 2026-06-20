'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query } = require('../config/db');

const COOKIE_NAME = 'zesto_token';
const JWT_SECRET  = process.env.JWT_SECRET || 'zesto_jwt_secret';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function createToken(user) {
  return jwt.sign({
    user_id: user.user_id,
    name:    user.name,
    email:   user.email,
    role:    user.role,
  }, JWT_SECRET, { expiresIn: '7d' });
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_MAX_AGE,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.cookie(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
}

const DEFAULT_ADMIN = {
  email: 'admin@zesto.ug',
  name:  'Zesto Admin',
  role:  'admin',
  passwordHash: '$2a$12$BFul7quywglSAzuEVzuHHOi.1BlFA4bAAzMelZJwS.XsrNQQeWS0W'
};

async function ensureDefaultAdmin() {
  const existing = await query('SELECT user_id FROM users WHERE email = ?', [DEFAULT_ADMIN.email]);
  if (existing && existing.length > 0) {
    return;
  }

  const insertResult = await query(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = user_id',
    [DEFAULT_ADMIN.name, DEFAULT_ADMIN.email, DEFAULT_ADMIN.passwordHash, DEFAULT_ADMIN.role]
  );

  try {
    await query(
      'INSERT IGNORE INTO admin_users (user_id) SELECT user_id FROM users WHERE email = ?',
      [DEFAULT_ADMIN.email]
    );
  } catch (err) {
    if (err && err.code !== 'ER_NO_SUCH_TABLE') {
      throw err;
    }
    console.warn('[ensureDefaultAdmin] admin_users table missing, skipping admin_users seed');
  }

  return insertResult;
}

// ── CUSTOMER REGISTRATION ───────────────────────────────────────────
router.post('/register/customer', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }

    const existing = await query('SELECT user_id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing && existing.length) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'customer')`,
      [name.trim(), email.toLowerCase().trim(), phone ? phone.trim() : null, hashed]
    );

    const users = await query('SELECT user_id, name, email, role FROM users WHERE user_id = ?', [result.insertId]);
    const user = users && users.length > 0 ? users[0] : null;
    
    if (!user) {
      return res.status(500).json({ success: false, message: 'User creation failed.' });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({ success: true, message: 'Registered successfully.', user: buildUserPayload(user) });
  } catch (err) {
    console.error('[POST /api/auth/register/customer]', err);
    return res.status(500).json({ success: false, message: 'Registration failed.' });
  }
});

// ── RESTAURANT REGISTRATION ───────────────────────────────────────────
router.post('/register/restaurant', async (req, res) => {
  try {
    const { name, email, phone, password, businessName, address, description } = req.body;
    if (!name || !email || !password || !businessName || !address) {
      return res.status(400).json({ success: false, message: 'Owner name, email, password, business name and address are required.' });
    }

    const existing = await query('SELECT user_id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing && existing.length) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    
    const userResult = await query(
      `INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'restaurant_admin')`,
      [name.trim(), email.toLowerCase().trim(), phone ? phone.trim() : null, hashed]
    );
    const ownerUserId = userResult.insertId;

    // Generate unique slug
    let slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    if (!slug) slug = 'restaurant-' + Date.now();
    let isUnique = false;
    let suffix = 0;
    let tempSlug = slug;
    while (!isUnique) {
      const existingSlug = await query('SELECT restaurant_id FROM restaurants WHERE slug = ?', [tempSlug]);
      if (existingSlug && existingSlug.length > 0) {
        suffix++;
        tempSlug = `${slug}-${suffix}`;
      } else {
        slug = tempSlug;
        isUnique = true;
      }
    }

    await query(
      `INSERT INTO restaurants (owner_user_id, name, slug, phone, email, address, description, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')`,
      [ownerUserId, businessName.trim(), slug, phone ? phone.trim() : null, email.toLowerCase().trim(), address.trim(), description ? description.trim() : null]
    );

    const users = await query('SELECT user_id, name, email, role FROM users WHERE user_id = ?', [ownerUserId]);
    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      return res.status(500).json({ success: false, message: 'Restaurant user creation failed.' });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({ 
      success: true, 
      message: 'Restaurant registered successfully.', 
      user: buildUserPayload(user) 
    });
  } catch (err) {
    console.error('[POST /api/auth/register/restaurant]', err);
    return res.status(500).json({ success: false, message: 'Restaurant registration failed.' });
  }
});

// ── RIDER REGISTRATION ────────────────────────────────────────────────
router.post('/register/rider', async (req, res) => {
  try {
    const { name, email, phone, password, vehicleType, vehicleNumber, nationalId } = req.body;
    if (!name || !email || !password || !vehicleType || !vehicleNumber || !nationalId) {
      return res.status(400).json({ success: false, message: 'Name, email, password, vehicle type, registration number, and national ID are required.' });
    }

    const existing = await query('SELECT user_id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing && existing.length) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const userResult = await query(
      `INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'rider')`,
      [name.trim(), email.toLowerCase().trim(), phone ? phone.trim() : null, hashed]
    );
    const userId = userResult.insertId;

    await query(
      `INSERT INTO riders (user_id, vehicle_type, vehicle_number, national_id, status) 
       VALUES (?, ?, ?, ?, 'approved')`,
      [userId, vehicleType, vehicleNumber.trim(), nationalId.trim()]
    );

    const users = await query('SELECT user_id, name, email, role FROM users WHERE user_id = ?', [userId]);
    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      return res.status(500).json({ success: false, message: 'Rider user creation failed.' });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({ 
      success: true, 
      message: 'Rider registered successfully.', 
      user: buildUserPayload(user) 
    });
  } catch (err) {
    console.error('[POST /api/auth/register/rider]', err);
    return res.status(500).json({ success: false, message: 'Rider registration failed.' });
  }
});

// ── UNIFIED LOGIN ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail === DEFAULT_ADMIN.email) {
      await ensureDefaultAdmin();
    }

    const users = await query('SELECT user_id, name, email, password, role FROM users WHERE email = ?', [normalizedEmail]);
    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.json({ success: true, message: 'Logged in successfully.', user: buildUserPayload(user) });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

// ── LOGOUT ───────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true, message: 'You have been logged out.' });
});

// ── GET ME (SESSION CHECK) ───────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!token) {
      return res.status(200).json({ success: true, user: null });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({ success: true, user: buildUserPayload(payload) });
  } catch (_err) {
    clearAuthCookie(res);
    return res.status(200).json({ success: true, user: null });
  }
});

module.exports = router;
