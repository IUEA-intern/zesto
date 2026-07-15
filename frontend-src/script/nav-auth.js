'use strict';

/**
 * Zesto — nav-auth.js
 *
 * Wires up the navbar's "Login / Sign Up" button + user-account pill for
 * pages that have their own navbar (index.html, restaurant.html) but no
 * page-specific script that already owns this (order.html / cart.html /
 * account.html handle it themselves and do NOT load this file).
 *
 * Mirrors the Auth.init()/Auth.updateUI() pattern used on order.html
 * (see script/order&cart.js) minus anything cart-related:
 *   - #userPill   -> populated via ZestoUserMenu.attach() when logged in
 *   - #openAuthModal -> hidden while logged in, shown while logged out
 */
(function () {
  const Auth = {
    async init() {
      let session = null;
      try {
        const res = await window.SharedAuth.checkSession();
        session = res.user;
      } catch {
        session = null;
      }
      this.updateUI(session);
    },

    updateUI(session) {
      const userPills = document.querySelectorAll('#userPill');
      const authBtns  = document.querySelectorAll('#openAuthModal');

      if (session) {
        userPills.forEach((userPill) => {
          window.ZestoUserMenu?.attach(userPill, session, {
            onLogout: async () => {
              try {
                await window.SharedAuth?.logout();
              } catch {}
            },
          });
        });
        authBtns.forEach((authBtn) => { authBtn.style.display = 'none'; });
      } else {
        userPills.forEach((userPill) => {
          userPill.classList.add('hidden');
          userPill.innerHTML = '';
        });
        authBtns.forEach((authBtn) => { authBtn.style.display = ''; });
      }
    },
  };

  document.addEventListener('auth-login', (e) => Auth.updateUI(e.detail));
  document.addEventListener('auth-logout', () => Auth.updateUI(null));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Auth.init());
  } else {
    Auth.init();
  }
})();
