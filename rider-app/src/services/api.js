/**
 * services/api.js — Zesto Rider HTTP client
 */
import { getItem, setItem, deleteItem } from './storage';

// ── Server URL ────────────────────────────────────────────────────
// UPDATE THIS to your server's LAN IP for physical device testing.
// Use the same IP in socket.js → SOCKET_URL
export const SERVER_HOST = '172.16.111.212';  // ← change to your PC's IP
export const BASE_URL    = `http://${SERVER_HOST}:3000/api`;

const TOKEN_KEY = 'zesto_rider_token';
const USER_KEY  = 'zesto_rider_user';

export async function saveToken(t)  { await setItem(TOKEN_KEY, t); }
export async function getToken()    { try { return await getItem(TOKEN_KEY); } catch { return null; } }
export async function clearToken()  { await deleteItem(TOKEN_KEY).catch(()=>{}); await deleteItem(USER_KEY).catch(()=>{}); }
export async function saveUser(u)   { await setItem(USER_KEY, JSON.stringify(u)); }
export async function getSavedUser(){ try { const r = await getItem(USER_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }

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
  get:    p        => request('GET',    p),
  post:   (p, b)   => request('POST',   p, b),
  put:    (p, b)   => request('PUT',    p, b),
  delete: p        => request('DELETE', p),
};

// ── Auth ──────────────────────────────────────────────────────────
export const AuthApi = {
  async getMobileToken(email, password) {
    const data = await Api.post('/auth/mobile-token', { email, password });
    if (!data.success) throw new Error(data.message || 'Login failed.');
    if (data.user?.role !== 'rider')
      throw new Error('This app is for Zesto riders only.');
    return data; // { success, token, user }
  },
  async logout() {
    try { await Api.post('/auth/logout', {}); } catch {}
  },
  // OTP registration flow
  sendOtp:    (payload)      => Api.post('/auth/rider/send-otp',   payload),
  verifyOtp:  (email, otp)   => Api.post('/auth/rider/verify-otp', { email, otp }),
  register:   (email, otp)   => Api.post('/auth/rider/register',   { email, otp }),
};

// ── Rider endpoints ───────────────────────────────────────────────
export const RiderApi = {
  getProfile:       ()              => Api.get('/rider/profile'),
  setAvailability:  (v)             => Api.put('/rider/availability', { is_available: v }),
  getAvailableOrders: ()            => Api.get('/rider/available-orders'),
  acceptOrder:      (id)            => Api.post(`/rider/accept-order/${id}`, {}),
  getActiveDelivery: ()             => Api.get('/rider/active-delivery'),
  markPickedUp:     (id, code)      => Api.post(`/rider/orders/${id}/pickup`, { code }),
  confirmDelivery:  (id, code)      => Api.post(`/rider/orders/${id}/confirm-delivery`, { code }),
  getHistory:       (page = 1)      => Api.get(`/rider/history?page=${page}&limit=20`),
};
