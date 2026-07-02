/**
 * Migration: Add ready_for_pickup to order status enum
 * 
 * This fixes the "Data truncated" error when trying to set order status to 'ready_for_pickup'
 * The schema.sql shows the correct enum, but the running database hasn't been migrated yet.
 */
'use strict';

const { query } = require('../src/config/db');

async function migrate() {
  try {
    console.log('🔄 Starting migration: Adding ready_for_pickup to orders.status enum...\n');

    // First, check current enum values
    const descResult = await query(`DESCRIBE orders status`);
    const currentType = descResult[0]?.Type || '';
    console.log('📊 Current status column type:', currentType);

    // Alter table to update enum values
    console.log('\n▶️  Executing: ALTER TABLE orders MODIFY status...\n');
    
    await query(`
      ALTER TABLE orders 
      MODIFY COLUMN status ENUM(
        'pending',
        'processing',
        'preparing',
        'ready_for_pickup',
        'out_for_delivery',
        'delivered',
        'cancelled'
      ) NOT NULL DEFAULT 'pending'
    `);

    console.log('✅ Migration successful!\n');
    console.log('📝 Status enum now includes: pending, processing, preparing, ready_for_pickup, out_for_delivery, delivered, cancelled');
    console.log('\n🎉 Database is now ready for ready_for_pickup status updates');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('\nSQL Error:', err.sqlMessage);
    if (err.sql) console.error('SQL:', err.sql);
    process.exit(1);
  }
}

migrate();
