/**
 * get-started.js — Backend integration for the Get Started onboarding page
 * Consumes API methods from SharedAuth.
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   STATE
   ───────────────────────────────────────────────────────────── */
let currentRole = null;   // 'restaurant' | 'rider'
let currentStep = 1;      // 1 | 2 | 3

/* ─────────────────────────────────────────────────────────────
   REDIRECT IF ALREADY LOGGED IN
   ───────────────────────────────────────────────────────────── */
(async function checkExistingSession() {
  // Let shared auth check first
  if (window.SharedAuth) {
    const res = await window.SharedAuth.checkSession();
    if (res && res.user) {
      window.location.href = 'index.html';
    }
  }
})();

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
    if (ind) {
      ind.className = 'step ' + (i < step ? 'done' : i === step ? 'active' : 'pending');
    }
  }

  // Update connector lines
  for (let i = 1; i <= 2; i++) {
    const line = document.getElementById('line-' + i);
    if (line) {
      line.className = 'step-line' + (i < step ? ' done' : '');
    }
  }

  // Populate step 2 with role-specific copy and forms
  if (step === 2 && currentRole) {
    const roleData = {
      restaurant: {
        emoji: '🏪', label: 'Restaurant / Shop',
        title: 'Register your business',
        sub:   'Get your restaurant listed on Zesto and start receiving orders.',
      },
      rider: {
        emoji: '🛵', label: 'Rider',
        title: 'Apply as a rider',
        sub:   'Join our fleet and start earning on your own schedule.',
      },
    };

    const d = roleData[currentRole];
    document.getElementById('role-chip').textContent    = d.emoji + ' ' + d.label;
    document.getElementById('step2-title').textContent  = d.title;
    document.getElementById('step2-sub').textContent    = d.sub;

    const bf    = document.getElementById('business-field');
    const bLbl  = document.getElementById('business-label');
    const bInp  = document.getElementById('business-input');
    
    const restAddr = document.getElementById('restaurant-address-field');
    const restDesc = document.getElementById('restaurant-desc-field');
    const restAddrInp = document.getElementById('restaurant-address-input');

    const riderVehType = document.getElementById('rider-vehicle-type-field');
    const riderVehNum = document.getElementById('rider-vehicle-num-field');
    const riderNatId = document.getElementById('rider-national-id-field');
    const riderVehNumInp = document.getElementById('rider-vehicle-num-input');
    const riderNatIdInp = document.getElementById('rider-national-id-input');

    // Reset visibility and required state
    bf.style.display = 'none';
    bInp.required = false;
    restAddr.style.display = 'none';
    restAddrInp.required = false;
    restDesc.style.display = 'none';
    riderVehType.style.display = 'none';
    riderVehNum.style.display = 'none';
    riderVehNumInp.required = false;
    riderNatId.style.display = 'none';
    riderNatIdInp.required = false;

    if (currentRole === 'restaurant') {
      bf.style.display    = 'flex';
      bLbl.innerHTML      = 'Business name <span style="color:var(--or);">*</span>';
      bInp.placeholder    = 'e.g. Burger Shack';
      bInp.required       = true;
      restAddr.style.display = 'flex';
      restAddrInp.required = true;
      restDesc.style.display = 'flex';
    } else if (currentRole === 'rider') {
      riderVehType.style.display = 'flex';
      riderVehNum.style.display = 'flex';
      riderVehNumInp.required = true;
      riderNatId.style.display = 'flex';
      riderNatIdInp.required = true;
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
  if (role === 'customer') return; // customer is removed
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
    const form = document.querySelector('.gs-form');
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
  const btn = document.querySelector('.gs-form button[type="submit"]');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2"
           style="animation:spin .7s linear infinite; margin-right: 8px;">
        <path d="M21 12a9 9 0 1 1-6-8.485"/>
      </svg>
      Creating account…`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `
      Create my account
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           style="width:18px;height:18px; margin-left: 8px;">
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
    address:      document.getElementById('restaurant-address-input')?.value.trim() || '',
    description:  document.getElementById('restaurant-desc-input')?.value.trim() || '',
    vehicleType:  document.getElementById('rider-vehicle-type-input')?.value || '',
    vehicleNumber:document.getElementById('rider-vehicle-num-input')?.value.trim() || '',
    nationalId:   document.getElementById('rider-national-id-input')?.value.trim() || '',
    terms:        document.getElementById('termsCheck')?.checked        || false,
  };
}

/* ─────────────────────────────────────────────────────────────
   CLIENT-SIDE VALIDATION
   ───────────────────────────────────────────────────────────── */
function validate(values) {
  const { firstName, lastName, email, phone, password, businessName, address, vehicleType, vehicleNumber, nationalId, terms } = values;

  if (!firstName || !lastName)
    return 'Please enter your first and last name.';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return 'Please enter a valid email address.';

  if (!phone)
    return 'Please enter a valid phone number.';

  if (password.length < 6)
    return 'Password must be at least 6 characters.';

  if (currentRole === 'restaurant') {
    if (!businessName) return 'Please enter your business name.';
    if (!address) return 'Please enter your business address.';
  }

  if (currentRole === 'rider') {
    if (!vehicleType) return 'Please select your vehicle type.';
    if (!vehicleNumber) return 'Please enter your vehicle registration number.';
    if (!nationalId) return 'Please enter your national ID.';
  }

  if (!terms)
    return 'You must agree to the Terms of Service and Privacy Policy.';

  return null; // valid
}

/* ─────────────────────────────────────────────────────────────
   API CALLS via SharedAuth
   ───────────────────────────────────────────────────────────── */
async function registerUser(values) {
  const payload = {
    name: `${values.firstName} ${values.lastName}`.trim(),
    email: values.email,
    phone: values.phone,
    password: values.password,
    // Restaurant specific
    businessName: values.businessName,
    address: values.address,
    description: values.description,
    // Rider specific
    vehicleType: values.vehicleType,
    vehicleNumber: values.vehicleNumber,
    nationalId: values.nationalId
  };

  if (!window.SharedAuth) {
    throw new Error('Auth script not loaded. Please refresh and try again.');
  }

  if (currentRole === 'restaurant') {
    return await window.SharedAuth.registerRestaurant(payload);
  } else {
    return await window.SharedAuth.registerRider(payload);
  }
}

/* ─────────────────────────────────────────────────────────────
   SHOW STEP 3 — SUCCESS STATE
   ───────────────────────────────────────────────────────────── */
function showSuccess(user) {
  goToStep(3);

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
    const res = await registerUser(values);
    
    // Save to local storage for backward compatibility
    localStorage.setItem('zesto_user', JSON.stringify(res.user));

    // 3. Show success step
    showSuccess(res.user);

  } catch (err) {
    let msg = err.message;
    if (msg.includes('Duplicate') || msg.includes('already registered'))
      msg = 'An account with this email already exists.';
    showError(msg);
  } finally {
    setLoading(false);
  }
}

/* ─────────────────────────────────────────────────────────────
   EXPOSE GLOBALLY (called from HTML onclick / onsubmit)
   ───────────────────────────────────────────────────────────── */
window.selectRole      = selectRole;
window.goToStep        = goToStep;
window.checkStrength   = checkStrength;
window.togglePassword  = togglePassword;
window.handleSignup    = handleSignup;
