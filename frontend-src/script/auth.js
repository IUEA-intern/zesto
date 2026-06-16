// ==============================
// ZESTO AUTH MODULE (shared)
// ==============================

let authModal;
let onAuthSuccessCallback = null;

// Call this once on page load
export function initAuthModal() {
  authModal = document.getElementById("authModal");

  const closeBtn = document.getElementById("closeAuthModal");
  if (closeBtn) {
    closeBtn.addEventListener("click", hideAuthModal);
  }

  setupAuthForms();
}

// Check login state
export function isUserLoggedIn() {
  return !!localStorage.getItem("zesto_user");
}

// Show modal and optionally pass callback
export function requireAuth(onSuccess) {
  if (isUserLoggedIn()) {
    onSuccess?.();
    return;
  }

  onAuthSuccessCallback = onSuccess;
  showAuthModal();
}

function showAuthModal() {
  authModal?.classList.remove("hidden");
}

function hideAuthModal() {
  authModal?.classList.add("hidden");
}

// ==============================
// LOGIN / SIGNUP HANDLING
// ==============================
function setupAuthForms() {
  const loginBtn = document.querySelector("#loginForm .btn-primary");
  const signupBtn = document.querySelector("#signupForm .btn-primary");

  loginBtn?.addEventListener("click", handleLogin);
  signupBtn?.addEventListener("click", handleSignup);
}

function handleLogin() {
  // simulate API call
  const user = {
    name: "Demo User",
    token: "abc123"
  };

  localStorage.setItem("zesto_user", JSON.stringify(user));

  onAuthSuccess();
}

function handleSignup() {
  const user = {
    name: "New User",
    token: "xyz456"
  };

  localStorage.setItem("zesto_user", JSON.stringify(user));

  onAuthSuccess();
}

function onAuthSuccess() {
  hideAuthModal();

  if (onAuthSuccessCallback) {
    onAuthSuccessCallback();
    onAuthSuccessCallback = null;
  }
}