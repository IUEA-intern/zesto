/**
 * public/admin/admin.js
 * ─────────────────────────────────────────────────────────────
 * Zesto Admin Dashboard — Vanilla JS SPA
 *
 * Pages   : dashboard · orders · products · users · payments · analytics · audit
 * Real-time: Socket.IO  (rooms: admin:dashboard, kitchen:live_updates)
 * Auth    : session check → role guard (admin|staff only)
 * Chart   : hand-drawn canvas bar chart (no external library)
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

/* ============================================================
   CONSTANTS
   ============================================================ */
const API = '/api';

const STATUS_LABELS = {
  pending:          '⏳ Pending',
  processing:       '✅ Processing',
  preparing:        '👨‍🍳 Preparing',
  out_for_delivery: '🚀 Out for Delivery',
  delivered:        '🎉 Delivered',
  cancelled:        '❌ Cancelled',
};
const PAYMENT_LABELS = {
  pending:  '⏳ Pending',
  verified: '✅ Verified',
  failed:   '❌ Failed',
  refunded: '↩ Refunded',
};

/* ============================================================
   STATE
   ============================================================ */
const State = {
  session:        null,
  currentPage:    'dashboard',
  ordersPage:     1,
  ordersStatus:   '',
  socket:         null,
  liveFeedItems:  [],
};

/* ============================================================
   UTILS
   ============================================================ */
const Utils = {
  currency: n => 'UGX ' + Number(n).toLocaleString('en-UG'),
  date:     d => new Date(d).toLocaleString('en-UG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }),
  escape:   s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  shortDate:d => new Date(d).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric' }),
};

/* ============================================================
   TOAST
   ============================================================ */
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

/* ============================================================
   API HELPERS
   ============================================================ */
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
  get:    p        => Api.req(p),
  post:   (p, b)   => Api.req(p, { method: 'POST',   body: b }),
  put:    (p, b)   => Api.req(p, { method: 'PUT',    body: b }),
  delete: p        => Api.req(p, { method: 'DELETE' }),
};

/* ============================================================
   AUTH GATE
   ============================================================ */
const Auth = {
  async check() {
    try {
      const res = await Api.get('/auth/me');
      if (!res.user || !['admin', 'staff'].includes(res.user.role)) {
        throw new Error('Insufficient role');
      }
      State.session = res.user;
      document.getElementById('sidebarUser').textContent =
        `👤 ${res.user.name} (${res.user.role})`;
      return true;
    } catch {
      return false;
    }
  },

  async login() {
    const email    = document.getElementById('agEmail').value.trim();
    const password = document.getElementById('agPassword').value;
    const btn      = document.getElementById('agLoginBtn');

    if (!email || !password) { Toast.error('Email and password required.'); return; }

    btn.disabled    = true;
    btn.textContent = 'Signing in…';
    try {
      const res = await Api.post('/auth/login', { email, password });
      if (!['admin', 'staff'].includes(res.user?.role)) {
        await Api.post('/auth/logout', {});
        Toast.error('Access denied. Admin accounts only.');
        return;
      }
      State.session = res.user;
      document.getElementById('sidebarUser').textContent =
        `👤 ${res.user.name} (${res.user.role})`;
      showApp();
      Toast.success(`Welcome, ${res.user.name}!`);
    } catch (err) {
      Toast.error(err.message || 'Login failed.');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Sign In';
    }
  },

  async logout() {
    try { await Api.post('/auth/logout', {}); } catch {}
    location.reload();
  },
};

/* ============================================================
   APP SHELL SHOW/HIDE
   ============================================================ */
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

/* ============================================================
   SOCKET.IO — real-time admin events
   ============================================================ */
function initSocket() {
  if (typeof io === 'undefined') {
    document.getElementById('liveIndicator').style.color = '#9CA3AF';
    return;
  }

  State.socket = io({ credentials: true });

  State.socket.on('connect', () => {
    State.socket.emit('admin:join');
    document.getElementById('liveIndicator').style.color = '';
  });

  State.socket.on('disconnect', () => {
    document.getElementById('liveIndicator').style.color = '#9CA3AF';
  });

  /* New order → live feed + badge */
  State.socket.on('order:new', ({ data }) => {
    addFeedItem({
      icon:  '📦',
      title: `New Order ${data.orderNumber || '#' + data.orderId}`,
      meta:  `${data.itemCount} item(s)`,
      amt:   Utils.currency(data.total),
    });
    refreshKPIs();
    bumpBadge();
  });

  /* Order status update → refresh table if on orders page */
  State.socket.on('order:update', ({ data }) => {
    if (State.currentPage === 'orders') Pages.orders.load();
    Toast.info(`Order #${data.orderId} → ${data.status}`);
    if (data.status === 'delivered' || data.status === 'cancelled') dropBadge();
  });

  /* Payment verified */
  State.socket.on('payment:verified', ({ data }) => {
    addFeedItem({
      icon:  '💳',
      title: `Payment Verified — Order #${data.orderId}`,
      meta:  data.method,
      amt:   Utils.currency(data.amount),
    });
    if (State.currentPage === 'payments') Pages.payments.load();
    refreshKPIs();
  });

  /* Payment failed */
  State.socket.on('payment:failed', ({ data }) => {
    addFeedItem({
      icon:  '❌',
      title: `Payment Failed — Order #${data.orderId}`,
      meta:  data.reason || '',
      amt:   '',
    });
    Toast.error(`Payment failed for order #${data.orderId}`);
    refreshKPIs();
  });

  /* Stock update */
  State.socket.on('product:stock_update', ({ data }) => {
    if (State.currentPage === 'products') Pages.products.load();
    if (data.newStock <= 5) {
      Toast.info(`⚠️ Low stock: Product #${data.productId} — ${data.newStock} left`);
    }
  });

  /* Analytics tick */
  State.socket.on('analytics:update', ({ data }) => {
    if (State.currentPage === 'dashboard') updateKPIs(data);
  });
}

/* Active orders badge on sidebar */
let _badgeCount = 0;
function bumpBadge() {
  _badgeCount++;
  const el = document.getElementById('activeOrdersBadge');
  if (el) { el.textContent = _badgeCount; el.classList.remove('hidden'); }
}
function dropBadge() {
  _badgeCount = Math.max(0, _badgeCount - 1);
  const el = document.getElementById('activeOrdersBadge');
  if (el) {
    el.textContent = _badgeCount || '';
    if (!_badgeCount) el.classList.add('hidden');
  }
}

/* Live feed */
function addFeedItem({ icon, title, meta, amt }) {
  const feed = document.getElementById('liveFeed');
  if (!feed) return;
  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = `
    <div class="feed-item-icon">${icon}</div>
    <div class="feed-item-body">
      <div class="feed-item-name">${Utils.escape(title)}</div>
      <div class="feed-item-meta">${Utils.escape(meta)} · ${Utils.date(new Date())}</div>
    </div>
    ${amt ? `<div class="feed-item-amt">${Utils.escape(amt)}</div>` : ''}`;
  feed.insertBefore(el, feed.firstChild);

  // Cap at 20 items
  while (feed.children.length > 20) feed.removeChild(feed.lastChild);
}

/* ============================================================
   PAGE ROUTER
   ============================================================ */
function navigateTo(page) {
  State.currentPage = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  const navEl  = document.querySelector(`.nav-item[data-page="${page}"]`);

  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    orders:    'Orders',
    products:  'Products',
    users:     'Users',
    payments:  'Payments',
    analytics: 'Analytics',
    audit:     'Audit Logs',
  };
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = titles[page] || page;

  // Load page data
  const loader = Pages[page];
  if (loader?.load) loader.load();

  // Close sidebar on mobile
  document.getElementById('sidebar')?.classList.remove('open');
}

/* ============================================================
   PAGES
   ============================================================ */
const Pages = {

  /* ── DASHBOARD ─────────────────────────────────────────── */
  dashboard: {
    async load() {
      await refreshKPIs();
      await this.loadTopProducts();
    },

    async loadTopProducts() {
      const el = document.getElementById('topProductsList');
      if (!el) return;
      try {
        const res = await Api.get('/admin/analytics/revenue?days=30');
        const top = res.data?.topProducts || [];
        if (!top.length) { el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:.85rem">No sales data yet.</div>'; return; }
        el.innerHTML = top.map((p, i) => `
          <div class="top-product-row">
            <span class="tp-rank">${i + 1}</span>
            <span class="tp-name">${Utils.escape(p.name)}</span>
            <span class="tp-units">${p.units_sold} sold</span>
            <span class="tp-rev">${Utils.currency(p.revenue)}</span>
          </div>`).join('');
      } catch {
        el.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:.82rem">Could not load top products.</div>';
      }
    },
  },

  /* ── ORDERS ─────────────────────────────────────────────── */
  orders: {
    async load(page = State.ordersPage, status = State.ordersStatus) {
      State.ordersPage   = page;
      State.ordersStatus = status;
      const tbody = document.getElementById('ordersBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading orders…</td></tr>';

      try {
        const qs  = new URLSearchParams({ page, limit: 20, ...(status ? { status } : {}) });
        const res = await Api.get(`/admin/orders?${qs}`);
        const rows = res.data || [];

        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No orders found.</td></tr>';
          return;
        }

        tbody.innerHTML = rows.map(o => `
          <tr>
            <td><strong>${Utils.escape(o.order_number || '#' + o.order_id)}</strong></td>
            <td>
              <div style="font-weight:700">${Utils.escape(o.customer_name || '—')}</div>
              <div style="font-size:.75rem;color:var(--text-sec)">${Utils.escape(o.customer_email || '')}</div>
            </td>
            <td><strong>${Utils.currency(o.total)}</strong></td>
            <td><span class="status-pill status-${o.payment_status || 'pending'}">${PAYMENT_LABELS[o.payment_status] || '—'}</span></td>
            <td>
              <select class="status-select" data-order-id="${o.order_id}" data-current="${o.status}">
                ${Object.keys(STATUS_LABELS).map(s =>
                  `<option value="${s}" ${o.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
                ).join('')}
              </select>
            </td>
            <td style="font-size:.78rem;color:var(--text-sec)">${Utils.shortDate(o.created_at)}</td>
            <td>
              <button class="btn-sm edit" data-view-order="${o.order_id}">View</button>
            </td>
          </tr>`).join('');

        /* Status selects */
        tbody.querySelectorAll('.status-select').forEach(sel => {
          sel.addEventListener('change', async () => {
            const ordId   = sel.dataset.orderId;
            const oldStat = sel.dataset.current;
            const newStat = sel.value;
            try {
              await Api.put(`/admin/orders/${ordId}/status`, { status: newStat });
              sel.dataset.current = newStat;
              Toast.success(`Order updated to "${STATUS_LABELS[newStat]}"`);
            } catch (err) {
              sel.value = oldStat; // revert
              Toast.error(err.message || 'Failed to update status.');
            }
          });
        });

        /* View buttons */
        tbody.querySelectorAll('[data-view-order]').forEach(btn => {
          btn.addEventListener('click', () => this.showDetail(btn.dataset.viewOrder));
        });

        /* Pagination */
        this.renderPagination(res.meta);
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-loading" style="color:#ef4444">${Utils.escape(err.message)}</td></tr>`;
      }
    },

    renderPagination({ page, limit, total }) {
      const el    = document.getElementById('ordersPagination');
      if (!el) return;
      const pages = Math.ceil(total / limit);
      if (pages <= 1) { el.innerHTML = ''; return; }
      el.innerHTML = Array.from({ length: pages }, (_, i) => i + 1).map(p =>
        `<button class="page-btn ${p === page ? 'active' : ''}" data-p="${p}">${p}</button>`
      ).join('');
      el.querySelectorAll('.page-btn').forEach(btn =>
        btn.addEventListener('click', () => Pages.orders.load(parseInt(btn.dataset.p), State.ordersStatus))
      );
    },

    async showDetail(orderId) {
      const modal   = document.getElementById('orderDetailModal');
      const title   = document.getElementById('orderDetailTitle');
      const content = document.getElementById('orderDetailContent');
      if (!modal) return;

      title.textContent = 'Loading order…';
      content.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted)">⏳ Loading…</div>';
      modal.classList.remove('hidden');

      try {
        /* Uses the new GET /api/admin/orders/:id endpoint */
        const res   = await Api.get(`/admin/orders/${orderId}`);
        const order = res.data;
        const items = order.items || [];

        title.textContent = `Order ${order.order_number || '#' + order.order_id}`;

        const itemsHTML = items.length
          ? items.map(i => `
              <div class="order-item-row">
                <span class="oi-name">${Utils.escape(i.name)}</span>
                <span class="oi-qty">× ${i.qty}</span>
                <span class="oi-sub">${Utils.currency(i.subtotal)}</span>
              </div>`).join('')
          : '<div class="order-item-row"><span class="oi-name" style="color:var(--text-muted)">No items found.</span></div>';

        content.innerHTML = `
          <div class="order-detail-grid">
            <div class="detail-group">
              <label>Customer</label>
              <div class="detail-val">${Utils.escape(order.customer_name || '—')}</div>
            </div>
            <div class="detail-group">
              <label>Email</label>
              <div class="detail-val">${Utils.escape(order.customer_email || '—')}</div>
            </div>
            <div class="detail-group">
              <label>Phone</label>
              <div class="detail-val">${Utils.escape(order.customer_phone || '—')}</div>
            </div>
            <div class="detail-group">
              <label>Order Date</label>
              <div class="detail-val">${Utils.date(order.created_at)}</div>
            </div>
            <div class="detail-group">
              <label>Order Status</label>
              <div class="detail-val">
                <span class="status-pill status-${order.status}">
                  ${STATUS_LABELS[order.status] || order.status}
                </span>
              </div>
            </div>
            <div class="detail-group">
              <label>Payment</label>
              <div class="detail-val">
                <span class="status-pill status-${order.payment_status || 'pending'}">
                  ${PAYMENT_LABELS[order.payment_status] || '⏳ Pending'}
                </span>
              </div>
            </div>
          </div>

          <div class="detail-group" style="margin-bottom:16px">
            <label>Delivery Address</label>
            <div class="detail-val" style="margin-top:4px;line-height:1.5">
              ${Utils.escape(order.delivery_address || '—')}
            </div>
          </div>

          ${order.notes ? `
          <div class="detail-group" style="margin-bottom:16px">
            <label>Notes</label>
            <div class="detail-val" style="margin-top:4px;color:var(--text-sec)">${Utils.escape(order.notes)}</div>
          </div>` : ''}

          <div style="font-weight:800;margin-bottom:10px">Order Items</div>
          <div class="order-items-list">${itemsHTML}</div>

          <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="color:var(--text-sec);font-size:.88rem">Subtotal</span>
              <span style="font-weight:700">${Utils.currency(order.subtotal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:10px">
              <span style="color:var(--text-sec);font-size:.88rem">Delivery Fee</span>
              <span style="font-weight:700">${Utils.currency(order.delivery_fee || 5000)}</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="font-weight:800;font-size:1rem">Total</span>
              <span style="font-weight:800;color:var(--orange);font-size:1.1rem">
                ${Utils.currency(order.total)}
              </span>
            </div>
          </div>`;
      } catch (err) {
        content.innerHTML = `<p style="color:#ef4444;padding:16px">${Utils.escape(err.message)}</p>`;
      }
    },
  },

  /* ── PRODUCTS ───────────────────────────────────────────── */
  products: {
    async load() {
      const tbody = document.getElementById('productsBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading products…</td></tr>';
      try {
        const res  = await Api.get('/admin/products');
        const rows = res.data || [];

        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No products found.</td></tr>';
          return;
        }

        tbody.innerHTML = rows.map(p => {
          const stockClass = p.stock === 0 ? 'stock-out' : p.stock <= p.low_stock_threshold ? 'stock-low' : 'stock-ok';
          const stockLabel = p.stock === 0 ? 'Out' : p.stock <= p.low_stock_threshold ? `⚠ ${p.stock}` : p.stock;
          const img = p.image_url
            ? `<img src="${Utils.escape(p.image_url)}" class="product-thumb" loading="lazy"/>`
            : `<div class="product-thumb-placeholder">🍔</div>`;
          return `
            <tr>
              <td>${img}</td>
              <td><strong>${Utils.escape(p.name)}</strong></td>
              <td style="font-size:.8rem">${Utils.escape(p.category_name || '—')}</td>
              <td><strong>${Utils.currency(p.price)}</strong></td>
              <td class="${stockClass}">${stockLabel}</td>
              <td>
                <span class="status-pill ${p.is_active ? 'status-delivered' : 'status-cancelled'}">
                  ${p.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn-sm edit" data-edit-id="${p.product_id}">Edit</button>
                <button class="btn-sm danger" data-delete-id="${p.product_id}">Delete</button>
              </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-edit-id]').forEach(btn =>
          btn.addEventListener('click', () => this.openModal(parseInt(btn.dataset.editId), rows))
        );
        tbody.querySelectorAll('[data-delete-id]').forEach(btn =>
          btn.addEventListener('click', () => this.delete(parseInt(btn.dataset.deleteId)))
        );
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-loading" style="color:#ef4444">${Utils.escape(err.message)}</td></tr>`;
      }
    },

    openModal(productId = null, products = []) {
      const modal   = document.getElementById('productModal');
      const title   = document.getElementById('productModalTitle');
      const editId  = document.getElementById('editProductId');

      // Reset form
      ['pName','pType','pPrice','pStock','pImageUrl','pDescription'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      document.getElementById('pCategory').value = '1';
      document.getElementById('pFeatured').checked = false;
      document.getElementById('pActive').checked   = true;
      editId.value = '';

      if (productId) {
        const p = products.find(x => x.product_id === productId);
        if (p) {
          title.textContent = 'Edit Product';
          editId.value = p.product_id;
          document.getElementById('pName').value        = p.name || '';
          document.getElementById('pCategory').value    = p.category_id || '1';
          document.getElementById('pType').value        = p.type || '';
          document.getElementById('pPrice').value       = p.price || '';
          document.getElementById('pStock').value       = p.stock ?? '';
          document.getElementById('pImageUrl').value    = p.image_url || '';
          document.getElementById('pDescription').value = p.description || '';
          document.getElementById('pFeatured').checked  = !!p.is_featured;
          document.getElementById('pActive').checked    = !!p.is_active;
        }
      } else {
        title.textContent = 'Add Product';
      }

      modal.classList.remove('hidden');
    },

    async save() {
      const editId = document.getElementById('editProductId').value;
      const body   = {
        name:        document.getElementById('pName').value.trim(),
        category_id: document.getElementById('pCategory').value,
        type:        document.getElementById('pType').value.trim(),
        price:       parseFloat(document.getElementById('pPrice').value),
        stock:       parseInt(document.getElementById('pStock').value) || 0,
        image_url:   document.getElementById('pImageUrl').value.trim(),
        description: document.getElementById('pDescription').value.trim(),
        is_featured: document.getElementById('pFeatured').checked ? 1 : 0,
        is_active:   document.getElementById('pActive').checked   ? 1 : 0,
      };

      if (!body.name || isNaN(body.price)) { Toast.error('Name and valid price are required.'); return; }

      const btn = document.getElementById('saveProductBtn');
      btn.disabled = true; btn.textContent = 'Saving…';

      try {
        if (editId) {
          await Api.put(`/admin/products/${editId}`, body);
          Toast.success('Product updated.');
        } else {
          await Api.post('/admin/products', body);
          Toast.success('Product created.');
        }
        document.getElementById('productModal').classList.add('hidden');
        this.load();
      } catch (err) {
        Toast.error(err.message || 'Save failed.');
      } finally {
        btn.disabled = false; btn.textContent = 'Save Product';
      }
    },

    async delete(productId) {
      if (!confirm('Deactivate this product? It will be hidden from the menu.')) return;
      try {
        await Api.delete(`/admin/products/${productId}`);
        Toast.success('Product deactivated.');
        this.load();
      } catch (err) {
        Toast.error(err.message || 'Delete failed.');
      }
    },
  },

  /* ── USERS ──────────────────────────────────────────────── */
  users: {
    async load() {
      const tbody = document.getElementById('usersBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading users…</td></tr>';
      try {
        const res  = await Api.get('/admin/users?limit=50');
        const rows = res.data || [];
        if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No users found.</td></tr>'; return; }
        tbody.innerHTML = rows.map(u => `
          <tr>
            <td><strong>${Utils.escape(u.id || u.user_id)}</strong></td>
            <td><strong>${Utils.escape(u.full_name || u.name)}</strong></td>
            <td style="font-size:.82rem">${Utils.escape(u.email)}</td>
            <td style="font-size:.82rem">${Utils.escape(u.phone || '—')}</td>
            <td><span class="status-pill ${u.role === 'admin' ? 'status-processing' : 'status-delivered'}">${Utils.escape(u.role || 'customer')}</span></td>
            <td style="font-weight:700">${u.order_count ?? 0}</td>
            <td style="font-size:.78rem;color:var(--text-sec)">${Utils.shortDate(u.created_at || u.updated_at)}</td>
          </tr>`).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-loading" style="color:#ef4444">${Utils.escape(err.message)}</td></tr>`;
      }
    },
  },

  /* ── PAYMENTS ───────────────────────────────────────────── */
  payments: {
    async load() {
      const tbody = document.getElementById('paymentsBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading payments…</td></tr>';
      try {
        const res  = await Api.get('/admin/payments?limit=50');
        const rows = res.data || [];
        if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No payments found.</td></tr>'; return; }
        tbody.innerHTML = rows.map(p => `
          <tr>
            <td><strong>${Utils.escape(p.order_number || '#' + p.order_id)}</strong></td>
            <td>
              <div style="font-weight:700">${Utils.escape(p.user_name || '—')}</div>
              <div style="font-size:.74rem;color:var(--text-sec)">${Utils.escape(p.user_email || '')}</div>
            </td>
            <td style="text-transform:capitalize">${Utils.escape(p.method?.replace(/_/g,' ') || '—')}</td>
            <td><strong>${Utils.currency(p.amount)}</strong></td>
            <td><span class="status-pill status-${p.status}">${PAYMENT_LABELS[p.status] || p.status}</span></td>
            <td style="font-size:.78rem;color:var(--text-sec)">${Utils.shortDate(p.created_at)}</td>
          </tr>`).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-loading" style="color:#ef4444">${Utils.escape(err.message)}</td></tr>`;
      }
    },
  },

  /* ── ANALYTICS ──────────────────────────────────────────── */
  analytics: {
    chartData: null,
    async load() {
      try {
        const res = await Api.get('/admin/analytics/revenue?days=30');
        this.chartData = res.data;
        this.drawChart(res.data.daily || []);
        this.renderTopProducts(res.data.topProducts || []);
      } catch (err) {
        Toast.error('Failed to load analytics.');
      }
    },

    /**
     * Hand-drawn canvas bar chart — no external library.
     * Draws a bar chart of daily revenue on #revenueChart.
     */
    drawChart(daily) {
      const canvas = document.getElementById('revenueChart');
      if (!canvas) return;
      const ctx    = canvas.getContext('2d');
      const dpr    = window.devicePixelRatio || 1;
      const W      = canvas.parentElement.clientWidth - 32;
      const H      = 240;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.scale(dpr, dpr);

      const PAD   = { top: 20, right: 20, bottom: 48, left: 68 };
      const cW    = W - PAD.left - PAD.right;
      const cH    = H - PAD.top  - PAD.bottom;

      ctx.clearRect(0, 0, W, H);

      if (!daily.length) {
        ctx.fillStyle = '#9CA3AF';
        ctx.font      = '14px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No revenue data yet', W / 2, H / 2);
        return;
      }

      const maxRev = Math.max(...daily.map(d => Number(d.revenue)), 1);
      const barW   = Math.max(4, (cW / daily.length) - 4);

      /* Grid lines */
      ctx.strokeStyle = '#E8EAF0';
      ctx.lineWidth   = 1;
      const gridLines = 5;
      for (let i = 0; i <= gridLines; i++) {
        const y = PAD.top + cH - (cH * i / gridLines);
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + cW, y);
        ctx.stroke();

        /* Y-axis labels */
        ctx.fillStyle  = '#9CA3AF';
        ctx.font       = '10px Plus Jakarta Sans, sans-serif';
        ctx.textAlign  = 'right';
        const val      = (maxRev * i / gridLines);
        ctx.fillText(val >= 1000 ? (val/1000).toFixed(0)+'k' : val.toFixed(0), PAD.left - 6, y + 3);
      }

      /* Bars */
      daily.forEach((d, i) => {
        const rev    = Number(d.revenue);
        const barH   = (rev / maxRev) * cH;
        const x      = PAD.left + i * (cW / daily.length) + (cW / daily.length - barW) / 2;
        const y      = PAD.top + cH - barH;

        /* Bar gradient */
        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0,   '#FF6B2C');
        grad.addColorStop(1,   '#FF8C5A');
        ctx.fillStyle = grad;

        /* Rounded top */
        const r = Math.min(4, barW / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, y + barH);
        ctx.lineTo(x, y + barH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();

        /* X-axis labels (every 5 bars) */
        if (i % 5 === 0 || i === daily.length - 1) {
          ctx.fillStyle  = '#9CA3AF';
          ctx.font       = '9px Plus Jakarta Sans, sans-serif';
          ctx.textAlign  = 'center';
          const label    = d.date ? d.date.slice(5) : ''; // MM-DD
          ctx.fillText(label, x + barW / 2, PAD.top + cH + 16);
        }
      });

      /* Y-axis label */
      ctx.save();
      ctx.translate(14, PAD.top + cH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle  = '#6B7280';
      ctx.font       = '10px Plus Jakarta Sans, sans-serif';
      ctx.textAlign  = 'center';
      ctx.fillText('Revenue (UGX)', 0, 0);
      ctx.restore();
    },

    renderTopProducts(top) {
      const el = document.getElementById('analyticsTopProducts');
      if (!el) return;
      if (!top.length) { el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:.85rem">No data.</div>'; return; }
      el.innerHTML = top.map((p, i) => `
        <div class="top-product-row">
          <span class="tp-rank">${i + 1}</span>
          <span class="tp-name">${Utils.escape(p.name)}</span>
          <span class="tp-units">${p.units_sold} sold</span>
          <span class="tp-rev">${Utils.currency(p.revenue)}</span>
        </div>`).join('');
    },
  },

  /* ── AUDIT LOGS ─────────────────────────────────────────── */
  audit: {
    async load() {
      const tbody = document.getElementById('auditBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading audit logs…</td></tr>';
      try {
        const res  = await Api.get('/admin/audit-logs?limit=80');
        const rows = res.data || [];
        if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No audit logs yet.</td></tr>'; return; }
        tbody.innerHTML = rows.map(l => `
          <tr>
            <td style="font-size:.76rem;color:var(--text-sec);white-space:nowrap">${Utils.date(l.created_at)}</td>
            <td style="font-size:.82rem">${Utils.escape(l.actor_name || 'System')}<br><span style="font-size:.72rem;color:var(--text-sec)">${l.actor_role}</span></td>
            <td><code style="font-size:.76rem;background:var(--bg);padding:2px 6px;border-radius:4px">${Utils.escape(l.action)}</code></td>
            <td style="font-size:.8rem">${Utils.escape(l.entity_type)}${l.entity_id ? ' #' + l.entity_id : ''}</td>
            <td style="font-size:.76rem;color:var(--text-sec)">${Utils.escape(l.ip_address || '—')}</td>
            <td style="font-size:.76rem;color:var(--text-sec);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escape(l.notes || '—')}</td>
          </tr>`).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-loading" style="color:#ef4444">${Utils.escape(err.message)}</td></tr>`;
      }
    },
  },
};

/* ============================================================
   KPI LOADER
   ============================================================ */
async function refreshKPIs() {
  try {
    const res = await Api.get('/admin/stats');
    updateKPIs(res.data);
  } catch { /* silent */ }
}

function updateKPIs(data) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpiRevenue',    Utils.currency(data.totalRevenue));
  set('kpiOrdersToday', data.ordersToday);
  set('kpiActive',      data.activeOrders);
  set('kpiFailed',      data.failedPayments);
  set('kpiUsers',       data.totalUsers?.toLocaleString() || '—');
  set('kpiLowStock',    data.lowStockItems);

  // Keep sidebar badge in sync with active orders
  _badgeCount = data.activeOrders || 0;
  const badge = document.getElementById('activeOrdersBadge');
  if (badge) {
    badge.textContent = _badgeCount || '';
    badge.classList.toggle('hidden', !_badgeCount);
  }
}

/* ============================================================
   EVENT BINDINGS
   ============================================================ */
function bindEvents() {
  /* Auth gate */
  document.getElementById('agLoginBtn')?.addEventListener('click', Auth.login.bind(Auth));
  document.getElementById('agPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') Auth.login();
  });

  /* Logout */
  document.getElementById('adminLogout')?.addEventListener('click', Auth.logout.bind(Auth));

  /* Sidebar navigation */
  document.querySelectorAll('.nav-item[data-page]').forEach(btn =>
    btn.addEventListener('click', () => navigateTo(btn.dataset.page))
  );

  /* Mobile sidebar toggle */
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  /* Orders: filter tabs */
  document.getElementById('orderFilterTabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    Pages.orders.load(1, tab.dataset.status);
  });

  /* Products: add button */
  document.getElementById('addProductBtn')?.addEventListener('click', () =>
    Pages.products.openModal()
  );

  /* Products: save modal */
  document.getElementById('saveProductBtn')?.addEventListener('click', () =>
    Pages.products.save()
  );

  /* Products: close modal */
  document.getElementById('closeProductModal')?.addEventListener('click', () =>
    document.getElementById('productModal').classList.add('hidden')
  );
  document.getElementById('productModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('productModal'))
      document.getElementById('productModal').classList.add('hidden');
  });

  /* Orders: close detail modal */
  document.getElementById('closeOrderModal')?.addEventListener('click', () =>
    document.getElementById('orderDetailModal').classList.add('hidden')
  );
  document.getElementById('orderDetailModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('orderDetailModal'))
      document.getElementById('orderDetailModal').classList.add('hidden');
  });

  /* Analytics: redraw chart on resize */
  window.addEventListener('resize', Utils.debounce(() => {
    if (State.currentPage === 'analytics' && Pages.analytics.chartData) {
      Pages.analytics.drawChart(Pages.analytics.chartData.daily || []);
    }
  }, 300));
}

/* debounce on Utils for resize handler */
Utils.debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();

  const authed = await Auth.check();

  if (authed) {
    showApp();
  } else {
    showAuthGate();
  }
});