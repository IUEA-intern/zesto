'use strict';

/**
 * controllers/restaurantAdminController.js
 * FILE: khalas/backend/src/controllers/restaurantAdminController.js
 *
 * FIXES vs previous version:
 *  - Added GET /orders/:id endpoint (viewOrder was doing O(n) scan before)
 *  - getRestaurantId returns full row so we can use status check properly
 *  - updateProduct uses correct NULL handling for COALESCE
 *  - deleteProduct does soft-delete only (is_active = 0)
 *  - All safeRows calls guard against bigint serialisation
 */

const { query } = require('../config/db');
const { log }   = require('../config/audit');

function safeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => {
    if (!r || typeof r !== 'object') return r;
    const out = {};
    for (const k of Object.keys(r)) {
      const v = r[k];
      out[k] = typeof v === 'bigint' ? Number(v) : v;
    }
    return out;
  });
}

/** Get restaurant owned by this user. Returns null if none / suspended. */
async function getRestaurantRow(userId) {
  const rows = safeRows(await query(
    'SELECT restaurant_id, status, name FROM restaurants WHERE owner_user_id = ? LIMIT 1',
    [userId]
  ));
  if (!rows.length || rows[0].status === 'suspended') return null;
  return rows[0];
}

/* ── Dashboard ─────────────────────────────────────────────── */
async function getDashboard(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) {
      return res.status(403).json({ success: false, message: 'No approved restaurant found for this account.' });
    }
    const rid = restaurant.restaurant_id;

    const [todayOrders, todayRevenue, pendingOrders, productCount, lowStock] = await Promise.all([
      query(`SELECT COUNT(DISTINCT o.order_id) AS cnt FROM orders o
             JOIN payments p ON o.order_id=p.order_id
             WHERE o.restaurant_id=? AND p.status='verified' AND DATE(o.created_at)=CURDATE()`, [rid]),
      query(`SELECT COALESCE(SUM(p.amount),0) AS total FROM payments p
             JOIN orders o ON o.order_id=p.order_id
             WHERE o.restaurant_id=? AND p.status='verified' AND DATE(p.created_at)=CURDATE()`,
             [rid]).catch(() => [{ total: 0 }]),
      query(`SELECT COUNT(DISTINCT o.order_id) AS cnt FROM orders o
             JOIN payments p ON o.order_id=p.order_id
             WHERE o.restaurant_id=? AND o.status='pending' AND p.status='verified'`, [rid]),
      query(`SELECT COUNT(*) AS cnt FROM products WHERE restaurant_id=? AND is_active=1`, [rid]),
      query(`SELECT COUNT(*) AS cnt FROM products
             WHERE restaurant_id=? AND stock <= low_stock_threshold AND is_active=1`, [rid]),
    ]);

    return res.json({
      success: true,
      data: {
        restaurantId:   rid,
        restaurantName: restaurant.name,
        todayOrders:    Number(safeRows(todayOrders)[0]?.cnt  || 0),
        todayRevenue:   Number(safeRows(todayRevenue)[0]?.total || 0),
        pendingOrders:  Number(safeRows(pendingOrders)[0]?.cnt || 0),
        productCount:   Number(safeRows(productCount)[0]?.cnt  || 0),
        lowStock:       Number(safeRows(lowStock)[0]?.cnt      || 0),
      },
    });
  } catch (err) {
    console.error('[restaurantAdmin] getDashboard', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard.' });
  }
}

/* ── Orders ────────────────────────────────────────────────── */
/**
 * FIX: Only show orders with verified payments to restaurant staff.
 * This prevents unpaid orders from appearing in the restaurant's order list.
 * Orders only appear after payment is confirmed by Pesapal/Flutterwave.
 */
async function getOrders(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });
    const rid = restaurant.restaurant_id;

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;

    let sql = `SELECT DISTINCT o.*, u.name AS customer_name, u.phone AS customer_phone
               FROM orders o 
               JOIN users u ON u.user_id = o.user_id
               JOIN payments p ON o.order_id = p.order_id
               WHERE o.restaurant_id = ? AND p.status = 'verified'`;
    const params = [rid];
    if (status) { sql += ' AND o.status = ?'; params.push(status); }
    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const countSql    = `SELECT COUNT(DISTINCT o.order_id) AS total 
                         FROM orders o 
                         JOIN payments p ON o.order_id = p.order_id 
                         WHERE o.restaurant_id=? AND p.status='verified'${status ? ' AND o.status=?' : ''}`;
    const countParams = status ? [rid, status] : [rid];

    const [orders, countRow] = await Promise.all([
      safeRows(await query(sql, params)),
      safeRows(await query(countSql, countParams)),
    ]);

    return res.json({
      success: true,
      data:    orders,
      meta:    { page, limit, total: Number(countRow[0]?.total || 0) },
    });
  } catch (err) {
    console.error('[restaurantAdmin] getOrders', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
}

/** 
 * FIX: single order detail endpoint with payment verification
 * Only show order details if payment has been verified.
 * This prevents accessing unpaid order details.
 */
async function getOrderById(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });

    const orderId = parseInt(req.params.id);
    
    // Verify payment is confirmed before allowing order access
    const paymentCheck = safeRows(await query(
      `SELECT p.payment_id FROM payments p 
       WHERE p.order_id = ? AND p.status = 'verified'`,
      [orderId]
    ));
    if (!paymentCheck.length) {
      return res.status(403).json({ success: false, message: 'Order payment not verified. Cannot access unpaid orders.' });
    }
    
    const orders = safeRows(await query(
      `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone
       FROM orders o JOIN users u ON u.user_id = o.user_id
       WHERE o.order_id = ? AND o.restaurant_id = ?`,
      [orderId, restaurant.restaurant_id]
    ));
    if (!orders.length) return res.status(404).json({ success: false, message: 'Order not found.' });

    const items = safeRows(await query(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY item_id', [orderId]
    ));

    return res.json({ success: true, data: { ...orders[0], items } });
  } catch (err) {
    console.error('[restaurantAdmin] getOrderById', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch order.' });
  }
}

/**
 * FIX: Enforce payment verification before allowing status updates.
 * Restaurant staff can only modify orders that have been paid for.
 */
async function updateOrderStatus(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });

    const orderId = parseInt(req.params.id);
    const { status } = req.body;
    const valid = ['processing', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'cancelled'];

    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }

    // CRITICAL: Verify payment before allowing status change
    const paymentVerified = safeRows(await query(
      `SELECT p.payment_id FROM payments p WHERE p.order_id = ? AND p.status = 'verified'`,
      [orderId]
    ));
    if (!paymentVerified.length) {
      return res.status(403).json({ success: false, message: 'Cannot modify unpaid orders. Payment must be verified first.' });
    }

    const rows = safeRows(await query(
      'SELECT status FROM orders WHERE order_id=? AND restaurant_id=?',
      [orderId, restaurant.restaurant_id]
    ));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found.' });

    await query('UPDATE orders SET status=?, updated_at=NOW() WHERE order_id=?', [status, orderId]);

    // Emit socket event if available
    const se = req.app?.get?.('socketEmitters');
    if (se) {
      se.adminOrderUpdate?.({ orderId, status });
      const labels = {
        processing:       '✅ Your order has been confirmed!',
        preparing:        '👨‍🍳 Your order is being prepared!',
        ready_for_pickup: '🍽️ Your order is ready!',
        out_for_delivery: '🚀 Your order is on the way!',
        cancelled:        '❌ Your order was cancelled.',
      };
      if (labels[status]) {
        const userRow = safeRows(await query('SELECT user_id FROM orders WHERE order_id=?', [orderId]));
        if (userRow[0]?.user_id) se.toastUser?.(userRow[0].user_id, { type: 'info', message: labels[status] });
      }
    }

    await log({
      actorId: userId, actorRole: req.user?.role,
      action: 'ORDER_STATUS_UPDATE', entityType: 'order', entityId: orderId,
      oldValue: { status: rows[0].status }, newValue: { status }, ip: req.ip,
    });

    return res.json({ success: true, message: `Order updated to ${status}.` });
  } catch (err) {
    console.error('[restaurantAdmin] updateOrderStatus', err);
    return res.status(500).json({ success: false, message: 'Failed to update order.' });
  }
}

/* ── Products ──────────────────────────────────────────────── */
async function getProducts(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });

    const rows = safeRows(await query(
      `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.category_id = p.category_id
       WHERE p.restaurant_id = ?
       ORDER BY p.category_id, p.product_id`,
      [restaurant.restaurant_id]
    ));
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[restaurantAdmin] getProducts', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
}

/** FIX: single product by ID — avoids O(n) scan in frontend */
async function getProductById(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });

    const id = parseInt(req.params.id);
    const rows = safeRows(await query(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON c.category_id = p.category_id
       WHERE p.product_id=? AND p.restaurant_id=?`,
      [id, restaurant.restaurant_id]
    ));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[restaurantAdmin] getProductById', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch product.' });
  }
}

async function createProduct(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });

    const { name, category_id, type, description, image_url, price, stock, is_featured, is_active } = req.body;
    if (!name || price == null) {
      return res.status(400).json({ success: false, message: 'Name and price are required.' });
    }

    function makeSlug(s) {
      return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    let slug = makeSlug(name) || `product-${Date.now()}`;
    const existing = safeRows(await query('SELECT product_id FROM products WHERE slug=?', [slug]));
    if (existing.length) slug = `${slug}-${Date.now()}`;

    const result = await query(
      `INSERT INTO products
         (restaurant_id, category_id, name, slug, type, description, image_url,
          price, stock, is_featured, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [restaurant.restaurant_id, Number(category_id) || 1, name, slug,
       type || null, description || null, image_url || null,
       Number(price), Number(stock) || 0,
       is_featured ? 1 : 0, is_active != null ? (is_active ? 1 : 0) : 1]
    );

    await log({
      actorId: userId, actorRole: req.user?.role,
      action: 'PRODUCT_CREATED', entityType: 'product',
      entityId: Number(result.insertId),
      newValue: { name, price, restaurantId: restaurant.restaurant_id }, ip: req.ip,
    });

    return res.status(201).json({ success: true, product_id: Number(result.insertId), message: 'Product created.' });
  } catch (err) {
    console.error('[restaurantAdmin] createProduct', err);
    return res.status(500).json({ success: false, message: 'Failed to create product.' });
  }
}

async function updateProduct(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });

    const id = parseInt(req.params.id);
    const existing = safeRows(await query(
      'SELECT * FROM products WHERE product_id=? AND restaurant_id=?',
      [id, restaurant.restaurant_id]
    ));
    if (!existing.length) return res.status(404).json({ success: false, message: 'Product not found.' });

    const { name, category_id, type, description, image_url, price, stock, is_active, is_featured } = req.body;

    // Build SET clauses only for provided fields
    const sets   = [];
    const params = [];

    if (name        != null) { sets.push('name=?');        params.push(name); }
    if (category_id != null) { sets.push('category_id=?'); params.push(Number(category_id)); }
    if (type        != null) { sets.push('type=?');        params.push(type || null); }
    if (description != null) { sets.push('description=?'); params.push(description || null); }
    if (image_url   != null) { sets.push('image_url=?');   params.push(image_url || null); }
    if (price       != null) { sets.push('price=?');       params.push(Number(price)); }
    if (stock       != null) { sets.push('stock=?');       params.push(Number(stock)); }
    if (is_active   != null) { sets.push('is_active=?');   params.push(is_active ? 1 : 0); }
    if (is_featured != null) { sets.push('is_featured=?'); params.push(is_featured ? 1 : 0); }

    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    sets.push('updated_at=NOW()');
    params.push(id, restaurant.restaurant_id);

    await query(`UPDATE products SET ${sets.join(', ')} WHERE product_id=? AND restaurant_id=?`, params);

    await log({
      actorId: userId, actorRole: req.user?.role,
      action: 'PRODUCT_UPDATED', entityType: 'product', entityId: id,
      oldValue: existing[0], newValue: req.body, ip: req.ip,
    });

    return res.json({ success: true, message: 'Product updated.' });
  } catch (err) {
    console.error('[restaurantAdmin] updateProduct', err);
    return res.status(500).json({ success: false, message: 'Failed to update product.' });
  }
}

async function deleteProduct(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });

    const id = parseInt(req.params.id);
    const existing = safeRows(await query(
      'SELECT product_id FROM products WHERE product_id=? AND restaurant_id=?',
      [id, restaurant.restaurant_id]
    ));
    if (!existing.length) return res.status(404).json({ success: false, message: 'Product not found.' });

    await query(
      'UPDATE products SET is_active=0, updated_at=NOW() WHERE product_id=? AND restaurant_id=?',
      [id, restaurant.restaurant_id]
    );

    await log({
      actorId: userId, actorRole: req.user?.role,
      action: 'PRODUCT_DELETED', entityType: 'product', entityId: id, ip: req.ip,
    });
    return res.json({ success: true, message: 'Product deactivated.' });
  } catch (err) {
    console.error('[restaurantAdmin] deleteProduct', err);
    return res.status(500).json({ success: false, message: 'Failed to delete product.' });
  }
}

/* ── Analytics ─────────────────────────────────────────────── */
async function getAnalytics(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const restaurant = await getRestaurantRow(userId);
    if (!restaurant) return res.status(403).json({ success: false, message: 'Restaurant not found.' });
    const rid  = restaurant.restaurant_id;
    const days = Math.min(90, parseInt(req.query.days) || 30);

    const [dailySales, topProducts, statusBreakdown] = await Promise.all([
      query(`SELECT DATE(o.created_at) AS date,
                    COUNT(DISTINCT o.order_id) AS order_count,
                    COALESCE(SUM(p.amount),0) AS revenue
             FROM orders o
             JOIN payments p ON o.order_id = p.order_id
             WHERE o.restaurant_id=?
               AND p.status='verified'
               AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             GROUP BY DATE(o.created_at)
             ORDER BY date ASC`, [rid, days]),
      query(`SELECT oi.name, SUM(oi.qty) AS units_sold, SUM(oi.subtotal) AS revenue
             FROM order_items oi
             JOIN orders o ON o.order_id = oi.order_id
             JOIN payments p ON o.order_id = p.order_id
             WHERE o.restaurant_id=?
               AND p.status='verified'
               AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               AND o.status != 'cancelled'
             GROUP BY oi.product_id, oi.name
             ORDER BY units_sold DESC LIMIT 5`, [rid, days]),
      query(`SELECT o.status, COUNT(DISTINCT o.order_id) AS cnt
             FROM orders o
             JOIN payments p ON o.order_id = p.order_id
             WHERE o.restaurant_id=?
               AND p.status='verified'
               AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             GROUP BY o.status`, [rid, days]),
    ]);

    return res.json({
      success: true,
      data: {
        dailySales:      safeRows(dailySales),
        topProducts:     safeRows(topProducts),
        statusBreakdown: safeRows(statusBreakdown),
      },
    });
  } catch (err) {
    console.error('[restaurantAdmin] getAnalytics', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
}

/* ── Settings ──────────────────────────────────────────────── */
async function getSettings(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const rows = safeRows(await query(
      `SELECT r.*, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
       FROM restaurants r JOIN users u ON u.user_id = r.owner_user_id
       WHERE r.owner_user_id=? LIMIT 1`, [userId]
    ));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[restaurantAdmin] getSettings', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
}

async function updateSettings(req, res) {
  try {
    const userId = req.user?.user_id || req.user?.id;
    const rows = safeRows(await query(
      'SELECT restaurant_id FROM restaurants WHERE owner_user_id=? LIMIT 1', [userId]
    ));
    if (!rows.length) return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    const rid = rows[0].restaurant_id;

    const { name, description, phone, email, address, logo_url, latitude, longitude } = req.body;

    let updatedLogoUrl = null;
    if (req.file && req.file.filename) {
      updatedLogoUrl = `/uploads/restaurants/${rid}/${req.file.filename}`;
    }

    const sets   = [];
    const params = [];
    if (name        != null) { sets.push('name=?');        params.push(name); }
    if (description != null) { sets.push('description=?'); params.push(description); }
    if (phone       != null) { sets.push('phone=?');       params.push(phone); }
    if (email       != null) { sets.push('email=?');       params.push(email); }
    if (address     != null) { sets.push('address=?');     params.push(address); }
    if (updatedLogoUrl != null) { sets.push('logo_url=?'); params.push(updatedLogoUrl); }
    else if (logo_url != null) { sets.push('logo_url=?'); params.push(logo_url); }
    if (latitude    != null) { sets.push('latitude=?');    params.push(latitude); }
    if (longitude   != null) { sets.push('longitude=?');   params.push(longitude); }

    if (sets.length) {
      sets.push('updated_at=NOW()');
      params.push(rid);
      await query(`UPDATE restaurants SET ${sets.join(', ')} WHERE restaurant_id=?`, params);
    }

    await log({
      actorId: userId, actorRole: req.user?.role,
      action: 'RESTAURANT_UPDATED', entityType: 'restaurant', entityId: rid,
      newValue: req.body, ip: req.ip,
    });

    return res.json({ success: true, message: 'Restaurant settings updated.' });
  } catch (err) {
    console.error('[restaurantAdmin] updateSettings', err);
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
}

module.exports = {
  getDashboard,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getAnalytics,
  getSettings,
  updateSettings,
};
