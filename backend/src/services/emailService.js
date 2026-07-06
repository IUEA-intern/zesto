'use strict';
/**
 * services/emailService.js
 * Sends transactional emails via Nodemailer.
 * Falls back to console-logging if SMTP not configured (dev mode).
 */

const nodemailer = require('nodemailer');

const isDev = !process.env.SMTP_USER || !process.env.SMTP_PASS;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (isDev) {
    // Dev: log to console — no real email sent
    return null;
  }
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Send an email.
 * In dev mode (no SMTP configured), logs the OTP to the console.
 */
async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`\n📧 [DEV EMAIL] To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body: ${text || html}\n`);
    return;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || `"Zesto" <noreply@zesto.ug>`,
    to,
    subject,
    html,
    text,
  });
}

/**
 * Send OTP verification email to a new rider.
 */
async function sendOtp(email, otp) {
  await sendEmail({
    to: email,
    subject: 'Zesto Rider — Email Verification Code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h1 style="color:#1A1A2E;font-size:28px;margin:0 0 4px">
          Zes<span style="color:#FF6B2C">to</span>
        </h1>
        <p style="color:#6B7280;margin:0 0 32px;font-size:13px">Rider Partner App</p>
        <h2 style="color:#1A1A2E;font-size:20px">Verify your email address</h2>
        <p style="color:#374151;line-height:1.6">
          Use the code below to complete your Zesto Rider registration.
          This code expires in <strong>10 minutes</strong>.
        </p>
        <div style="background:#F4F6FA;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
          <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#1A1A2E">${otp}</span>
        </div>
        <p style="color:#6B7280;font-size:13px;line-height:1.6">
          If you didn't request this, you can safely ignore this email.
          Your account won't be created until you verify.
        </p>
        <hr style="border:none;border-top:1px solid #E8EAF0;margin:24px 0">
        <p style="color:#9CA3AF;font-size:12px">© 2024 Zesto · Uganda</p>
      </div>
    `,
    text: `Your Zesto Rider verification code is: ${otp}. It expires in 10 minutes.`,
  });
}

/**
 * Send welcome email after successful registration.
 */
async function sendWelcome(email, name) {
  await sendEmail({
    to: email,
    subject: 'Welcome to Zesto Rider! 🎉',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h1 style="color:#1A1A2E;font-size:28px;margin:0 0 4px">
          Zes<span style="color:#FF6B2C">to</span>
        </h1>
        <h2 style="color:#1A1A2E">Welcome, ${name}! 🎉</h2>
        <p style="color:#374151;line-height:1.6">
          Your Zesto Rider account has been created successfully.
        </p>
        <div style="background:#fff7ed;border-left:4px solid #FF6B2C;padding:16px;border-radius:8px;margin:24px 0;">
          <strong style="color:#c2410c">Next step: Get approved</strong>
          <p style="color:#374151;margin:8px 0 0;font-size:14px">
            Your account is currently <strong>pending approval</strong>. 
            Please contact the Zesto team to complete your onboarding and start earning.
          </p>
        </div>
        <p style="color:#374151;line-height:1.6">
          <strong>📞 Contact us:</strong><br>
          WhatsApp / Call: <a href="tel:+256700000000" style="color:#FF6B2C">+256 700 000 000</a><br>
          Email: <a href="mailto:riders@zesto.ug" style="color:#FF6B2C">riders@zesto.ug</a>
        </p>
        <hr style="border:none;border-top:1px solid #E8EAF0;margin:24px 0">
        <p style="color:#9CA3AF;font-size:12px">© 2024 Zesto · Uganda</p>
      </div>
    `,
    text: `Welcome ${name}! Your Zesto Rider account is pending approval. Contact riders@zesto.ug to get started.`,
  });
}

module.exports = { sendOtp, sendWelcome, sendEmail };
