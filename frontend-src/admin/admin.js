/**
 * admin/admin.js — Zesto Super Admin Dashboard
 * Extends original admin.js with Restaurants, Riders, Settings, Platform Analytics
 * Preserves all original behaviour (orders, products, users, payments, audit, socket).
 */
'use strict';

const API = '/api';

const STATUS_LABELS = {
  pending:          '⏳ Pending',
  processing:       '✅ Processing',
  preparing:        '👨‍🍳 Preparing',
  out_for_delivery: '🚀 Out for Delivery',
  delivered:        '🎉 Delivered',
  cancelled:        '❌ Cancelled',
  ready_for_pickup: '🍽️ Ready for Pickup',
};

const PAYMENT_LABELS = {
  pending:  '⏳ Pending',
  verified: '✅ Verified',
  failed:   '❌ Failed',
  refunded: '↩ Refunded',
};

const PAGE_TITLES = {
  dashboard:   'Dashboard',
  restaurants: 'Restaurants',
  riders:      'Riders',
  users:       'Users',
  orders:      'Orders',
  payments:    'Payments',
  analytics:   'Analytics',
  audit:       'Audit Logs',
  settings:    'Platform Settings',
};

const State = {
  session:            null,
  currentPage:        'dashboard',
  ordersPage:         1,
  ordersStatus:       '',
  restaurantsPage:    1,
  restaurantsStatus:  '',
  ridersPage:         1,
  ridersStatus:       '',
  usersRole:          '',
  analyticsDays:      30,
  socket:             null,
  liveFeedItems:      [],
};

/* ── Utils ─────────────────────────────────────────────────── */
const Utils = {
  currency: n => 'UGX ' + Number(n).toLocaleString('en-UG'),
  date:     d => new Date(d).toLocaleString('en-UG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }),
  escape:   s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  shortDate:d => new Date(d).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric' }),
  statusPill(status) {
    const label = STATUS_LABELS[status] || status;
    return `<span class="status-pill status-${status}">${Utils.escape(label)}</span>`;
  },
  paymentPill(status) {
    const label = PAYMENT_LABELS[status] || status;
    return `<span class="status-pill status-${status}">${Utils.escape(label)}</span>`;
  },
  restaurantStatusPill(status) {
    const map = { pending:'status-pending', approved:'status-delivered', suspended:'status-cancelled' };
    const labels = { pending:'⏳ Pending', approved:'✅ Approved', suspended:'🚫 Suspended' };
    return `<span class="status-pill ${map[status]||''}">${Utils.escape(labels[status]||status)}</span>`;
  },
};

/* ── Toast ─────────────────────────────────────────────────── */
const Toast = {
  show(msg, type = 'info', dur = 4000) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const icons = { success:'✅', error:'❌', info:'🍊', warning:'⚠️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type]||'🍊'}</span><span>${Utils.escape(msg)}</span>`;
    c.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, dur);
  },
  success: m => Toast.show(m, 'success'),
  error:   m => Toast.show(m, 'error'),
  info:    m => Toast.show(m, 'info'),
};

/* ── API ───────────────────────────────────────────────────── */
const Api = {
  async req(path, opts = {}) {
    const res  = await fetch(API + path, {
      ...opts,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  },
  get:    p       => Api.req(p),
  post:   (p, b)  => Api.req(p, { method: 'POST',   body: b }),
  put:    (p, b)  => Api.req(p, { method: 'PUT',    body: b }),
  delete: p       => Api.req(p, { method: 'DELETE' }),
};

/* ── Auth ──────────────────────────────────────────────────── */
const Auth = {
  async check() {
    try {
      const res = await Api.get('/auth/me');
      if (!res.user || !['admin', 'staff', 'super_admin'].includes(res.user.role)) {
        throw new Error('Insufficient role');
      }
      State.session = res.user;
      document.getElementById('sidebarUser').textContent = `👤 ${res.user.name} (${res.user.role})`;
      return true;
    } catch { return false; }
  },

  async login() {
    const email    = document.getElementById('agEmail').value.trim();
    const password = document.getElementById('agPassword').value;
    const btn      = document.getElementById('agLoginBtn');
    if (!email || !password) { Toast.error('Email and password required.'); return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res = await Api.post('/auth/login', { email, password });
      if (!['admin', 'staff', 'super_admin'].includes(res.user?.role)) {
        await Api.post('/auth/logout', {});
        Toast.error('Access denied. Admin accounts only.');
        return;
      }
      State.session = res.user;
      document.getElementById('sidebarUser').textContent = `👤 ${res.user.name} (${res.user.role})`;
      showApp();
      Toast.success(`Welcome, ${res.user.name}!`);
    } catch (err) {
      Toast.error(err.message || 'Login failed.');
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  },

  async logout() {
    try { await Api.post('/auth/logout', {}); } catch {}
    location.reload();
  },
};

/* ── App Shell ─────────────────────────────────────────────── */
function showApp() {
  document.getElementById('authGate').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  initSocket();
  navigateTo('dashboard');
}

function showAuthGate() {
  document.getElementById('authGate').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
}

function refreshActivePage() {
  const page = State.currentPage;

  const loaders = {
    dashboard: loadDashboard,
    orders: loadOrders,
    payments: loadPayments,
    restaurants: loadRestaurants,
    riders: loadRiders,
    users: loadUsers,
    analytics: loadAnalytics,
    audit: loadAudit,
    settings: loadSettings
  };

  if (loaders[page]) {
    loaders[page]();
  }
}

/* ── Socket.IO ─────────────────────────────────────────────── */
function initSocket() {
  if (typeof io === 'undefined') {
    document.getElementById('liveIndicator').style.color = '#9CA3AF';
    return;
  }
  State.socket = io({ credentials: true, reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
  
  State.socket.on('connect', () => {
    State.socket.emit('admin:join');
    document.getElementById('liveIndicator').style.color = '';
    console.log('🔌 Socket connected');
  });
  
  State.socket.on('disconnect', (reason) => {
    document.getElementById('liveIndicator').style.color = '#9CA3AF';
    console.log('🔌 Socket disconnected:', reason);
  });

  State.socket.on('reconnect', () => {
    console.log('🔄 Socket reconnected');
    if (State.currentPage === 'orders') loadOrders();
    refreshKPIs();
  });

  /* ── Order Events ──────────────────────────────────── */
  
  /** Payment pending — customer just started paying */
  State.socket.on('payment:pending', ({ data }) => {
    console.log('⏳ Payment pending event:', data);
    addFeedItem({
      icon: '⏳',
      title: `Payment Pending`,
      meta: `Order #${data.orderNumber || data.orderId} — ${Utils.escape(data.method || 'mobile money')}`,
      amt: Utils.currency(data.amount),
    });
    refreshKPIs();
    if (State.currentPage === 'payments') loadPayments();
  });

  /** Payment made — gateway received payment, awaiting server verification */
  State.socket.on('payment:made', ({ data }) => {
    console.log('💸 Payment made event:', data);
    addFeedItem({
      icon: '💸',
      title: `Payment Made`,
      meta: `Order #${data.orderNumber || data.orderId}`,
      amt: Utils.currency(data.amount),
    });
    refreshKPIs();
    if (State.currentPage === 'payments') loadPayments();
  });

  /** New paid order received (payment verified) */
  State.socket.on('order:new', ({ data }) => {
    console.log('📦 New order event:', data);

    const orderNumber = data.orderNumber || data.order_id || data.orderId;

    addFeedItem({
      icon: '📦',
      title: `New Order ${orderNumber}`,
      meta: `${data.itemCount || '?'} item(s)`,
      amt: Utils.currency(data.total),
    });

    refreshKPIs();
    bumpBadge();

    refreshActivePage();
  });

  /** Order status changed */
  State.socket.on('order:update', ({ data }) => {
    console.log('🔄 Order update event:', data);

    refreshKPIs();
    refreshActivePage();
  });

  /** Payment verified - order is ready to be displayed */
  State.socket.on('payment:verified', ({ data }) => {
    console.log('💳 Payment verified event:', data);

    refreshKPIs();
    refreshActivePage();
  });

  /** Payment failed */
  State.socket.on('payment:failed', ({ data }) => {
    console.log('❌ Payment failed event:', data);

    refreshKPIs();
    refreshActivePage();
  });

  State.socket.on('toast', ({ message }) => Toast.info(message));
}

/* ── Navigation ────────────────────────────────────────────── */
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  const navEl  = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;
  State.currentPage = page;

  // Mobile: Close sidebar on navigate
  document.getElementById('sidebar')?.classList.remove('open');

  const loaders = {
    dashboard:   loadDashboard,
    restaurants: loadRestaurants,
    riders:      loadRiders,
    users:       loadUsers,
    orders:      loadOrders,
    payments:    loadPayments,
    analytics:   loadAnalytics,
    audit:       loadAudit,
    settings:    loadSettings,
  };
  if (loaders[page]) loaders[page]();
}

/* ── Live Feed ─────────────────────────────────────────────── */
function addFeedItem({ icon, title, meta, amt }) {
  State.liveFeedItems.unshift({ icon, title, meta, amt });
  if (State.liveFeedItems.length > 20) State.liveFeedItems.pop();
  renderFeed();
}

function renderFeed() {
  const el = document.getElementById('liveFeed');
  if (!el) return;
  if (!State.liveFeedItems.length) {
    el.innerHTML = '<div class="feed-empty">Waiting for orders…</div>';
    return;
  }
  el.innerHTML = State.liveFeedItems.map(i => `
    <div class="feed-item">
      <span class="feed-item-icon">${i.icon}</span>
      <div class="feed-item-body">
        <div class="feed-item-name">${Utils.escape(i.title)}</div>
        <div class="feed-item-meta">${Utils.escape(i.meta)}</div>
      </div>
      <span class="feed-item-amt">${Utils.escape(i.amt)}</span>
    </div>`).join('');
}

function bumpBadge() {
  const b = document.getElementById('activeOrdersBadge');
  if (!b) return;
  b.textContent = String(Number(b.textContent || '0') + 1);
  b.classList.remove('hidden');
}

/* ────────────────────────────────────────────────────────────
   DASHBOARD
   ──────────────────────────────────────────────────────────── */
async function loadDashboard() {
  refreshKPIs();
  loadTopRestaurants();
}

async function refreshKPIs() {
  try {
    const res = await Api.get('/super-admin/stats');
    const d = res.data;
    document.getElementById('kpiRestaurants').textContent        = d.totalRestaurants;
    document.getElementById('kpiPendingRestaurants').textContent  = d.pendingRestaurants;
    document.getElementById('kpiRiders').textContent             = d.totalRiders;
    document.getElementById('kpiPendingRiders').textContent      = d.pendingRiders;
    document.getElementById('kpiCustomers').textContent          = d.totalCustomers;
    document.getElementById('kpiOrders').textContent             = d.totalOrders;
    document.getElementById('kpiRevenue').textContent            = Utils.currency(d.totalRevenue);
    document.getElementById('kpiFailed').textContent             = d.failedPayments;
    document.getElementById('kpiCommission').textContent         = Utils.currency(d.platformCommission);

    // Update sidebar badges
    if (d.pendingRestaurants > 0) {
      const b = document.getElementById('pendingRestaurantsBadge');
      b.textContent = d.pendingRestaurants;
      b.classList.remove('hidden');
    }
    if (d.pendingRiders > 0) {
      const b = document.getElementById('pendingRidersBadge');
      b.textContent = d.pendingRiders;
      b.classList.remove('hidden');
    }
  } catch (err) {
    console.error('KPI fetch failed', err);
  }
}

async function loadTopRestaurants() {
  try {
    const res = await Api.get('/super-admin/analytics?days=30');
    const list = res.data?.topRestaurants || [];
    const el = document.getElementById('topRestaurantsList');
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">No data yet</div>'; return; }
    el.innerHTML = list.map((r, i) => `
      <div class="top-product-row">
        <span class="tp-rank">${i + 1}</span>
        <span class="tp-name">${Utils.escape(r.name)}</span>
        <span class="tp-units">${r.total_orders} orders</span>
        <span class="tp-rev">${Utils.currency(r.total_revenue)}</span>
      </div>`).join('');
  } catch {}
}

/* ────────────────────────────────────────────────────────────
   RESTAURANTS
   ──────────────────────────────────────────────────────────── */
async function loadRestaurants() {
  const tbody = document.getElementById('restaurantsBody');
  tbody.innerHTML = '<tr><td colspan="8" class="table-loading">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ page: State.restaurantsPage, limit: 20 });
    if (State.restaurantsStatus) params.set('status', State.restaurantsStatus);
    const res = await Api.get(`/super-admin/restaurants?${params}`);
    const rows = res.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-loading">No restaurants found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>
          <div style="font-weight:700">${Utils.escape(r.name)}</div>
          <div style="font-size:.76rem;color:var(--text-muted)">${Utils.escape(r.email||'—')}</div>
        </td>
        <td>${Utils.escape(r.owner_name)}</td>
        <td>${Utils.escape(r.phone||'—')}</td>
        <td>${r.total_orders ?? 0}</td>
        <td>${Utils.currency(r.total_revenue ?? 0)}</td>
        <td>${Utils.restaurantStatusPill(r.status)}</td>
        <td>${Utils.shortDate(r.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn-sm edit" data-action="view-restaurant" data-id="${r.restaurant_id}">View</button>
            ${r.status !== 'approved'   ? `<button class="btn-sm edit" data-action="approve-restaurant" data-id="${r.restaurant_id}">✅ Approve</button>` : ''}
            ${r.status !== 'suspended'  ? `<button class="btn-sm danger" data-action="suspend-restaurant" data-id="${r.restaurant_id}">🚫 Suspend</button>` : ''}
          </div>
        </td>
      </tr>`).join('');
    renderPagination('restaurantsPagination', res.meta, p => { State.restaurantsPage = p; loadRestaurants(); });

    // Attach delegated handler for restaurant action buttons (defensive: works even if inline handlers fail)
    // Remove any previous handler to avoid duplicates
    if (!document.__zesto_restaurant_action_bound) {
      document.__zesto_restaurant_action_bound = true;
      document.addEventListener('click', async (ev) => {
        const btn = ev.target.closest && ev.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = Number(btn.dataset.id);
        if (!action || !id) return;
        try {
          if (action === 'view-restaurant') {
            return viewRestaurant(id);
          }
          if (action === 'approve-restaurant') {
            await Api.put(`/super-admin/restaurants/${id}/approve`);
            Toast.success('Restaurant approved.');
            if (btn.dataset.close) document.getElementById(btn.dataset.close)?.classList.add('hidden');
            loadRestaurants(); refreshKPIs();
            return;
          }
          if (action === 'suspend-restaurant') {
            if (!confirm('Suspend this restaurant?')) return;
            await Api.put(`/super-admin/restaurants/${id}/suspend`);
            Toast.success('Restaurant suspended.');
            if (btn.dataset.close) document.getElementById(btn.dataset.close)?.classList.add('hidden');
            loadRestaurants(); refreshKPIs();
            return;
          }
        } catch (err) {
          Toast.error(err.message || 'Action failed');
        }
      });
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Error: ${Utils.escape(err.message)}</td></tr>`;
  }
}

async function viewRestaurant(id) {
  const modal   = document.getElementById('restaurantModal');
  const content = document.getElementById('restaurantModalContent');
  const title   = document.getElementById('restaurantModalTitle');
  modal.classList.remove('hidden');
  content.innerHTML = '<div style="text-align:center;padding:32px">Loading…</div>';
  try {
    const res = await Api.get(`/super-admin/restaurants/${id}`);
    const r = res.data;
    title.textContent = r.name;
    content.innerHTML = `
      <div class="order-detail-grid">
        <div class="detail-group"><label>Owner</label><div class="detail-val">${Utils.escape(r.owner_name)}</div></div>
        <div class="detail-group"><label>Email</label><div class="detail-val">${Utils.escape(r.owner_email||'—')}</div></div>
        <div class="detail-group"><label>Phone</label><div class="detail-val">${Utils.escape(r.phone||'—')}</div></div>
        <div class="detail-group"><label>Status</label><div class="detail-val">${Utils.restaurantStatusPill(r.status)}</div></div>
        <div class="detail-group"><label>Total Orders</label><div class="detail-val">${r.order_count}</div></div>
        <div class="detail-group"><label>Total Revenue</label><div class="detail-val">${Utils.currency(r.total_revenue)}</div></div>
        <div class="detail-group"><label>Products</label><div class="detail-val">${r.product_count}</div></div>
        <div class="detail-group"><label>Joined</label><div class="detail-val">${Utils.shortDate(r.created_at)}</div></div>
      </div>
      ${r.description ? `<p style="color:var(--text-sec);font-size:.86rem;margin-top:8px">${Utils.escape(r.description)}</p>` : ''}
      <div style="display:flex;gap:10px;margin-top:20px">
        ${r.status !== 'approved'  ? `<button class="btn-primary" data-action="approve-restaurant" data-id="${r.restaurant_id}" data-close="restaurantModal">✅ Approve</button>` : ''}
        ${r.status !== 'suspended' ? `<button class="btn-sm danger" style="padding:10px 22px" data-action="suspend-restaurant" data-id="${r.restaurant_id}" data-close="restaurantModal">🚫 Suspend</button>` : ''}
      </div>`;
  } catch (err) {
    content.innerHTML = `<p style="color:var(--danger)">${Utils.escape(err.message)}</p>`;
  }
}

async function approveRestaurant(id) {
  try {
    await Api.put(`/super-admin/restaurants/${id}/approve`);
    Toast.success('Restaurant approved.');
    loadRestaurants();
    refreshKPIs();
  } catch (err) { Toast.error(err.message); }
}

async function suspendRestaurant(id) {
  if (!confirm('Suspend this restaurant?')) return;
  try {
    await Api.put(`/super-admin/restaurants/${id}/suspend`);
    Toast.success('Restaurant suspended.');
    loadRestaurants();
    refreshKPIs();
  } catch (err) { Toast.error(err.message); }
}

/* ────────────────────────────────────────────────────────────
   RIDERS
   ──────────────────────────────────────────────────────────── */
async function loadRiders() {
  const tbody = document.getElementById('ridersBody');
  tbody.innerHTML = '<tr><td colspan="8" class="table-loading">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ page: State.ridersPage, limit: 20 });
    if (State.ridersStatus) params.set('status', State.ridersStatus);
    const res = await Api.get(`/super-admin/riders?${params}`);
    const rows = res.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-loading">No riders found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>
          <div style="font-weight:700">${Utils.escape(r.rider_name)}</div>
          <div style="font-size:.76rem;color:var(--text-muted)">${Utils.escape(r.rider_email||'—')}</div>
        </td>
        <td>${Utils.escape((r.vehicle_type||'').replace('_',' '))}</td>
        <td>${Utils.escape(r.vehicle_number||'—')}</td>
        <td>${r.deliveries_completed ?? 0}</td>
        <td>${r.deliveries_failed ?? 0}</td>
        <td><span style="color:${r.is_available?'var(--success)':'var(--text-muted)'};font-weight:700">${r.is_available?'🟢 Yes':'⚫ No'}</span></td>
        <td>${Utils.restaurantStatusPill(r.status)}</td>
        <td>
          <div style="display:flex;gap:6px">
            ${r.status !== 'approved'  ? `<button class="btn-sm edit" onclick="approveRider(${r.rider_id})">✅ Approve</button>` : ''}
            ${r.status !== 'suspended' ? `<button class="btn-sm danger" onclick="suspendRider(${r.rider_id})">🚫 Suspend</button>` : ''}
          </div>
        </td>
      </tr>`).join('');
    renderPagination('ridersPagination', res.meta, p => { State.ridersPage = p; loadRiders(); });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Error: ${Utils.escape(err.message)}</td></tr>`;
  }
}

async function approveRider(id) {
  try {
    await Api.put(`/super-admin/riders/${id}/approve`);
    Toast.success('Rider approved.');
    loadRiders(); refreshKPIs();
  } catch (err) { Toast.error(err.message); }
}

async function suspendRider(id) {
  if (!confirm('Suspend this rider?')) return;
  try {
    await Api.put(`/super-admin/riders/${id}/suspend`);
    Toast.success('Rider suspended.');
    loadRiders(); refreshKPIs();
  } catch (err) { Toast.error(err.message); }
}

/* ────────────────────────────────────────────────────────────
   USERS
   ──────────────────────────────────────────────────────────── */
async function loadUsers() {
  const tbody = document.getElementById('usersBody');
  tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ limit: 30 });
    if (State.usersRole) params.set('role', State.usersRole);
    const res = await Api.get(`/super-admin/users?${params}`);
    const rows = res.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No users found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(u => {
      const phoneValue = u.phone || u.phone_number || '—';
      return `
      <tr>
        <td>${u.user_id}</td>
        <td>${Utils.escape(u.name)}</td>
        <td>${Utils.escape(u.email)}</td>
        <td>${Utils.escape(phoneValue)}</td>
        <td><span class="status-pill ${u.role==='super_admin'?'status-processing':u.role==='restaurant_admin'?'status-preparing':u.role==='rider'?'status-delivered':'status-pending'}">${Utils.escape(u.role)}</span></td>
        <td>${u.order_count ?? 0}</td>
        <td>${Utils.shortDate(u.created_at)}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Error: ${Utils.escape(err.message)}</td></tr>`;
  }
}

/* ────────────────────────────────────────────────────────────
   ORDERS (re-uses original /api/admin/orders)
   ──────────────────────────────────────────────────────────── */
async function loadOrders() {
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = '<tr><td colspan="8" class="table-loading">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ page: State.ordersPage, limit: 20 });
    if (State.ordersStatus) params.set('status', State.ordersStatus);
    const res = await Api.get(`/admin/orders?${params}`);
    const rows = res.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-loading">No orders found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(o => `
      <tr data-order-id="${o.order_id}">
        <td><strong>${Utils.escape(o.order_number)}</strong></td>
        <td>${Utils.escape(o.customer_name)}</td>
        <td>${Utils.escape(o.restaurant_name||'—')}</td>
        <td>${Utils.currency(o.total)}</td>
        <td>${Utils.paymentPill(o.payment_status||'pending')}</td>
        <td>${Utils.statusPill(o.status)}</td>
        <td>${Utils.shortDate(o.created_at)}</td>
        <td><button class="btn-sm edit" onclick="viewOrder(${o.order_id})">View</button></td>
      </tr>`).join('');
    renderPagination('ordersPagination', res.meta, p => { State.ordersPage = p; loadOrders(); });
    // update badge
    const badge = document.getElementById('activeOrdersBadge');
    const activeCount = rows.filter(o => !['delivered','cancelled'].includes(o.status)).length;
    badge.textContent = activeCount;
    badge.classList.toggle('hidden', activeCount === 0);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Error: ${Utils.escape(err.message)}</td></tr>`;
  }
}

async function viewOrder(id) {
  const modal   = document.getElementById('orderDetailModal');
  const content = document.getElementById('orderDetailContent');
  modal.classList.remove('hidden');
  content.innerHTML = '<div style="text-align:center;padding:32px">Loading…</div>';
  try {
    const res = await Api.get(`/admin/orders/${id}`);
    const o = res.data;
    document.getElementById('orderDetailTitle').textContent = `Order ${o.order_number}`;
    content.innerHTML = `
      <div class="order-detail-grid">
        <div class="detail-group"><label>Customer</label><div class="detail-val">${Utils.escape(o.customer_name)}</div></div>
        <div class="detail-group"><label>Phone</label><div class="detail-val">${Utils.escape(o.customer_phone||'—')}</div></div>
        <div class="detail-group"><label>Status</label><div class="detail-val">${Utils.statusPill(o.status)}</div></div>
        <div class="detail-group"><label>Payment</label><div class="detail-val">${Utils.paymentPill(o.payment_status||'pending')}</div></div>
        <div class="detail-group"><label>Total</label><div class="detail-val">${Utils.currency(o.total)}</div></div>
        <div class="detail-group"><label>Date</label><div class="detail-val">${Utils.date(o.created_at)}</div></div>
        <div class="detail-group" style="grid-column:1/-1"><label>Address</label><div class="detail-val">${Utils.escape(o.delivery_address||'—')}</div></div>
      </div>
      <h4 style="margin:16px 0 8px;font-size:.88rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-sec)">Items</h4>
      <div class="order-items-list">
        ${(o.items||[]).map(i => `
          <div class="order-item-row">
            <span class="oi-name">${Utils.escape(i.name)}</span>
            <span class="oi-qty">× ${i.qty}</span>
            <span class="oi-sub">${Utils.currency(i.subtotal)}</span>
          </div>`).join('')}
      </div>
      <div style="margin-top:16px;text-align:right;font-weight:800;font-size:1rem">
        Total: ${Utils.currency(o.total)}
      </div>`;
  } catch (err) {
    content.innerHTML = `<p style="color:var(--danger)">${Utils.escape(err.message)}</p>`;
  }
}

/* ────────────────────────────────────────────────────────────
   PAYMENTS
   ──────────────────────────────────────────────────────────── */
async function loadPayments() {
  const tbody = document.getElementById('paymentsBody');
  tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading…</td></tr>';
  try {
    const res  = await Api.get('/admin/payments');
    const rows = res.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No payments found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(p => `
      <tr>
        <td>${p.payment_id}</td>
        <td>${Utils.escape(p.order_number||'—')}</td>
        <td>${Utils.escape(p.user_name||'—')}</td>
        <td>${Utils.escape(p.method)}</td>
        <td>${Utils.currency(p.amount)}</td>
        <td>${Utils.paymentPill(p.status)}</td>
        <td>${Utils.shortDate(p.created_at)}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Error: ${Utils.escape(err.message)}</td></tr>`;
  }
}

/* ────────────────────────────────────────────────────────────
   ANALYTICS
   ──────────────────────────────────────────────────────────── */
let chartInstance = null;

async function loadAnalytics() {
  try {
    const res  = await Api.get(`/super-admin/analytics?days=${State.analyticsDays}`);
    const data = res.data;

    // Orders per day chart
    renderChart(data.ordersPerDay || []);

    // Top restaurants
    const topEl = document.getElementById('analyticsTopRestaurants');
    const top = data.topRestaurants || [];
    topEl.innerHTML = top.length
      ? top.map((r, i) => `
          <div class="top-product-row">
            <span class="tp-rank">${i + 1}</span>
            <span class="tp-name">${Utils.escape(r.name)}</span>
            <span class="tp-units">${r.total_orders} orders</span>
            <span class="tp-rev">${Utils.currency(r.total_revenue)}</span>
          </div>`).join('')
      : '<div style="padding:20px;text-align:center;color:var(--text-muted)">No data yet</div>';

    // Revenue by restaurant
    const revEl = document.getElementById('revenueByRestaurant');
    const rev = data.revenueByRestaurant || [];
    revEl.innerHTML = rev.length
      ? rev.map((r, i) => `
          <div class="top-product-row">
            <span class="tp-rank">${i + 1}</span>
            <span class="tp-name">${Utils.escape(r.name)}</span>
            <span class="tp-units">${r.order_count} orders</span>
            <span class="tp-rev">${Utils.currency(r.revenue)}</span>
          </div>`).join('')
      : '<div style="padding:20px;text-align:center;color:var(--text-muted)">No data yet</div>';

    // Delivery stats
    const ds  = data.deliveryStats || {};
    const dEl = document.getElementById('deliveryStats');
    dEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div><div style="font-size:.76rem;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Total Deliveries</div><div style="font-size:1.4rem;font-weight:800">${ds.total ?? '—'}</div></div>
        <div><div style="font-size:.76rem;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Success Rate</div><div style="font-size:1.4rem;font-weight:800;color:var(--success)">${ds.successRate != null ? ds.successRate + '%' : '—'}</div></div>
        <div><div style="font-size:.76rem;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Delivered</div><div style="font-size:1.4rem;font-weight:800;color:var(--success)">${ds.delivered ?? '—'}</div></div>
        <div><div style="font-size:.76rem;font-weight:700;color:var(--text-sec);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Failed</div><div style="font-size:1.4rem;font-weight:800;color:var(--danger)">${ds.failed ?? '—'}</div></div>
      </div>`;
  } catch (err) {
    console.error('Analytics failed', err);
  }
}

function renderChart(daily) {
  const canvas = document.getElementById('revenueChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth; const H = 260;
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  if (!daily.length) {
    ctx.fillStyle = '#9CA3AF'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('No data for this period', W / 2, H / 2);
    return;
  }
  const pad = { top: 20, right: 20, bottom: 40, left: 55 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top  - pad.bottom;
  const maxVal = Math.max(...daily.map(d => Number(d.order_count) || 0), 1);
  const bW = Math.max(4, cW / daily.length - 4);
  ctx.fillStyle = '#f0f0f0';
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const y = pad.top + cH - cH * f;
    ctx.fillRect(pad.left, y, cW, 1);
    ctx.fillStyle = '#9CA3AF'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * f), pad.left - 6, y + 4);
    ctx.fillStyle = '#f0f0f0';
  });
  daily.forEach((d, i) => {
    const val = Number(d.order_count) || 0;
    const x = pad.left + i * (cW / daily.length) + (cW / daily.length - bW) / 2;
    const h = (val / maxVal) * cH;
    const y = pad.top + cH - h;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#FF6B2C');
    grad.addColorStop(1, 'rgba(255,107,44,0.3)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, bW, h, [4, 4, 0, 0]);
    ctx.fill();
    if (i % Math.ceil(daily.length / 7) === 0) {
      const label = new Date(d.date).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
      ctx.fillStyle = '#9CA3AF'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, x + bW / 2, H - 10);
    }
  });
}

/* ────────────────────────────────────────────────────────────
   AUDIT
   ──────────────────────────────────────────────────────────── */
async function loadAudit(filter = '') {
  const tbody = document.getElementById('auditBody');
  tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ limit: 50 });
    if (filter) params.set('action', filter);
    const res  = await Api.get(`/admin/audit-logs?${params}`);
    const rows = res.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No logs found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(l => `
      <tr>
        <td style="white-space:nowrap">${Utils.date(l.created_at)}</td>
        <td>${Utils.escape(l.actor_name||'System')}</td>
        <td><span class="status-pill status-processing">${Utils.escape(l.actor_role)}</span></td>
        <td style="font-family:monospace;font-size:.78rem">${Utils.escape(l.action)}</td>
        <td>${Utils.escape(l.entity_type)}${l.entity_id ? ` #${l.entity_id}` : ''}</td>
        <td style="font-size:.76rem;color:var(--text-muted)">${Utils.escape(l.ip_address||'—')}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Error: ${Utils.escape(err.message)}</td></tr>`;
  }
}

/* ────────────────────────────────────────────────────────────
   PLATFORM SETTINGS
   ──────────────────────────────────────────────────────────── */
const SETTING_FIELD_MAP = {
  platform_name:          'set_platform_name',
  support_email:          'set_support_email',
  support_phone:          'set_support_phone',
  currency:               'set_currency',
  restaurant_commission:  'set_restaurant_commission',
  delivery_commission:    'set_delivery_commission',
  base_delivery_fee:      'set_base_delivery_fee',
  per_km_fee:             'set_per_km_fee',
  max_delivery_distance:  'set_max_delivery_distance',
  jwt_expiration:         'set_jwt_expiration',
  session_timeout:        'set_session_timeout',
  audit_logs_enabled:     'set_audit_logs_enabled',
  audit_retention_days:   'set_audit_retention_days',
};

async function loadSettings() {
  try {
    const res = await Api.get('/super-admin/settings');
    const data = res.data || {};
    // Flatten grouped settings
    for (const group of Object.values(data)) {
      for (const [key, { value }] of Object.entries(group)) {
        const fieldId = SETTING_FIELD_MAP[key];
        if (!fieldId) continue;
        const el = document.getElementById(fieldId);
        if (el) el.value = value ?? '';
      }
    }
  } catch (err) {
    Toast.error('Failed to load settings: ' + err.message);
  }
}

async function saveSettings() {
  const settings = {};
  for (const [key, fieldId] of Object.entries(SETTING_FIELD_MAP)) {
    const el = document.getElementById(fieldId);
    if (el) settings[key] = el.value;
  }
  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await Api.put('/super-admin/settings', settings);
    Toast.success('Platform settings saved.');
  } catch (err) {
    Toast.error(err.message);
  } finally {
    btn.disabled = false; btn.textContent = '💾 Save Settings';
  }
}

/* ────────────────────────────────────────────────────────────
   PAGINATION HELPER
   ──────────────────────────────────────────────────────────── */
function renderPagination(containerId, meta, onPage) {
  const el = document.getElementById(containerId);
  if (!el || !meta) return;
  const totalPages = Math.ceil(meta.total / meta.limit);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
    const p = i + 1;
    return `<button class="page-btn${p === meta.page ? ' active' : ''}" data-page="${p}">${p}</button>`;
  }).join('');
  el.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => onPage(Number(btn.dataset.page)));
  });
}

/* ────────────────────────────────────────────────────────────
   EVENT WIRING
   ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Auth check
  const ok = await Auth.check();
  if (ok) {
    showApp();
  } else {
    showAuthGate();
    const agLoginBtn = document.getElementById('agLoginBtn');
    agLoginBtn?.addEventListener('click', Auth.login);
    document.getElementById('agPassword')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') Auth.login();
    });
  }

  // Logout
  document.getElementById('adminLogout')?.addEventListener('click', Auth.logout);

  // Sidebar nav
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
  });

  document.getElementById('sidebarClose')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });

  document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });

  // Restaurant filter tabs
  document.getElementById('page-restaurants')?.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('page-restaurants').querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.restaurantsStatus = btn.dataset.status || '';
      State.restaurantsPage   = 1;
      loadRestaurants();
    });
  });

  // Riders filter tabs
  document.getElementById('page-riders')?.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('page-riders').querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.ridersStatus = btn.dataset.status || '';
      State.ridersPage   = 1;
      loadRiders();
    });
  });

  // Users role tabs
  document.getElementById('page-users')?.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('page-users').querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.usersRole = btn.dataset.role || '';
      loadUsers();
    });
  });

  // Orders filter tabs
  document.getElementById('page-orders')?.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('page-orders').querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.ordersStatus = btn.dataset.status || '';
      State.ordersPage   = 1;
      loadOrders();
    });
  });

  // Analytics days filter
  document.getElementById('page-analytics')?.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('page-analytics').querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.analyticsDays = Number(btn.dataset.days) || 30;
      loadAnalytics();
    });
  });

  // Audit search
  document.getElementById('auditSearch')?.addEventListener('input', e => {
    loadAudit(e.target.value.trim());
  });

  // Settings save
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);

  // Modal closes
  document.getElementById('closeRestaurantModal')?.addEventListener('click', () => {
    document.getElementById('restaurantModal').classList.add('hidden');
  });
  document.getElementById('closeOrderModal')?.addEventListener('click', () => {
    document.getElementById('orderDetailModal').classList.add('hidden');
  });

  // Close modals on overlay click
  document.getElementById('restaurantModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
  document.getElementById('orderDetailModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
});
