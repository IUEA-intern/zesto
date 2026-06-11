const { query, testConnection } = require('../src/config/db');
(async () => {
  try {
    await testConnection();
    const tables = await query('SHOW TABLES');
    console.log(JSON.stringify(tables, null, 2));
  } catch (err) {
    console.error(err);
  }
})();
