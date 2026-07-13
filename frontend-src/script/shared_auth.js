/**
 * Zesto — shared_auth.js
 * FILE: khalas/frontend-src/shared_auth.js  (REPLACE existing)
 * ─────────────────────────────────────────────────────────────────────
 * Customer-only auth popup. Injects the modal HTML, validates all fields
 * inline (field-level errors, not just toasts), calls /api/auth/* and
 * updates the navbar pill on every page.
 *
 * NO rider or restaurant registration — those live in their own pages.
 * ─────────────────────────────────────────────────────────────────────
 */

'use strict';

(function () {
  const API_BASE = '/api';

  // ── Session state ──────────────────────────────────────────────────
  let session = null;
  let pendingRegistration = null; // { name, email, phone, password } — held between send-code and verify

  // ── Validation helpers ─────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // Ugandan numbers: 07XXXXXXXX or +2567XXXXXXXX (spaces stripped before test)
  const PHONE_RE = /^(\+?256|0)7\d{8}$/;

  function isValidEmail(val) { return EMAIL_RE.test(val.trim()); }
  function isValidPhone(val) { return PHONE_RE.test(val.trim().replace(/\s/g, '')); }

  // ── Inline field error helpers ─────────────────────────────────────
  // Each input has a sibling <span class="field-error" id="{inputId}Error">
  function setFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    const errEl = document.getElementById(inputId + 'Error');
    if (!input || !errEl) return;
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');
    errEl.textContent = message;
    errEl.style.display = 'block';
  }

  function clearFieldError(inputId) {
    const input = document.getElementById(inputId);
    const errEl = document.getElementById(inputId + 'Error');
    if (!input || !errEl) return;
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
    errEl.textContent = '';
    errEl.style.display = 'none';
  }

  function clearAllErrors(prefix) {
    // prefix = 'login' | 'reg'
    const allIds = prefix === 'login'
      ? ['loginEmail', 'loginPassword']
      : ['regName', 'regEmail', 'regPhone', 'regPassword', 'regConfirm'];
    allIds.forEach(clearFieldError);
  }

  // Returns true if valid, false + shows inline errors if not
  function validateLoginForm() {
    let ok = true;
    const email    = document.getElementById('loginEmail')?.value.trim()   ?? '';
    const password = document.getElementById('loginPassword')?.value        ?? '';

    clearAllErrors('login');

    if (!email) {
      setFieldError('loginEmail', 'Email address is required.');
      ok = false;
    } else if (!isValidEmail(email)) {
      setFieldError('loginEmail', 'Enter a valid email address (e.g. you@example.com).');
      ok = false;
    }

    if (!password) {
      setFieldError('loginPassword', 'Password is required.');
      ok = false;
    }

    return ok;
  }

  function validateRegisterForm() {
    let ok = true;
    const name     = document.getElementById('regName')?.value.trim()    ?? '';
    const email    = document.getElementById('regEmail')?.value.trim()   ?? '';
    const phone    = document.getElementById('regPhone')?.value.trim()   ?? '';
    const password = document.getElementById('regPassword')?.value       ?? '';
    const confirm  = document.getElementById('regConfirm')?.value        ?? '';

    clearAllErrors('reg');

    if (!name) {
      setFieldError('regName', 'Full name is required.');
      ok = false;
    } else if (name.length < 3) {
      setFieldError('regName', 'Name must be at least 3 characters.');
      ok = false;
    } else if (name.length > 50) {
      setFieldError('regName', 'Name is too long (max 50 characters).');
      ok = false;
    }

    if (!email) {
      setFieldError('regEmail', 'Email address is required.');
      ok = false;
    } else if (!isValidEmail(email)) {
      setFieldError('regEmail', 'Enter a valid email address (e.g. you@example.com).');
      ok = false;
    }

    // Phone is optional — only validate format if something was entered
    if (phone && !isValidPhone(phone)) {
      setFieldError('regPhone', 'Enter a valid Ugandan number (e.g. 0712345678 or +256712345678).');
      ok = false;
    }

    if (!password) {
      setFieldError('regPassword', 'Password is required.');
      ok = false;
    } else if (password.length < 6) {
      setFieldError('regPassword', 'Password must be at least 6 characters.');
      ok = false;
    } else if (password.length > 128) {
      setFieldError('regPassword', 'Password is too long (max 128 characters).');
      ok = false;
    }

    if (!confirm) {
      setFieldError('regConfirm', 'Please confirm your password.');
      ok = false;
    } else if (confirm !== password) {
      setFieldError('regConfirm', 'Passwords do not match.');
      ok = false;
    }

    return ok;
  }

  // ── Toast system ───────────────────────────────────────────────────
  const Toast = {
    container: null,

    init() {
      this.container = document.getElementById('toastContainer');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toastContainer';
        this.container.className = 'toast-container';
        this.container.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.container);
      }
    },

    show(message, type = 'info', duration = 3500) {
      if (!this.container) this.init();
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

  // ── Utility ────────────────────────────────────────────────────────
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Public API (window.SharedAuth) ─────────────────────────────────
  window.SharedAuth = {

    async request(path, options = {}) {
      const res = await fetch(API_BASE + path, {
        ...options,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Request failed.');
      return data;
    },

    async login(email, password) {
      const data = await this.request('/auth/login', { method: 'POST', body: { email, password } });
      session = data.user;
      document.dispatchEvent(new CustomEvent('auth-login', { detail: session }));
      updateUI();
      return data;
    },

    async registerCustomer(name, email, phone, password) {
      const data = await this.request('/auth/register/customer', {
        method: 'POST',
        body: { name, email, phone: phone || null, password },
      });
      session = data.user;
      document.dispatchEvent(new CustomEvent('auth-login', { detail: session }));
      updateUI();
      return data;
    },

    async sendVerificationCode(email) {
      return this.request('/auth/send-code', { method: 'POST', body: { email } });
    },

    async verifyEmailCode(email, code) {
      return this.request('/auth/verify-code', { method: 'POST', body: { email, code } });
    },

    async checkSession() {
      try {
        const data = await this.request('/auth/me');
        session = data.user;
        if (session) document.dispatchEvent(new CustomEvent('auth-login', { detail: session }));
        updateUI();
        return data;
      } catch {
        session = null;
        updateUI();
        return { success: true, user: null };
      }
    },

    async logout() {
      const data = await this.request('/auth/logout', { method: 'POST' });
      session = null;
      document.dispatchEvent(new CustomEvent('auth-logout'));
      updateUI();
      return data;
    },

    getSession() { return session; },
    showLogin()    { openModal('login'); },
    showRegister() { openModal('register'); },
  };

  // ── Modal HTML injection ───────────────────────────────────────────
  // Each input has:
  //   - required + aria-required="true"
  //   - autocomplete hint
  //   - a <span id="{id}Error" class="field-error" role="alert"> for inline errors
  function injectModalHTML() {
    if (document.getElementById('authModal')) return;

    if (!document.getElementById('toastContainer')) {
      const el = document.createElement('div');
      el.id = 'toastContainer';
      el.className = 'toast-container';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }

    const html = `
<div id="authModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
  <div class="modal-card">
    <button class="modal-close" id="closeAuthModal" aria-label="Close modal">&times;</button>

    <!-- ── Login Tab ── -->
    <div id="loginTab" class="auth-tab active">
      <h2 class="modal-title" id="authModalTitle">Welcome Back 👋</h2>
      <p class="modal-sub">Log in to your Zesto account</p>

      <div class="form-group">
        <label for="loginEmail">Email address <span aria-hidden="true" class="required-mark">*</span></label>
        <input
          type="email"
          id="loginEmail"
          name="email"
          placeholder="you@example.com"
          autocomplete="email"
          required
          aria-required="true"
          aria-describedby="loginEmailError"
        />
        <span class="field-error" id="loginEmailError" role="alert"></span>
      </div>

      <div class="form-group">
        <label for="loginPassword">Password <span aria-hidden="true" class="required-mark">*</span></label>
        <input
          type="password"
          id="loginPassword"
          name="password"
          placeholder="••••••••"
          autocomplete="current-password"
          required
          aria-required="true"
          aria-describedby="loginPasswordError"
        />
        <span class="field-error" id="loginPasswordError" role="alert"></span>
      </div>

      <button class="btn-primary full-width" id="loginBtn" type="button">Log In</button>
      <p class="auth-switch">Don't have an account? <a href="#" id="switchToRegister">Sign Up</a></p>
    </div>

    <!-- ── Register Tab ── -->
    <div id="registerTab" class="auth-tab hidden">
      <h2 class="modal-title">Create Account 🎉</h2>
      <p class="modal-sub">Join Zesto for fast food delivery</p>

      <div class="form-group">
        <label for="regName">Full name <span aria-hidden="true" class="required-mark">*</span></label>
        <input
          type="text"
          id="regName"
          name="name"
          placeholder="John Doe"
          autocomplete="name"
          required
          aria-required="true"
          aria-describedby="regNameError"
          maxlength="120"
        />
        <span class="field-error" id="regNameError" role="alert"></span>
      </div>

      <div class="form-group">
        <label for="regEmail">Email address <span aria-hidden="true" class="required-mark">*</span></label>
        <input
          type="email"
          id="regEmail"
          name="email"
          placeholder="you@example.com"
          autocomplete="email"
          required
          aria-required="true"
          aria-describedby="regEmailError"
          maxlength="180"
        />
        <span class="field-error" id="regEmailError" role="alert"></span>
      </div>

      <div class="form-group">
        <label for="regPhone">Phone number <span class="optional-label">(optional)</span></label>
        <input
          type="tel"
          id="regPhone"
          name="phone"
          placeholder="0712 345 678"
          autocomplete="tel"
          aria-describedby="regPhoneError regPhoneHint"
          maxlength="20"
        />
        
        <span class="field-error" id="regPhoneError" role="alert"></span>
      </div>

      <div class="form-group">
        <label for="regPassword">Password <span aria-hidden="true" class="required-mark">*</span></label>
        <input
          type="password"
          id="regPassword"
          name="password"
          placeholder="Min. 6 characters"
          autocomplete="new-password"
          required
          aria-required="true"
          aria-describedby="regPasswordError"
          minlength="6"
          maxlength="128"
        />
        <span class="field-error" id="regPasswordError" role="alert"></span>
      </div>

      <div class="form-group">
        <label for="regConfirm">Confirm password <span aria-hidden="true" class="required-mark">*</span></label>
        <input
          type="password"
          id="regConfirm"
          name="confirmPassword"
          placeholder="Re-enter your password"
          autocomplete="new-password"
          required
          aria-required="true"
          aria-describedby="regConfirmError"
          maxlength="128"
        />
        <span class="field-error" id="regConfirmError" role="alert"></span>
      </div>

      <button class="btn-primary full-width" id="registerBtn" type="button">Create Account</button>
      <p class="auth-switch">Already have an account? <a href="#" id="switchToLogin">Log In</a></p>
    </div>

    <!-- ── Verify Email Tab ── -->
    <div id="verifyTab" class="auth-tab hidden">
      <h2 class="modal-title">Check your email 📧</h2>
      <p class="modal-sub">We sent a 6-digit code to <strong id="verifyEmailLabel"></strong></p>

      <div class="form-group">
        <label for="verifyCode">Verification code <span aria-hidden="true" class="required-mark">*</span></label>
        <input
          type="text"
          id="verifyCode"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="000000"
          style="text-align:center; letter-spacing:6px; font-weight:700; font-size:20px;"
          aria-describedby="verifyCodeError"
        />
        <span class="field-error" id="verifyCodeError" role="alert"></span>
      </div>

      <button class="btn-primary full-width" id="verifyCodeBtn" type="button">Verify &amp; Create Account</button>
      <p class="auth-switch">Didn't get it? <a href="#" id="resendVerifyCode">Resend code</a></p>
    </div>
  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ── UI update (navbar pill) ────────────────────────────────────────
  function updateUI() {
    const signinBtns = document.querySelectorAll('a[href*="login.html"], .btn-nav-signin');
    const signupBtns = document.querySelectorAll('a[href*="signin.html"], a[href*="signup.html"], .btn-nav-signup');

    document.querySelectorAll('.user-pill-shared').forEach(el => el.remove());

    if (session) {
      signinBtns.forEach(btn => (btn.style.display = 'none'));
      signupBtns.forEach(btn => (btn.style.display = 'none'));

      document.querySelectorAll('.nav-actions, .nav-actions-auth, .mobile-actions').forEach(container => {
        if (container.querySelector('#userPill')) return; // order/account pages handle their own
        const pill = document.createElement('div');
        pill.className = 'user-pill-shared';
        container.appendChild(pill);
        window.ZestoUserMenu?.attach(pill, session, {
          onLogout: async () => {
            try {
              await window.SharedAuth.logout();
              Toast.info('Logged out successfully.');
            } catch {
              Toast.error('Logout failed. Please try again.');
            }
          },
        });
      });
    } else {
      signinBtns.forEach(btn => (btn.style.display = ''));
      signupBtns.forEach(btn => (btn.style.display = ''));
    }
  }

  // ── Modal open / close ─────────────────────────────────────────────
  function openModal(tab = 'login') {
    const overlay = document.getElementById('authModal');
    if (!overlay) return;

    // Always route through switchTab so the verify tab can never be
    // left stacked underneath login/register — it's the single source
    // of truth for "which one tab is showing".
    switchTab(tab);
    overlay.classList.remove('hidden');

    if (tab === 'login') {
      document.getElementById('authModalTitle')?.focus();
    }
  }

  function closeModal() {
    const overlay = document.getElementById('authModal');
    if (!overlay) return;
    overlay.classList.add('hidden');
    // Inputs are intentionally left as-is — an accidental click on the
    // backdrop (or the × button) shouldn't wipe out what was typed.
    // Fields are only cleared explicitly via resetAuthForms(), which
    // runs after a successful login/registration.
  }

  // Fully clears the modal — called after a successful login or a
  // completed (verified) registration, never on an incidental close.
  function resetAuthForms() {
    const overlay = document.getElementById('authModal');
    if (!overlay) return;
    overlay.querySelectorAll('input').forEach(el => (el.value = ''));
    clearAllErrors('login');
    clearAllErrors('reg');
    clearFieldError('verifyCode');
    pendingRegistration = null;
  }

  function closeMobileMenus() {
    document.getElementById('mobileMenu')?.classList.remove('open');
    document.getElementById('mobileDrawer')?.classList.remove('open');
  }

  // ── Tab-switch helpers ─────────────────────────────────────────────
  function switchTab(to) {
    const loginTab    = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const verifyTab   = document.getElementById('verifyTab');

    [loginTab, registerTab, verifyTab].forEach(tab => {
      tab?.classList.remove('active');
      tab?.classList.add('hidden');
    });

    if (to === 'login') {
      loginTab?.classList.add('active');
      loginTab?.classList.remove('hidden');
      clearAllErrors('reg');
    } else if (to === 'verify') {
      verifyTab?.classList.add('active');
      verifyTab?.classList.remove('hidden');
    } else {
      registerTab?.classList.add('active');
      registerTab?.classList.remove('hidden');
      clearAllErrors('login');
    }
  }

  // ── Event listeners ────────────────────────────────────────────────
  function initListeners() {
    const overlay = document.getElementById('authModal');
    if (!overlay) return;

    // Close
    document.getElementById('closeAuthModal')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
    });

    // Tab switches
    document.getElementById('switchToRegister')?.addEventListener('click', e => {
      e.preventDefault(); switchTab('register');
    });
    document.getElementById('switchToLogin')?.addEventListener('click', e => {
      e.preventDefault(); switchTab('login');
    });

    // Clear inline errors as the user types / changes value
    ['loginEmail', 'loginPassword'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => clearFieldError(id));
    });
    ['regName', 'regEmail', 'regPhone', 'regPassword', 'regConfirm'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => clearFieldError(id));
    });

    // ── Login submit ─────────────────────────────────────────────────
    const loginBtn = document.getElementById('loginBtn');
    loginBtn?.addEventListener('click', async () => {
      if (!validateLoginForm()) return;

      const email    = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      loginBtn.disabled = true;
      loginBtn.textContent = 'Logging in…';
      try {
        const res = await window.SharedAuth.login(email, password);
        closeModal();
        resetAuthForms();
        Toast.success(res.message || 'Logged in!');
        if (window.location.pathname.includes('Get_Started.html')) {
          setTimeout(() => (window.location.href = 'index.html'), 1000);
        }
      } catch (err) {
        // Server returned a specific message — show it under the password field
        // (avoids leaking which field is wrong, per backend design)
        Toast.error(err.message || 'Login failed. Please try again.');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';
      }
    });

    // ── Register submit (step 1: send code) ────────────────────────────
    const registerBtn = document.getElementById('registerBtn');
    registerBtn?.addEventListener('click', async () => {
      if (!validateRegisterForm()) return;

      const name     = document.getElementById('regName').value.trim();
      const email    = document.getElementById('regEmail').value.trim();
      const phone    = document.getElementById('regPhone').value.trim();
      const password = document.getElementById('regPassword').value;

      pendingRegistration = { name, email, phone: phone || null, password };

      registerBtn.disabled = true;
      registerBtn.textContent = 'Sending code…';
      try {
        await window.SharedAuth.sendVerificationCode(email);
        document.getElementById('verifyEmailLabel').textContent = email;
        document.getElementById('verifyCode').value = '';
        clearFieldError('verifyCode');
        switchTab('verify');
        document.getElementById('verifyCode')?.focus();
      } catch (err) {
        Toast.error(err.message || 'Could not send verification code. Please try again.');
      } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = 'Create Account';
      }
    });

    // ── Verify submit (step 2: confirm code, then actually register) ───
    const verifyBtn = document.getElementById('verifyCodeBtn');
    verifyBtn?.addEventListener('click', async () => {
      const code = document.getElementById('verifyCode').value.trim();
      if (!/^\d{6}$/.test(code)) {
        setFieldError('verifyCode', 'Enter the 6-digit code from your email.');
        return;
      }
      if (!pendingRegistration) { switchTab('register'); return; }

      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying…';
      try {
        await window.SharedAuth.verifyEmailCode(pendingRegistration.email, code);

        const res = await window.SharedAuth.registerCustomer(
          pendingRegistration.name,
          pendingRegistration.email,
          pendingRegistration.phone,
          pendingRegistration.password
        );
        closeModal();
        resetAuthForms();
        Toast.success(res.message || 'Account created!');
        if (window.location.pathname.includes('Get_Started.html')) {
          setTimeout(() => (window.location.href = 'index.html'), 1000);
        }
      } catch (err) {
        setFieldError('verifyCode', err.message || 'Invalid or expired code.');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Create Account';
      }
    });

    // ── Resend code ──────────────────────────────────────────────────
    document.getElementById('resendVerifyCode')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!pendingRegistration) return;
      const link = e.target;
      clearFieldError('verifyCode');
      link.style.pointerEvents = 'none';
      const originalText = link.textContent;
      link.textContent = 'Sending…';
      try {
        await window.SharedAuth.sendVerificationCode(pendingRegistration.email);
        document.getElementById('verifyCode').value = '';
        document.getElementById('verifyCode').focus();
        link.textContent = 'Code sent ✓';
        setTimeout(() => { link.textContent = originalText; }, 2500);
      } catch (err) {
        // Shown right next to the code field — a corner toast is easy to
        // miss while the modal has focus.
        setFieldError('verifyCode', err.message || 'Could not resend code. Please try again.');
        link.textContent = originalText;
      } finally {
        link.style.pointerEvents = '';
      }
    });

    // ── Global link intercept (navbar Sign In / Sign Up clicks) ──────
    document.addEventListener('click', e => {
      const link = e.target.closest('a');
      if (!link) return;

      const href      = link.getAttribute('href') || '';
      const cls       = link.className           || '';
      const isSignIn  = href.includes('login.html')  || cls.includes('btn-nav-signin');
      const isSignUp  = (href.includes('signin.html') || href.includes('signup.html') || cls.includes('btn-nav-signup'))
                        && !href.includes('Get_Started.html');

      if (isSignIn) {
        e.preventDefault();
        closeMobileMenus();
        openModal('login');
      } else if (isSignUp) {
        e.preventDefault();
        closeMobileMenus();
        openModal('register');
      }
    });
  }

  // ── Boot ───────────────────────────────────────────────────────────
  async function init() {
    injectModalHTML();
    Toast.init();
    initListeners();
    await window.SharedAuth.checkSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();