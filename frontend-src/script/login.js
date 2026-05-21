 /* ─────────────────────────────────
     Sign-in form (original)
  ───────────────────────────────── */
  function togglePassword() {
    const input = document.getElementById('password');
    const icon  = document.getElementById('eyeIcon');
    if (input.type === 'password') {
      input.type = 'text';
      icon.innerHTML = `<path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M4.2 4.3C2.7 5.3 1.5 7 1.5 7s2.2 4.5 6.5 4.5c1 0 1.9-.2 2.7-.6M6 3.6C6.5 3.5 7 3.5 7.5 3.5c4.3 0 6.5 4.5 6.5 4.5s-.6 1.2-1.8 2.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/>`;
    } else {
      input.type = 'password';
      icon.innerHTML = `<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/>`;
    }
  }

  function handleLogin(e) {
    e.preventDefault();
    const email  = document.getElementById('email').value;
    const pass   = document.getElementById('password').value;
    const errEl  = document.getElementById('errorMsg');
    const btn    = document.querySelector('.lf-submit');

    if (email !== 'demo@zesto.com' || pass !== 'password') {
      errEl.classList.add('show');
      document.getElementById('email').classList.add('error');
      document.getElementById('password').classList.add('error');
    } else {
      errEl.classList.remove('show');
      btn.textContent = '✓ Welcome back!';
      btn.style.background = '#22C55E';
    }
  }

  ['email','password'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById(id).classList.remove('error');
      document.getElementById('errorMsg').classList.remove('show');
    });
  });

  /* ─────────────────────────────────
     Forgot Password — state
  ───────────────────────────────── */
  let currentStep = 1;
  let countdownTimer = null;
  // Demo: valid emails that "exist" in the system
  const VALID_EMAILS = ['demo@zesto.com', 'user@example.com', 'test@zesto.com'];
  // Demo OTP (in a real app this comes from the server)
  const DEMO_OTP = '123456';

  function openFP() {
    // Pre-fill email from sign-in form if available
    const mainEmail = document.getElementById('email').value;
    if (mainEmail) document.getElementById('fpEmail').value = mainEmail;

    goStep(1);
    document.getElementById('fpOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('fpEmail').focus(), 320);
  }

  function closeFP() {
    document.getElementById('fpOverlay').classList.remove('open');
    document.body.style.overflow = '';
    if (countdownTimer) clearInterval(countdownTimer);
    // Reset after animation
    setTimeout(resetFPForm, 350);
  }

  function closeFPAndFocus() {
    closeFP();
    setTimeout(() => document.getElementById('email').focus(), 400);
  }

  function resetFPForm() {
    goStep(1, true);
    document.getElementById('fpEmail').value = '';
    document.getElementById('fpNewPw').value = '';
    document.getElementById('fpConfirmPw').value = '';
    clearOTP();
    ['fpErr1','fpErr2','fpErr3'].forEach(id => document.getElementById(id).classList.remove('show'));
    document.getElementById('strengthFill').style.width = '0%';
    document.getElementById('strengthLabel').textContent = '';
  }

  function goStep(n, silent) {
    // hide current
    document.getElementById('fpStep' + currentStep).classList.remove('active');
    currentStep = n;
    document.getElementById('fpStep' + n).classList.add('active');

    // update dots
    for (let i = 1; i <= 3; i++) {
      const dot = document.getElementById('dot' + i);
      dot.classList.remove('active','done');
      if (i < n) dot.classList.add('done');
      else if (i === n) dot.classList.add('active');
    }
    // hide progress on success step
    document.getElementById('fpProgress').style.display = (n === 4) ? 'none' : 'flex';
  }

  /* ─────────────────────────────────
     Step 1 → send code
  ───────────────────────────────── */
  function sendCode() {
    const email = document.getElementById('fpEmail').value.trim();
    const errEl = document.getElementById('fpErr1');

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      document.getElementById('fpEmail').classList.add('error');
      errEl.querySelector('span') && null;
      errEl.textContent = '';
      errEl.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 10.5v.5" stroke-linecap="round"/></svg> Please enter a valid email address.';
      errEl.classList.add('show');
      return;
    }

    // Demo: check if email "exists"
    if (!VALID_EMAILS.includes(email.toLowerCase())) {
      document.getElementById('fpEmail').classList.add('error');
      errEl.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 10.5v.5" stroke-linecap="round"/></svg> We couldn\'t find an account with that email.';
      errEl.classList.add('show');
      return;
    }

    errEl.classList.remove('show');
    document.getElementById('fpEmail').classList.remove('error');
    document.getElementById('fpEmailDisplay').textContent = email;
    goStep(2);
    startCountdown();
    setTimeout(() => document.getElementById('otp0').focus(), 320);
  }

  document.getElementById('fpEmail').addEventListener('input', () => {
    document.getElementById('fpEmail').classList.remove('error');
    document.getElementById('fpErr1').classList.remove('show');
  });

  /* ─────────────────────────────────
     OTP inputs
  ───────────────────────────────── */
  function clearOTP() {
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById('otp' + i);
      el.value = '';
      el.classList.remove('filled','error');
    }
    document.getElementById('fpVerifyBtn').disabled = true;
  }

  function initOTP() {
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById('otp' + i);

      el.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val;
        document.getElementById('fpErr2').classList.remove('show');

        if (val) {
          e.target.classList.add('filled');
          e.target.classList.remove('error');
          if (i < 5) document.getElementById('otp' + (i+1)).focus();
        } else {
          e.target.classList.remove('filled');
        }

        // enable verify once all filled
        const code = getOTPValue();
        document.getElementById('fpVerifyBtn').disabled = code.length < 6;
      });

      el.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          document.getElementById('otp' + (i-1)).focus();
        }
        // allow paste
      });

      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
        for (let j = 0; j < text.length; j++) {
          const inp = document.getElementById('otp' + j);
          if (inp) { inp.value = text[j]; inp.classList.add('filled'); }
        }
        const next = document.getElementById('otp' + Math.min(text.length, 5));
        if (next) next.focus();
        document.getElementById('fpVerifyBtn').disabled = getOTPValue().length < 6;
      });
    }
  }

  function getOTPValue() {
    let v = '';
    for (let i = 0; i < 6; i++) v += (document.getElementById('otp' + i).value || '');
    return v;
  }

  /* ─────────────────────────────────
     Resend countdown
  ───────────────────────────────── */
  function startCountdown() {
    const msg = document.getElementById('resendMsg');
    const cd  = document.getElementById('resendCountdown');
    const num = document.getElementById('countdownNum');
    msg.style.display = 'none';
    cd.style.display  = 'inline';
    let secs = 30;
    num.textContent = secs;
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      secs--;
      num.textContent = secs;
      if (secs <= 0) {
        clearInterval(countdownTimer);
        cd.style.display  = 'none';
        msg.style.display = 'inline';
      }
    }, 1000);
  }

  function resendCode() {
    clearOTP();
    document.getElementById('fpErr2').classList.remove('show');
    startCountdown();
    document.getElementById('otp0').focus();
    // Show a brief toast-like feedback
    const sub = document.getElementById('fpStep2Sub');
    sub.style.color = '#22C55E';
    sub.textContent = 'Code resent! Check your inbox.';
    setTimeout(() => {
      sub.style.color = '';
      sub.innerHTML = 'We sent a 6-digit code to <strong id="fpEmailDisplay">' + document.getElementById('fpEmailDisplay').textContent + '</strong>. Enter it below.';
    }, 2000);
  }

  /* ─────────────────────────────────
     Step 2 → verify code
  ───────────────────────────────── */
  function verifyCode() {
    const code = getOTPValue();
    const btn  = document.getElementById('fpVerifyBtn');

    // loading state
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="animation:spin .7s linear infinite"><circle cx="8" cy="8" r="5" stroke-dasharray="18" stroke-dashoffset="6"/></svg> Verifying…';

    // Simulate async check
    setTimeout(() => {
      if (code === DEMO_OTP) {
        document.getElementById('fpErr2').classList.remove('show');
        goStep(3);
        setTimeout(() => document.getElementById('fpNewPw').focus(), 320);
      } else {
        for (let i = 0; i < 6; i++) document.getElementById('otp' + i).classList.add('error');
        document.getElementById('fpErr2').classList.add('show');
        btn.disabled = false;
        btn.innerHTML = 'Verify code <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
      }
    }, 900);
  }

  /* ─────────────────────────────────
     Password strength meter
  ───────────────────────────────── */
  function checkStrength(pw) {
    const fill  = document.getElementById('strengthFill');
    const label = document.getElementById('strengthLabel');
    if (!pw) { fill.style.width = '0%'; label.textContent = ''; return; }

    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const levels = [
      { w: '20%', c: '#E53E3E', t: 'Too weak' },
      { w: '40%', c: '#DD6B20', t: 'Weak' },
      { w: '60%', c: '#D69E2E', t: 'Fair' },
      { w: '80%', c: '#38A169', t: 'Good' },
      { w: '100%',c: '#22C55E', t: 'Strong 💪' }
    ];
    const lvl = levels[Math.min(score, 4)];
    fill.style.width      = lvl.w;
    fill.style.background = lvl.c;
    label.textContent     = lvl.t;
    label.style.color     = lvl.c;
  }

  function toggleFPPw(inputId, btn) {
    const inp = document.getElementById(inputId);
    const svg = btn.querySelector('svg');
    if (inp.type === 'password') {
      inp.type = 'text';
      svg.innerHTML = `<path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M4.2 4.3C2.7 5.3 1.5 7 1.5 7s2.2 4.5 6.5 4.5c1 0 1.9-.2 2.7-.6M6 3.6C6.5 3.5 7 3.5 7.5 3.5c4.3 0 6.5 4.5 6.5 4.5s-.6 1.2-1.8 2.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/>`;
    } else {
      inp.type = 'password';
      svg.innerHTML = `<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/>`;
    }
  }

  /* ─────────────────────────────────
     Step 3 → reset password
  ───────────────────────────────── */
  function resetPassword() {
    const pw1 = document.getElementById('fpNewPw').value;
    const pw2 = document.getElementById('fpConfirmPw').value;
    const err = document.getElementById('fpErr3');

    if (pw1.length < 8) {
      err.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 10.5v.5" stroke-linecap="round"/></svg> Password must be at least 8 characters.';
      err.classList.add('show');
      document.getElementById('fpNewPw').classList.add('error');
      return;
    }
    if (pw1 !== pw2) {
      err.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 10.5v.5" stroke-linecap="round"/></svg> Passwords don\'t match. Please try again.';
      err.classList.add('show');
      document.getElementById('fpConfirmPw').classList.add('error');
      return;
    }
    err.classList.remove('show');
    goStep(4);
  }

  ['fpNewPw','fpConfirmPw'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById(id).classList.remove('error');
      document.getElementById('fpErr3').classList.remove('show');
    });
  });

  /* ─────────────────────────────────
     Dismiss overlay on backdrop click
  ───────────────────────────────── */
  document.getElementById('fpOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFP();
  });

  /* ESC key */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('fpOverlay').classList.contains('open')) closeFP();
  });

  /* ─────────────────────────────────
     Spin keyframe (for loading state)
  ───────────────────────────────── */
  const styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(styleEl);

  /* Init OTP listeners */
  initOTP();
