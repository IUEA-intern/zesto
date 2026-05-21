function togglePw(fieldId, iconId) {
    const input = document.getElementById(fieldId);
    const icon  = document.getElementById(iconId);
    if (input.type === 'password') {
      input.type = 'text';
      icon.innerHTML = '<path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M4.2 4.3C2.7 5.3 1.5 7 1.5 7s2.2 4.5 6.5 4.5c1 0 1.9-.2 2.7-.6M6 3.6C6.5 3.5 7 3.5 7.5 3.5c4.3 0 6.5 4.5 6.5 4.5s-.6 1.2-1.8 2.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/>';
    } else {
      input.type = 'password';
      icon.innerHTML = '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/>';
    }
  }

  function checkStrength(val) {
    const bars = ['bar1','bar2','bar3'].map(id => document.getElementById(id));
    const hint = document.getElementById('pwHint');
    bars.forEach(b => { b.className = 'pw-bar'; });
    let score = 0;
    if (val.length >= 8) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^a-zA-Z0-9]/.test(val)) score++;
    const cls   = ['','weak','fair','strong'];
    const hints = ['Use 8+ characters with numbers and symbols','Add numbers or symbols to strengthen','Add a symbol to make it stronger','Strong password!'];
    for (let i = 0; i < score; i++) bars[i].classList.add(cls[score]);
    hint.textContent = hints[score];
  }

  function handleSignup(e) {
    e.preventDefault();
    const pw   = document.getElementById('password').value;
    const conf = document.getElementById('confirm').value;
    const errEl = document.getElementById('errorMsg');
    const errTx = document.getElementById('errorText');
    const btn   = document.querySelector('.lf-submit');

    if (pw.length < 8) {
      errTx.textContent = 'Password must be at least 8 characters.';
      errEl.classList.add('show');
      document.getElementById('password').classList.add('error');
      return;
    }
    if (pw !== conf) {
      errTx.textContent = 'Passwords do not match. Please try again.';
      errEl.classList.add('show');
      document.getElementById('confirm').classList.add('error');
      return;
    }

    errEl.classList.remove('show');
    btn.innerHTML = '✓ Account created!';
    btn.style.background = '#22C55E';
    btn.disabled = true;
  }

  ['fname','lname','email','phone','password','confirm'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById(id).classList.remove('error');
      document.getElementById('errorMsg').classList.remove('show');
    });
  });