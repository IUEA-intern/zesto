// repos/paymentRepo.js
const db = require('../db');

async function create({ orderId, provider, providerTxId, amount, currency }) {
  const [result] = await db.query(
    `INSERT INTO payments (order_id, provider, provider_tx_id, amount, currency, status)
     VALUES (?, ?, ?, ?, ?, 'initiated')`,
    [orderId, provider, providerTxId, amount, currency]
  );
  return result.insertId;
}

async function findByProviderTxId(providerTxId) {
  const [rows] = await db.query(
    'SELECT id, order_id, status FROM payments WHERE provider_tx_id = ? LIMIT 1',
    [providerTxId]
  );
  return rows[0] || null;
}

async function updateStatus(id, status, rawResponse) {
  await db.query(
    'UPDATE payments SET status = ?, raw_response = ?, updated_at = NOW() WHERE id = ?',
    [status, JSON.stringify(rawResponse), id]
  );
}

async function latestByOrder(orderId) {
  const [rows] = await db.query(
    'SELECT provider_tx_id, status, created_at FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
    [orderId]
  );
  return rows[0] || null;
}

module.exports = { create, findByProviderTxId, updateStatus, latestByOrder };
