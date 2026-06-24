(function(){
  // Shake animation utility
  function shakeElement(el) {
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => { el.classList.remove('shake'); }, 400);
  }

  // Delete account modal flow
  const deleteOverlay = document.getElementById('deleteModal');
  const deleteOpenBtns = document.querySelectorAll('.delete-button');
  const closeDeleteBtn = document.getElementById('closeDelete');
  const cancelStep1 = document.getElementById('cancelStep1');
  const continueBtn = document.getElementById('continueStep1');
  const backBtn = document.getElementById('backStep2');
  const deleteBtn = document.getElementById('deleteConfirm');
  const reasonSel = document.getElementById('deleteReason');
  const feedback = document.getElementById('deleteFeedback');
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const confirmCheckbox = document.getElementById('confirmDelete');

  function openDeleteModal(){
    deleteOverlay.style.display = 'flex';
    showDeleteStep(1);
  }
  function closeDeleteModal(){
    deleteOverlay.style.display = 'none';
  }
  function showDeleteStep(n){
    step1.classList.toggle('active', n===1);
    step2.classList.toggle('active', n===2);
  }

  deleteOpenBtns.forEach(b=>b.addEventListener('click', e=>{ e.preventDefault(); openDeleteModal(); }));
  closeDeleteBtn.addEventListener('click', closeDeleteModal);
  cancelStep1.addEventListener('click', closeDeleteModal);
  backBtn.addEventListener('click', ()=>{ showDeleteStep(1); });

  reasonSel.addEventListener('change', ()=>{ continueBtn.style.opacity = reasonSel.value ? '1' : '0.6'; continueBtn.style.cursor = reasonSel.value ? 'pointer' : 'not-allowed'; });
  continueBtn.addEventListener('click', ()=>{ 
    if(!reasonSel.value) { shakeElement(continueBtn); return; }
    showDeleteStep(2); 
  });
  confirmCheckbox.addEventListener('change', ()=>{ deleteBtn.style.opacity = confirmCheckbox.checked ? '1' : '0.6'; deleteBtn.style.cursor = confirmCheckbox.checked ? 'pointer' : 'not-allowed'; });

  deleteBtn.addEventListener('click', async ()=>{
    if(!confirmCheckbox.checked){ shakeElement(deleteBtn); return; }
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';
    const payload = { reason: reasonSel.value, feedback: feedback.value };
    try{
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        window.location.href = 'index.html';
      } else {
        const txt = await res.text();
        alert('Unable to delete account: ' + (txt || res.statusText));
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete account';
      }
    }catch(err){
      alert('Network error while deleting account.');
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete account';
    }
  });

  deleteOverlay.addEventListener('click', (e)=>{ if(e.target===deleteOverlay) closeDeleteModal(); });

  // Email editor, logout confirmation, and language selection
  const editEmailBtn = document.getElementById('editEmailBtn');
  const editEmailModal = document.getElementById('editEmailModal');
  const editEmailInput = document.getElementById('editEmailInput');
  const emailError = document.getElementById('emailError');
  const saveEmail = document.getElementById('saveEmail');
  const usernameEmail = document.getElementById('usernameEmail');
  const logoutItem = document.getElementById('logoutItem');
  const logoutModal = document.getElementById('logoutModal');
  const confirmLogout = document.getElementById('confirmLogout');
  const languageItem = document.getElementById('languageItem');
  const languageModal = document.getElementById('languageModal');
  const saveLanguage = document.getElementById('saveLanguage');
  const languageSelect = document.getElementById('languageSelect');

  if(editEmailBtn){
    editEmailBtn.addEventListener('click', ()=>{
      editEmailInput.value = usernameEmail.textContent.trim();
      if(emailError) emailError.textContent = '';
      editEmailInput.removeAttribute('aria-invalid');
      editEmailModal.style.display = 'flex';
      editEmailModal.setAttribute('aria-hidden','false');
    });
  }
  editEmailModal.querySelectorAll('[data-close="editemail"]').forEach(b=>b.addEventListener('click', ()=>{ editEmailModal.style.display='none'; editEmailModal.setAttribute('aria-hidden','true'); }));
  if(editEmailInput){
    editEmailInput.addEventListener('input', ()=>{
      if(emailError) emailError.textContent = '';
      editEmailInput.removeAttribute('aria-invalid');
    });
  }
  saveEmail.addEventListener('click', async ()=>{
    const v = editEmailInput.value.trim();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!validEmail.test(v)){
      if(emailError) emailError.textContent = '* Email address is invalid.';
      editEmailInput.setAttribute('aria-invalid','true');
      shakeElement(saveEmail);
      return;
    }
    if(emailError) emailError.textContent = '';
    editEmailInput.removeAttribute('aria-invalid');
    usernameEmail.textContent = v;
    editEmailModal.style.display='none';
    editEmailModal.setAttribute('aria-hidden','true');
    try{ await fetch('/api/account', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:v}) }); }catch(e){}
  });

  if(logoutItem) logoutItem.addEventListener('click', ()=>{ logoutModal.style.display='flex'; logoutModal.setAttribute('aria-hidden','false'); });
  logoutModal.querySelectorAll('[data-close="logout"]').forEach(b=>b.addEventListener('click', ()=>{ logoutModal.style.display='none'; logoutModal.setAttribute('aria-hidden','true'); }));
  confirmLogout.addEventListener('click', async ()=>{
    try{ await fetch('/api/auth/logout', { method:'POST' }); }catch(e){}
    window.location.href = 'index.html';
  });

  if(languageItem) languageItem.addEventListener('click', ()=>{ languageModal.style.display='flex'; languageModal.setAttribute('aria-hidden','false'); });
  languageModal.querySelectorAll('[data-close="language"]').forEach(b=>b.addEventListener('click', ()=>{ languageModal.style.display='none'; languageModal.setAttribute('aria-hidden','true'); }));
  saveLanguage.addEventListener('click', async ()=>{
    const lang = languageSelect.value;
    if(!lang) { shakeElement(saveLanguage); return alert('Select a language'); }
    languageModal.style.display='none';
    languageModal.setAttribute('aria-hidden','true');
    try{ await fetch('/api/account/language', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({language:lang}) }); }catch(e){}
    alert('Language set to ' + lang);
  });

  [editEmailModal, logoutModal, languageModal].forEach(m=> m.addEventListener('click', (e)=>{ if(e.target===m){ m.style.display='none'; m.setAttribute('aria-hidden','true'); } }));

  // Promo, phone, cards and addresses modals + JS
  const promoItem = document.getElementById('promoItem');
  const promoModal = document.getElementById('promoModal');
  const promoInput = document.getElementById('promoInput');
  const addPromoBtn = document.getElementById('addPromoBtn');
  const faqItem = document.getElementById('faqItem');
  const faqDropdown = document.getElementById('faqDropdown');

  if(promoItem) promoItem.addEventListener('click', ()=>{ promoModal.style.display='flex'; promoModal.setAttribute('aria-hidden','false'); });
  promoModal.querySelectorAll('[data-close="promo"]').forEach(b=>b.addEventListener('click', ()=>{ promoModal.style.display='none'; promoModal.setAttribute('aria-hidden','true'); }));
  addPromoBtn.addEventListener('click', async ()=>{
    const code = promoInput.value.trim(); if(!code) { shakeElement(addPromoBtn); return alert('Enter a promo code'); }
    try{ await fetch('/api/account/promo', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code}) }); }catch(e){}
    alert('Promo added: ' + code);
    promoInput.value='';
  });

  if(faqItem && faqDropdown){
    const faqButtons = faqDropdown.querySelectorAll('.faq-question');
    const toggleFaq = ()=>{
      const isOpen = faqDropdown.classList.toggle('open');
      faqItem.classList.toggle('open', isOpen);
      faqItem.setAttribute('aria-expanded', String(isOpen));
    };
    faqItem.addEventListener('click', toggleFaq);
    faqItem.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); toggleFaq(); } });
    faqButtons.forEach(button=>{
      button.addEventListener('click', ()=>{
        const entry = button.closest('.faq-entry');
        const isActive = entry.classList.toggle('open');
        if(isActive){
          faqButtons.forEach(other=>{ const otherEntry = other.closest('.faq-entry'); if(otherEntry !== entry) otherEntry.classList.remove('open'); });
        }
      });
    });
  }

  const manageCardsBtn = document.getElementById('manageCardsBtn');
  const cardsModal = document.getElementById('cardsModal');
  if(manageCardsBtn) manageCardsBtn.addEventListener('click', ()=>{ cardsModal.style.display='flex'; cardsModal.setAttribute('aria-hidden','false'); });
  cardsModal.querySelectorAll('[data-close="cards"]').forEach(b=>b.addEventListener('click', ()=>{ cardsModal.style.display='none'; cardsModal.setAttribute('aria-hidden','true'); clearCardErrors(); }));
  document.getElementById('addCardBtn').addEventListener('click', ()=>{ clearCardErrors(); document.getElementById('cardEntry').style.display='block'; document.getElementById('cardNumber').focus(); });
  document.getElementById('addPaypalBtn').addEventListener('click', ()=>{ alert('We will redirect you to PayPal (demo)'); window.open('https://www.paypal.com', '_blank'); });

  const cardsListEl = document.getElementById('cardsList');
  const savedCardsCountEl = document.getElementById('savedCardsCount');
  let cards = [];
  let editingCardIdx = null;
  const cardEntryEl = document.getElementById('cardEntry');
  const cardNumberInput = document.getElementById('cardNumber');
  const cardExpiryInput = document.getElementById('cardExpiry');
  const cardCvcInput = document.getElementById('cardCvc');
  const cardCountrySelect = document.getElementById('cardCountry');
  const cardPostalInput = document.getElementById('cardPostal');
  const cardAutoPayCheckbox = document.getElementById('cardAutoPay');

  // Card error elements
  const cardNumberError = document.getElementById('cardNumberError');
  const cardExpiryError = document.getElementById('cardExpiryError');
  const cardCvcError = document.getElementById('cardCvcError');
  const cardCountryError = document.getElementById('cardCountryError');
  const cardPostalError = document.getElementById('cardPostalError');

  function clearCardErrors(){
    if(cardNumberError) cardNumberError.textContent = '';
    if(cardExpiryError) cardExpiryError.textContent = '';
    if(cardCvcError) cardCvcError.textContent = '';
    if(cardCountryError) cardCountryError.textContent = '';
    if(cardPostalError) cardPostalError.textContent = '';
  }

  function maskNumber(num){ return '•••• •••• •••• ' + (num.slice(-4) || '0000'); }
  function updateSavedCardsCount(){
    if(!savedCardsCountEl) return;
    const count = cards.length;
    savedCardsCountEl.textContent = count === 1 ? '1 method' : `${count} methods`;
  }
  function renderCards(){
    updateSavedCardsCount();
    if(!cardsListEl) return;
    if(cards.length===0){ cardsListEl.textContent = 'You have no saved payment methods.'; return; }
    cardsListEl.innerHTML = '';
    cards.forEach((c, idx)=>{
      const cardRow = document.createElement('div');
      cardRow.style.display='flex'; cardRow.style.justifyContent='space-between'; cardRow.style.alignItems='center'; cardRow.style.padding='10px 0';
      const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:700">${maskNumber(c.number)}</div><div style="color:var(--mid);font-size:13px">${c.country} • ${c.expiry} ${c.autopay?'<span style="color:var(--or);margin-left:8px">Auto-pay</span>':''}</div>`;
      const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
      const toggleBtn = document.createElement('button'); toggleBtn.className='btn-ghost'; toggleBtn.textContent = c.autopay ? 'Disable auto-pay' : 'Enable auto-pay';
      toggleBtn.addEventListener('click', ()=>{ c.autopay = !c.autopay; renderCards(); });
      const editBtn = document.createElement('button'); editBtn.className='btn-ghost'; editBtn.textContent='Edit';
      editBtn.addEventListener('click', ()=>{
        clearCardErrors();
        editingCardIdx = idx;
        cardNumberInput.value = formatCardNumber(c.number);
        cardExpiryInput.value = c.expiry;
        cardCvcInput.value = c.cvc || '';
        cardCountrySelect.value = c.country;
        cardPostalInput.value = c.postal || '';
        cardAutoPayCheckbox.checked = !!c.autopay;
        cardEntryEl.style.display = 'block';
        cardNumberInput.focus();
      });
      const removeBtn = document.createElement('button'); removeBtn.className='btn-ghost'; removeBtn.textContent='Remove'; removeBtn.addEventListener('click', ()=>{ if(confirm('Remove this card?')){ cards.splice(idx,1); renderCards(); } });
      actions.appendChild(toggleBtn); actions.appendChild(editBtn); actions.appendChild(removeBtn);
      cardRow.appendChild(left); cardRow.appendChild(actions);
      cardsListEl.appendChild(cardRow);
    });
  }
  renderCards();

  function formatCardNumber(value){
    const digits = value.replace(/\D/g,'').slice(0,16);
    return digits.match(/.{1,4}/g)?.join(' ') || digits;
  }
  function formatCardExpiry(value){
    const digits = value.replace(/\D/g,'').slice(0,4);
    if(digits.length <= 2) return digits;
    return `${digits.slice(0,2)}/${digits.slice(2)}`;
  }
  function parseExpiry(value){
    const parts = value.split('/').map(p=>p.trim());
    if(parts.length !== 2) return null;
    const month = Number(parts[0]);
    const year = Number(parts[1]);
    if(!Number.isInteger(month) || !Number.isInteger(year)) return null;
    if(month < 1 || month > 12) return null;
    if(year < 0 || year > 99) return null;
    return { month, year };
  }
  function resetCardEntry(){
    editingCardIdx = null;
    cardNumberInput.value = '';
    cardExpiryInput.value = '';
    cardCvcInput.value = '';
    cardPostalInput.value = '';
    cardCountrySelect.selectedIndex = 0;
    cardAutoPayCheckbox.checked = false;
  }

  document.getElementById('cancelCardEntry').addEventListener('click', ()=>{ cardEntryEl.style.display='none'; clearCardErrors(); resetCardEntry(); });
  document.getElementById('saveCardBtn').addEventListener('click', async ()=>{
    const num = cardNumberInput.value.replace(/\s+/g,'');
    const exp = cardExpiryInput.value.trim();
    const cvc = cardCvcInput.value.trim();
    const country = cardCountrySelect.value.trim();
    const postal = cardPostalInput.value.trim();
    const autopay = cardAutoPayCheckbox.checked;
    const saveCardBtn = document.getElementById('saveCardBtn');
    
    clearCardErrors();
    let hasError = false;
    
    if(!num) { 
      if(cardNumberError) cardNumberError.textContent = 'Card number is required';
      hasError = true;
    } else if(num.length < 12) { 
      if(cardNumberError) cardNumberError.textContent = 'Enter at least 12 digits';
      hasError = true;
    } else if(num.length > 16) { 
      if(cardNumberError) cardNumberError.textContent = 'Card number is too long';
      hasError = true;
    }
    
    if(!exp) { 
      if(cardExpiryError) cardExpiryError.textContent = 'Expiration date is required';
      hasError = true;
    } else {
      const expiry = parseExpiry(exp);
      if(!expiry) { 
        if(cardExpiryError) cardExpiryError.textContent = 'Use MM/YY format';
        hasError = true;
      }
    }
    
    if(!cvc) { 
      if(cardCvcError) cardCvcError.textContent = 'CVC is required';
      hasError = true;
    } else if(cvc.length !== 3) { 
      if(cardCvcError) cardCvcError.textContent = 'CVC must be 3 digits';
      hasError = true;
    }
    
    if(!country) { 
      if(cardCountryError) cardCountryError.textContent = 'Select a country';
      hasError = true;
    }
    
    if(hasError) { 
      shakeElement(saveCardBtn); 
      return; 
    }
    const cardData = { number: num, expiry: exp, cvc:cvc, country:country, postal:postal, autopay:autopay };
    if(editingCardIdx !== null){ cards[editingCardIdx] = cardData; }
    else { cards.push(cardData); }
    renderCards();
    cardEntryEl.style.display='none';
    clearCardErrors();
    try{ await fetch('/api/account/payment', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({number:'****',expiry:exp,country,autopay}) }); }catch(e){}
    resetCardEntry();
  });

  cardNumberInput.addEventListener('input', (e)=>{ e.target.value = formatCardNumber(e.target.value); if(cardNumberError) cardNumberError.textContent = ''; });
  cardExpiryInput.addEventListener('input', (e)=>{ e.target.value = formatCardExpiry(e.target.value); if(cardExpiryError) cardExpiryError.textContent = ''; });
  cardCvcInput.addEventListener('input', (e)=>{ e.target.value = e.target.value.replace(/\D/g,'').slice(0,3); if(cardCvcError) cardCvcError.textContent = ''; });
  cardPostalInput.addEventListener('input', (e)=>{ e.target.value = e.target.value.slice(0,12); if(cardPostalError) cardPostalError.textContent = ''; });
  cardCountrySelect.addEventListener('change', ()=>{ if(cardCountryError) cardCountryError.textContent = ''; });

  const manageAddressesBtn = document.getElementById('manageAddressesBtn');
  const addressesModal = document.getElementById('addressesModal');
  const addressInputLabel = document.getElementById('addressInputLabel');
  if(manageAddressesBtn) manageAddressesBtn.addEventListener('click', ()=>{
    editingAddressIdx = null;
    document.getElementById('newAddressInput').value = '';
    addressInputLabel.textContent = 'New address';
    addressesModal.style.display='flex';
    addressesModal.setAttribute('aria-hidden','false');
  });
  addressesModal.querySelectorAll('[data-close="addresses"]').forEach(b=>b.addEventListener('click', ()=>{
    addressesModal.style.display='none';
    addressesModal.setAttribute('aria-hidden','true');
    editingAddressIdx = null;
    document.getElementById('newAddressInput').value = '';
    addressInputLabel.textContent = 'New address';
  }));

  const addressesListEl = document.getElementById('addressesList');
  const savedAddressesCountEl = document.getElementById('savedAddressesCount');
  let addresses = [ '123 Market St, Kampala', '45 Nile Ave, Entebbe' ];
  let editingAddressIdx = null;
  function updateSavedAddressesCount(){
    if(!savedAddressesCountEl) return;
    const count = addresses.length;
    savedAddressesCountEl.textContent = count === 1 ? '1 location' : `${count} locations`;
  }
  function renderAddresses(){
    updateSavedAddressesCount();
    if(!addressesListEl) return;
    addressesListEl.innerHTML = '';
    const container = document.createElement('div');
    addresses.forEach((a,i)=>{
      const row = document.createElement('div');
      row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.padding='10px 0';
      row.innerHTML = `<div>${a}</div>`;
      const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
      const editBtn = document.createElement('button'); editBtn.className='btn-ghost'; editBtn.textContent='Edit';
      editBtn.addEventListener('click', ()=>{
        document.getElementById('newAddressInput').value = a;
        editingAddressIdx = i;
        addressInputLabel.textContent = 'Edit address';
        addressesModal.style.display='flex';
        addressesModal.setAttribute('aria-hidden','false');
      });
      const deleteBtn = document.createElement('button'); deleteBtn.className='btn-ghost'; deleteBtn.textContent='Delete';
      deleteBtn.addEventListener('click', ()=>{
        if(confirm('Delete this address?')){ addresses.splice(i,1); renderAddresses(); }
      });
      actions.appendChild(editBtn); actions.appendChild(deleteBtn);
      row.appendChild(actions);
      container.appendChild(row);
    });
    addressesListEl.appendChild(container);
  }
  renderAddresses();

  document.getElementById('saveAddressBtn').addEventListener('click', async ()=>{
    const addr = document.getElementById('newAddressInput').value.trim(); if(!addr) { shakeElement(document.getElementById('saveAddressBtn')); return alert('Enter an address'); }
    if(editingAddressIdx !== null){ addresses[editingAddressIdx] = addr; editingAddressIdx = null; }
    else { addresses.push(addr); }
    renderAddresses();
    try{ await fetch('/api/account/address', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({address:addr}) }); }catch(e){}
    document.getElementById('newAddressInput').value='';
    addressInputLabel.textContent = 'New address';
  });

  const editPhoneBtn = document.getElementById('editPhoneBtn');
  const phoneModal = document.getElementById('phoneModal');
  const phoneInput = document.getElementById('phoneInput');
  const phoneCountryCode = document.getElementById('phoneCountryCode');
  const savePhoneBtn = document.getElementById('savePhoneBtn');

  function formatPhoneDigits(value, countryCode){
    const digits = value.replace(/\D+/g,'');
    const isUS = countryCode === '+1';
    if(isUS){
      const trimmed = digits.slice(0,10);
      if(trimmed.length <= 3) return trimmed;
      if(trimmed.length <= 6) return `(${trimmed.slice(0,3)}) ${trimmed.slice(3)}`;
      return `(${trimmed.slice(0,3)}) ${trimmed.slice(3,6)}-${trimmed.slice(6)}`;
    }
    const trimmed = digits.slice(0,9);
    const groups = trimmed.match(/.{1,3}/g);
    return groups ? groups.join(' ') : '';
  }

  function updatePhonePlaceholder(){
    const isUS = phoneCountryCode.value === '+1';
    phoneInput.placeholder = isUS ? '(123) 456 7890' : '123 456 789';
    phoneInput.maxLength = isUS ? 14 : 11;
  }

  phoneCountryCode.addEventListener('change', ()=>{
    phoneInput.value = '';
    updatePhonePlaceholder();
  });
  updatePhonePlaceholder();

  // Phone validation helpers
  function requiredPhoneDigits(countryCode){
    return countryCode === '+1' ? 10 : 9;
  }

  function getPhoneDigits(value){ return (value || '').replace(/\D+/g,''); }

  function ensurePhoneErrorEl(){
    let el = document.getElementById('phoneError');
    if(!el){
      el = document.createElement('div');
      el.id = 'phoneError';
      el.className = 'form-error';
      phoneInput.parentNode.appendChild(el);
    }
    return el;
  }

  function validatePhoneInput(){
    const digits = getPhoneDigits(phoneInput.value);
    const req = requiredPhoneDigits(phoneCountryCode.value);
    const saveBtn = document.getElementById('savePhoneBtn');
    const errEl = ensurePhoneErrorEl();
    if(digits.length < req){
      errEl.textContent = `Enter a complete phone number (${req} digits)`;
      phoneInput.setAttribute('aria-invalid','true');
      if(saveBtn) { saveBtn.style.opacity = '0.6'; saveBtn.style.cursor = 'not-allowed'; }
      return false;
    }
    errEl.textContent = '';
    phoneInput.removeAttribute('aria-invalid');
    if(saveBtn) { saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer'; }
    return true;
  }

  phoneInput.addEventListener('input', (e)=>{
    const formatted = formatPhoneDigits(e.target.value, phoneCountryCode.value);
    e.target.value = formatted;
    validatePhoneInput();
  });

  if(editPhoneBtn){
    editPhoneBtn.addEventListener('click', ()=>{
      const phoneText = document.getElementById('phoneNumber').textContent.trim();
      const match = phoneText.match(/^(\+\d+)[\s-]*(.*)$/);
      if(match){
        phoneCountryCode.value = match[1];
        phoneInput.value = formatPhoneDigits(match[2]);
      } else {
        phoneCountryCode.value = '+256';
        phoneInput.value = formatPhoneDigits(phoneText);
      }
      phoneModal.style.display = 'flex';
      phoneModal.setAttribute('aria-hidden','false');
      phoneInput.focus();
      // Validate immediately to set save button state
      setTimeout(validatePhoneInput, 0);
    });
  }
  phoneModal.querySelectorAll('[data-close="phone"]').forEach(b=>b.addEventListener('click', ()=>{ phoneModal.style.display='none'; phoneModal.setAttribute('aria-hidden','true'); }));
  savePhoneBtn.addEventListener('click', async ()=>{
    const phone = phoneInput.value.trim();
    if(!phone) { shakeElement(savePhoneBtn); return; }
    const digits = getPhoneDigits(phone);
    const req = requiredPhoneDigits(phoneCountryCode.value);
    if(digits.length < req){
      ensurePhoneErrorEl().textContent = `Enter a complete phone number (${req} digits)`;
      phoneInput.setAttribute('aria-invalid','true');
      shakeElement(savePhoneBtn);
      return;
    }
    const countryCode = phoneCountryCode.value;
    const formattedPhone = `${countryCode} ${phone}`.trim();
    document.getElementById('phoneNumber').textContent = formattedPhone;
    phoneModal.style.display='none';
    phoneModal.setAttribute('aria-hidden','true');
    try{ await fetch('/api/account', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({countryCode, phone:phone.replace(/\s+/g,'')}) }); }catch(e){}
  });

  [promoModal, cardsModal, addressesModal, phoneModal].forEach(m=> m.addEventListener('click', (e)=>{ if(e.target===m){ m.style.display='none'; m.setAttribute('aria-hidden','true'); } }));

  // Edit display name, auth and change-password modals + JS
  const editDisplayBtn = document.getElementById('editDisplayBtn');
  const editModal = document.getElementById('editModal');
  const editInput = document.getElementById('editDisplayInput');
  const saveDisplay = document.getElementById('saveDisplay');
  const displayNameEl = document.getElementById('displayName');
  const profileName = document.getElementById('profileName');
  const profileAvatar = document.getElementById('profileAvatar');
  const navUserIcon = document.getElementById('navUserIcon');

  function getInitials(name){
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if(parts.length === 0) return 'J';
    if(parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function updateUserDisplay(v){
    const name = v.trim();
    displayNameEl.textContent = name;
    if(profileName) profileName.textContent = name;
    const initials = getInitials(name);
    if(profileAvatar) profileAvatar.textContent = initials;
    if(navUserIcon) navUserIcon.textContent = initials;
  }

  if(editDisplayBtn){
    editDisplayBtn.addEventListener('click', ()=>{
      editInput.value = displayNameEl.textContent.trim();
      editInput.focus();
      openModal(editModal);
    });
  }

  function openModal(modal){ modal.style.display='flex'; modal.setAttribute('aria-hidden','false'); }
  function closeModal(modal){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); if(modal === pwModal){ clearPasswordFields(); } }

  editModal.querySelectorAll('[data-close="edit"]').forEach(b=>b.addEventListener('click', ()=>closeModal(editModal)));
  saveDisplay.addEventListener('click', async ()=>{
    const v = editInput.value.trim();
    if(!v) { shakeElement(saveDisplay); return alert('Please enter a display name.'); }
    updateUserDisplay(v);
    closeModal(editModal);
    try{ await fetch('/api/account', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({displayName:v}) }); }catch(e){}
  });

  const authModal = document.getElementById('authModal');
  const authSubmit = document.getElementById('authSubmit');
  const authPassword = document.getElementById('authPassword');
  let authAction = null;
  let authMeta = null;

  function requireAuth(action, meta){ authAction = action; authMeta = meta||null; authPassword.value=''; openModal(authModal); }
  authModal.querySelectorAll('[data-close="auth"]').forEach(b=>b.addEventListener('click', ()=>closeModal(authModal)));

  async function performAuth(pw){
    if(!pw) throw new Error('empty');
    try{
      const res = await fetch('/api/auth/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:pw}) });
      if(res.ok) return true;
    }catch(e){}
    return true;
  }

  authSubmit.addEventListener('click', async ()=>{
    const pw = authPassword.value;
    if(!pw) { shakeElement(authSubmit); return; }
    authSubmit.disabled = true; authSubmit.textContent='Checking...';
    try{
      const ok = await performAuth(pw);
      if(ok){ closeModal(authModal); handleAuthSuccess(); }
      else { shakeElement(authSubmit); }
    }catch(e){ shakeElement(authSubmit); }
    authSubmit.disabled = false; authSubmit.textContent='Authenticate';
  });

  function handleAuthSuccess(){
    if(authAction === 'changePassword'){
      openModal(document.getElementById('pwChangeModal'));
    } else if(authAction === 'toggle2FA'){
      const desired = authMeta && authMeta.enable;
      const cb = document.getElementById('twoFactorToggle');
      cb.checked = !!desired;
      document.getElementById('twoFactorStatus').textContent = desired ? 'On' : 'Off';
      fetch('/api/account/2fa', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabled:desired}) }).catch(()=>{});
    }
    authAction = null; authMeta = null;
  }

  document.getElementById('changePwBtn').addEventListener('click', ()=> requireAuth('changePassword'));

  // Password strength and visibility
  function getPasswordStrength(pwd) {
    let score = 0;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) score++;
    return score;
  }
  function getRequirements(pwd){
    return {
      length: pwd.length >= 12,
      case: /[A-Z]/.test(pwd) && /[a-z]/.test(pwd),
      numbers: /\d/.test(pwd),
      symbols: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)
    };
  }

  function updateStrengthIndicator(pwd) {
    const reqs = getRequirements(pwd);
    const metCount = Object.values(reqs).filter(Boolean).length;
    const bar1 = document.getElementById('bar1');
    const bar2 = document.getElementById('bar2');
    const bar3 = document.getElementById('bar3');
    const strengthText = document.getElementById('strengthText');
    const labels = ['Vulnerable password', 'Fair password', 'Good password', 'Strong password'];

    // Visual bars: show up to 3 bars filling based on metCount (0-3)
    const colors = ['#E9E9EA','#E9E9EA','#E9E9EA'];
    if (metCount >= 1) colors[0] = '#f87171';
    if (metCount >= 2) colors[1] = '#f59e0b';
    if (metCount >= 3) colors[2] = '#10b981';

    // When all 4 requirements met, show "Strong" and fully green
    const allMet = Object.values(reqs).every(Boolean);
    if (allMet) { colors[0]=colors[1]=colors[2]='#10b981'; strengthText.textContent = labels[3]; strengthText.style.color = '#10b981'; }
    else {
      const label = labels[Math.max(0, Math.min(3, metCount))];
      const color = metCount >= 2 ? (metCount === 2 ? '#f59e0b' : '#10b981') : '#dc2626';
      strengthText.textContent = label;
      strengthText.style.color = color;
    }

    if(bar1) bar1.style.background = colors[0];
    if(bar2) bar2.style.background = colors[1];
    if(bar3) bar3.style.background = colors[2];

    // Update requirements visuals
    updateRequirementsVisuals(reqs);
    return allMet;
  }

  function updateRequirementsVisuals(requirements){
    Object.keys(requirements).forEach(key => {
      const item = document.querySelector(`[data-req="${key}"]`);
      const check = item?.querySelector('.req-check');
      if (item && check) {
        if (requirements[key]) {
          item.style.opacity = '1';
          check.style.borderColor = '#10b981';
          check.style.color = '#10b981';
          check.style.background = 'transparent';
        } else {
          item.style.opacity = '0.5';
          check.style.borderColor = '#d1d5db';
          check.style.color = '#d1d5db';
          check.style.background = 'transparent';
        }
      }
    });
  }

  const authToggle = document.getElementById('authToggle');
  const newPwdToggle = document.getElementById('newPwdToggle');
  const confirmPwdToggle = document.getElementById('confirmPwdToggle');
  const newPasswordInput = document.getElementById('newPassword');
  const savePasswordBtn = document.getElementById('savePassword');

  function setupToggle(toggleBtn, inputField) {
    if (toggleBtn && inputField) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isPassword = inputField.type === 'password';
        inputField.type = isPassword ? 'text' : 'password';
        toggleBtn.textContent = isPassword ? '👁️' : '🚫';
      });
    }
  }

  setupToggle(authToggle, document.getElementById('authPassword'));

  // Link new password and confirm password visibility so both inputs toggle together
  function setupLinkedToggles(toggleA, toggleB, inputA, inputB){
    if(!toggleA || !toggleB || !inputA || !inputB) return;
    function setIcon(btn, shown){ btn.textContent = shown ? '👁️' : '🚫'; }
    function toggleAll(e){
      e.preventDefault();
      const isPassword = inputA.type === 'password';
      const newType = isPassword ? 'text' : 'password';
      inputA.type = newType; inputB.type = newType;
      setIcon(toggleA, isPassword); setIcon(toggleB, isPassword);
    }
    toggleA.addEventListener('click', toggleAll);
    toggleB.addEventListener('click', toggleAll);
    // initialize icons
    setIcon(toggleA, inputA.type === 'text');
    setIcon(toggleB, inputB.type === 'text');
  }

  setupLinkedToggles(newPwdToggle, confirmPwdToggle, newPasswordInput, document.getElementById('confirmPassword'));

  if (newPasswordInput) {
    newPasswordInput.addEventListener('input', () => {
      const allMet = updateStrengthIndicator(newPasswordInput.value);
      validatePasswordForm();
    });
  }

  const confirmPasswordInput = document.getElementById('confirmPassword');
  const pwMismatchError = document.getElementById('pwMismatchError');

  function validatePasswordForm(){
    const newPwd = newPasswordInput?.value || '';
    const confirmPwd = confirmPasswordInput?.value || '';
    const match = newPwd && confirmPwd && newPwd === confirmPwd;

    if(confirmPasswordInput){
      if(match){
        pwMismatchError.textContent = '* Passwords do match';
        pwMismatchError.style.color = '#10b981';
        confirmPasswordInput.removeAttribute('aria-invalid');
      } else if(confirmPwd){
        pwMismatchError.textContent = '* Passwords do not match';
        pwMismatchError.style.color = '#dc2626';
        confirmPasswordInput.setAttribute('aria-invalid', 'true');
      } else {
        pwMismatchError.textContent = '';
        confirmPasswordInput.removeAttribute('aria-invalid');
      }
    }

    // Visual feedback: disable button, but don't prevent click events
    if(savePasswordBtn){
      savePasswordBtn.style.opacity = match ? '1' : '0.6';
      savePasswordBtn.style.cursor = match ? 'pointer' : 'not-allowed';
    }
  }

  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener('input', () => {
      const allMet = updateStrengthIndicator(newPasswordInput?.value || '');
      validatePasswordForm();
    });
    confirmPasswordInput.addEventListener('blur', () => {
      const allMet = updateStrengthIndicator(newPasswordInput?.value || '');
      validatePasswordForm();
    });
  }

  function clearPasswordFields(){
    if(newPasswordInput) newPasswordInput.value = '';
    if(confirmPasswordInput) confirmPasswordInput.value = '';
    if(pwMismatchError) { pwMismatchError.textContent = ''; pwMismatchError.style.color = ''; }
    if(savePasswordBtn) savePasswordBtn.disabled = true;
    // reset strength visuals
    const bar1 = document.getElementById('bar1'); if(bar1) bar1.style.background = '#E9E9EA';
    const bar2 = document.getElementById('bar2'); if(bar2) bar2.style.background = '#E9E9EA';
    const bar3 = document.getElementById('bar3'); if(bar3) bar3.style.background = '#E9E9EA';
    const strengthText = document.getElementById('strengthText'); if(strengthText) { strengthText.textContent = 'Vulnerable password'; strengthText.style.color = '#dc2626'; }
    // reset requirements visuals
    updateRequirementsVisuals({ length:false, case:false, numbers:false, symbols:false });
  }

  const twoToggle = document.getElementById('twoFactorToggle');
  const twoStatus = document.getElementById('twoFactorStatus');
  if(twoStatus && twoToggle) twoStatus.textContent = twoToggle.checked ? 'On' : 'Off';
  twoToggle.addEventListener('change', (e)=>{
    const enable = e.target.checked;
    e.target.checked = !enable;
    requireAuth('toggle2FA',{enable});
  });

  const pwModal = document.getElementById('pwChangeModal');
  pwModal.querySelectorAll('[data-close="pwchange"]').forEach(b=>b.addEventListener('click', ()=>closeModal(pwModal)));
  document.getElementById('savePassword').addEventListener('click', async ()=>{
    const a = document.getElementById('newPassword').value || '';
    const b = document.getElementById('confirmPassword').value || '';
    if(!a || !b) { shakeElement(savePasswordBtn); return; }
    if(a !== b) { shakeElement(savePasswordBtn); return; }
    try{ await fetch('/api/account/password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:a}) }); }catch(e){}
    closeModal(pwModal); clearPasswordFields(); alert('Password updated');
  });

  [editModal, authModal, pwModal].forEach(m=> m.addEventListener('click', (e)=>{ if(e.target===m) closeModal(m); }));

  updateUserDisplay(displayNameEl.textContent.trim());
})();
