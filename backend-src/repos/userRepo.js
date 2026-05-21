// repos/userRepo.js — all SQL touching the users / refresh_tokens tables
const db = require('../db');

async function findByEmail(email) {
  const [rows] = await db.query(
    'SELECT id, name, email, phone, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await db.query(
    'SELECT id, name, email, phone, delivery_address, role, is_active, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function existsByEmailOrPhone(email, phone) {
  const [rows] = await db.query(
    'SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1',
    [email.toLowerCase(), phone]
  );
  return rows.length > 0;
}

async function create({ name, email, phone, password_hash, delivery_address }) {
  const [result] = await db.query(
    'INSERT INTO users (name, email, phone, password_hash, delivery_address) VALUES (?,?,?,?,?)',
    [name, email.toLowerCase(), phone, password_hash, delivery_address || null]
  );
  return result.insertId;
}

async function update(id, { name, phone, delivery_address }) {
  await db.query(
    `UPDATE users
     SET
       name             = COALESCE(?, name),
       phone            = COALESCE(?, phone),
       delivery_address = COALESCE(?, delivery_address),
       updated_at       = NOW()
     WHERE id = ?`,
    [name || null, phone || null, delivery_address || null, id]
  );
}

// ── Refresh tokens ───────────────────────────────────────────────────────────

/**
 * Upserts a refresh token for a user.
 * Because user_id is UNIQUE in refresh_tokens, this replaces any existing token,
 * which prevents ghost sessions from accumulating across logins.
 */
async function upsertRefreshToken(userId, tokenHash, expiresAt) {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at)`,
    [userId, tokenHash, expiresAt]
  );
}

async function findRefreshToken(userId, tokenHash) {
  const [rows] = await db.query(
    'SELECT id FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND expires_at > NOW() LIMIT 1',
    [userId, tokenHash]
  );
  return rows[0] || null;
}

async function deleteRefreshTokens(userId) {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
}

module.exports = {
  findByEmail,
  findById,
  existsByEmailOrPhone,
  create,
  update,
  upsertRefreshToken,
  findRefreshToken,
  deleteRefreshTokens,
};
