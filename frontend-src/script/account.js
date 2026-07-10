'use strict';

/**
 * Zesto — account.js
 * Powers account.html: "My Orders" (in-progress + history) and
 * "Account Settings" (name/phone/password).
 *
 * Uses window.SharedAuth (from shared_auth.js) for session/login,
 * and hits /api/orders + the new /api/auth/profile & /change-password
 * endpoints directly.
 */

const Toast = {
  container: null,
  init() { this.container = document.getElementById('toastContainer'); },
  show(message, type = 'info', duration = 3500) {
    if (!this.container) return;
    const icons = { success: '✅', error: '❌', info: '🍊', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '🍊'}</span><span>${escapeHtml(message)}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  },
  success(m) { this.show(m, 'success'); },
  error(m)   { this.show(m, 'error'); },
  info(m)    { this.show(m, 'info'); },
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function currency(n) { return 'UGX ' + Number(n || 0).toLocaleString('en-UG'); }
function dateFmt(d) {
  return new Date(d).toLocaleString('en-UG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const IN_PROGRESS_STATUSES = ['pending', 'processing', 'preparing', 'ready_for_pickup', 'out_for_delivery'];
const STEPS = [
  { key: 'placed',   label: 'Placed',   statuses: ['pending', 'processing', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'] },
  { key: 'cooking',  label: 'Cooking',  statuses: ['processing', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'] },
  { key: 'ready',    label: 'Ready',    statuses: ['ready_for_pickup', 'out_for_delivery', 'delivered'] },
  { key: 'onway',    label: 'On the way', statuses: ['out_for_delivery', 'delivered'] },
  { key: 'delivered',label: 'Delivered', statuses: ['delivered'] },
];

const STATUS_COLORS = {
  pending:           { bg: '#FEF3C7', fg: '#92400E' },
  processing:        { bg: '#DBEAFE', fg: '#1E40AF' },
  preparing:         { bg: '#FDE68A', fg: '#92400E' },
  ready_for_pickup:  { bg: '#E0E7FF', fg: '#3730A3' },
  out_for_delivery:  { bg: '#FFEDD5', fg: '#C2410C' },
  delivered:         { bg: '#DCFCE7', fg: '#166534' },
  cancelled:         { bg: '#FEE2E2', fg: '#991B1B' },
};

function statusLabel(status) {
  return String(status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function statusPill(status) {
  const c = STATUS_COLORS[status] || { bg: '#F3F4F6', fg: '#374151' };
  return `<span class="order-status-pill" style="background:${c.bg};color:${c.fg}">${statusLabel(status)}</span>`;
}

function renderProgress(order) {
  if (order.status === 'cancelled') {
    return `<div class="order-progress"><div class="step cancelled"><div class="dot"></div><div class="label">Cancelled</div></div></div>`;
  }
  return `<div class="order-progress">${STEPS.map((s, i) => {
    const reached = s.statuses.includes(order.status);
    const isCurrent = reached && (i === STEPS.length - 1 || !STEPS[i + 1].statuses.includes(order.status));
    const cls = isCurrent ? 'current' : (reached ? 'done' : '');
    return `<div class="step ${cls}"><div class="line"></div><div class="dot"></div><div class="label">${s.label}</div></div>`;
  }).join('')}</div>`;
}

function orderCard(order, { history = false } = {}) {
  const codeBox = (!history && order.delivery_confirmation_code) ? `
    <div class="order-code-box">
      <div class="lbl">Delivery code for Order ${escapeHtml(order.order_number)}</div>
      <div class="code">${escapeHtml(String(order.delivery_confirmation_code))}</div>
      <div class="hint">Keep this safe — only give it to your rider once they arrive with your food.</div>
    </div>` : '';

  return `
    <div class="order-card" data-order-id="${order.order_id}">
      <div class="order-card-top">
        <div>
          <div class="order-card-num">${escapeHtml(order.order_number)}</div>
          <div class="order-card-restaurant">🏪 ${escapeHtml(order.restaurant_name || 'Zesto')}</div>
          <div class="order-card-meta">${order.item_count ?? '?'} item${order.item_count === 1 ? '' : 's'} • ${dateFmt(order.created_at)}</div>
        </div>
        <div style="text-align:right">
          ${statusPill(order.status)}
          <div class="order-total">${currency(order.total)}</div>
        </div>
      </div>
      ${!history ? renderProgress(order) : ''}
      ${codeBox}
    </div>`;
}

const State = {
  session: null,
  orders: [],
  activeTab: 'orders',
  activeSub: 'progress',
  socket: null,
};

async function loadOrders() {
  try {
    const res = await window.SharedAuth.request('/orders');
    State.orders = res.data || [];
    renderOrders();
  } catch (err) {
    Toast.error('Failed to load your orders: ' + err.message);
  }
}

function renderOrders() {
  const progressEl = document.getElementById('ordersInProgress');
  const historyEl  = document.getElementById('ordersHistory');

  const inProgress = State.orders.filter(o => IN_PROGRESS_STATUSES.includes(o.status));
  const history    = State.orders.filter(o => !IN_PROGRESS_STATUSES.includes(o.status));

  progressEl.innerHTML = inProgress.length
    ? inProgress.map(o => orderCard(o)).join('')
    : `<div class="empty-state"><span class="emoji">🍽️</span>No orders in progress right now.</div>`;

  historyEl.innerHTML = history.length
    ? history.map(o => orderCard(o, { history: true })).join('')
    : `<div class="empty-state"><span class="emoji">🗂️</span>No past orders yet.</div>`;
}

/* ── Tabs ─────────────────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.account-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.account-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.activeTab = btn.dataset.tab;
      document.querySelectorAll('.account-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`panel-${State.activeTab}`).classList.add('active');
    });
  });

  document.querySelectorAll('.orders-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.orders-subtab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.activeSub = btn.dataset.sub;
      document.getElementById('ordersInProgress').style.display = State.activeSub === 'progress' ? '' : 'none';
      document.getElementById('ordersHistory').style.display    = State.activeSub === 'history'  ? '' : 'none';
    });
  });
}

/* ── Account settings ─────────────────────────────────────── */
async function fillSettingsForm() {
  document.getElementById('settingsEmail').value = State.session?.email || '';
  document.getElementById('settingsName').value  = State.session?.name || '';
  try {
    const res = await window.SharedAuth.request('/auth/profile');
    if (res.user) document.getElementById('settingsPhone').value = res.user.phone || '';
  } catch {
    // Non-fatal — name/email already filled from session
  }
}

async function saveProfile() {
  const btn = document.getElementById('saveProfileBtn');
  const name  = document.getElementById('settingsName').value.trim();
  const phone = document.getElementById('settingsPhone').value.trim();
  if (!name) { Toast.error('Please enter your name.'); return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const res = await window.SharedAuth.request('/auth/profile', { method: 'PATCH', body: { name, phone } });
    Toast.success('Profile updated.');
    if (res.user) State.session = { ...State.session, ...res.user };
  } catch (err) {
    Toast.error(err.message || 'Failed to update profile.');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

async function savePassword() {
  const btn = document.getElementById('savePasswordBtn');
  const current = document.getElementById('currentPassword').value;
  const next    = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmNewPassword').value;

  if (!current || !next || !confirm) { Toast.error('Please fill in all password fields.'); return; }
  if (next.length < 8) { Toast.error('New password must be at least 8 characters.'); return; }
  if (next !== confirm) { Toast.error('New password and confirmation do not match.'); return; }

  btn.disabled = true; btn.textContent = 'Updating…';
  try {
    await window.SharedAuth.request('/auth/change-password', {
      method: 'POST',
      body: { currentPassword: current, newPassword: next },
    });
    Toast.success('Password updated successfully.');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
  } catch (err) {
    Toast.error(err.message || 'Failed to update password.');
  } finally {
    btn.disabled = false; btn.textContent = 'Update Password';
  }
}

/* ── Realtime: keep the in-progress list current ─────────── */
function initSocket() {
  if (typeof io === 'undefined' || !State.session) return;
  State.socket = io({ transports: ['websocket', 'polling'] });
  State.socket.on('connect', () => State.socket.emit('join', State.session.user_id));
  ['order:created', 'order:update', 'payment:status'].forEach(evt => {
    State.socket.on(evt, () => loadOrders());
  });
}

/* ── Nav pill (account.html manages its own #userPill, same pattern
   as order&cart.js, since shared_auth.js skips pages that already
   have one) ─────────────────────────────────────────────────── */
function updateNavUI() {
  const userPill   = document.getElementById('userPill');
  const userNameEl = document.getElementById('userName');
  const authBtn    = document.getElementById('openAuthModal');

  if (State.session) {
    userPill?.classList.remove('hidden');
    if (userNameEl) userNameEl.textContent = State.session.name;
    if (authBtn) authBtn.style.display = 'none';
  } else {
    userPill?.classList.add('hidden');
    if (authBtn) authBtn.style.display = '';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();
  initTabs();
  document.getElementById('openAuthModal')?.addEventListener('click', () => window.SharedAuth.showLogin());
  document.getElementById('logoutBtn')?.addEventListener('click', () => window.SharedAuth.logout());
  document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
  document.getElementById('savePasswordBtn').addEventListener('click', savePassword);

  document.addEventListener('auth-logout', () => {
    State.session = null;
    updateNavUI();
    window.location.href = 'index.html';
  });

  const { user } = await window.SharedAuth.checkSession();
  if (!user) {
    updateNavUI();
    Toast.info('Please log in to view your account.');
    window.SharedAuth.showLogin();
    document.addEventListener('auth-login', async () => {
      State.session = window.SharedAuth.getSession();
      updateNavUI();
      await fillSettingsForm();
      await loadOrders();
      initSocket();
    }, { once: true });
    return;
  }

  State.session = user;
  updateNavUI();
  await fillSettingsForm();
  await loadOrders();
  initSocket();

  // Fallback polling in case a socket event is missed
  setInterval(() => { if (!document.hidden) loadOrders(); }, 20000);
});
