// repos/restaurantRepo.js
const db = require('../db');

async function list({ category_id, search, open, limit, offset }) {
  let sql = `
    SELECT
      r.id, r.name, r.description, r.logo_url, r.cover_url, r.address,
      r.delivery_time_min, r.delivery_fee, r.min_order_amount,
      r.rating, r.rating_count, r.is_open,
      c.id AS category_id, c.name AS category_name
    FROM restaurants r
    JOIN categories c ON c.id = r.category_id
    WHERE r.is_active = TRUE
  `;
  const params = [];

  if (category_id) { sql += ' AND r.category_id = ?';  params.push(Number(category_id)); }
  if (search)       { sql += ' AND r.name LIKE ?';      params.push(`%${search}%`); }
  if (open === 'true') { sql += ' AND r.is_open = TRUE'; }

  sql += ' ORDER BY r.rating DESC, r.name LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await db.query(sql, params);
  return rows;
}

async function findById(id) {
  const [rows] = await db.query(
    `SELECT r.*, c.name AS category_name
     FROM restaurants r
     JOIN categories c ON c.id = r.category_id
     WHERE r.id = ? AND r.is_active = TRUE`,
    [id]
  );
  return rows[0] || null;
}

async function getMenu(restaurantId) {
  const [items] = await db.query(
    `SELECT id, name, description, price, image_url, is_available, sort_order
     FROM menu_items
     WHERE restaurant_id = ?
     ORDER BY sort_order, name`,
    [restaurantId]
  );
  return items;
}

// ── Admin ────────────────────────────────────────────────────────────────────

async function create({ category_id, name, description, logo_url, cover_url, address,
                        latitude, longitude, phone, delivery_time_min,
                        delivery_fee, min_order_amount }) {
  const [result] = await db.query(
    `INSERT INTO restaurants
       (category_id, name, description, logo_url, cover_url, address,
        latitude, longitude, phone, delivery_time_min, delivery_fee, min_order_amount)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [category_id, name, description || null, logo_url || null, cover_url || null,
     address, latitude || null, longitude || null, phone || null,
     delivery_time_min || 30, delivery_fee || 0, min_order_amount || 0]
  );
  return result.insertId;
}

async function update(id, fields) {
  // Only update fields that were provided
  const allowed = ['category_id','name','description','logo_url','cover_url','address',
                   'latitude','longitude','phone','delivery_time_min','delivery_fee',
                   'min_order_amount','is_open','is_active'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (!sets.length) return;
  params.push(id);
  await db.query(`UPDATE restaurants SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
}

async function createMenuItem({ restaurant_id, name, description, price, image_url, sort_order }) {
  const [result] = await db.query(
    `INSERT INTO menu_items (restaurant_id, name, description, price, image_url, sort_order)
     VALUES (?,?,?,?,?,?)`,
    [restaurant_id, name, description || null, price, image_url || null, sort_order || 0]
  );
  return result.insertId;
}

async function updateMenuItem(id, fields) {
  const allowed = ['name','description','price','image_url','is_available','sort_order'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (!sets.length) return;
  params.push(id);
  await db.query(`UPDATE menu_items SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
}

async function deleteMenuItem(id) {
  await db.query('DELETE FROM menu_items WHERE id = ?', [id]);
}

module.exports = {
  list, findById, getMenu,
  create, update,
  createMenuItem, updateMenuItem, deleteMenuItem,
};
