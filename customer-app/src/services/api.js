/**
 * services/api.js — Zesto Customer HTTP client
 * Talks to the SAME Express/MariaDB backend used by the web frontend
 * and the rider app (backend/src). No backend changes are required.
 */
import { getItem, setItem, deleteItem } from './storage';

// ── Server URL ────────────────────────────────────────────────────
// UPDATE THIS to your server's LAN IP for physical device testing
// (same backend as the rider app — keep these in sync).
// e.g. '192.168.1.42'. Use 'localhost' only for web/simulator.
export const SERVER_HOST = 'http://13.63.203.228:3000'; // ← change to your PC's IP
// export const SERVER_PORT = 3000;
export const BASE_URL = `${Api_BASE_URL}/api`;
// export const ASSET_BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

const TOKEN_KEY = 'zesto_customer_token';
const USER_KEY = 'zesto_customer_user';

export async function saveToken(t) { await setItem(TOKEN_KEY, t); }
export async function getToken() { try { return await getItem(TOKEN_KEY); } catch { return null; } }
export async function clearToken() { await deleteItem(TOKEN_KEY).catch(() => {}); await deleteItem(USER_KEY).catch(() => {}); }
export async function saveUser(u) { await setItem(USER_KEY, JSON.stringify(u)); }
export async function getSavedUser() { try { const r = await getItem(USER_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }

// Resolve a possibly-relative image path (image_url / logo_url) returned
// by the API into an absolute URL the RN <Image> component can load.
export function resolveImage(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${ASSET_BASE_URL}${path}`;
}

async function request(method, path, body = null) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body !== null) options.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, options);
  } catch {
    throw new Error('Cannot reach the server. Please check your network connection.');
  }

  let data;
  try { data = await res.json(); } catch { throw new Error('Unexpected server response.'); }

  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

export const Api = {
  get: p => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  delete: p => request('DELETE', p),
};

// ── Auth ──────────────────────────────────────────────────────────
export const AuthApi = {
  async register({ name, email, phone, password }) {
    const data = await Api.post('/auth/register/customer', { name, email, phone, password });
    if (!data.success) throw new Error(data.message || 'Registration failed.');
    return data;
  },
  async getMobileToken(email, password) {
    const data = await Api.post('/auth/mobile-token', { email, password });
    if (!data.success) throw new Error(data.message || 'Login failed.');
    if (data.user?.role !== 'customer') {
      throw new Error('This app is for Zesto customers. Use the Rider app if you are a delivery rider.');
    }
    return data; // { success, token, user }
  },
  async logout() {
    try { await Api.post('/auth/logout', {}); } catch {}
  },
  getMe: () => Api.get('/auth/me'),
  async updateProfile({ name, phone }) {
    const data = await Api.patch('/auth/profile', { name, phone });
    if (!data.success) throw new Error(data.message || 'Failed to update profile.');
    return data; // { success, token, user }
  },
  async changePassword({ currentPassword, newPassword }) {
    const data = await Api.post('/auth/change-password', { currentPassword, newPassword });
    if (!data.success) throw new Error(data.message || 'Failed to change password.');
    return data;
  },
};

// ── Restaurants ───────────────────────────────────────────────────
export const RestaurantApi = {
  list: () => Api.get('/restaurants'),
  getById: id => Api.get(`/restaurants/${id}`),
};

// ── Products ──────────────────────────────────────────────────────
export const ProductApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.restaurant_id) qs.set('restaurant_id', params.restaurant_id);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return Api.get(`/products${suffix}`);
  },
  getById: id => Api.get(`/products/${id}`),
};

// ── Cart (server-side cart, synced across devices) ───────────────
export const CartApi = {
  get: () => Api.get('/cart'),
  add: (product_id, qty = 1) => Api.post('/cart', { product_id, qty }),
  updateQty: (cart_id, qty) => Api.put(`/cart/${cart_id}`, { qty }),
  remove: cart_id => Api.delete(`/cart/${cart_id}`),
  clear: () => Api.delete('/cart'),
};

// ── Orders ────────────────────────────────────────────────────────
export const OrderApi = {
  create: ({ items, delivery_address, payment_method, notes }) =>
    Api.post('/orders', { items, delivery_address, payment_method, notes }),
  list: () => Api.get('/orders'),
  getById: id => Api.get(`/orders/${id}`),
  verify: (id, { transaction_id, tx_ref }) => Api.post(`/orders/${id}/verify`, { transaction_id, tx_ref }),
};

// ── Payments ──────────────────────────────────────────────────────
export const PaymentApi = {
  initiatePesapal: (order_id, method = 'mobile_money') =>
    Api.post('/payments/pesapal/initiate', { order_id, method }),
  getStatusForOrder: orderId => Api.get(`/payments/order/${orderId}`),
};

// ── Misc ──────────────────────────────────────────────────────────
export const SettingsApi = {
  getDeliveryFee: () => Api.get('/settings/delivery-fee'),
};
