"use strict";

/**
 * controllers/emailVerificationController.js
 * ─────────────────────────────────────────────────────────────────────
 * Role-agnostic email verification. Used before customer, restaurant,
 * and rider registration all alike — so this is the ONLY place the
 * send/verify logic lives.
 *
 *   sendCode()               → POST /api/auth/send-code
 *   verifyCode()              → POST /api/auth/verify-code
 *   consumeEmailVerification()→ internal helper, called by
 *                                authController.registerCustomer and
 *                                onboardingController.register* right
 *                                before they insert a new user.
 * ─────────────────────────────────────────────────────────────────────
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

async function sendCode(req, res) {
  try {
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
 * if this email has a verified, unexpired code — and consumes it
 * (deletes the row) so the same code can't be reused for a second
 * account.
 */
async function consumeEmailVerification(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return false;

  const rows = await query(
    "SELECT id FROM email_verifications WHERE email = ? AND verified = 1 AND expires_at > NOW()",
    [normalized]
  );
  if (!rows.length) return false;

  await query("DELETE FROM email_verifications WHERE id = ?", [rows[0].id]);
  return true;
}

module.exports = { sendCode, verifyCode, consumeEmailVerification };
