/**
 * Migration: Add pickup_confirmation_code to orders
 *
 * Adds the restaurant <-> rider handoff code, separate from the existing
 * customer-facing delivery_confirmation_code. When a restaurant marks an
 * order ready_for_pickup, a 6-digit code is generated and shown only to
 * the restaurant; the rider must enter it correctly to confirm pickup.
 * This closes a fraud gap where a rider could mark an order "picked up"
 * without actually collecting it from the restaurant, or a restaurant
 * could dispute a legitimate pickup.
 *
 * Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS).
 */
'use strict';

const { query } = require('../src/config/db');

async function migrate() {
  try {
    console.log('🔄 Starting migration: Adding pickup_confirmation_code to orders...\n');

    await query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS pickup_confirmation_code CHAR(6) NULL
          COMMENT '6-digit code generated when order is marked ready_for_pickup; restaurant reads it aloud, rider enters it to confirm pickup'
        AFTER assigned_staff_id
    `);

    console.log('✅ Migration successful! orders.pickup_confirmation_code is ready.\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.sqlMessage) console.error('SQL Error:', err.sqlMessage);
    if (err.sql) console.error('SQL:', err.sql);
    process.exit(1);
  }
}

migrate();
