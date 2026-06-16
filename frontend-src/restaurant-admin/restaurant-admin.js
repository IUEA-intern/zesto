/**
 * frontend-src/restaurant-admin/restaurant-admin.js
 * Zesto Restaurant Admin Dashboard — Vanilla JS SPA
 * Auth: restaurant_admin role only
 * API: /api/restaurant/*
 */
'use strict';

const API = '/api';

const STATUS_LABELS = {
  pending:          '⏳ Pending',
  processing:       '✅ Processing',
  preparing:        '👨‍🍳 Preparing',
  ready_for_pickup: '🍽️ Ready for Pickup',
  out_for_delivery: '🚀 Out for Delivery',
  delivered:        '🎉 Delivered',
  cancelled:        '❌ Cancelled',
};

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  orders:    'Orders',
  products:  'Products',
  analytics: 'Analytics',
  settings:  'Restaurant Settings',
};

const State = {
  session:      null,
  currentPage:  'dashboard',
  ordersPage:   1,
  ordersStatus: '',
  analyticsDays: 30,
  editProductId: null,
  socket:       null,
  liveFeedItems: [],
};

/* ── Utils ─────────────────────────────────────────────────── */
const Utils = {
  currency: n => 'UGX ' + Number(n).toLocaleString('en-UG'),
  date:     d => new Date(d).toLocaleString('en-UG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }),
  shortDate:d => new Date(d).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric' }),
  escape:   s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  statusPill(status) {
    const label = STATUS_LABELS[status] || status;
    return `<span class="status-pill status-${status}">${Utils.escape(label)}</span>`;
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
      if (!res.user || res.user.role !== 'restaurant_admin') throw new Error('Not a restaurant admin');
      State.session = res.user;
      document.getElementById('sidebarUser').textContent = `👤 ${res.user.name}`;
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
      if (res.user?.role !== 'restaurant_admin') {
        await Api.post('/auth/logout', {});
        Toast.error('Access denied. Restaurant admin accounts only.');
        return;
      }
      State.session = res.user;
      document.getElementById('sidebarUser').textContent = `👤 ${res.user.name}`;
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

/* ── Socket ────────────────────────────────────────────────── */
function initSocket() {
  if (typeof io === 'undefined') {
    document.getElementById('liveIndicator').style.color = '#9CA3AF';
    return;
  }
  State.socket = io({ credentials: true });
  State.socket.on('connect', () => {
    State.socket.emit('restaurant:join');
    document.getElementById('liveIndicator').style.color = '';
  });
  State.socket.on('disconnect', () => {
    document.getElementById('liveIndicator').style.color = '#9CA3AF';
  });
  State.socket.on('order:new', ({ data }) => {
    addFeedItem({ icon:'📦', title:`New Order ${data.orderNumber||'#'+data.orderId}`, meta:`${data.itemCount} item(s)`, amt: Utils.currency(data.total) });
    refreshKPIs();
    bumpBadge();
    if (State.currentPage === 'orders') loadOrders();
  });
}

/* ── Navigation ────────────────────────────────────────────── */
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;
  State.currentPage = page;
  const loaders = {
    dashboard: loadDashboard,
    orders:    loadOrders,
    products:  loadProducts,
    analytics: loadAnalytics,
    settings:  loadSettings,
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
    el.innerHTML = '<div class="feed-empty">No recent orders</div>';
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
  const b = document.getElementById('pendingOrdersBadge');
  if (!b) return;
  b.textContent = String(Number(b.textContent || '0') + 1);
  b.classList.remove('hidden');
}

/* ────────────────────────────────────────────────────────────
   DASHBOARD
   ──────────────────────────────────────────────────────────── */
async function loadDashboard() {
  refreshKPIs();
  loadTopProducts();
}

async function refreshKPIs() {
  try {
    const res = await Api.get('/restaurant/dashboard');
    const d   = res.data;
    document.getElementById('kpiTodayOrders').textContent  = d.todayOrders;
    document.getElementById('kpiTodayRevenue').textContent = Utils.currency(d.todayRevenue);
    document.getElementById('kpiPending').textContent      = d.pendingOrders;
    document.getElementById('kpiProducts').textContent     = d.productCount;
    document.getElementById('kpiLowStock').textContent     = d.lowStock;

    const badge = document.getElementById('pendingOrdersBadge');
    badge.textContent = d.pendingOrders;
    badge.classList.toggle('hidden', d.pendingOrders === 0);
  } catch (err) {
    console.error('KPI fetch failed', err);
  }
}

async function loadTopProducts() {
  try {
    const res  = await Api.get('/restaurant/analytics?days=30');
    const list = res.data?.topProducts || [];
    const el   = document.getElementById('topProductsList');
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">No sales data yet</div>';
      return;
    }
    el.innerHTML = list.map((p, i) => `
      <div class="top-product-row">
        <span class="tp-rank">${i + 1}</span>
        <span class="tp-name">${Utils.escape(p.name)}</span>
        <span class="tp-units">${p.units_sold} sold</span>
        <span class="tp-rev">${Utils.currency(p.revenue)}</span>
      </div>`).join('');
  } catch {}
}

/* ────────────────────────────────────────────────────────────
   ORDERS
   ──────────────────────────────────────────────────────────── */
async function loadOrders() {
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ page: State.ordersPage, limit: 20 });
    if (State.ordersStatus) params.set('status', State.ordersStatus);
    const res  = await Api.get(`/restaurant/orders?${params}`);
    const rows = res.data || [];

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No orders found.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(o => `
      <tr>
        <td><strong>${Utils.escape(o.order_number)}</strong></td>
        <td>${Utils.escape(o.customer_name || '—')}</td>
        <td>${Utils.escape(o.customer_phone || '—')}</td>
        <td>${Utils.currency(o.total)}</td>
        <td>${Utils.statusPill(o.status)}</td>
        <td>${Utils.shortDate(o.created_at)}</td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <button class="btn-sm edit" onclick="viewOrder(${o.order_id})">View</button>
            ${o.status === 'pending'     ? `<button class="btn-sm edit" onclick="setOrderStatus(${o.order_id},'processing')">✅ Accept</button>` : ''}
            ${o.status === 'pending'     ? `<button class="btn-sm danger" onclick="setOrderStatus(${o.order_id},'cancelled')">❌ Reject</button>` : ''}
            ${o.status === 'processing'  ? `<button class="btn-sm edit" onclick="setOrderStatus(${o.order_id},'preparing')">👨‍🍳 Preparing</button>` : ''}
            ${o.status === 'preparing'   ? `<button class="btn-sm edit" onclick="setOrderStatus(${o.order_id},'ready_for_pickup')">🍽️ Ready</button>` : ''}
          </div>
        </td>
      </tr>`).join('');

    renderPagination('ordersPagination', res.meta, p => { State.ordersPage = p; loadOrders(); });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Error: ${Utils.escape(err.message)}</td></tr>`;
  }
}

async function setOrderStatus(orderId, status) {
  try {
    await Api.put(`/restaurant/orders/${orderId}/status`, { status });
    Toast.success(`Order updated to ${STATUS_LABELS[status] || status}`);
    loadOrders();
    refreshKPIs();
  } catch (err) {
    Toast.error(err.message);
  }
}

async function viewOrder(id) {
  const modal   = document.getElementById('orderDetailModal');
  const content = document.getElementById('orderDetailContent');
  modal.classList.remove('hidden');
  content.innerHTML = '<div style="text-align:center;padding:32px">Loading…</div>';
  try {
    // FIX: use direct single-order endpoint instead of full-list scan
    const res   = await Api.get(`/restaurant/orders/${id}`);
    const order = res.data;
    if (!order) { content.innerHTML = '<p style="color:var(--danger)">Order not found.</p>'; return; }

    document.getElementById('orderDetailTitle').textContent = `Order ${order.order_number}`;
    const items = order.items || [];
    content.innerHTML = `
      <div class="order-detail-grid">
        <div class="detail-group"><label>Customer</label><div class="detail-val">${Utils.escape(order.customer_name||'—')}</div></div>
        <div class="detail-group"><label>Phone</label><div class="detail-val">${Utils.escape(order.customer_phone||'—')}</div></div>
        <div class="detail-group"><label>Status</label><div class="detail-val">${Utils.statusPill(order.status)}</div></div>
        <div class="detail-group"><label>Total</label><div class="detail-val">${Utils.currency(order.total)}</div></div>
        <div class="detail-group" style="grid-column:1/-1"><label>Delivery Address</label><div class="detail-val">${Utils.escape(order.delivery_address||'—')}</div></div>
      </div>
      ${items.length ? `
        <h4 style="margin:16px 0 8px;font-size:.84rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-sec)">Items</h4>
        <div class="order-items-list">
          ${items.map(i => `
            <div class="order-item-row">
              <span class="oi-name">${Utils.escape(i.name)}</span>
              <span class="oi-qty">× ${i.qty}</span>
              <span class="oi-sub">${Utils.currency(i.subtotal)}</span>
            </div>`).join('')}
        </div>
        <div style="margin-top:12px;text-align:right;font-weight:800">Total: ${Utils.currency(order.total)}</div>
      ` : ''}
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
        ${order.status === 'pending'    ? `<button class="btn-primary" onclick="setOrderStatus(${order.order_id},'processing'); document.getElementById('orderDetailModal').classList.add('hidden')">✅ Accept</button>` : ''}
        ${order.status === 'pending'    ? `<button class="btn-sm danger" style="padding:10px 20px" onclick="setOrderStatus(${order.order_id},'cancelled'); document.getElementById('orderDetailModal').classList.add('hidden')">❌ Reject</button>` : ''}
        ${order.status === 'processing' ? `<button class="btn-primary" onclick="setOrderStatus(${order.order_id},'preparing'); document.getElementById('orderDetailModal').classList.add('hidden')">👨‍🍳 Start Preparing</button>` : ''}
        ${order.status === 'preparing'  ? `<button class="btn-primary" onclick="setOrderStatus(${order.order_id},'ready_for_pickup'); document.getElementById('orderDetailModal').classList.add('hidden')">🍽️ Mark Ready</button>` : ''}
      </div>`;
  } catch (err) {
    content.innerHTML = `<p style="color:var(--danger)">${Utils.escape(err.message)}</p>`;
  }
}

/* ────────────────────────────────────────────────────────────
   PRODUCTS
   ──────────────────────────────────────────────────────────── */
async function loadProducts() {
  const tbody = document.getElementById('productsBody');
  tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading…</td></tr>';
  try {
    const res  = await Api.get('/restaurant/products');
    const rows = res.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No products yet. Add your first one!</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(p => {
      const stockClass = p.stock === 0 ? 'stock-out' : p.stock <= (p.low_stock_threshold || 5) ? 'stock-low' : 'stock-ok';
      const stockLabel = p.stock === 0 ? '⛔ Out' : p.stock <= (p.low_stock_threshold || 5) ? `⚠️ ${p.stock}` : p.stock;
      const productId = Number(p.product_id);
      return `
        <tr>
          <td>
            ${p.image_url
              ? `<img src="${Utils.escape(p.image_url)}" class="product-thumb" alt="" loading="lazy" onerror="this.style.display='none'">`
              : `<div class="product-thumb-placeholder">🍔</div>`}
          </td>
          <td>
            <div style="font-weight:700">${Utils.escape(p.name)}</div>
            ${p.type ? `<div style="font-size:.74rem;color:var(--text-muted)">${Utils.escape(p.type)}</div>` : ''}
          </td>
          <td>${Utils.escape(p.category_name || '—')}</td>
          <td>${Utils.currency(p.price)}</td>
          <td class="${stockClass}">${stockLabel}</td>
          <td>
            <span class="status-pill ${p.is_active ? 'status-delivered' : 'status-cancelled'}">
              ${p.is_active ? '✅ Active' : '❌ Inactive'}
            </span>
          </td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn-sm edit" data-action="edit-product" data-id="${productId}">Edit</button>
              <button class="btn-sm danger" data-action="delete-product" data-id="${productId}">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Attach delegated handler for product action buttons (defensive approach)
    if (!document.__zesto_product_action_bound) {
      document.__zesto_product_action_bound = true;
      document.addEventListener('click', async (ev) => {
        const btn = ev.target.closest && ev.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = Number(btn.dataset.id);
        if (!action || !id) return;
        try {
          if (action === 'edit-product') {
            return openEditProduct(id);
          }
          if (action === 'delete-product') {
            return deleteProduct(id);
          }
        } catch (err) {
          Toast.error(err.message || 'Action failed');
        }
      });
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Error: ${Utils.escape(err.message)}</td></tr>`;
  }
}

function openAddProduct() {
  State.editProductId = null;
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('editProductId').value = '';
  document.getElementById('pName').value         = '';
  document.getElementById('pCategory').value     = '1';
  document.getElementById('pType').value         = '';
  document.getElementById('pPrice').value        = '';
  document.getElementById('pStock').value        = '';
  document.getElementById('pImageUrl').value     = '';
  document.getElementById('pDescription').value  = '';
  document.getElementById('pFeatured').checked   = false;
  document.getElementById('pActive').checked     = true;
  document.getElementById('productModal').classList.remove('hidden');
}

async function openEditProduct(id) {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    Toast.error('Invalid product selected.');
    return;
  }

  try {
    const res = await Api.get(`/restaurant/products/${productId}`);
    const p   = res.data;
    if (!p) { Toast.error('Product not found'); return; }
    State.editProductId = productId;
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('editProductId').value = productId;
    document.getElementById('pName').value         = p.name || '';
    document.getElementById('pCategory').value     = p.category_id || '1';
    document.getElementById('pType').value         = p.type || '';
    document.getElementById('pPrice').value        = p.price || '';
    document.getElementById('pStock').value        = p.stock ?? '';
    document.getElementById('pImageUrl').value     = p.image_url || '';
    document.getElementById('pDescription').value  = p.description || '';
    document.getElementById('pFeatured').checked   = !!p.is_featured;
    document.getElementById('pActive').checked     = !!p.is_active;
    document.getElementById('productModal').classList.remove('hidden');
  } catch (err) {
    Toast.error(err.message);
  }
}

async function saveProduct() {
  const name        = document.getElementById('pName').value.trim();
  const category_id = document.getElementById('pCategory').value;
  const type        = document.getElementById('pType').value.trim();
  const price       = document.getElementById('pPrice').value;
  const stock       = document.getElementById('pStock').value;
  const image_url   = document.getElementById('pImageUrl').value.trim();
  const description = document.getElementById('pDescription').value.trim();
  const is_featured = document.getElementById('pFeatured').checked ? 1 : 0;
  const is_active   = document.getElementById('pActive').checked   ? 1 : 0;

  if (!name || !price) { Toast.error('Name and price are required.'); return; }

  const btn = document.getElementById('saveProductBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const body = { name, category_id: Number(category_id), type, price: Number(price),
                 stock: Number(stock)||0, image_url, description, is_featured, is_active };
  try {
    if (State.editProductId) {
      await Api.put(`/restaurant/products/${State.editProductId}`, body);
      Toast.success('Product updated.');
    } else {
      await Api.post('/restaurant/products', body);
      Toast.success('Product created.');
    }
    document.getElementById('productModal').classList.add('hidden');
    loadProducts();
    refreshKPIs();
  } catch (err) {
    Toast.error(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Product';
  }
}

async function deleteProduct(id) {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    Toast.error('Invalid product selected.');
    return;
  }

  if (!confirm('Deactivate this product?')) return;
  try {
    await Api.delete(`/restaurant/products/${productId}`);
    Toast.success('Product deactivated.');
    loadProducts();
    refreshKPIs();
  } catch (err) {
    Toast.error(err.message);
  }
}

/* ────────────────────────────────────────────────────────────
   ANALYTICS
   ──────────────────────────────────────────────────────────── */
async function loadAnalytics() {
  try {
    const res  = await Api.get(`/restaurant/analytics?days=${State.analyticsDays}`);
    const data = res.data;

    renderSalesChart(data.dailySales || []);

    // Top products
    const topEl = document.getElementById('analyticsTopProducts');
    const top   = data.topProducts || [];
    topEl.innerHTML = top.length
      ? top.map((p, i) => `
          <div class="top-product-row">
            <span class="tp-rank">${i + 1}</span>
            <span class="tp-name">${Utils.escape(p.name)}</span>
            <span class="tp-units">${p.units_sold} sold</span>
            <span class="tp-rev">${Utils.currency(p.revenue)}</span>
          </div>`).join('')
      : '<div style="padding:20px;text-align:center;color:var(--text-muted)">No sales data yet</div>';

    // Status breakdown
    const sbEl = document.getElementById('statusBreakdown');
    const sb   = data.statusBreakdown || [];
    sbEl.innerHTML = sb.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">
          ${sb.map(s => `
            <div style="background:var(--bg);border-radius:10px;padding:14px;text-align:center;border:1px solid var(--border)">
              <div style="font-size:1.4rem;font-weight:800">${s.cnt}</div>
              <div>${Utils.statusPill(s.status)}</div>
            </div>`).join('')}
         </div>`
      : '<div style="text-align:center;color:var(--text-muted)">No data for this period</div>';
  } catch (err) {
    console.error('Analytics failed', err);
  }
}

function renderSalesChart(daily) {
  const canvas = document.getElementById('salesChart');
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
  const pad = { top:20, right:20, bottom:40, left:65 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top  - pad.bottom;
  const maxVal = Math.max(...daily.map(d => Number(d.revenue) || 0), 1);
  const bW = Math.max(4, cW / daily.length - 4);
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const y = pad.top + cH - cH * f;
    ctx.fillStyle = '#f0f0f0'; ctx.fillRect(pad.left, y, cW, 1);
    ctx.fillStyle = '#9CA3AF'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Utils.currency(maxVal * f).replace('UGX ',''), pad.left - 4, y + 4);
  });
  daily.forEach((d, i) => {
    const val = Number(d.revenue) || 0;
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
      const label = new Date(d.date).toLocaleDateString('en-UG', { month:'short', day:'numeric' });
      ctx.fillStyle = '#9CA3AF'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, x + bW / 2, H - 10);
    }
  });
}

/* ────────────────────────────────────────────────────────────
   SETTINGS
   ──────────────────────────────────────────────────────────── */
async function loadSettings() {
  try {
    const res = await Api.get('/restaurant/settings');
    const r   = res.data;
    document.getElementById('set_name').value        = r.name        || '';
    document.getElementById('set_phone').value       = r.phone       || '';
    document.getElementById('set_email').value       = r.email       || '';
    document.getElementById('set_logo_url').value    = r.logo_url    || '';
    document.getElementById('set_address').value     = r.address     || '';
    document.getElementById('set_description').value = r.description || '';
  } catch (err) {
    Toast.error('Failed to load settings: ' + err.message);
  }
}

async function saveSettings() {
  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await Api.put('/restaurant/settings', {
      name:        document.getElementById('set_name').value.trim(),
      phone:       document.getElementById('set_phone').value.trim(),
      email:       document.getElementById('set_email').value.trim(),
      logo_url:    document.getElementById('set_logo_url').value.trim(),
      address:     document.getElementById('set_address').value.trim(),
      description: document.getElementById('set_description').value.trim(),
    });
    Toast.success('Restaurant settings saved.');
  } catch (err) {
    Toast.error(err.message);
  } finally {
    btn.disabled = false; btn.textContent = '💾 Save Profile';
  }
}

/* ────────────────────────────────────────────────────────────
   PAGINATION
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
  const ok = await Auth.check();
  if (ok) {
    showApp();
  } else {
    showAuthGate();
    document.getElementById('agLoginBtn')?.addEventListener('click', Auth.login);
    document.getElementById('agPassword')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') Auth.login();
    });
  }

  document.getElementById('adminLogout')?.addEventListener('click', Auth.logout);

  // Sidebar nav
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Mobile sidebar
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
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

  // Product CRUD
  document.getElementById('addProductBtn')?.addEventListener('click', openAddProduct);
  document.getElementById('saveProductBtn')?.addEventListener('click', saveProduct);
  document.getElementById('closeProductModal')?.addEventListener('click', () => {
    document.getElementById('productModal').classList.add('hidden');
  });
  document.getElementById('productModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // Order modal close
  document.getElementById('closeOrderModal')?.addEventListener('click', () => {
    document.getElementById('orderDetailModal').classList.add('hidden');
  });
  document.getElementById('orderDetailModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // Settings save
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
});
