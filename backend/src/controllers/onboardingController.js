"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const { consumeEmailVerification } = require("./emailVerificationController");

const COOKIE_NAME = "zesto_token";
const JWT_SECRET = process.env.JWT_SECRET || "zesto_jwt_secret";
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

function createToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function buildUserPayload(user) {
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TOKEN_MAX_AGE,
    path: "/",
  });
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateRestaurantPayload(payload) {
  if (!payload.name) return "Please enter your full name.";
  if (!payload.email || !isValidEmail(payload.email)) return "Please enter a valid email address.";
  if (!payload.phone) return "Please enter your phone number.";
  if (!payload.password || payload.password.length < 8) return "Password must be at least 8 characters.";
  if (!payload.restaurantName) return "Please enter your restaurant name.";
  if (!payload.address) return "Please enter your restaurant address.";
  return null;
}

function validateRiderPayload(payload) {
  if (!payload.name) return "Please enter your full name.";
  if (!payload.email || !isValidEmail(payload.email)) return "Please enter a valid email address.";
  if (!payload.phone) return "Please enter your phone number.";
  if (!payload.password || payload.password.length < 8) return "Password must be at least 8 characters.";
  if (!payload.vehicleNumber) return "Please enter your vehicle registration number.";
  if (!payload.nationalId) return "Please enter your national ID.";
  return null;
}

function slugify(value) {
  const base = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "restaurant";
}

async function generateUniqueSlug(baseName) {
  const base = slugify(baseName);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const rows = await query("SELECT restaurant_id FROM restaurants WHERE slug = ?", [candidate]);
    if (!rows || rows.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function normalizeRestaurantPayload(body) {
  const restaurant = body && typeof body.restaurant === "object" ? body.restaurant : {};
  return {
    name: normalizeText(body?.name || restaurant.name || body?.restaurantName || body?.restaurant_name),
    email: normalizeText(body?.email || restaurant.email),
    phone: normalizeText(body?.phone || restaurant.phone),
    password: typeof body?.password === "string" ? body.password : "",
    restaurantName: normalizeText(body?.restaurantName || restaurant.name || body?.restaurant_name || body?.name),
    address: normalizeText(body?.restaurantAddress || restaurant.address || body?.address),
    latitude: body?.latitude ?? restaurant.latitude ?? null,
    longitude: body?.longitude ?? restaurant.longitude ?? null,
    description: normalizeText(body?.description || restaurant.description || body?.restaurantDescription),
  };
}

function normalizeRiderPayload(body) {
  const rider = body && typeof body.rider === "object" ? body.rider : {};
  return {
    name: normalizeText(body?.name || rider.name),
    email: normalizeText(body?.email || rider.email),
    phone: normalizeText(body?.phone || rider.phone),
    password: typeof body?.password === "string" ? body.password : "",
    vehicleType: normalizeText(body?.vehicleType || rider.vehicleType || body?.vehicle_type || rider.vehicle_type || "boda_boda"),
    vehicleNumber: normalizeText(body?.vehicleNumber || rider.vehicleNumber || body?.vehicle_number || body?.licensePlate || rider.licensePlate || rider.vehicle_number),
    nationalId: normalizeText(body?.nationalId || rider.nationalId || body?.national_id || rider.national_id),
  };
}

async function upsertUser({ name, email, phone, password, targetRole }) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  const cleanName = normalizeText(name);
  const cleanPhone = normalizeText(phone);

  const existingUsers = await query("SELECT user_id FROM users WHERE email = ?", [normalizedEmail]);

  if (existingUsers && existingUsers.length > 0) {
    const userId = existingUsers[0].user_id;
    await query(
      "UPDATE users SET role = ?, name = ?, phone = COALESCE(?, phone) WHERE user_id = ?",
      [targetRole, cleanName, cleanPhone || null, userId],
    );
    return userId;
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const insertResult = await query(
    "INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)",
    [cleanName, normalizedEmail, cleanPhone || null, hashedPassword, targetRole],
  );

  return insertResult.insertId;
}

async function ensureRestaurantProfile(userId, payload) {
  const existing = await query("SELECT restaurant_id FROM restaurants WHERE owner_user_id = ? LIMIT 1", [userId]);
  const slug = await generateUniqueSlug(payload.restaurantName || payload.name || "restaurant");
  const values = [
    userId,
    payload.restaurantName,
    slug,
    payload.phone || null,
    payload.email || null,
    payload.address || null,
    payload.latitude ?? null,
    payload.longitude ?? null,
    payload.description || null,
  ];

  if (existing && existing.length > 0) {
    await query(
      `UPDATE restaurants
       SET name = ?, slug = ?, phone = ?, email = ?, address = ?, latitude = ?, longitude = ?, description = ?
       WHERE owner_user_id = ?`,
      [...values.slice(1), userId],
    );
  } else {
    await query(
      `INSERT INTO restaurants (owner_user_id, name, slug, phone, email, address, latitude, longitude, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      values,
    );
  }
}

async function ensureRiderProfile(userId, payload) {
  const existing = await query("SELECT rider_id FROM riders WHERE user_id = ? LIMIT 1", [userId]);
  const values = [
    userId,
    payload.vehicleType || "boda_boda",
    payload.vehicleNumber || null,
    payload.nationalId || null,
  ];

  if (existing && existing.length > 0) {
    await query(
      `UPDATE riders
       SET vehicle_type = ?, vehicle_number = ?, national_id = ?
       WHERE user_id = ?`,
      [...values.slice(1), userId],
    );
  } else {
    await query(
      `INSERT INTO riders (user_id, vehicle_type, vehicle_number, national_id, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      values,
    );
  }
}

async function registerRestaurantAdmin(req, res) {
  try {
    const payload = normalizeRestaurantPayload(req.body);

    const validationError = validateRestaurantPayload(payload);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const emailVerified = await consumeEmailVerification(payload.email);
    if (!emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your email before creating an account.",
      });
    }

    const userId = await upsertUser({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
      targetRole: "restaurant_admin",
    });

    await ensureRestaurantProfile(userId, payload);

    const userRows = await query("SELECT user_id, name, email, role FROM users WHERE user_id = ?", [userId]);
    const user = userRows[0];

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: "Restaurant registration successful. Welcome aboard!",
      user: buildUserPayload(user),
    });
  } catch (err) {
    console.error("[registerRestaurantAdmin] Error processing request:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error processing registration.",
    });
  }
}

async function registerRider(req, res) {
  try {
    const payload = normalizeRiderPayload(req.body);

    const validationError = validateRiderPayload(payload);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const emailVerified = await consumeEmailVerification(payload.email);
    if (!emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your email before creating an account.",
      });
    }

    const userId = await upsertUser({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
      targetRole: "rider",
    });

    await ensureRiderProfile(userId, payload);

    const userRows = await query("SELECT user_id, name, email, role FROM users WHERE user_id = ?", [userId]);
    const user = userRows[0];

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: "Rider registration completed successfully!",
      user: buildUserPayload(user),
    });
  } catch (err) {
    console.error("[registerRider] Error processing request:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error processing registration.",
    });
  }
}

module.exports = {
  registerRestaurantAdmin,
  registerRider,
};
