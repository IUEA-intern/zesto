/**
 * routes/settings.js
 * GET /api/settings/public — safe, non-sensitive platform settings that
 * any client (customer web app, rider app) can read without being
 * logged in — e.g. support email/phone, so those never need to be
 * hard-coded in a client and go stale when the super admin changes them.
 *
 * Only an explicit whitelist is exposed here — platform_settings also
 * holds operational config (commission %, JWT expiration, etc.) that
 * has no business being public.
 */
'use strict';

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');

const PUBLIC_SETTING_KEYS = [
  'platform_name',
  'platform_logo',
  'support_email',
  'support_phone',
  'currency',
];

router.get('/public', async (req, res) => {
  try {
    const placeholders = PUBLIC_SETTING_KEYS.map(() => '?').join(',');
    const rows = await query(
      `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN (${placeholders})`,
      PUBLIC_SETTING_KEYS
    );

    const data = {};
    (rows || []).forEach(r => { data[r.setting_key] = r.setting_value; });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[GET /api/settings/public]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
});

module.exports = router;
