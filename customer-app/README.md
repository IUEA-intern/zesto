# Zesto Customer App (React Native + Expo)

A customer-facing mobile app for the Zesto food delivery platform, built with
**React Native + Expo**. It talks to the **same backend** used by the Zesto
web frontend and the existing `rider-app` — no backend or database changes
are required.

## What's included

- **Auth** — register / login as a `customer` (uses `/api/auth/register/customer`
  and `/api/auth/mobile-token`, same as the rider app's token flow)
- **Browse** — restaurants, featured products, per-restaurant menus with
  category filters
- **Cart** — server-side cart (`/api/cart`), synced across devices/web
- **Checkout** — delivery address + notes, payment method choice
- **Payments** — Pesapal hosted checkout opened in an in-app WebView
  (`/api/payments/pesapal/initiate`), with live status polling +
  Socket.IO confirmation
- **Order tracking** — real-time status timeline via Socket.IO
  (`order:track` room + `order:update`/`order:status`/`notification:toast`)
- **Order history & profile**

## Project layout

```
customer-app/
├── App.js                     # Root: providers + navigation
├── app.json / package.json    # Expo config
└── src/
    ├── components/index.js    # Shared UI (Button, Card, StatusPill, etc.)
    ├── navigation/index.js    # Stack (auth) + Bottom tabs (main app)
    ├── screens/               # One file per screen
    ├── services/
    │   ├── api.js             # REST client — mirrors backend/src/routes
    │   ├── socket.js          # Socket.IO client
    │   ├── AuthContext.js     # Session state
    │   ├── CartContext.js     # Cart state (backed by /api/cart)
    │   └── storage.js         # Cross-platform secure token storage
    ├── theme/index.js         # Design tokens (colors, spacing, shadows)
    └── utils/index.js         # Formatters, validators, status labels
```

## 1. Point the app at your backend

Open `src/services/api.js` and set your backend server's **LAN IP address**
(the same server the `rider-app` and web frontend use):

```js
export const SERVER_HOST = '192.168.1.42'; // ← your machine's LAN IP
export const SERVER_PORT = 3000;
```

- Find your LAN IP: `ipconfig` (Windows) / `ifconfig` or `ip addr` (Mac/Linux).
- Don't use `localhost` — a phone/emulator on the same Wi-Fi network can't
  reach your computer's `localhost`.
- Make sure the backend's CORS config allows your Expo dev origin (it already
  allows typical Expo/local origins if configured like the rider app).

## 2. Install & run

```bash
cd customer-app
npm install
npx expo start
```

Then:
- Press `a` for Android emulator, `i` for iOS simulator, or scan the QR code
  with **Expo Go** on your physical phone (same Wi-Fi network as the backend).

Make sure the backend is running first:
```bash
cd backend
npm run dev   # or however you normally start it
```

## 3. Test accounts

Use `Sign Up` in the app to create a new customer account — it calls
`POST /api/auth/register/customer` directly, no OTP required (that flow is
rider-only). Alternatively, use any existing `role = 'customer'` account
from your database.

## Notes on payments

Pesapal's hosted checkout redirects to a **web** callback URL
(`/api/payments/pesapal/callback`) that a mobile app can't intercept the way
a browser can. To handle this, the app:

1. Opens the Pesapal redirect URL in an in-app `WebView`.
2. Polls `GET /api/payments/order/:orderId` every 3s for the payment status.
3. Also listens for the `payment:status` Socket.IO event for a faster update.
4. Once `status === 'verified'`, the cart is cleared and the user is taken to
   live order tracking.

## Notes on real-time updates

The app joins two rooms on connect (mirroring `rider-app`'s pattern):
- `user:<id>` and `user_<id>` — personal notifications or order/payment events
- `order:<orderId>` — joined while viewing `OrderDetailScreen`, for
  `order:update` events broadcast when a restaurant/admin/rider changes an
  order's status

No backend changes were needed — this app is a pure client of the existing
Express + Socket.IO server.
