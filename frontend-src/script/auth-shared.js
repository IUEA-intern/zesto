/**
 * Zesto — auth-shared.js
 * ──────────────────────────────────────────────────────────────
 * Shared authentication popup script for all pages except order.html and cart.html.
 * Dynamically injects the Auth Modal HTML, handles API login/signup,
 * updates navigation buttons to user pills when logged in, and intercepts
 * Sign In / Get Started button clicks to show the popup modals.
 * ──────────────────────────────────────────────────────────────
 */

'use strict';

(function () {
  const API_BASE = '/api';

  // State
  let session = null;

  // Toast System
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
      toast.innerHTML = `<span class="toast-icon">${icons[type] || '🍊'}</span><span>${escapeHTML(message)}</span>`;
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

  // Helper: Escape HTML
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // API Helpers
  const Api = {
    async request(path, options = {}) {
      try {
        const res = await fetch(API_BASE + path, {
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

    get:  (path)       => Api.request(path),
    post: (path, body) => Api.request(path, { method: 'POST', body }),
  };

  // Inject Modal HTML
  function injectModalHTML() {
    if (document.getElementById('authModal')) return;

    // Toast Container
    if (!document.getElementById('toastContainer')) {
      const toastEl = document.createElement('div');
      toastEl.id = 'toastContainer';
      toastEl.className = 'toast-container';
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }

    // Modal Markup
    const modalHTML = `
      <div id="authModal" class="modal-overlay hidden">
        <div class="modal-card">
          <button class="modal-close" id="closeAuthModal" aria-label="Close">&times;</button>

          <!-- Login Tab -->
          <div id="loginTab" class="auth-tab active">
            <h2 class="modal-title">Welcome Back 👋</h2>
            <p class="modal-sub">Log in to your Zesto account</p>
            <div class="form-group">
              <label for="loginEmail">Email</label>
              <input type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email" />
            </div>
            <div class="form-group">
              <label for="loginPassword">Password</label>
              <input type="password" id="loginPassword" placeholder="••••••••" autocomplete="current-password" />
            </div>
            <button class="btn-primary full-width" id="loginBtn">Log In</button>
            <p class="auth-switch">Don't have an account? <a href="#" id="switchToRegister">Sign Up</a></p>
          </div>

          <!-- Register Tab -->
          <div id="registerTab" class="auth-tab hidden">
            <h2 class="modal-title">Create Account 🎉</h2>
            <p class="modal-sub">Join Zesto for fast food delivery</p>
            <div class="form-group">
              <label for="regName">Full Name</label>
              <input type="text" id="regName" placeholder="John Doe" autocomplete="name" />
            </div>
            <div class="form-group">
              <label for="regEmail">Email</label>
              <input type="email" id="regEmail" placeholder="you@example.com" autocomplete="email" />
            </div>
            <div class="form-group">
              <label for="regPhone">Phone (optional)</label>
              <input type="tel" id="regPhone" placeholder="+256 7XX XXX XXX" autocomplete="tel" />
            </div>
            <div class="form-group">
              <label for="regPassword">Password</label>
              <input type="password" id="regPassword" placeholder="Min. 6 characters" autocomplete="new-password" />
            </div>
            <button class="btn-primary full-width" id="registerBtn">Create Account</button>
            <p class="auth-switch">Already have an account? <a href="#" id="switchToLogin">Log In</a></p>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  // UI Setup & Updates
  function updateUI() {
    // Selectors for navbar buttons
    const signinBtns = document.querySelectorAll('a[href*="login.html"], .btn-nav-signin');
    const signupBtns = document.querySelectorAll('a[href*="signin.html"], a[href*="Get_Started.html"], a[href*="signup.html"], .btn-nav-signup');

    // Remove existing user pills
    document.querySelectorAll('.user-pill-shared').forEach(el => el.remove());

    if (session) {
      // Hide all standard buttons
      signinBtns.forEach(btn => btn.style.display = 'none');
      signupBtns.forEach(btn => btn.style.display = 'none');

      // Add user pill to nav containers
      // We look for .nav-actions, .nav-actions-auth, and mobile-actions containers
      const containers = document.querySelectorAll('.nav-actions, .nav-actions-auth, .mobile-actions');
      containers.forEach(container => {
        const pill = document.createElement('div');
        pill.className = 'user-pill user-pill-shared';
        pill.innerHTML = `
          <span class="user-avatar">👤</span>
          <span class="user-name-text">${escapeHTML(session.name)}</span>
          <button class="btn-logout btn-logout-shared" title="Logout">↩</button>
        `;
        // Setup logout event listener for the pill
        pill.querySelector('.btn-logout-shared').addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await Api.post('/auth/logout', {});
            session = null;
            Toast.info('Logged out successfully.');
            updateUI();
          } catch (err) {
            Toast.error('Logout failed.');
          }
        });
        container.appendChild(pill);
      });
    } else {
      // Show all standard buttons
      signinBtns.forEach(btn => btn.style.display = '');
      signupBtns.forEach(btn => btn.style.display = '');
    }
  }

  // Open / Close Modal helpers
  function openModal(tab = 'login') {
    const overlay = document.getElementById('authModal');
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');

    if (!overlay) return;

    if (tab === 'login') {
      loginTab?.classList.add('active');
      loginTab?.classList.remove('hidden');
      registerTab?.classList.remove('active');
      registerTab?.classList.add('hidden');
    } else {
      registerTab?.classList.add('active');
      registerTab?.classList.remove('hidden');
      loginTab?.classList.remove('active');
      loginTab?.classList.add('hidden');
    }

    overlay.classList.remove('hidden');
  }

  // Clear inputs inside modal
  function clearModalInputs() {
    const inputs = document.querySelectorAll('#authModal input');
    inputs.forEach(input => input.value = '');
  }

  function closeModal() {
    const overlay = document.getElementById('authModal');
    overlay?.classList.add('hidden');
    clearModalInputs();
  }

  // Initialize event listeners
  function initListeners() {
    const overlay       = document.getElementById('authModal');
    const closeBtn      = document.getElementById('closeAuthModal');
    const loginTab      = document.getElementById('loginTab');
    const registerTab   = document.getElementById('registerTab');
    const switchToReg   = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');
    const loginBtn      = document.getElementById('loginBtn');
    const registerBtn   = document.getElementById('registerBtn');

    if (!overlay) return;

    closeBtn?.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    switchToReg?.addEventListener('click', e => {
      e.preventDefault();
      loginTab?.classList.remove('active');
      loginTab?.classList.add('hidden');
      registerTab?.classList.add('active');
      registerTab?.classList.remove('hidden');
    });

    switchToLogin?.addEventListener('click', e => {
      e.preventDefault();
      registerTab?.classList.remove('active');
      registerTab?.classList.add('hidden');
      loginTab?.classList.add('active');
      loginTab?.classList.remove('hidden');
    });

    loginBtn?.addEventListener('click', async () => {
      const email    = document.getElementById('loginEmail')?.value.trim();
      const password = document.getElementById('loginPassword')?.value;
      if (!email || !password) { Toast.error('Please fill in all fields.'); return; }
      try {
        loginBtn.disabled = true; loginBtn.textContent = 'Logging in…';
        const res = await Api.post('/auth/login', { email, password });
        session = res.user;
        closeModal();
        Toast.success(res.message || 'Logged in!');
        updateUI();
        // If we are on login.html or signin.html, redirect them to index.html or order.html
        if (window.location.pathname.includes('login.html') || window.location.pathname.includes('signin.html') || window.location.pathname.includes('Get_Started.html')) {
          setTimeout(() => { window.location.href = 'order.html'; }, 1000);
        }
      } catch (err) {
        Toast.error(err.message || 'Login failed.');
      } finally {
        loginBtn.disabled = false; loginBtn.textContent = 'Log In';
      }
    });

    registerBtn?.addEventListener('click', async () => {
      const name     = document.getElementById('regName')?.value.trim();
      const email    = document.getElementById('regEmail')?.value.trim();
      const phone    = document.getElementById('regPhone')?.value.trim();
      const password = document.getElementById('regPassword')?.value;
      if (!name || !email || !password) { Toast.error('Please fill in all required fields.'); return; }
      if (password.length < 6) { Toast.error('Password must be at least 6 characters.'); return; }
      try {
        registerBtn.disabled = true; registerBtn.textContent = 'Creating account…';
        const res = await Api.post('/auth/register', { name, email, phone, password });
        session = res.user;
        closeModal();
        Toast.success(res.message || 'Account created!');
        updateUI();
        if (window.location.pathname.includes('login.html') || window.location.pathname.includes('signin.html') || window.location.pathname.includes('Get_Started.html')) {
          setTimeout(() => { window.location.href = 'order.html'; }, 1000);
        }
      } catch (err) {
        Toast.error(err.message || 'Registration failed.');
      } finally {
        registerBtn.disabled = false; registerBtn.textContent = 'Create Account';
      }
    });

    // Intercept clicks on sign-in and sign-up links across the page navs
    document.addEventListener('click', e => {
      // Find nearest link
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href') || '';
      const className = link.className || '';

      // Check if it's a sign in link
      if (href.includes('login.html') || className.includes('btn-nav-signin')) {
        e.preventDefault();
        // If mobile menu is open, close it
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu && mobileMenu.classList.contains('open')) {
          mobileMenu.classList.remove('open');
        }
        // Also close the rider mobile drawer
        const drawer = document.getElementById('mobileDrawer');
        if (drawer && drawer.classList.contains('open')) {
          drawer.classList.remove('open');
        }
        openModal('login');
      }
      // Check if it's a sign up link
      else if (href.includes('signin.html') || href.includes('signup.html') || href.includes('Get_Started.html') || className.includes('btn-nav-signup')) {
        e.preventDefault();
        // If mobile menu is open, close it
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu && mobileMenu.classList.contains('open')) {
          mobileMenu.classList.remove('open');
        }
        // Also close the rider mobile drawer
        const drawer = document.getElementById('mobileDrawer');
        if (drawer && drawer.classList.contains('open')) {
          drawer.classList.remove('open');
        }
        openModal('register');
      }
    });
  }

  // Initialization function
  async function init() {
    injectModalHTML();
    Toast.init();
    initListeners();

    // Check if user is logged in
    try {
      const res = await Api.get('/auth/me');
      session = res.user;
    } catch (err) {
      session = null;
    }
    updateUI();
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
