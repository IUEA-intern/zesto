# Khalas Food Ordering App

A lightweight food ordering web app with a polished landing page, restaurant directory, ordering flow, cart checkout, and authentication screens.

## Application Flow

              ┌───────────────┐
              │  index.html   │ ◄─────────────────────────┐
              │ (Landing Page)│                           │
              └───────┬───────┘                           │
                      │ (Browse / Get Started)            │
                      ▼                                   │
            ┌──────────────────┐                          │
            │  restaurant.html │                          │
            │(Directory Grid)  │                          │
            └─────────┬────────┘                          │
                      │ (Select Restaurant)               │
                      ▼                                   │
            ┌──────────────────┐ ◄─────────────────┐      │
            │    order.html    │                   │      │
            │  (Menu Page)     │                   │      │
            └─────────┬────────┘                   │      │
                      │ (Cart Nav / View)          │      │
                      ▼                            │      │
            ┌──────────────────┐                   │      │
            │    cart.html     │ ──────────────────┘      │
            │ (Checkout View)  │ (Continue Shopping)      │
            └──────────────────┘                          │
                                                          │
    =================== AUTH STREAM ===================   │
                                                          │
     ┌───────────────┐           ┌──────────────────┐     │
     │login (1).html │ ◄───────► │   signin.html    │     │
     │  (Sign In)    │           │ (Create Account) │     │
     └───────┬───────┘           └────────┬─────────┘     │
             │                            │               │
             └────────────────────────────┴───────────────┘
                 (On Success Form Validation Redirect)

---

## ✨ Features

### 💻 Client UI & Layout
- **Landing page flow:** Clear primary entry point through `index.html` with navigation into restaurants and auth.
- **Restaurant directory:** Grid-based restaurant selection screen in `restaurant.html`.
- **Menu and cart flow:** Seamless page transition from `order.html` to `cart.html`.
- **Authentication views:** Separate `login (1).html` and `signin.html` forms for sign-in and account creation.
- **Responsive navigation:** Header and button actions designed for quick route access across files.

### ⚙️ Application Logic & Mechanics
- **Routing pipeline:** Pages are connected by direct HTML anchors and redirect flows.
- **Cart state flow:** Client-side cart behavior supports view and checkout transitions.
- **Form validation:** Auth screens can be wired with submit validation and redirect logic.
- **Dynamic restaurant links:** Restaurant cards should map to the menu page.
- **Secure rendering:** Placeholder for escaping HTML input values and protecting UI rendering.

### 🛠️ Code Improvements
- **Updated anchor links:** Primary navigation points between `index.html`, `restaurant.html`, `order.html`, and `cart.html`.
- **Auth redirect setup:** Login page can redirect users back to the main app after valid credentials.
- **Back navigation fixes:** Stable back button behavior for `order.html`.
- **Improved cards:** Restaurant cards now include dynamic href fallback to `order.html`.

---

## 📋 Change Log

### [v1.1.0] 2026-05-21
**Added**
- App routing pipeline from `index.html` ➔ `restaurant.html` ➔ `order.html` ➔ `cart.html`.
- Authentication redirect flow for `login (1).html` and `signin.html`.
- Root-level `README.md` documentation with flow diagram and feature details.

**Changed**
- Restaurant grid anchor logic so cards resolve to the menu page.
- Header and navigation layout for smoother page transitions.
- Standardized cart and header UI interactions across pages.

**Fixed**
- Addressed broken back navigation paths in the ordering flow.
- Stabilized page link behavior for core app screens.

---

## 📍 Notes

- This `README.md` is generated for the current `test16` branch.
- Pushes are configured to the repository `https://github.com/pPARTY1920/khalas.git`.
- Use this file as a reference for app structure, feature coverage, and next enhancement steps.
