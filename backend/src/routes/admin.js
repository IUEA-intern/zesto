/**
 * server/routes/admin.js
 * All endpoints require admin or staff role.
 *
 * GET  /api/admin/stats                — dashboard KPI summary
 * GET  /api/admin/orders               — paginated order list
 * PUT  /api/admin/orders/:id/status    — update order status
 * GET  /api/admin/products             — full product list (incl. inactive)
 * POST /api/admin/products             — create product
 * PUT  /api/admin/products/:id         — update product
 * DELETE /api/admin/products/:id       — soft-delete product
 * GET  /api/admin/users                — paginated user list
 * GET  /api/admin/payments             — payment history
 * GET  /api/admin/audit-logs           — audit trail
 * GET  /api/admin/analytics/revenue    — revenue chart data
 */

'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { log, ACTIONS } = require('../config/audit');

const DB_NAME = process.env.DB_NAME || 'zesto_db';

const PRODUCT_CATEGORY_MAP = {
  food:    { id: 1, name: 'Food' },
  drink:   { id: 2, name: 'Drinks' },
  dessert: { id: 3, name: 'Desserts' },
  other:   { id: 4, name: 'Combos' },
};

function safeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => {
    if (!r || typeof r !== 'object') return r;
    const out = {};
    for (const k of Object.keys(r)) {
      const v = r[k];
      if (typeof v === 'bigint') {
        // Convert BigInt to Number when safe, otherwise to string
        try { out[k] = Number(v); } catch { out[k] = String(v); }
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

function formatProduct(row) {
  if (!row || typeof row !== 'object') return row;

  const categoryKey = row.category || (row.category_name || '').toLowerCase();
  const meta = PRODUCT_CATEGORY_MAP[categoryKey] || {
    id: Number(row.category_id) || 4,
    name: row.category_name || 'Combos',
  };

  return {
    ...row,
    category: row.category || categoryKey || 'other',
    category_id: Number(row.category_id) || meta.id,
    category_name: row.category_name || meta.name,
    low_stock_threshold: Number(row.low_stock_threshold) || 5,
  };
}

const productColumnCache = {};
const columnCache = {};
async function productColumnExists(columnName) {
  if (productColumnCache[columnName] != null) return productColumnCache[columnName];
  const rows = safeRows(await query(
    'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [DB_NAME, 'products', columnName]
  ));
  return productColumnCache[columnName] = Number(rows[0]?.cnt || 0) > 0;
}

async function columnExists(tableName, columnName) {
  const key = `${tableName}::${columnName}`;
  if (columnCache[key] != null) return columnCache[key];
  const rows = safeRows(await query(
    'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [DB_NAME, tableName, columnName]
  ));
  return columnCache[key] = Number(rows[0]?.cnt || 0) > 0;
}

async function tableExists(tableName) {
  const rows = safeRows(await query(
    'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [DB_NAME, tableName]
  ));
  return Number(rows[0]?.cnt || 0) > 0;
}

// All admin routes require login + admin role
router.use(requireAuth, requireAdmin);

/* ── GET /api/admin/stats ──────────────────────────────────── */
router.get('/stats', async (req, res) => {
  try {
    const paymentsAvailable = await tableExists('payments');
    const [ordersToday, activeOrders, totalUsers, lowStock] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM orders WHERE DATE(created_at)=CURDATE()`),
      query(`SELECT COUNT(*) AS cnt FROM orders WHERE status NOT IN ('delivered','cancelled')`),
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role='customer'`),
      query(`SELECT COUNT(*) AS cnt FROM products WHERE stock <= 5 AND is_active=1`),
    ]);

    const revenueRows = paymentsAvailable
      ? safeRows(await query(`SELECT COALESCE(SUM(p.amount),0) AS total_revenue FROM payments p WHERE p.status='verified'`))
      : [{ total_revenue: 0 }];
    const failedPayments = paymentsAvailable
      ? safeRows(await query(`SELECT COUNT(*) AS cnt FROM payments WHERE status='failed' AND DATE(created_at)=CURDATE()`))
      : [{ cnt: 0 }];

    return res.json({
      success: true,
      data: {
        totalRevenue:   Number(revenueRows[0]?.total_revenue) || 0,
        ordersToday:    Number(safeRows(ordersToday)[0]?.cnt) || 0,
        activeOrders:   Number(safeRows(activeOrders)[0]?.cnt) || 0,
        failedPayments: Number(failedPayments[0]?.cnt) || 0,
        totalUsers:     Number(safeRows(totalUsers)[0]?.cnt) || 0,
        lowStockItems:  Number(safeRows(lowStock)[0]?.cnt) || 0,
      },
    });
  } catch (err) {
    console.error('[ADMIN API ERROR] [GET /admin/stats]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

/* ── GET /api/admin/orders ─────────────────────────────────── */
router.get('/orders', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;

    const paymentsAvailable = await tableExists('payments');
    let sql = `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone`;
    if (paymentsAvailable) {
      sql += `, p.status AS payment_status, p.method AS payment_method`;
    }
    sql += ` FROM orders o JOIN users u ON u.user_id = o.user_id`;
    if (paymentsAvailable) {
      sql += ` LEFT JOIN payments p ON p.order_id = o.order_id AND p.status='verified'`;
    }
    sql += ` WHERE 1=1`;

    const params = [];
    if (status) { sql += ' AND o.status = ?'; params.push(status); }
    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [orders, countRow] = await Promise.all([
      safeRows(await query(sql, params)),
      safeRows(await query(`SELECT COUNT(*) AS total FROM orders ${status ? 'WHERE status=?' : ''}`, status ? [status] : [])),
    ]);

    return res.json({
      success: true,
      data:    orders,
      meta:    { page, limit, total: Number(countRow[0]?.total) || 0 },
    });
  } catch (err) {
    console.error('[ADMIN API ERROR] [GET /admin/orders]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
});

/* ── GET /api/admin/orders/:id ─────────────────────────────── */
router.get('/orders/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (!orderId) return res.status(400).json({ success: false, message: 'Invalid order ID.' });

    const paymentsAvailable = await tableExists('payments');
    let sql = `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone`;
    if (paymentsAvailable) {
      sql += `, p.status AS payment_status, p.method AS payment_method, p.flw_tx_id`;
    }
    sql += ` FROM orders o JOIN users u ON u.user_id = o.user_id`;
    if (paymentsAvailable) {
      sql += ` LEFT JOIN payments p ON p.order_id = o.order_id AND p.status = 'verified'`;
    }
    sql += ` WHERE o.order_id = ?`;

    const orders = safeRows(await query(sql, [orderId]));

    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const items = safeRows(await query(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY item_id',
      [orderId]
    ));

    return res.json({ success: true, data: { ...orders[0], items } });
  } catch (err) {
    console.error('[GET /admin/orders/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch order.' });
  }
});

/* ── PUT /api/admin/orders/:id/status ──────────────────────── */
router.put('/orders/:id/status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;
    const valid = ['pending','processing','preparing','out_for_delivery','delivered','cancelled'];

    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const current = await query('SELECT status FROM orders WHERE order_id=?', [orderId]);
    if (!current.length) return res.status(404).json({ success: false, message: 'Order not found.' });

    await query(
      'UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE order_id=?',
      [status, orderId]
    );

    await log({
      actorId:    req.user?.user_id || req.user?.id,
      actorRole:  req.user?.role,
      action:     ACTIONS.ORDER_STATUS_UPDATE,
      entityType: 'order',
      entityId:   orderId,
      oldValue:   { status: current[0].status },
      newValue:   { status },
      ip:         req.ip,
    });

    // Emit real-time update
    const se = req.app.get('socketEmitters');
    if (se) {
      se.adminOrderUpdate({ orderId, status });
      // Get user for this order
      const orderRow = await query('SELECT user_id, order_number FROM orders WHERE order_id=?', [orderId]);
      if (orderRow.length) {
        const labels = {
          processing:       '✅ Order confirmed!',
          preparing:        '👨‍🍳 Your order is being prepared!',
          out_for_delivery: '🚀 Your order is on the way!',
          delivered:        '🎉 Order delivered! Enjoy!',
          cancelled:        '❌ Your order was cancelled.',
        };
        if (labels[status]) {
          se.toastUser(orderRow[0].user_id, { type: 'info', message: labels[status] });
        }
        if (status === 'out_for_delivery') {
          se.kitchenOrderReady(orderId, orderRow[0].order_number);
        }
      }
    }

    return res.json({ success: true, message: `Order status updated to ${status}.` });
  } catch (err) {
    console.error('[PUT /admin/orders/:id/status]', err);
    return res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
});

/* ── GET /api/admin/products ───────────────────────────────── */
router.get('/products', async (req, res) => {
  try {
    const hasCategory = await productColumnExists('category');
    const hasCategoryId = await productColumnExists('category_id');

    let sql;
    if (hasCategory) {
      sql = `SELECT p.* FROM products p ORDER BY p.category, p.product_id`;
    } else if (hasCategoryId && await tableExists('categories')) {
      sql = `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.category_id = p.category_id ORDER BY p.category_id, p.product_id`;
    } else {
      sql = `SELECT p.* FROM products p ORDER BY p.product_id`;
    }

    const products = safeRows(await query(sql)).map(formatProduct);
    return res.json({ success: true, data: products });
  } catch (err) {
    console.error('[ADMIN API ERROR] [GET /admin/products]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
});

/* ── POST /api/admin/products ──────────────────────────────── */
router.post('/products', async (req, res) => {
  try {
    const { name, category_id, type, description, image_url, price, stock, is_featured, is_active } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, message: 'name and price are required.' });

    const hasCategory = await productColumnExists('category');
    const hasCategoryId = await productColumnExists('category_id');
    const categoriesAvailable = await tableExists('categories');

    // detect product columns
    const hasSlug = await columnExists('products','slug');
    const hasTypeCol = await columnExists('products','type');
    const hasDescriptionCol = await columnExists('products','description');
    const hasImageCol = await columnExists('products','image_url');
    const hasPriceCol = await columnExists('products','price');
    const hasStockCol = await columnExists('products','stock');
    const hasIsFeatured = await columnExists('products','is_featured');
    const hasIsActive = await columnExists('products','is_active');

    function makeSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

    // build INSERT dynamically based on available columns
    const cols = [];
    const placeholders = [];
    const vals = [];

    cols.push('name'); placeholders.push('?'); vals.push(name);
    if (hasSlug) { const slug = makeSlug(name) || `product-${Date.now()}`; let finalSlug = slug; const existing = safeRows(await query('SELECT product_id FROM products WHERE slug=?', [slug])).length ? true : false; if (existing) finalSlug = `${slug}-${Date.now()}`; cols.push('slug'); placeholders.push('?'); vals.push(finalSlug); }
    if (hasCategory) { cols.push('category'); placeholders.push('?'); vals.push({1:'food',2:'drink',3:'dessert',4:'other'}[Number(category_id)||1] || 'food'); }
    else if (hasCategoryId && categoriesAvailable) { cols.push('category_id'); placeholders.push('?'); vals.push(Number(category_id) || 1); }
    if (hasTypeCol) { cols.push('type'); placeholders.push('?'); vals.push(type || null); }
    if (hasDescriptionCol) { cols.push('description'); placeholders.push('?'); vals.push(description || null); }
    if (hasImageCol) { cols.push('image_url'); placeholders.push('?'); vals.push(image_url || null); }
    if (hasPriceCol) { cols.push('price'); placeholders.push('?'); vals.push(price); }
    if (hasStockCol) { cols.push('stock'); placeholders.push('?'); vals.push(stock || 0); }
    if (hasIsFeatured) { cols.push('is_featured'); placeholders.push('?'); vals.push(is_featured ? 1 : 0); }
    if (hasIsActive) { cols.push('is_active'); placeholders.push('?'); vals.push(is_active != null ? (is_active ? 1 : 0) : 1); }

    const sql = `INSERT INTO products (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const result = await query(sql, vals);

    await log({
      actorId:    req.user?.user_id || req.user?.id,
      actorRole:  req.user?.role,
      action:     ACTIONS.PRODUCT_CREATED, entityType: 'product',
      entityId:   Number(result.insertId), newValue: { name, price },
      ip:         req.ip,
    });

    return res.status(201).json({ success: true, product_id: Number(result.insertId), message: 'Product created.' });
  } catch (err) {
    console.error('[POST /admin/products]', err);
    return res.status(500).json({ success: false, message: 'Failed to create product.' });
  }
});

/* ── PUT /api/admin/products/:id ───────────────────────────── */
router.put('/products/:id', async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const old = await query('SELECT * FROM products WHERE product_id=?', [id]);
    if (!old.length) return res.status(404).json({ success: false, message: 'Product not found.' });

    const { name, category_id, type, description, image_url, price, stock, is_active, is_featured } = req.body;
    const hasCategory = await productColumnExists('category');
    const hasCategoryId = await productColumnExists('category_id');
    const categoriesAvailable = await tableExists('categories');

    const categoryIndex = Number(category_id);
    const categoryValue = {
      1: 'food',
      2: 'drink',
      3: 'dessert',
      4: 'other',
    }[categoryIndex] || 'food';
    const categoryParam = category_id != null && category_id !== '' ? categoryValue : null;
    const categoryIdParam = category_id != null && category_id !== '' ? categoryIndex : null;

    // prepare slug if name provided and DB supports it
    function makeSlug(s) {
      return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    const hasSlug = await columnExists('products','slug');
    let slugParam = null;
    if (hasSlug && name) {
      slugParam = makeSlug(name) || null;
      if (slugParam) {
        const sExists = safeRows(await query('SELECT product_id FROM products WHERE slug=?', [slugParam]));
        if (sExists.length && sExists[0].product_id !== id) slugParam = `${slugParam}-${Date.now()}`;
      }
    }

    // build UPDATE dynamically based on available columns
    const hasSlugCol = await columnExists('products','slug');
    const hasTypeCol = await columnExists('products','type');
    const hasDescriptionCol = await columnExists('products','description');
    const hasImageCol = await columnExists('products','image_url');
    const hasPriceCol = await columnExists('products','price');
    const hasStockCol = await columnExists('products','stock');
    const hasIsFeaturedCol = await columnExists('products','is_featured');
    const hasIsActiveCol = await columnExists('products','is_active');

    const setClauses = [];
    const params = [];

    if (name !== undefined) {
      setClauses.push('name=COALESCE(?,name)'); params.push(name || null);
    }
    if (hasSlugCol) { setClauses.push('slug=COALESCE(?,slug)'); params.push(slugParam || null); }

    if (hasCategory) { setClauses.push('category=COALESCE(?,category)'); params.push(categoryParam); }
    else if (hasCategoryId && categoriesAvailable) { setClauses.push('category_id=COALESCE(?,category_id)'); params.push(categoryIdParam); }

    if (hasTypeCol) { setClauses.push('type=COALESCE(?,type)'); params.push(type || null); }
    if (hasDescriptionCol) { setClauses.push('description=COALESCE(?,description)'); params.push(description || null); }
    if (hasImageCol) { setClauses.push('image_url=COALESCE(?,image_url)'); params.push(image_url || null); }
    if (hasPriceCol) { setClauses.push('price=COALESCE(?,price)'); params.push(price || null); }
    if (hasStockCol) { setClauses.push('stock=COALESCE(?,stock)'); params.push(stock != null ? stock : null); }
    if (hasIsActiveCol) { setClauses.push('is_active=COALESCE(?,is_active)'); params.push(is_active != null ? is_active : null); }
    if (hasIsFeaturedCol) { setClauses.push('is_featured=COALESCE(?,is_featured)'); params.push(is_featured != null ? is_featured : null); }

    setClauses.push('updated_at=CURRENT_TIMESTAMP');

    const updateSql = `UPDATE products SET ${setClauses.join(', ')} WHERE product_id=?`;
    params.push(id);

    await query(updateSql, params);

    const se = req.app.get('socketEmitters');
    if (se && stock != null) se.productStockUpdate(id, parseInt(stock));

    await log({
      actorId: req.user?.user_id || req.user?.id,
      actorRole: req.user?.role,
      action: ACTIONS.PRODUCT_UPDATED, entityType: 'product', entityId: id,
      oldValue: old[0], newValue: req.body, ip: req.ip,
    });

    return res.json({ success: true, message: 'Product updated.' });
  } catch (err) {
    console.error('[PUT /admin/products/:id]', err);
    return res.status(500).json({ success: false, message: 'Failed to update product.' });
  }
});

/* ── DELETE /api/admin/products/:id (soft delete) ──────────── */
router.delete('/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (await columnExists('products','is_active')) {
      await query('UPDATE products SET is_active=0, updated_at=CURRENT_TIMESTAMP WHERE product_id=?', [id]);
    } else {
      await query('DELETE FROM products WHERE product_id=?', [id]);
    }
    await log({
      actorId: req.user?.user_id || req.user?.id,
      actorRole: req.user?.role,
      action: ACTIONS.PRODUCT_DELETED, entityType: 'product', entityId: id, ip: req.ip,
    });
    return res.json({ success: true, message: 'Product deactivated.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete product.' });
  }
});

/* ── GET /api/admin/users ──────────────────────────────────── */
router.get('/users', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const userCols = ['user_id','name','email'];
    if (await columnExists('users','phone')) userCols.push('phone');
    if (await columnExists('users','role')) userCols.push('role');
    if (await columnExists('users','is_active')) userCols.push('is_active');
    if (await columnExists('users','last_login')) userCols.push('last_login');
    if (await columnExists('users','created_at')) userCols.push('created_at');
    if (await columnExists('users','updated_at')) userCols.push('updated_at');
    const orderBy = userCols.includes('created_at') ? 'created_at' : userCols.includes('updated_at') ? 'updated_at' : 'user_id';
    const usersSql = `SELECT u.user_id AS id, u.name AS full_name, ${userCols.join(', ')}, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id) AS order_count FROM users u ORDER BY ${orderBy} DESC LIMIT ? OFFSET ?`;
    const users = safeRows(await query(usersSql, [limit, offset]));
    const total = safeRows(await query('SELECT COUNT(*) AS cnt FROM users'));
    return res.json({ success: true, data: users, meta: { page, limit, total: Number(total[0]?.cnt) || 0 } });
  } catch (err) {
    console.error('[ADMIN API ERROR] [GET /admin/users]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

/* ── GET /api/admin/payments ───────────────────────────────── */
router.get('/payments', async (req, res) => {
  try {
    if (!await tableExists('payments')) {
      return res.json({ success: true, data: [] });
    }

    const limit = Math.min(50, parseInt(req.query.limit) || 30);
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const rows  = safeRows(await query(
      `SELECT p.*, u.name AS user_name, u.email AS user_email, o.order_number
       FROM payments p
       JOIN users  u ON u.user_id  = p.user_id
       JOIN orders o ON o.order_id = p.order_id
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [limit, (page - 1) * limit]
    ));
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[ADMIN API ERROR] [GET /admin/payments]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch payments.' });
  }
});

/* ── GET /api/admin/audit-logs ─────────────────────────────── */
router.get('/audit-logs', async (req, res) => {
  try {
    if (!await tableExists('audit_logs')) {
      return res.json({ success: true, data: [] });
    }

    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const page   = Math.max(1,   parseInt(req.query.page)  || 1);
    const action = req.query.action || null;
    let sql    = `SELECT l.*, u.name AS actor_name FROM audit_logs l
                  LEFT JOIN users u ON u.user_id = l.actor_id WHERE 1=1`;
    const params = [];
    if (action) { sql += ' AND l.action = ?'; params.push(action); }
    sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, (page - 1) * limit);
    const logs = safeRows(await query(sql, params));
    return res.json({ success: true, data: logs });
  } catch (err) {
    console.error('[ADMIN API ERROR] [GET /admin/audit-logs]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

/* ── GET /api/admin/analytics/revenue ──────────────────────── */
router.get('/analytics/revenue', async (req, res) => {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 30);
    const paymentsAvailable = await tableExists('payments');
    const daily = safeRows(await query(
      `SELECT DATE(o.created_at) AS date,
              COUNT(*)           AS order_count,
              COALESCE(SUM(${paymentsAvailable ? 'p.amount' : '0'}), 0) AS revenue
       FROM orders o
       ${paymentsAvailable ? "LEFT JOIN payments p ON p.order_id = o.order_id AND p.status='verified'" : ''}
       WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(o.created_at)
       ORDER BY date ASC`,
      [days]
    ));

    const topProducts = safeRows(await query(
      `SELECT oi.name, SUM(oi.qty) AS units_sold, SUM(oi.subtotal) AS revenue
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND o.status != 'cancelled'
       GROUP BY oi.product_id, oi.name
       ORDER BY units_sold DESC LIMIT 5`,
      [days]
    ));

    return res.json({ success: true, data: { daily, topProducts } });
  } catch (err) {
    console.error('[ADMIN API ERROR] [GET /admin/analytics/revenue]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
});

module.exports = router;