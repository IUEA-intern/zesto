const { query, testConnection } = require('../src/config/db');

(async () => {
  try {
    await testConnection();
    const users = await query('SELECT user_id, email, role FROM users WHERE email = ?', ['admin@zesto.ug']);
    console.log('QUERY RESULT:', users);
    console.log('IS ARRAY:', Array.isArray(users));
    if (Array.isArray(users)) console.log('LENGTH:', users.length);
  } catch (err) {
    console.error('ERROR:', err);
  }
})();
