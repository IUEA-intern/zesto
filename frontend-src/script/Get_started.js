/**
 * get-started.js — Backend integration for the Get Started onboarding page
 *
 * API used:  POST /api/auth/register
 * Stack:     Express + MySQL + JWT (bcryptjs, jsonwebtoken)
 * Auth flow: register → receive { accessToken, refreshToken, user }
 *            → store tokens → redirect to index.html
 *
 * Endpoints consumed from the existing backend:
 *   POST /api/auth/register   → create account
 *   GET  /api/auth/me         → (optional) verify token after redirect
 */

/* ─────────────────────────────────────────────────────────────
   CONFIG  — change BASE_URL to match your server
───────────────────────────────────────────────────────────── */
const API_BASE = 'http://localhost:3000/api';

/* ─────────────────────────────────────────────────────────────
   TOKEN HELPERS
   Mirrors what your existing login.js does with localStorage
───────────────────────────────────────────────────────────── */
const Auth = {
  save(accessToken, refreshToken, user) {
    localStorage.setItem('accessToken',  accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user',         JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },
  getAccess()  { return localStorage.getItem('accessToken');  },
  getRefresh() { return localStorage.getItem('refreshToken'); },
  getUser()    { return JSON.parse(localStorage.getItem('user') || 'null'); },
  isLoggedIn() { return !!localStorage.getItem('accessToken'); },
};

/* ─────────────────────────────────────────────────────────────
   REDIRECT IF ALREADY LOGGED IN
───────────────────────────────────────────────────────────── */
if (Auth.isLoggedIn()) {
  window.location.href = 'index.html';
}

/* ─────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────── */
let currentRole = null;   // 'customer' | 'restaurant' | 'rider'
let currentStep = 1;      // 1 | 2 | 3

/* ─────────────────────────────────────────────────────────────
   STEP NAVIGATION
───────────────────────────────────────────────────────────── */
function goToStep(step) {
  // Hide all panels
  document.querySelectorAll('.gs-step').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + step).classList.add('active');

  // Update stepper circles
  for (let i = 1; i <= 3; i++) {
    const ind = document.getElementById('step-indicator-' + i);
    ind.className = 'step ' + (i < step ? 'done' : i === step ? 'active' : 'pending');
  }

  // Update connector lines
  for (let i = 1; i <= 2; i++) {
    const line = document.getElementById('line-' + i);
    line.className = 'step-line' + (i < step ? ' done' : '');
  }

  // Populate step 2 with role-specific copy
  if (step === 2 && currentRole) {
    const roleData = {
      customer:   {
        emoji: '🛒', label: 'Customer',
        title: 'Create your account',
        sub:   'Fill in your details to start ordering in minutes.',
        businessFieldVisible: false,
      },
      restaurant: {
        emoji: '🏪', label: 'Restaurant / Shop',
        title: 'Register your business',
        sub:   'Get your restaurant listed on Zesto and start receiving orders.',
        businessFieldVisible: true,
        businessLabel: 'Business name',
        businessPlaceholder: 'e.g. Burger Shack',
      },
      rider: {
        emoji: '🛵', label: 'Rider',
        title: 'Apply as a rider',
        sub:   'Join our fleet and start earning on your own schedule.',
        businessFieldVisible: true,
        businessLabel: 'Vehicle type',
        businessPlaceholder: 'e.g. Motorcycle, Bicycle, Car',
      },
    };

    const d = roleData[currentRole];
    document.getElementById('role-chip').textContent    = d.emoji + ' ' + d.label;
    document.getElementById('step2-title').textContent  = d.title;
    document.getElementById('step2-sub').textContent    = d.sub;

    const bf    = document.getElementById('business-field');
    const bLbl  = document.getElementById('business-label');
    const bInp  = document.getElementById('business-input');

    if (d.businessFieldVisible) {
      bf.style.display    = 'flex';
      bLbl.innerHTML      = d.businessLabel + ' <span style="color:var(--or);">*</span>';
      bInp.placeholder    = d.businessPlaceholder;
      bInp.required       = true;
    } else {
      bf.style.display  = 'none';
      bInp.required     = false;
    }
  }

  // Scroll right panel to top
  const panel = document.querySelector('.gs-right');
  if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' });

  currentStep = step;
}

/* ─────────────────────────────────────────────────────────────
   ROLE SELECTION
───────────────────────────────────────────────────────────── */
function selectRole(role) {
  currentRole = role;

  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('role-' + role).classList.add('selected');

  const nextBtn = document.getElementById('step1-next');
  if (nextBtn) nextBtn.disabled = false;
}

/* ─────────────────────────────────────────────────────────────
   PASSWORD STRENGTH METER
───────────────────────────────────────────────────────────── */
function checkStrength(val) {
  const bars  = ['ps1','ps2','ps3','ps4'].map(id => document.getElementById(id));
  const label = document.getElementById('strength-label');
  if (!bars[0] || !label) return;

  bars.forEach(b => { b.className = 'ps-bar'; });

  if (!val.length) {
    label.textContent = 'Use at least 8 characters, with a number and symbol.';
    label.style.color = '';
    return;
  }

  let score = 0;
  if (val.length >= 8)         score++;
  if (/[A-Z]/.test(val))       score++;
  if (/[0-9]/.test(val))       score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  const classes = ['', 'weak', 'medium', 'medium', 'strong'];
  const labels  = [
    '',
    'Weak — add numbers and symbols',
    'Medium — getting better!',
    'Good — add a symbol',
    'Strong password ✓',
  ];
  const colors  = ['', '#EF4444', '#F59E0B', '#F59E0B', '#22C55E'];

  for (let i = 0; i < score; i++) bars[i].classList.add(classes[score]);
  label.textContent = labels[score];
  label.style.color = colors[score];
}

/* ─────────────────────────────────────────────────────────────
   TOGGLE PASSWORD VISIBILITY
───────────────────────────────────────────────────────────── */
function togglePassword() {
  const input = document.getElementById('passwordInput');
  const icon  = document.getElementById('eye-icon');
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
               a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24
               A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8
               a18.5 18.5 0 0 1-2.16 3.19
               m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>`;
  } else {
    input.type = 'password';
    icon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>`;
  }
}

/* ─────────────────────────────────────────────────────────────
   UI HELPERS — show / hide errors, loading state
───────────────────────────────────────────────────────────── */
function showError(msg) {
  let box = document.getElementById('form-error-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'form-error-box';
    box.style.cssText = `
      background:#FEF2F2; border:1.5px solid #FECACA; border-radius:12px;
      padding:12px 16px; font-size:13px; color:#DC2626;
      margin-bottom:16px; display:flex; align-items:center; gap:8px;
    `;
    const form = document.getElementById('registerForm');
    form.insertAdjacentElement('beforebegin', box);
  }
  box.innerHTML = `<span style="font-size:16px;">⚠️</span> ${msg}`;
  box.style.display = 'flex';
}

function hideError() {
  const box = document.getElementById('form-error-box');
  if (box) box.style.display = 'none';
}

function setLoading(loading) {
  const btn = document.getElementById('submit-btn');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2"
           style="animation:spin .7s linear infinite;">
        <path d="M21 12a9 9 0 1 1-6-8.485"/>
      </svg>
      Creating account…`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `
      Create my account
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           style="width:18px;height:18px;">
        <path d="M5 12h14M14 7l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }
}

// CSS spinner keyframe (injected once)
const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(spinStyle);

/* ─────────────────────────────────────────────────────────────
   COLLECT FORM VALUES
───────────────────────────────────────────────────────────── */
function getFormValues() {
  return {
    firstName:    document.getElementById('firstName')?.value.trim()    || '',
    lastName:     document.getElementById('lastName')?.value.trim()     || '',
    email:        document.getElementById('emailInput')?.value.trim()   || '',
    phone:        document.getElementById('phoneInput')?.value.trim()   || '',
    password:     document.getElementById('passwordInput')?.value       || '',
    businessName: document.getElementById('business-input')?.value.trim() || '',
    terms:        document.getElementById('termsCheck')?.checked        || false,
  };
}

/* ─────────────────────────────────────────────────────────────
   CLIENT-SIDE VALIDATION
   (matches server rules in authService.js)
───────────────────────────────────────────────────────────── */
function validate(values) {
  const { firstName, lastName, email, phone, password, businessName, terms } = values;

  if (!firstName || !lastName)
    return 'Please enter your first and last name.';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return 'Please enter a valid email address.';

  if (!phone || phone.replace(/\D/g, '').length < 9)
    return 'Please enter a valid phone number.';

  if (password.length < 6)
    return 'Password must be at least 6 characters.';  // mirrors server rule

  if (currentRole !== 'customer' && !businessName)
    return currentRole === 'rider'
      ? 'Please enter your vehicle type.'
      : 'Please enter your business name.';

  if (!terms)
    return 'You must agree to the Terms of Service and Privacy Policy.';

  return null; // valid
}

/* ─────────────────────────────────────────────────────────────
   API CALL  — POST /api/auth/register
   Request body matches authService.register():
     { name, email, phone, password, delivery_address? }

   NOTE: the existing schema has role ENUM('customer','admin').
   Restaurant / rider roles aren't in the DB yet — we add a
   note field to name so you can filter them server-side later,
   or extend the schema with a role column.
───────────────────────────────────────────────────────────── */
async function registerUser(values) {
  const fullName = values.firstName + ' ' + values.lastName;

  // Build name with role tag for restaurant/rider so backend can filter
  // e.g.  "Burger Shack [restaurant]"  or  "John Doe [rider:Motorcycle]"
  let name = fullName;
  if (currentRole === 'restaurant' && values.businessName)
    name = values.businessName + ' [restaurant]';
  if (currentRole === 'rider' && values.businessName)
    name = fullName + ' [rider:' + values.businessName + ']';

  const payload = {
  name,
  email:    values.email,
  phone:    values.phone,
  password: values.password,
  role:     currentRole,   // 'customer' | 'restaurant' | 'rider'
};

  const res = await fetch(`${API_BASE}/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    // Server returns { error: "..." }  (AppError shape from authService)
    throw new Error(data.error || 'Registration failed. Please try again.');
  }

  // data = { accessToken, refreshToken, user: { id, name, email, phone } }
  return data;
}

/* ─────────────────────────────────────────────────────────────
   SHOW STEP 3 — SUCCESS STATE
───────────────────────────────────────────────────────────── */
function showSuccess(user) {
  goToStep(3);

  // Personalise the welcome message with the user's first name
  const title = document.getElementById('step3-welcome');
  if (title && user?.name) {
    const firstName = user.name.split(' ')[0];
    title.textContent = `Welcome, ${firstName}! 🎉`;
  }
}

/* ─────────────────────────────────────────────────────────────
   MAIN FORM SUBMIT HANDLER
───────────────────────────────────────────────────────────── */
async function handleSignup(e) {
  e.preventDefault();
  hideError();

  const values = getFormValues();

  // 1. Client-side validation
  const validationError = validate(values);
  if (validationError) {
    showError(validationError);
    return;
  }

  // 2. Send to API
  setLoading(true);
  try {
    const { accessToken, refreshToken, user } = await registerUser(values);

    // 3. Persist tokens (same pattern as existing login.js)
    Auth.save(accessToken, refreshToken, user);

    // 4. Show success step
    showSuccess(user);

  } catch (err) {
    // Map known server messages to friendly copy
    let msg = err.message;
    if (msg.includes('Duplicate'))
      msg = 'An account with this email or phone already exists. <a href="signin.html" style="color:var(--or);font-weight:700;">Sign in instead?</a>';
    if (msg.includes('Too many registration'))
      msg = 'Too many attempts. Please wait a few minutes and try again.';

    showError(msg);
  } finally {
    setLoading(false);
  }
}

/* ─────────────────────────────────────────────────────────────
   TOKEN REFRESH HELPER
   Call this anywhere you get a 401 "Access token expired" response.
   Matches the existing /api/auth/refresh endpoint.
───────────────────────────────────────────────────────────── */
async function refreshAccessToken() {
  const refreshToken = Auth.getRefresh();
  if (!refreshToken) { Auth.clear(); window.location.href = 'signin.html'; return null; }

  const res  = await fetch(`${API_BASE}/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    Auth.clear();
    window.location.href = 'signin.html';
    return null;
  }

  const { accessToken, refreshToken: newRefresh } = await res.json();
  localStorage.setItem('accessToken',  accessToken);
  localStorage.setItem('refreshToken', newRefresh);
  return accessToken;
}

/* ─────────────────────────────────────────────────────────────
   EXPOSE GLOBALLY (called from HTML onclick / onsubmit)
───────────────────────────────────────────────────────────── */
window.selectRole      = selectRole;
window.goToStep        = goToStep;
window.checkStrength   = checkStrength;
window.togglePassword  = togglePassword;
window.handleSignup    = handleSignup;
window.refreshAccessToken = refreshAccessToken;
