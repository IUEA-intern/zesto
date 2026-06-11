/**
 * server/config/audit.js
 * Writes structured entries to audit_logs table.
 * Never throws — audit failure should not break business logic.
 */

'use strict';

const { query } = require('./db');

/**
 * log({ actorId, actorRole, action, entityType, entityId, oldValue, newValue, ip, userAgent, notes })
 */
async function log({
  actorId    = null,
  actorRole  = 'system',
  action,
  entityType,
  entityId   = null,
  oldValue   = null,
  newValue   = null,
  ip         = null,
  userAgent  = null,
  notes      = null,
}) {
  try {
    await query(
      `INSERT INTO audit_logs
         (actor_id, actor_role, action, entity_type, entity_id,
          old_value, new_value, ip_address, user_agent, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actorId,
        actorRole,
        action,
        entityType,
        entityId,
        oldValue  ? JSON.stringify(oldValue)  : null,
        newValue  ? JSON.stringify(newValue)  : null,
        ip,
        userAgent ? String(userAgent).substring(0, 500) : null,
        notes,
      ]
    );
  } catch (err) {
    // Never crash the caller — just log to console
    console.error('[AuditLog] Failed to write log entry:', err.message);
  }
}

/* Named action constants — import in routes to avoid typos */
const ACTIONS = {
  // Auth
  USER_REGISTER:          'USER_REGISTER',
  USER_LOGIN:             'USER_LOGIN',
  USER_LOGOUT:            'USER_LOGOUT',
  USER_LOGIN_FAILED:      'USER_LOGIN_FAILED',

  // Orders
  ORDER_CREATED:          'ORDER_CREATED',
  ORDER_STATUS_UPDATE:    'ORDER_STATUS_UPDATE',
  ORDER_CANCELLED:        'ORDER_CANCELLED',

  // Payments
  PAYMENT_INITIATED:      'PAYMENT_INITIATED',
  PAYMENT_VERIFIED:       'PAYMENT_VERIFIED',
  PAYMENT_FAILED:         'PAYMENT_FAILED',
  PAYMENT_REPLAY_BLOCKED: 'PAYMENT_REPLAY_BLOCKED',

  // Products (admin)
  PRODUCT_CREATED:        'PRODUCT_CREATED',
  PRODUCT_UPDATED:        'PRODUCT_UPDATED',
  PRODUCT_DELETED:        'PRODUCT_DELETED',
  STOCK_UPDATED:          'STOCK_UPDATED',

  // Admin
  ADMIN_ACTION:           'ADMIN_ACTION',
};

module.exports = { log, ACTIONS };