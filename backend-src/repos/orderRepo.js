// repos/orderRepo.js
const db = require('../db');

/**
 * Creates an order and its items inside an already-open transaction connection.
 * The caller is responsible for beginTransaction / commit / rollback.
 */
async function createWithItems(conn, { userId, restaurantId, deliveryAddress,
                                       subtotal, deliveryFee, totalAmount,
                                       notes, items }) {
  const [orderResult] = await conn.query(
    `INSERT INTO orders
       (user_id, restaurant_id, delivery_address, subtotal, delivery_fee, total_amount, notes)
     VALUES (?,?,?,?,?,?,?)`,
    [userId, restaurantId, deliveryAddress, subtotal, deliveryFee, totalAmount, notes || null]
  );
  const orderId = orderResult.insertId;

  // Bulk insert order items
  const rows = items.map(i => [orderId, i.menu_item_id, i.name, i.price, i.quantity, i.price * i.quantity]);
  await conn.query(
    'INSERT INTO order_items (order_id, menu_item_id, name, unit_price, quantity, line_total) VALUES ?',
    [rows]
  );

  return orderId;
}

async function listByUser(userId, { limit, offset }) {
  const [rows] = await db.query(
    `SELECT
       o.id, o.status, o.payment_status, o.total_amount,
       o.delivery_fee, o.subtotal, o.created_at,
       r.id AS restaurant_id, r.name AS restaurant_name, r.logo_url
     FROM orders o
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.user_id = ?
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  return rows;
}

async function findByIdAndUser(orderId, userId) {
  const [rows] = await db.query(
    `SELECT o.*, r.name AS restaurant_name, r.logo_url, r.phone AS restaurant_phone
     FROM orders o
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.id = ? AND o.user_id = ?`,
    [orderId, userId]
  );
  return rows[0] || null;
}

async function findById(orderId) {
  const [rows] = await db.query(
    `SELECT o.*, r.name AS restaurant_name
     FROM orders o
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.id = ?`,
    [orderId]
  );
  return rows[0] || null;
}

async function getItems(orderId) {
  const [rows] = await db.query(
    'SELECT name, unit_price, quantity, line_total FROM order_items WHERE order_id = ?',
    [orderId]
  );
  return rows;
}

async function updateStatus(orderId, status) {
  await db.query(
    'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, orderId]
  );
}

async function updatePayment(orderId, { paymentStatus, paymentReference, paymentMethod, status }) {
  await db.query(
    `UPDATE orders
     SET payment_status = ?, payment_reference = ?, payment_method = ?, status = ?, updated_at = NOW()
     WHERE id = ?`,
    [paymentStatus, paymentReference, paymentMethod, status, orderId]
  );
}

// Admin: list all orders with optional status filter
async function listAll({ status, limit, offset }) {
  let sql = `
    SELECT o.id, o.status, o.payment_status, o.total_amount,
           o.delivery_address, o.created_at,
           u.name AS customer_name, u.phone AS customer_phone,
           r.name AS restaurant_name
    FROM orders o
    JOIN users u ON u.id = o.user_id
    JOIN restaurants r ON r.id = o.restaurant_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const [rows] = await db.query(sql, params);
  return rows;
}

module.exports = {
  createWithItems, listByUser, findByIdAndUser,
  findById, getItems, updateStatus, updatePayment, listAll,
};
