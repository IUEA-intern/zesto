(async () => {
  try {
    const fetch = globalThis.fetch || (await import('node-fetch')).default;
    const base = 'http://localhost:5000';

    // Login
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@zesto.ug', password: 'Admin@123' }),
    });
    console.log('LOGIN STATUS', login.status);
    const sc = login.headers.get('set-cookie') || login.headers.get('Set-Cookie');
    console.log('SET-COOKIE:', sc);
    const cookie = sc ? sc.split(';')[0] : '';

    // Fetch users
    const users = await fetch(base + '/api/admin/users', { headers: { cookie } });
    console.log('\nUSERS STATUS', users.status);
    console.log('USERS BODY:', await users.text());

    // Create product
    const create = await fetch(base + '/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Test Product', category_id: 1, price: 1000, stock: 10 }),
    });
    console.log('\nCREATE STATUS', create.status);
    console.log('CREATE BODY:', await create.text());
  } catch (err) {
    console.error('SCRIPT ERROR', err);
  }
})();
