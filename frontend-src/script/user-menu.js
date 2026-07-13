'use strict';

/**
 * Zesto — user-menu.js
 *
 * Shared "account menu" component: a circular avatar (initials) next to
 * the user's name, which opens a dropdown (My Orders / Account Settings
 * / Sign Out) on click, and shows a name+email tooltip on hover —
 * the same pattern as Google/ChatGPT/Claude's account menu.
 *
 * Used on every customer page (index.html, order.html, cart.html,
 * account.html) so there's a single source of truth for this markup
 * and behavior instead of it being duplicated per page.
 *
 * Usage:
 *   ZestoUserMenu.attach(pillEl, session, { onLogout: async () => {...} })
 */
(function () {
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0][0] || '';
    const last  = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (first + last).toUpperCase();
  }

  /**
   * Builds the pill's inner markup. Both the avatar-circle (initials) and
   * the name text are included together on purpose — see the note at the
   * bottom of this file for how to keep only one if you decide you don't
   * want both.
   */
  function buildPillHTML(session) {
    const name  = session?.name || 'Account';
    const email = session?.email || '';
    const initial = initials(name);

    return `
      <button type="button" id="userPillTrigger" class="user-pill-trigger" aria-haspopup="true" aria-expanded="false">
        <span class="user-avatar-circle">${escapeHTML(initial)}</span>
        <span id="userName" class="user-name-text">${escapeHTML(name)}</span>
        <svg class="user-pill-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="user-tooltip" role="tooltip">
        <div class="user-tooltip-name">${escapeHTML(name)}</div>
        ${email ? `<div class="user-tooltip-email">${escapeHTML(email)}</div>` : ''}
      </div>

      <div id="userDropdown" class="user-dropdown hidden" role="menu">
        <div class="user-dropdown-header">
          <span class="user-avatar-circle user-avatar-circle-lg">${escapeHTML(initial)}</span>
          <div class="user-dropdown-id">
            <div class="user-dropdown-name">${escapeHTML(name)}</div>
            ${email ? `<div class="user-dropdown-email">${escapeHTML(email)}</div>` : ''}
          </div>
        </div>
        <div class="user-dropdown-divider"></div>
        <a href="account.html?tab=orders" class="user-dropdown-item" role="menuitem">
          <span class="user-dropdown-item-icon">📦</span><span>My Orders</span>
        </a>
        <a href="account.html?tab=settings" class="user-dropdown-item" role="menuitem">
          <span class="user-dropdown-item-icon">⚙️</span><span>Account Settings</span>
        </a>
        <div class="user-dropdown-divider"></div>
        <button type="button" id="logoutBtn" class="user-dropdown-item user-dropdown-item-danger" role="menuitem">
          <span class="user-dropdown-item-icon">↩</span><span>Sign Out</span>
        </button>
      </div>
    `;
  }

  /**
   * Renders the menu into `pillEl` and wires up all interaction:
   * click-to-toggle, outside-click / Escape to close, and the Sign Out
   * button (via the onLogout callback, since logout mechanics differ
   * slightly per page).
   */
  function attach(pillEl, session, { onLogout } = {}) {
    if (!pillEl || !session) return;

    pillEl.classList.remove('hidden');
    pillEl.classList.add('user-pill');
    pillEl.innerHTML = buildPillHTML(session);

    const trigger  = pillEl.querySelector('#userPillTrigger');
    const dropdown = pillEl.querySelector('#userDropdown');
    const logoutBtn = pillEl.querySelector('#logoutBtn');

    function closeMenu() {
      dropdown.classList.add('hidden');
      pillEl.classList.remove('menu-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
    function openMenu() {
      dropdown.classList.remove('hidden');
      pillEl.classList.add('menu-open');
      trigger.setAttribute('aria-expanded', 'true');
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains('hidden');
      // Only one account menu should ever be open at a time.
      document.querySelectorAll('.user-dropdown').forEach(d => d.classList.add('hidden'));
      document.querySelectorAll('.user-pill').forEach(p => p.classList.remove('menu-open'));
      if (isOpen) closeMenu(); else openMenu();
    });

    document.addEventListener('click', (e) => {
      if (!pillEl.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    logoutBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      closeMenu();
      try {
        await onLogout?.();
      } catch {}
    });
  }

  window.ZestoUserMenu = { attach, buildPillHTML, initials };
})();

/**
 * ── Want just initials, or just the name — not both? ──────────────────
 * Right now the pill shows BOTH the avatar-initials circle and the name
 * text side by side. To keep only one:
 *
 *   - Initials only: in buildPillHTML() above, delete the line
 *     `<span id="userName" class="user-name-text">...</span>`
 *
 *   - Name only: in buildPillHTML() above, delete the line
 *     `<span class="user-avatar-circle">...</span>` (the first one,
 *     inside the trigger button — leave the ones inside the dropdown
 *     header alone, that avatar should stay).
 *
 * Either way, no other file needs to change — this is the only place
 * the pill's markup is generated.
 */
