// repos/cartRepo.js
const db = require('../db');

async function findByUser(userId) {
  const [rows] = await db.query(
    `SELECT c.id, c.restaurant_id, r.name AS restaurant_name,
            r.delivery_fee, r.min_order_amount
     FROM carts c
     JOIN restaurants r ON r.id = c.restaurant_id
     WHERE c.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

async function getItems(cartId) {
  const [rows] = await db.query(
    `SELECT ci.id, ci.quantity,
            mi.id AS menu_item_id, mi.name, mi.price, mi.image_url, mi.is_available
     FROM cart_items ci
     JOIN menu_items mi ON mi.id = ci.menu_item_id
     WHERE ci.cart_id = ?
     ORDER BY ci.id`,
    [cartId]
  );
  return rows;
}

async function createCart(userId, restaurantId) {
  const [result] = await db.query(
    'INSERT INTO carts (user_id, restaurant_id) VALUES (?,?)',
    [userId, restaurantId]
  );
  return result.insertId;
}

async function upsertItem(cartId, menuItemId, quantity) {
  await db.query(
    `INSERT INTO cart_items (cart_id, menu_item_id, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = ?`,
    [cartId, menuItemId, quantity, quantity]
  );
}

async function removeItem(cartId, menuItemId) {
  await db.query(
    'DELETE FROM cart_items WHERE cart_id = ? AND menu_item_id = ?',
    [cartId, menuItemId]
  );
}

async function itemCount(cartId) {
  const [rows] = await db.query(
    'SELECT COUNT(*) AS cnt FROM cart_items WHERE cart_id = ?',
    [cartId]
  );
  return rows[0].cnt;
}

async function deleteCart(cartId) {
  await db.query('DELETE FROM carts WHERE id = ?', [cartId]);
}

async function deleteCartByUser(userId) {
  await db.query('DELETE FROM carts WHERE user_id = ?', [userId]);
}

module.exports = {
  findByUser, getItems, createCart,
  upsertItem, removeItem, itemCount,
  deleteCart, deleteCartByUser,
};
