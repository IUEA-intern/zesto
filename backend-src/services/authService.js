// services/authService.js
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const AppError = require('../utils/AppError');
const userRepo = require('../repos/userRepo');

function signAccess(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshExpiry() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

async function register({ name, email, phone, password, delivery_address }) {
  if (!name || !email || !phone || !password) {
    throw new AppError('name, email, phone and password are required');
  }
  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters');
  }

  const exists = await userRepo.existsByEmailOrPhone(email, phone);
  if (exists) throw new AppError('Email or phone already registered', 409);

  const password_hash = await bcrypt.hash(password, 12);
  const userId = await userRepo.create({ name, email, phone, password_hash, delivery_address });

  const user = { id: userId, email: email.toLowerCase(), role: 'customer' };
  const accessToken  = signAccess(user);
  const refreshToken = signRefresh(user);

  await userRepo.upsertRefreshToken(userId, hashToken(refreshToken), refreshExpiry());

  return { accessToken, refreshToken, user: { id: userId, name, email: user.email, phone } };
}

async function login({ email, password }) {
  if (!email || !password) throw new AppError('email and password are required');

  const user = await userRepo.findByEmail(email);
  // Return the same error regardless of whether the user exists (prevents email enumeration)
  if (!user) throw new AppError('Invalid credentials', 401);
  if (!user.is_active) throw new AppError('Account suspended', 403);

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw new AppError('Invalid credentials', 401);

  const accessToken  = signAccess(user);
  const refreshToken = signRefresh(user);

  // Upsert: replaces any existing token row for this user, so old sessions are invalidated
  await userRepo.upsertRefreshToken(user.id, hashToken(refreshToken), refreshExpiry());

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
  };
}

async function refresh(refreshToken) {
  if (!refreshToken) throw new AppError('refreshToken required');

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid refresh token', 401);
  }

  const stored = await userRepo.findRefreshToken(payload.id, hashToken(refreshToken));
  if (!stored) throw new AppError('Invalid or expired refresh token', 401);

  const user = await userRepo.findById(payload.id);
  if (!user || !user.is_active) throw new AppError('User not found', 401);

  const newAccess  = signAccess(user);
  const newRefresh = signRefresh(user);

  await userRepo.upsertRefreshToken(user.id, hashToken(newRefresh), refreshExpiry());

  return { accessToken: newAccess, refreshToken: newRefresh };
}

async function logout(userId) {
  await userRepo.deleteRefreshTokens(userId);
}

module.exports = { register, login, refresh, logout };
