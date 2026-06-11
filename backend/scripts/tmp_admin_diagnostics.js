const { query, testConnection } = require('../src/config/db');
(async () => {
  try {
    await testConnection();
    const tests = [
      ['products', 'SELECT * FROM products LIMIT 1'],
      ['users', 'SELECT * FROM users LIMIT 1'],
      ['categories', 'SELECT * FROM categories LIMIT 1'],
      ['countOrders', 'SELECT COUNT(*) AS cnt FROM orders'],
      ['countUsers', 'SELECT COUNT(*) AS cnt FROM users'],
      ['insertProduct', "INSERT INTO products (name, slug, category_id, price, stock, is_featured) VALUES ('test product', CONCAT('test-product-', UNIX_TIMESTAMP()), 1, 12000, 10, 0)"]
    ];

    for (const [label, sql] of tests) {
      try {
        const res = await query(sql);
        console.log('OK', label, Array.isArray(res) ? res.length : JSON.stringify(res));
        if (label === 'insertProduct') console.log('INSERT RESULT', res);
      } catch (e) {
        console.error('ERROR', label, e.message, e);
      }
    }
  } catch (err) {
    console.error('CONN ERR', err.message, err);
  } finally {
    process.exit(0);
  }
})();
