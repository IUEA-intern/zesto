"use strict";

/**
 * services/mailerService.js
 * ─────────────────────────────────────────────────────────────────────
 * Thin wrapper around Nodemailer. One transporter, reused across
 * requests (created lazily on first send, not on every call).
 *
 * Required env vars (see backend/.env):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 * ─────────────────────────────────────────────────────────────────────
 */

const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587/25
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendVerificationEmail(email, code) {
  const from = process.env.SMTP_FROM || `"Zesto" <${process.env.SMTP_USER}>`;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[DEV EMAIL] To: ${email}`);
    console.log(`   Subject: Your Zesto verification code`);
    console.log(`   Code: ${code}`);
    return;
  }

  try {
    await getTransporter().sendMail({
      from,
      to: email,
      subject: "Your Zesto verification code",
      text: `Your Zesto verification code is ${code}. It expires in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto;">
          <h2 style="color:#111;">Verify your email</h2>
          <p>Use the code below to finish creating your Zesto account. It expires in 10 minutes.</p>
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; background:#f4f4f4; padding: 16px 24px; border-radius: 8px; text-align:center;">${code}</p>
          <p style="color:#888; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  } catch (error) {
    console.warn(`[mailerService] SMTP send failed, falling back to console output: ${error.message}`);
    console.log(`[DEV EMAIL] To: ${email}`);
    console.log(`   Subject: Your Zesto verification code`);
    console.log(`   Code: ${code}`);
  }
}

module.exports = { sendVerificationEmail };
