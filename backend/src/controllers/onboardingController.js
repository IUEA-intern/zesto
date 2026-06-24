"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db"); // Assuming pool query wrapper is exposed here

const COOKIE_NAME = "zesto_token";
const JWT_SECRET = process.env.JWT_SECRET || "zesto_jwt_secret";
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

// Helper to sign JWT
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

// Helper to set auth cookie
function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TOKEN_MAX_AGE,
    path: "/",
  });
}

/**
 * Common logic to upsert a user into the DB and transition roles if they exist.
 */
async function upsertUser({ name, email, phone, password, targetRole }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check if user already exists
  const existingUsers = await query(
    "SELECT user_id, password, role FROM users WHERE email = ?",
    [normalizedEmail],
  );

  let userId;

  if (existingUsers && existingUsers.length > 0) {
    // User exists. Update their role to the target marketplace role.
    userId = existingUsers[0].user_id;
    await query(
      "UPDATE users SET role = ?, name = ?, phone = COALESCE(?, phone) WHERE user_id = ?",
      [targetRole, name.trim(), phone ? phone.trim() : null, userId],
    );
  } else {
    // User does not exist. Create a new account.
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const insertResult = await query(
      "INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)",
      [
        name.trim(),
        normalizedEmail,
        phone ? phone.trim() : null,
        hashedPassword,
        targetRole,
      ],
    );
    userId = insertResult.insertId;
  }

  return userId;
}

/**
 * POST /api/auth/register/restaurant
 * Body payload expectation: { name, email, phone, password, restaurantName, address }
 */
async function registerRestaurantAdmin(req, res) {
  try {
    const { name, email, phone, password, restaurantName, address } = req.body;

    if (!email || !password || !restaurantName) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields." });
    }

    // Process user assignment/creation
    const userId = await upsertUser({
      name,
      email,
      phone,
      password,
      targetRole: "restaurant_admin",
    });

    // Insert relationship or restaurant profile metadata into your restaurant/owner tables
    // Adjust table names and column layouts to fit your actual relational schema
    await query(
      `INSERT INTO restaurants (owner_id, restaurant_name, address)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE restaurant_name = VALUES(restaurant_name), address = VALUES(address)`,
      [userId, restaurantName.trim(), address ? address.trim() : null],
    );

    // Fetch refreshed user snapshot for payload mapping
    const userRows = await query(
      "SELECT user_id, name, email, role FROM users WHERE user_id = ?",
      [userId],
    );
    const user = userRows[0];

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.status(200).json({
      success: true,
      message: "Restaurant registration successful. Welcome aboard!",
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[registerRestaurantAdmin] Error processing request:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server error processing registration.",
      });
  }
}

/**
 * POST /api/auth/register/rider
 * Body payload expectation: { name, email, phone, password, vehicleType, licensePlate }
 */
async function registerRider(req, res) {
  try {
    const { name, email, phone, password, vehicleType, licensePlate } =
      req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields." });
    }

    // Process user assignment/creation
    const userId = await upsertUser({
      name,
      email,
      phone,
      password,
      targetRole: "rider",
    });

    // Insert relationship or status tracking metadata into your riders structural system
    await query(
      `INSERT INTO riders (user_id, vehicle_type, license_plate, status)
       VALUES (?, ?, ?, 'offline')
       ON DUPLICATE KEY UPDATE vehicle_type = VALUES(vehicle_type), license_plate = VALUES(license_plate)`,
      [
        userId,
        vehicleType ? vehicleType.trim() : null,
        licensePlate ? licensePlate.trim() : null,
      ],
    );

    // Fetch refreshed user snapshot for payload mapping
    const userRows = await query(
      "SELECT user_id, name, email, role FROM users WHERE user_id = ?",
      [userId],
    );
    const user = userRows[0];

    const token = createToken(user);
    setAuthCookie(res, token);

    return res.status(200).json({
      success: true,
      message: "Rider registration completed successfully!",
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[registerRider] Error processing request:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server error processing registration.",
      });
  }
}

module.exports = {
  registerRestaurantAdmin,
  registerRider,
};
