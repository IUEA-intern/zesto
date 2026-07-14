"use strict";

/**
 * controllers/emailVerificationController.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Role-agnostic email verification. Used before customer, restaurant,
 * and rider registration all alike â€” so this is the ONLY place the
 * send/verify logic lives.
 *
 *   sendCode()               â†’ POST /api/auth/send-code
 *   verifyCode()              â†’ POST /api/auth/verify-code
 *   consumeEmailVerification()â†’ internal helper, called by
 *                                authController.registerCustomer and
 *                                onboardingController.register* right
 *                                before they insert a new user.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

const { query } = require("../config/db");
const { sendVerificationEmail } = require("../services/mailerService");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function ensureEmailVerificationTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(180) NOT NULL,
      code CHAR(6) NOT NULL,
      verified TINYINT(1) NOT NULL DEFAULT 0,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_email_verifications_email (email),
      INDEX idx_email_verifications_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function sendCode(req, res) {
  try {
    await ensureEmailVerificationTable();
    const email = (req.body?.email || "").trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }

    // Don't send codes for emails that already have an account.
    const existingUser = await query("SELECT user_id FROM users WHERE email = ?", [email]);
    if (existingUser.length) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists. Please log in instead.",
      });
    }

    // Rate-limit resends so the button can't be spammed.
    const existing = await query(
      "SELECT created_at FROM email_verifications WHERE email = ?",
      [email]
    );
    if (existing.length) {
      const secondsSinceLast = (Date.now() - new Date(existing[0].created_at).getTime()) / 1000;
      if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          success: false,
          message: "Please wait a moment before requesting another code.",
        });
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await query(
      `INSERT INTO email_verifications (email, code, verified, attempts, expires_at)
       VALUES (?, ?, 0, 0, ?)
       ON DUPLICATE KEY UPDATE
         code = VALUES(code), verified = 0, attempts = 0,
         expires_at = VALUES(expires_at), created_at = CURRENT_TIMESTAMP`,
      [email, code, expiresAt]
    );

    await sendVerificationEmail(email, code);

    return res.json({ success: true, message: "Verification code sent." });
  } catch (err) {
    console.error("[sendCode] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Could not send verification code. Please try again.",
    });
  }
}

async function verifyCode(req, res) {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const code = (req.body?.code || "").trim();

    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Email and code are required." });
    }

    const rows = await query(
      "SELECT id, code, attempts, expires_at FROM email_verifications WHERE email = ?",
      [email]
    );
    const record = rows[0];

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No verification code found for this email. Please request a new one.",
      });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "This code has expired. Please request a new one." });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, message: "Too many attempts. Please request a new code." });
    }

    if (record.code !== code) {
      await query("UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?", [record.id]);
      return res.status(400).json({ success: false, message: "Incorrect code. Please try again." });
    }

    await query("UPDATE email_verifications SET verified = 1 WHERE id = ?", [record.id]);

    return res.json({ success: true, message: "Email verified." });
  } catch (err) {
    console.error("[verifyCode] Error:", err);
    return res.status(500).json({ success: false, message: "Could not verify code. Please try again." });
  }
}

/**
 * Called internally by registerCustomer / registerRestaurantAdmin /
 * registerRider right before they insert a new user. Returns true only
 * if this email has a verified, unexpired code â€” and consumes it
 * (deletes the row) so the same code can't be reused for a second
 * account.
 */
async function consumeEmailVerification(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return false;

  // NOTE: expiry is checked in JS (Date.now()) rather than "expires_at > NOW()"
  // in SQL. NOW() is evaluated using the DB server's own session time zone,
  // which can silently drift from Node's clock/timezone on a fresh server
  // (this caused every code to look "expired" the instant it was verified,
  // even though verifyCode()'s JS-side check said it was still valid).
  const rows = await query(
    "SELECT id, verified, expires_at FROM email_verifications WHERE email = ?",
    [normalized]
  );
  const record = rows[0];
  if (!record || !record.verified) return false;
  if (new Date(record.expires_at).getTime() < Date.now()) return false;

  await query("DELETE FROM email_verifications WHERE id = ?", [record.id]);
  return true;
}

module.exports = { sendCode, verifyCode, consumeEmailVerification };
