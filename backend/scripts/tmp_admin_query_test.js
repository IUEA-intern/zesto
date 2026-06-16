const { query, testConnection } = require('../src/config/db');
(async () => {
  try {
    await testConnection();
    const tests = [
      {name:'orders list', sql:`SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone, p.status AS payment_status, p.method AS payment_method FROM orders o JOIN users u ON u.user_id = o.user_id LEFT JOIN payments p ON p.order_id = o.order_id AND p.status=\'verified\' WHERE 1=1 ORDER BY o.created_at DESC LIMIT 1 OFFSET 0`},
      {name:'orders count', sql:'SELECT COUNT(*) AS total FROM orders'},
      {name:'products', sql:'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.category_id = p.category_id ORDER BY p.category_id, p.product_id'},
      {name:'users', sql:'SELECT user_id, name, email, phone, role, is_active, last_login, created_at, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id) AS order_count FROM users u ORDER BY created_at DESC LIMIT 1 OFFSET 0'},
      {name:'user count', sql:'SELECT COUNT(*) AS cnt FROM users'},
      {name:'payments', sql:'SELECT p.*, u.name AS user_name, u.email AS user_email, o.order_number FROM payments p JOIN users u ON u.user_id = p.user_id JOIN orders o ON o.order_id = p.order_id ORDER BY p.created_at DESC LIMIT 1 OFFSET 0'},
      {name:'audit-logs', sql:'SELECT l.*, u.name AS actor_name FROM audit_logs l LEFT JOIN users u ON u.user_id = l.actor_id WHERE 1=1 ORDER BY l.created_at DESC LIMIT 1 OFFSET 0'},
      {name:'analytics orders', sql:'SELECT DATE(o.created_at) AS date, COUNT(*) AS order_count, COALESCE(SUM(p.amount), 0) AS revenue FROM orders o LEFT JOIN payments p ON p.order_id = o.order_id AND p.status=\'verified\' WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY DATE(o.created_at) ORDER BY date ASC'},
      {name:'analytics topProducts', sql:'SELECT oi.name, SUM(oi.qty) AS units_sold, SUM(oi.subtotal) AS revenue FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND o.status != \'cancelled\' GROUP BY oi.product_id, oi.name ORDER BY units_sold DESC LIMIT 5'}
    ];
    for (const t of tests) {
      try {
        const rows = await query(t.sql);
        console.log('OK', t.name, Array.isArray(rows) ? rows.length : typeof rows, rows[0] ? Object.keys(rows[0]).slice(0,5) : 'no rows');
      } catch (err) {
        console.error('ERR', t.name, err.sqlMessage || err.message || err);
      }
    }
  } catch (err) {
    console.error('CONN ERR', err);
  }
})();
