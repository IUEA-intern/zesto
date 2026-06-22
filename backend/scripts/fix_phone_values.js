/*
One-off script: fix_phone_values.js
Run with: node backend/scripts/fix_phone_values.js (from project root)
This will set `phone = NULL` for any users where phone equals email or contains an '@'.
*/

const { query } = require('../src/config/db');

async function run() {
  try {
    console.log('Cleaning users where phone looks like email...');
    const res = await query("UPDATE users SET phone = NULL WHERE phone = email OR phone LIKE '%@%'");
    console.log('Done. Rows affected:', res?.affectedRows || res?.changedRows || 0);
    process.exit(0);
  } catch (err) {
    console.error('Failed to run cleanup', err);
    process.exit(2);
  }
}

run();
