(async () => {
  try {
    const fetch = globalThis.fetch || (await import('node-fetch')).default;
    const base = 'http://localhost:5000';
    const creds = { email: 'admin@zesto.ug', password: 'Admin@123' };
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const sc = login.headers.get('set-cookie');
    const cookie = sc ? sc.split(';')[0] : '';
    if (login.status !== 200) { console.error('LOGIN FAIL', await login.text()); return; }
    console.log('LOGIN OK');
    const productsRes = await fetch(base + '/api/admin/products', { headers: { cookie } });
    console.log('PRODUCTS STATUS', productsRes.status);
    const productsJson = await productsRes.json();
    console.log('PRODUCTS BODY', JSON.stringify(productsJson, null, 2));
    const prod = productsJson.data && productsJson.data[0];
    if (!prod) { console.error('NO PRODUCT'); return; }
    console.log('TEST PRODUCT', prod.product_id, prod.name);
    const updateBody = { name: prod.name + ' TEST', category_id: prod.category_id || 1, price: prod.price || 1000, stock: (prod.stock || 0) + 1, is_active: prod.is_active ? 1 : 0, is_featured: prod.is_featured ? 1 : 0 };
    console.log('UPDATE BODY', updateBody);
    const updateRes = await fetch(base + `/api/admin/products/${prod.product_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(updateBody) });
    console.log('UPDATE STATUS', updateRes.status, await updateRes.text());
    const deleteRes = await fetch(base + `/api/admin/products/${prod.product_id}`, { method: 'DELETE', headers: { cookie } });
    console.log('DELETE STATUS', deleteRes.status, await deleteRes.text());
  } catch (err) { console.error('ERR', err); }
})();
