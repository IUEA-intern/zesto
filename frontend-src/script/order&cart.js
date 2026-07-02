/**
 * Zesto — order&cart.js
 * ──────────────────────────────────────────────────────────────
 * Single JS module serving both order.html and cart.html.
 * Architecture: module pattern — no globals, no duplicate listeners.
 *
 * CART STORAGE RULE: localStorage stores ONLY { product_id, qty }
 * Product details always resolved against the in-memory products map.
 * ──────────────────────────────────────────────────────────────
 */

'use strict';

/* ============================================================
   CONSTANTS
   ============================================================ */
const API        = '/api';
const STORAGE_KEY = 'zesto_cart';    // [{ product_id, qty }]
let DELIVERY_FEE = 5000;            // UGX — loaded from backend settings

/* ============================================================
   STATE
   ============================================================ */
const State = {
  products:  new Map(),   // product_id → product object
  session:   null,        // { user_id, name, email, role } or null
  cartItems: [],          // [{ product_id, qty }] — mirrors localStorage
  cartServerIds: new Map(), // product_id → cart_id for server sync
  intent:    null,        // 'checkout' when login is required before completing checkout
  restaurant_id: null,
  currentRestaurant: null,
};

/* ============================================================
   UTILITY HELPERS
   ============================================================ */
const Utils = {
  /** Format number as UGX currency string */
  currency(n) {
    return 'UGX ' + Number(n).toLocaleString('en-UG');
  },

  /** Simple debounce */
  debounce(fn, ms = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  },

  /** Emoji icon per category */
  categoryIcon(cat) {
    const key = String(cat || '').toLowerCase();
    return {
      food: '🍔',
      drink: '🥤',
      drinks: '🥤',
      dessert: '🍰',
      desserts: '🍰',
      other: '🎁',
      combos: '🎁',
    }[key] || '🍽️';
  },

  normalizeCategory(cat) {
    const key = String(cat || '').toLowerCase().trim();
    if (key === 'drinks') return 'drink';
    if (key === 'desserts') return 'dessert';
    if (key === 'combos') return 'other';
    if (['food', 'drink', 'dessert', 'other'].includes(key)) return key;
    return 'other';
  },

  normalizeCategory(cat) {
    const key = String(cat || '').toLowerCase().trim();
    if (key === 'drinks') return 'drink';
    if (key === 'desserts') return 'dessert';
    if (key === 'combos') return 'other';
    if (['food', 'drink', 'dessert', 'other'].includes(key)) return key;
    return 'other';
  },

  /** Escape HTML to prevent XSS when injecting user-supplied strings */
  escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

/* ============================================================
   TOAST SYSTEM
   ============================================================ */
async function loadDeliveryFee() {
  try {
    const res = await fetch('/api/settings/delivery-fee');
    const data = await res.json();
    if (res.ok && data?.data?.delivery_fee != null) {
      DELIVERY_FEE = Number(data.data.delivery_fee);
      if (!Number.isFinite(DELIVERY_FEE) || DELIVERY_FEE < 0) DELIVERY_FEE = 5000;
    }
  } catch (err) {
    console.warn('[delivery-fee] using fallback value', err);
  }
}

/* ============================================================
   DELIVERY CONFIRMATION CODE MODAL
   Shown to the customer right after payment is verified.
   The code must be given to the delivery rider on arrival.
   ============================================================ */
const DeliveryCodeModal = {
  show(code, orderNumber) {
    if (!code) return;

    // Persist so the customer can find it again if they navigate away
    try {
      const stored = JSON.parse(localStorage.getItem('zesto_delivery_codes') || '{}');
      stored[orderNumber || 'latest'] = code;
      localStorage.setItem('zesto_delivery_codes', JSON.stringify(stored));
    } catch {}

    let overlay = document.getElementById('deliveryCodeOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'deliveryCodeOverlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; padding: 20px;
    `;
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:380px;width:100%;
                  padding:28px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="font-size:42px;margin-bottom:8px">🎉</div>
        <h2 style="margin:0 0 6px;font-size:1.2rem;font-weight:800">Payment Confirmed!</h2>
        <p style="margin:0 0 18px;color:#666;font-size:.9rem">
          Your order is being prepared. Give this code to the delivery rider when your order arrives.
        </p>
        <div style="background:#fff7ed;border:2px dashed #f97316;border-radius:12px;
                    padding:16px;margin-bottom:18px">
          <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:#9a5b1f;margin-bottom:4px">
            Delivery Confirmation Code
          </div>
          <div style="font-size:2.1rem;font-weight:800;letter-spacing:6px;color:#ea580c">${Utils.escape(String(code))}</div>
        </div>
        <button id="deliveryCodeCloseBtn" style="width:100%;padding:12px;border:none;border-radius:10px;
                background:#ea580c;color:#fff;font-weight:700;font-size:.95rem;cursor:pointer">
          Got it!
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('deliveryCodeCloseBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  },
};

const Toast = {
  container: null,

  init() {
    this.container = document.getElementById('toastContainer');
  },

  show(message, type = 'info', duration = 3500) {
    if (!this.container) return;
    const icons = { success: '✅', error: '❌', info: '🍊', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '🍊'}</span><span>${Utils.escape(message)}</span>`;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); },
  info(msg)    { this.show(msg, 'info'); },
  warning(msg) { this.show(msg, 'warning'); },
};

/* ============================================================
   LOCAL STORAGE CART  (minimal: product_id + qty only)
   ============================================================ */
const LocalCart = {
  load() {
    try {
      return this.normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
    } catch { return []; }
  },

  save(items) {
    const normalized = this.normalize(items);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(
      normalized.map(({ product_id, qty }) => ({ product_id, qty }))
    ));
    return normalized;
  },

  normalize(items) {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach(({ product_id, qty }) => {
      const productId = Number(product_id);
      const quantity = Number(qty);
      if (!Number.isInteger(productId) || !Number.isFinite(quantity) || quantity < 1) return;
      map.set(productId, (map.get(productId) || 0) + quantity);
    });
    return Array.from(map, ([product_id, qty]) => ({ product_id, qty }));
  },

  add(productId, qty = 1) {
    const items = this.load();
    const existing = items.find(i => i.product_id === productId);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({ product_id: productId, qty });
    }
    this.save(items);
    return items;
  },

  update(productId, qty) {
    const items = this.load().map(i =>
      i.product_id === productId ? { ...i, qty } : i
    ).filter(i => i.qty > 0);
    this.save(items);
    return items;
  },

  remove(productId) {
    const items = this.load().filter(i => i.product_id !== productId);
    this.save(items);
    return items;
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  },

  count() {
    return this.load().reduce((sum, i) => sum + i.qty, 0);
  },
};

/* ============================================================
   API HELPERS
   ============================================================ */
const Api = {
  async request(path, options = {}) {
    try {
      const res = await fetch(API + path, {
        ...options,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      return data;
    } catch (err) {
      throw err;
    }
  },

  get:    (path)         => Api.request(path),
  post:   (path, body)   => Api.request(path, { method: 'POST',   body }),
  put:    (path, body)   => Api.request(path, { method: 'PUT',    body }),
  delete: (path)         => Api.request(path, { method: 'DELETE' }),
};

/* ============================================================
   SESSION / AUTH
   ============================================================ */
const Auth = {
  async init() {
    try {
      const res = await window.SharedAuth.checkSession();
      State.session = res.user;
    } catch {
      State.session = null;
    }
    this.updateUI();
  },

  updateUI() {
    const userPill   = document.getElementById('userPill');
    const userNameEl = document.getElementById('userName');
    const authBtn    = document.getElementById('openAuthModal');

    if (State.session) {
      if (userPill)   { userPill.classList.remove('hidden'); }
      if (userNameEl) { userNameEl.textContent = State.session.name; }
      if (authBtn)    { authBtn.style.display = 'none'; }
    } else {
      if (userPill)   { userPill.classList.add('hidden'); }
      if (authBtn)    { authBtn.style.display = ''; }
    }
  },

  async login(email, password) {
    return window.SharedAuth.login(email, password);
  },

  async register(name, email, phone, password) {
    return window.SharedAuth.registerCustomer(name, email, phone, password);
  },

  async logout() {
    return window.SharedAuth.logout();
  },
};

/* ============================================================
   PRODUCTS MODULE (order.html only)
   ============================================================ */
const Products = {
  /** Render N skeleton cards into a grid */
  renderSkeletons(gridEl, count = 6) {
    gridEl.innerHTML = Array.from({ length: count }).map(() => `
      <div class="skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-body">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long"></div>
        </div>
      </div>`).join('');
  },

  /** Build a single product card HTML */
  buildCard(p) {
    const imgTag = p.image_url
      ? `<img src="${Utils.escape(p.image_url)}" alt="${Utils.escape(p.name)}" class="product-card-img" loading="lazy" />`
      : `<div class="product-card-img-placeholder">${Utils.categoryIcon(Utils.normalizeCategory(p.category))}</div>`;

    const outOfStock = p.stock < 1;
    const stockBadge = outOfStock ? `<span class="stock-badge">Out of stock</span>` : '';

    return `
      <article class="product-card${outOfStock ? ' out-of-stock' : ''}" data-id="${p.product_id}">
        <div class="product-card-img-wrap">${imgTag}</div>
        <div class="product-card-body">
          <span class="product-type-tag">${Utils.escape(p.type || p.category)}</span>
          <h3 class="product-name">${Utils.escape(p.name)}</h3>
          <p class="product-desc">${Utils.escape(p.description || '')}</p>
          ${stockBadge}
        </div>
        <div class="product-card-footer">
          <span class="product-price">
            ${Utils.currency(p.price)}
            <small>/ item</small>
          </span>
          <div class="dynamic-cart-controls"></div>
        </div>
      </article>`;
  },

  /** Render an array of products into a grid element */
  renderGrid(gridEl, items) {
    if (!items.length) {
      gridEl.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;padding:12px 0">Nothing here yet.</p>';
      return;
    }
    gridEl.innerHTML = items.map(p => this.buildCard(p)).join('');
  },

  /** Fetch restaurant details and update Hero */
  async fetchRestaurant(id) {
    try {
      const res = await Api.get(`/restaurants/${id}`);
      State.currentRestaurant = res.data;
      this.updateHero(res.data);
    } catch (err) {
      console.warn('[fetchRestaurant]', err);
      Toast.error('Could not load restaurant details.');
    }
  },

  /** Update Hero section with restaurant info */
  updateHero(r) {
    const title = document.querySelector('.hero-title');
    const desc  = document.querySelector('.hero-desc');
    const tagline = document.querySelector('.hero-tagline');
    
    if (title) title.innerHTML = `Order from <span class="hero-accent">${Utils.escape(r.name)}</span>`;
    if (desc)  desc.textContent = r.description || `Fresh meals delivered from ${r.name} straight to your door.`;
    if (tagline) tagline.textContent = r.address || 'Fast • Fresh • Flavourful';

    // Set restaurant image as background image
    const heroBg = document.querySelector('.hero-bg');
    if (heroBg && r.logo_url) {
      heroBg.style.backgroundImage = `url(${r.logo_url})`;
    }
  },

  /** Fetch all products, populate state map, render all 4 grids */
  async loadAll() {
    const grids = {
      food:    document.getElementById('foodGrid'),
      drink:   document.getElementById('drinksGrid'),
      dessert: document.getElementById('dessertsGrid'),
      other:   document.getElementById('otherGrid'),
    };

    // Show skeletons while loading
    Object.values(grids).forEach(g => g && this.renderSkeletons(g));

    try {
      let url = '/products';
      if (State.restaurant_id) {
        url += `?restaurant_id=${State.restaurant_id}`;
      }
      const res = await Api.get(url);
      const all = res.data || [];

      // Populate global products map
      all.forEach(p => State.products.set(p.product_id, p));

      // Group by category
      const grouped = { food: [], drink: [], dessert: [], other: [] };
      all.forEach(p => {
        const normalized = Utils.normalizeCategory(p.category);
        grouped[normalized].push(p);
      });

      Object.entries(grouped).forEach(([cat, items]) => {
        if (grids[cat]) this.renderGrid(grids[cat], items);
      });

      // Refresh add buttons to reflect current cart
      Cart.refreshAddButtons();
    } catch (err) {
      console.error('[Products.loadAll]', err);
      Object.values(grids).forEach(g => {
        if (g) g.innerHTML = '<p style="color:#ef4444;font-size:.9rem;padding:12px 0">Failed to load products. Please refresh.</p>';
      });
      Toast.error('Failed to load menu. Please refresh the page.');
    }
  },
};

/* ============================================================
   CART MODULE
   ============================================================ */
const Cart = {

  refreshState() {
    State.cartItems = LocalCart.load();
  },
  
  /** Sync State.cartItems from localStorage */
  syncFromStorage() {
    State.cartItems = LocalCart.load();
  },

  rememberServerItems(items) {
    State.cartServerIds.clear();
    items.forEach(item => {
      if (item.cart_id) State.cartServerIds.set(Number(item.product_id), Number(item.cart_id));
      State.products.set(item.product_id, item);
    });
  },

  async syncServerQty(productId, qty) {
    if (!State.session) return;

    const cartId = State.cartServerIds.get(productId);
    if (cartId) {
      await Api.put(`/cart/${cartId}`, { qty });
      return;
    }

    await Api.post('/cart', { product_id: productId, qty });
  },

  async removeServerItem(productId) {
    if (!State.session) return;

    const cartId = State.cartServerIds.get(productId);
    if (!cartId) return;

    await Api.delete(`/cart/${cartId}`);
    State.cartServerIds.delete(productId);
  },

  /** Update badge count(s) in the navbar */
  updateBadge() {
    const count = LocalCart.count();
    document.querySelectorAll('.cart-badge').forEach(el => {
      el.textContent = count;
      el.style.transform = 'scale(1.2)';
      setTimeout(() => { el.style.transform = ''; }, 200);
    });
    // Hero cart count
    const heroCount = document.getElementById('heroCartCount');
    if (heroCount) heroCount.textContent = count > 0 ? count : '';
  },

  /** On the order page, visually mark "added" buttons for items already in cart */
  refreshAddButtons() {
    document.querySelectorAll('.product-card').forEach(card => {
      const productId = parseInt(card.dataset.id);

      const item = LocalCart.load().find(i => i.product_id === productId);

      const footer = card.querySelector('.product-card-footer');
      if (!footer) return;

      const existingControls = footer.querySelector('.dynamic-cart-controls');
      if (existingControls) existingControls.remove();

      let controlsHTML = '';

      if (item && item.qty > 0) {
        controlsHTML = `
          <div class="dynamic-cart-controls cart-item-controls order-qty-controls">
            <button
              class="qty-btn btn-order-minus"
              data-id="${productId}"
              aria-label="Decrease quantity"
            >
              −
            </button>

            <span class="qty-display">${item.qty}</span>

            <button
              class="qty-btn btn-order-plus"
              data-id="${productId}"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        `;
      } else {
        controlsHTML = `
          <button
            class="btn-add-cart dynamic-cart-controls"
            data-id="${productId}"
          >
            + Add
          </button>
        `;
      }

      footer.insertAdjacentHTML('beforeend', controlsHTML);
    });
  },

  handleOrderMinus(e) {
    const btn = e.target.closest('.btn-order-minus');
    if (!btn) return;

    const pid = parseInt(btn.dataset.id);

    const item = LocalCart.load().find(i => i.product_id === pid);

    if (!item) return;

    if (item.qty <= 1) {
      LocalCart.remove(pid);
    } else {
      LocalCart.update(pid, item.qty - 1);
    }

    this.refreshState();
    this.updateBadge();
    this.refreshAddButtons();
  },

  handleOrderPlus(e) {
    const btn = e.target.closest('.btn-order-plus');
    if (!btn) return;

    const pid = parseInt(btn.dataset.id);

    const item = LocalCart.load().find(i => i.product_id === pid);

    if (!item) return;

    LocalCart.update(pid, item.qty + 1);

    this.refreshState();
    this.updateBadge();
    this.refreshAddButtons();
  },

  /** Check if product belongs to the current restaurant or if cart is empty/same restaurant */
  async isCartSafe(productId) {
    const items = LocalCart.load();
    if (!items.length) return true;

    const p = State.products.get(productId);
    if (!p) return true;

    // Check existing items in cart
    const firstItemId = items[0].product_id;
    let firstItem = State.products.get(firstItemId);
    
    if (!firstItem) {
        // Fetch it if missing
        try {
            const res = await Api.get(`/products/${firstItemId}`);
            firstItem = res.data;
            State.products.set(firstItemId, firstItem);
        } catch (err) {
            return true;
        }
    }

    if (firstItem.restaurant_id !== p.restaurant_id) {
        if (confirm("You can only order from one restaurant at a time. Clear your cart and start a new order?")) {
            this.clearAll();
            return true;
        }
        return false;
    }
    return true;
  },

  /** Handle add-to-cart click from the product grid (event delegation) */
  async handleAddToCart(e) {
    const btn = e.target.closest('.btn-add-cart');
    if (!btn || btn.disabled) return;

    const productId = parseInt(btn.dataset.id);
    const product   = State.products.get(productId);
    if (!product) return;

    const safe = await this.isCartSafe(productId);
    if (!safe) return;

    LocalCart.add(productId, 1);
    this.updateBadge();

    // Visual feedback
    this.refreshAddButtons();
    Toast.success(`${product.name} added to cart!`);

    // If user is logged in, also sync to server cart
    if (State.session) {
      Api.post('/cart', { product_id: productId, qty: 1 }).catch(err => {
        console.warn('[Cart sync server]', err.message);
      });
    }
  },

  /** Initialise cart page — load items, render, bind events */
  async initCartPage() {
    this.syncFromStorage();
    this.updateBadge();

    // 🔥 IMPORTANT: ensure products exist BEFORE rendering
    const res = await Api.get('/products');
    (res.data || []).forEach(p => {
      State.products.set(p.product_id, p);
    });

    await this.mergeServerCart();
},

  /**
   * Merge: local cart wins when it has a selected qty; server-only items remain.
   * This preserves the user's visible selection without adding it again on refresh.
   */
  async mergeServerCart() {
    try {
      const localItems  = LocalCart.load();
      const localMap    = new Map(localItems.map(i => [i.product_id, i.qty]));
      const res         = await Api.get('/cart');
      const serverItems = res.data || [];
      const serverMap   = new Map(serverItems.map(i => [i.product_id, { qty: i.qty, cart_id: i.cart_id }]));

      this.rememberServerItems(serverItems);

      const merged = [];
      const allIds = new Set([ ...localMap.keys(), ...serverMap.keys() ]);

      for (const productId of allIds) {
        const localQty  = localMap.get(productId) || 0;
        const serverQty = serverMap.get(productId)?.qty || 0;
        const qty       = localMap.has(productId) ? localQty : serverQty;
        if (qty < 1) continue;
        merged.push({
          product_id: productId,
          qty,
          cart_id: serverMap.get(productId)?.cart_id || null,
        });
      }

      await Promise.all(merged.map(async item => {
        if (item.cart_id) {
          const existingQty = serverMap.get(item.product_id)?.qty || 0;
          if (item.qty !== existingQty) {
            await Api.put(`/cart/${item.cart_id}`, { qty: item.qty });
          }
        } else {
          await Api.post('/cart', { product_id: item.product_id, qty: item.qty });
        }
      }));

      const refreshed = await Api.get('/cart');
      this.rememberServerItems(refreshed.data || []);

      const persisted = merged.map(({ product_id, qty }) => ({ product_id, qty }));
      LocalCart.save(persisted);
      State.cartItems = persisted;
    } catch (err) {
      console.warn('[mergeServerCart]', err.message);
    }

    await this.fetchMissingProducts();
    this.renderCartPage();
  },

  /** Fetch product details for cart items not yet in State.products */
  async fetchMissingProducts() {
    const missing = State.cartItems
      .map(i => i.product_id)
      .filter(id => !State.products.has(id));

    await Promise.all(missing.map(async id => {
      try {
        const res = await Api.get(`/products/${id}`);
        State.products.set(id, res.data);
      } catch { /* item might be deleted */ }
    }));
  },

  /** Render cart items list and summary */
  renderCartPage() {
    const loadingEl  = document.getElementById('cartLoading');
    const emptyEl    = document.getElementById('cartEmpty');
    const listEl     = document.getElementById('cartItemsList');
    const checkoutBtn = document.getElementById('checkoutBtn');

    if (!listEl) return;

    if (loadingEl) loadingEl.style.display = 'none';

    const items = State.cartItems;

    if (!items.length) {
      emptyEl && emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      if (checkoutBtn) checkoutBtn.disabled = true;
      this.renderSummary([]);
      return;
    }

    emptyEl && emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    if (checkoutBtn) checkoutBtn.disabled = false;

    listEl.innerHTML = items.map(item => this.buildCartItemHTML(item)).join('');
    this.renderSummary(items);
    this.updateBadge();
  },

  buildCartItemHTML({ product_id, qty }) {
    const p = State.products.get(product_id);
    if (!p) {
      return `
        <div class="cart-item" data-pid="${product_id}">
          <div class="cart-item-info">
            <span class="cart-item-name">Loading product...</span>
          </div>
        </div>
      `;
    }

    const lineTotal = parseFloat(p.price) * qty;
    const imgTag    = p.image_url
      ? `<img src="${Utils.escape(p.image_url)}" alt="${Utils.escape(p.name)}" class="cart-item-img" loading="lazy" />`
      : `<div class="cart-item-img-placeholder">${Utils.categoryIcon(p.category)}</div>`;

    return `
      <div class="cart-item" data-pid="${product_id}">
        ${imgTag}
        <div class="cart-item-info">
          <div class="cart-item-name">${Utils.escape(p.name)}</div>
          <div class="cart-item-type">${Utils.escape(p.type || p.category)}</div>
          <div class="cart-item-unit-price">${Utils.currency(p.price)} each</div>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn btn-qty-minus" data-pid="${product_id}" aria-label="Decrease qty">−</button>
          <span class="qty-display">${qty}</span>
          <button class="qty-btn btn-qty-plus"  data-pid="${product_id}" aria-label="Increase qty">+</button>
        </div>
        <div class="cart-item-price">${Utils.currency(lineTotal)}</div>
        <button class="btn-remove-item" data-pid="${product_id}" aria-label="Remove item">🗑️</button>
      </div>`;
  },

  renderSummary(items) {
    const subtotal = items.reduce((sum, { product_id, qty }) => {
      const p = State.products.get(product_id);
      return sum + (p ? parseFloat(p.price) * qty : 0);
    }, 0);

    const total = subtotal + (items.length ? DELIVERY_FEE : 0);

    // Summary sidebar
    const summaryRows       = document.getElementById('summaryRows');
    const grandTotal        = document.getElementById('grandTotal');
    const modalSub          = document.getElementById('modalSubtotal');
    const modalTotalEl      = document.getElementById('modalTotal');
    const modalDeliveryFee  = document.getElementById('modalDeliveryFee');
    const summaryDeliveryFee = document.getElementById('summaryDeliveryFee');

    if (summaryRows) {
      summaryRows.innerHTML = items.map(({ product_id, qty }) => {
        const p = State.products.get(product_id);
        if (!p) return '';
        return `<div class="summary-row"><span>${Utils.escape(p.name)} ×${qty}</span><span>${Utils.currency(parseFloat(p.price) * qty)}</span></div>`;
      }).join('');
    }

    const displayFee = items.length ? DELIVERY_FEE : 0;

    if (grandTotal)   grandTotal.textContent   = Utils.currency(total);
    if (modalSub)     modalSub.textContent     = Utils.currency(subtotal);
    if (modalTotalEl) modalTotalEl.textContent = Utils.currency(total);
    if (modalDeliveryFee) modalDeliveryFee.textContent = Utils.currency(displayFee);
    if (summaryDeliveryFee) summaryDeliveryFee.textContent = Utils.currency(displayFee);
  },

  /** Qty decrease handler */
  handleQtyMinus(e) {
    const btn = e.target.closest('.btn-qty-minus');
    if (!btn) return;
    const pid  = parseInt(btn.dataset.pid);
    const item = LocalCart.load().find(i => i.product_id === pid);
    if (!item) return;

    if (item.qty <= 1) {
      this.removeItem(pid);
    } else {
      const nextQty = item.qty - 1;
      LocalCart.update(pid, nextQty);
      this.refreshState();
      this.syncServerQty(pid, nextQty).catch(err => {
        console.warn('[Cart qty sync]', err.message);
      });
      this.renderCartPage();
    }
  },

  /** Qty increase handler */
  handleQtyPlus(e) {
    const btn = e.target.closest('.btn-qty-plus');
    if (!btn) return;
    const pid  = parseInt(btn.dataset.pid);
    const item = LocalCart.load().find(i => i.product_id === pid);
    const p    = State.products.get(pid);

    if (!item || !p) return;
    if (item.qty >= p.stock) {
      Toast.warning('Max stock reached for this item.');
      return;
    }

    const nextQty = item.qty + 1;
    LocalCart.update(pid, nextQty);
    this.refreshState();
    this.syncServerQty(pid, nextQty).catch(err => {
      console.warn('[Cart qty sync]', err.message);
    });
    this.renderCartPage();
  },

  /** Remove item with animation */
  removeItem(pid) {
    const itemEl = document.querySelector(`.cart-item[data-pid="${pid}"]`);
    if (itemEl) {
      itemEl.classList.add('removing');
      itemEl.addEventListener('animationend', () => {
        LocalCart.remove(pid);
        this.refreshState();
        this.removeServerItem(pid).catch(err => {
          console.warn('[Cart remove sync]', err.message);
        });
        this.renderCartPage();
        this.updateBadge();
        Toast.info('Item removed from cart.');
      }, { once: true });
    } else {
      LocalCart.remove(pid);
      this.refreshState();
      this.removeServerItem(pid).catch(err => {
        console.warn('[Cart remove sync]', err.message);
      });
      this.renderCartPage();
      this.updateBadge();
    }
  },

  /** Handle remove button click */
  handleRemove(e) {
    const btn = e.target.closest('.btn-remove-item');
    if (!btn) return;
    this.removeItem(parseInt(btn.dataset.pid));
  },

  /** Clear all */
  clearAll() {
    LocalCart.clear();
    this.refreshState();
    if (State.session) Api.delete('/cart').catch(() => {});
    this.renderCartPage();
    this.updateBadge();
    Toast.info('Cart cleared.');
  },
};

/* ============================================================
   CHECKOUT MODULE (Pesapal)
   ============================================================ */

function resetAuthTabsToLogin() {
  const overlay = document.getElementById('authModal');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');

  if (!overlay || !loginTab || !registerTab) return;

  // Fully reset visibility/state so tabs can't overlap.
  loginTab.classList.add('active');
  loginTab.classList.remove('hidden');

  registerTab.classList.remove('active');
  registerTab.classList.add('hidden');
}

function openAuthModal(message = '') {
  const modal = document.getElementById('authModal');
  if (!modal) return;

  // Safeguard: always open from a clean login-only state.
  resetAuthTabsToLogin();

  modal.classList.remove('hidden');

  if (message) {
    let warn = document.getElementById('authWarning');
    if (!warn) {
      warn = document.createElement('div');
      warn.id = 'authWarning';
      warn.className = 'auth-warning';
      document.getElementById('loginTab')?.prepend(warn);
    }
    warn.textContent = message;
  }
}

const Checkout = {
  async openModal() {
    await Auth.init();

    if (!State.session) {
      State.intent = 'checkout';
      openAuthModal('Please log in to continue checkout.');
      Toast.warning('Please log in to continue checkout.');
      return;
    }

    const items = LocalCart.load();
    if (!items.length) {
      Toast.warning('Your cart is empty.');
      return;
    }

    Cart.renderSummary(items);
    const modal = document.getElementById('checkoutModal');
    if (modal) modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = document.getElementById('checkoutModal');
    if (modal) modal.classList.add('hidden');
  },

  async proceed() {
    const address = document.getElementById('deliveryAddress')?.value.trim();
    const method  = document.getElementById('paymentMethod')?.value || 'mobile_money';
    const notes   = document.getElementById('orderNotes')?.value.trim();

    if (!address) {
      Toast.error('Please enter a delivery address.');
      return;
    }

    const items = LocalCart.load().map(({ product_id, qty }) => ({ product_id, qty }));
    if (!items.length) {
      Toast.error('Your cart is empty.');
      return;
    }

    await this.placeOrderAndStartPesapal(items, address, method, notes);
  },

  async placeOrderAndStartPesapal(items, deliveryAddress, paymentMethod, notes) {
    const proceedBtn = document.getElementById('proceedPaymentBtn');
    const originalText = proceedBtn?.textContent || 'Proceed to Payment';
    if (proceedBtn) {
      proceedBtn.disabled = true;
      proceedBtn.textContent = 'Opening Pesapal...';
    }

    try {
      const orderRes = await Api.post('/orders', {
        items,
        delivery_address: deliveryAddress,
        payment_method: paymentMethod,
        notes,
      });

      const paymentRes = await Api.post('/payments/pesapal/initiate', {
        order_id: orderRes.order_id,
        method: paymentMethod,
      });

      if (!paymentRes.redirect_url) {
        throw new Error('Pesapal did not return a payment link.');
      }

      Toast.info('Redirecting to Pesapal...');
      window.location.href = paymentRes.redirect_url;
    } catch (err) {
      Toast.error(err.message || 'Failed to start payment. Please try again.');
      if (proceedBtn) {
        proceedBtn.disabled = false;
        proceedBtn.textContent = originalText;
      }
    }
  },
};

/* ============================================================
   AUTH MODAL
   ============================================================ */
const AuthModal = {
  init() {
    const openBtn       = document.getElementById('openAuthModal');
    const logoutBtn     = document.getElementById('logoutBtn');

    openBtn?.addEventListener('click', () => {
      window.SharedAuth?.showLogin();
    });

    logoutBtn?.addEventListener('click', async () => {
      try {
        await window.SharedAuth?.logout();
        Cart.updateBadge();
        Toast.info('Logged out successfully.');
      } catch { Toast.error('Logout failed.'); }
    });

    // Custom event listeners to keep order&cart state in sync with SharedAuth
    document.addEventListener('auth-login', async (e) => {
      State.session = e.detail;
      Auth.updateUI();
      if (document.getElementById('cartItemsList')) {
        await Cart.mergeServerCart();
      }
      if (State.intent === 'checkout') {
        State.intent = null;
        document.getElementById('authModal')?.classList.add('hidden');
        await Checkout.openModal();
      }
    });

    document.addEventListener('auth-logout', () => {
      State.session = null;
      State.intent = null;
      Auth.updateUI();
    });
  }
};

/* ============================================================
   CATEGORY TABS (order.html)
   ============================================================ */
const CategoryTabs = {
  init() {
    const tabsEl = document.querySelector('.tabs-inner');
    if (!tabsEl) return;

    tabsEl.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const cat = btn.dataset.category;
      document.querySelectorAll('.menu-section').forEach(sec => {
        if (cat === 'all') {
          sec.classList.remove('hidden');
        } else {
          // Show section if its id matches the category or is "drinks" for "drink"
          const matches = sec.id === cat || sec.id === cat + 's' ||
            (cat === 'drink' && sec.id === 'drinks') ||
            (cat === 'dessert' && sec.id === 'desserts');
          sec.classList.toggle('hidden', !matches);
        }
      });
    });
  },
};

/* ============================================================
   SOCKET.IO — real-time updates
   ============================================================ */
const SocketManager = {
  socket: null,

  init() {
    if (typeof io === 'undefined') return;
    try {
      this.socket = io({ autoConnect: true, reconnectionAttempts: 5 });

      this.socket.on('connect', () => {
        if (State.session) {
          this.socket.emit('join', State.session.user_id);
        }
      });

      this.socket.on('order:new', (data) => {
        Toast.success(`Order #${data.order_id} received! Total: ${Utils.currency(data.total)}`);
      });

      this.socket.on('order:status', (data) => {
        const labels = {
          confirmed:         '✅ Order confirmed!',
          preparing:         '👨‍🍳 Your order is being prepared!',
          out_for_delivery:  '🚀 Your order is on its way!',
          delivered:         '🎉 Order delivered! Enjoy your meal!',
          cancelled:         '❌ Your order was cancelled.',
        };
        const msg = labels[data.status] || `Order status: ${data.status}`;
        Toast.info(msg, 6000);
      });

      this.socket.on('payment:status', ({ data }) => {
        if (!data) return;
        if (data.status === 'verified' && data.deliveryCode) {
          DeliveryCodeModal.show(data.deliveryCode, data.orderId);
        } else if (data.status === 'delivered') {
          Toast.success('🎉 Your order has been delivered! Enjoy your meal!');
        } else if (data.status === 'failed') {
          Toast.error('Payment failed. Please try again.');
        }
      });
    } catch (err) {
      console.warn('[SocketManager]', err);
    }
  },
};

/* ============================================================
   NAVBAR SCROLL EFFECT
   ============================================================ */
function initNavScroll() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  window.addEventListener('scroll', Utils.debounce(() => {
    nav.style.boxShadow = window.scrollY > 10
      ? '0 4px 28px rgba(0,0,0,.12)'
      : '0 2px 20px rgba(0,0,0,.06)';
  }, 50));
}


function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  if (!payment) return;

  const orderId = params.get('order_id');

  if (payment === 'success') {
    LocalCart.clear();
    Cart.syncFromStorage();
    Cart.updateBadge();
    Toast.success('Payment confirmed! Your order is being prepared.');

    // Fetch the order to retrieve the delivery confirmation code
    if (orderId) {
      Api.get(`/orders/${orderId}`)
        .then((res) => {
          const code = res?.data?.delivery_confirmation_code;
          if (code) DeliveryCodeModal.show(code, res.data.order_number || orderId);
        })
        .catch((err) => console.warn('[handlePaymentReturn] Failed to fetch delivery code:', err));
    }
  } else if (payment === 'pending' || payment === 'already-processed') {
    Toast.info('Payment is being processed. We will update your order shortly.');
  } else if (payment === 'failed') {
    Toast.error('Payment failed. Please try again.');
  } else {
    Toast.error('We could not confirm the payment status. Please contact support if money was deducted.');
  }

  const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

/* ============================================================
   PAGE ROUTER — detect which page we're on and initialise
   ============================================================ */
async function bootPage() {
  Toast.init();
  await loadDeliveryFee();

  // Shared init across all pages
  await Auth.init();
  Cart.syncFromStorage();
  Cart.updateBadge();
  AuthModal.init();
  SocketManager.init();
  initNavScroll();

  const isCartPage  = !!document.getElementById('cartItemsList');
  const isOrderPage = !!document.getElementById('foodGrid');

  /* ── ORDER PAGE ───────────────────────────────────────────── */
  if (isOrderPage) {
    const params = new URLSearchParams(window.location.search);

    // 1. Try URL first
    let restaurantId = params.get('restaurant_id');

    // 2. Fallback to last selected restaurant
    if (!restaurantId) {
      restaurantId = localStorage.getItem('zesto_restaurant_id');
    }

    // 3. If still missing → redirect (prevents broken UI)
    if (!restaurantId) {
      window.location.href = "index.html"; // or your restaurant list page
      return;
    }

    // 4. Set global state
    State.restaurant_id = restaurantId;

    // 5. Persist for cart/navigation
    localStorage.setItem('zesto_restaurant_id', restaurantId);

    // 6. Load restaurant data
    await Products.fetchRestaurant(restaurantId);

    CategoryTabs.init();
    await Products.loadAll();

    // Event delegation for add-to-cart
    document.querySelector('.menu-main')?.addEventListener('click', e => {
      if (e.target.closest('.btn-add-cart')) {
        Cart.handleAddToCart(e);
      }
      else if (e.target.closest('.btn-order-minus')) {
        Cart.handleOrderMinus(e);
      }
      else if (e.target.closest('.btn-order-plus')) {
        Cart.handleOrderPlus(e);
      }
    });
  }


  /* ── CART PAGE ────────────────────────────────────────────── */
  if (isCartPage) {
    await Cart.initCartPage();

    // ✅ RESTORE MENU LINK WITH RESTAURANT ID
    const restaurantId = localStorage.getItem('zesto_restaurant_id');

    const menuUrl = restaurantId
      ? `order.html?restaurant_id=${restaurantId}`
      : 'order.html';

    document.querySelectorAll('a[href="order.html"]').forEach(link => {
      link.href = menuUrl;
    });

    // Event delegation for qty controls and remove buttons
    const listEl = document.getElementById('cartItemsList');
    listEl?.addEventListener('click', e => {
      if (e.target.closest('.btn-qty-minus')) Cart.handleQtyMinus(e);
      else if (e.target.closest('.btn-qty-plus')) Cart.handleQtyPlus(e);
      else if (e.target.closest('.btn-remove-item')) Cart.handleRemove(e);
    });

    // Clear all button
    document.getElementById('clearCartBtn')?.addEventListener('click', () => {
      if (confirm('Remove all items from your cart?')) Cart.clearAll();
    });

    // Checkout button → open checkout modal
    document.getElementById('checkoutBtn')?.addEventListener('click', () => Checkout.openModal());

    // Checkout modal close
    document.getElementById('closeCheckoutModal')?.addEventListener('click', () => Checkout.closeModal());

    // Proceed to payment
    document.getElementById('proceedPaymentBtn')?.addEventListener('click', () => Checkout.proceed());

    // Close modal on overlay click
    document.getElementById('checkoutModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('checkoutModal')) Checkout.closeModal();
    });
  }
}

/* ── Single DOMContentLoaded entry point ──────────────────── */
document.addEventListener('DOMContentLoaded', bootPage);