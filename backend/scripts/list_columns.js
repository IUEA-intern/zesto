(async () => {
  try {
    const { query, testConnection } = require('../src/config/db');
    await testConnection();
    const DB_NAME = process.env.DB_NAME || 'zesto_db_2';
    const forTables = ['users','products'];
    for (const t of forTables) {
      const rows = await query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [DB_NAME, t]);
      console.log('\nCOLUMNS FOR', t, '=>', rows.map(r => r.COLUMN_NAME));
    }
  } catch (err) { console.error('ERR', err); }
})();
