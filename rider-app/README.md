# Zesto Rider App

React Native + Expo delivery partner app for the Zesto platform.

---

## Quick Start

### 1. Find your PC's IP address

```bash
# Windows
ipconfig          # look for IPv4 Address under your active adapter

# macOS / Linux
ifconfig          # look for inet under en0 (Wi-Fi) or eth0
```

### 2. Set the server IP — ONE place only

Edit **`src/services/api.js`**, line 12:

```js
export const SERVER_HOST = '192.168.1.100';   // ← your PC's LAN IP
```

Both `api.js` and `socket.js` derive their URLs from this single constant.

### 3. Install & run

```bash
cd rider-app
npm install

# For Expo Go on the same Wi-Fi network:
npm start          # then scan QR with Expo Go

# If on a restricted network (university, office):
npm run tunnel     # uses ngrok tunnel — works on any network
                   # (requires: npm install -g @expo/ngrok)
```

---

## Network Troubleshooting (University / Restricted Networks)

If the app can't connect on your university network:

| Problem | Fix |
|---------|-----|
| Expo Go can't load the app | Use `npm run tunnel` |
| App loads but API fails | Device and PC on different VLANs — use phone hotspot |
| Socket won't connect | Same as above — hotspot or tunnel |
| Works on hotspot, not uni Wi-Fi | University blocks peer-to-peer traffic — use tunnel |

**Recommended for development:** Connect your PC and phone to the **same mobile hotspot**, then use `npm start` with the hotspot IP.

---

## What's New in v1.1

### Bug Fixes
- ✅ **Sign-out now works correctly** — clears SecureStore token, disconnects socket, resets all auth state, navigator returns to Login
- ✅ **Branding changed from Khalas → Zesto** throughout the entire app

### New Features
- ✅ **Sign Up screen** — full rider registration with vehicle details and National ID
- ✅ **Email OTP verification** — 6-digit code sent on registration (dev: printed to server console)
- ✅ **Post-registration guidance** — pending approval screen with contact info
- ✅ **Map integration** — `react-native-maps` shows restaurant + customer markers with route polyline
- ✅ **Google Maps navigation** — tapping Navigate opens Google Maps (or Apple Maps on iOS) with turn-by-turn directions
- ✅ **Uber/Glovo-style UI** — professional order cards, map-first delivery screen, animated bottom sheet
- ✅ **Single IP config** — change `SERVER_HOST` in one place, both REST and Socket.IO update automatically
- ✅ **Polling fallback** — Socket.IO uses `websocket` + `polling` transports for restricted networks

### Backend Additions
| File | Change |
|------|--------|
| `backend/src/services/emailService.js` | New — Nodemailer OTP + welcome emails (dev: console fallback) |
| `backend/src/controllers/authController.js` | Added `riderSendOtp`, `riderVerifyOtp`, `riderRegister` |
| `backend/src/routes/auth.js` | Added `/rider/send-otp`, `/rider/verify-otp`, `/rider/register` |
| `backend/package.json` | Added `nodemailer` dependency |

---

## Email Configuration

Add to `backend/.env` to send real emails:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Zesto" <noreply@zesto.ug>
```

Without these, OTP codes are printed to the **server console** — perfect for development.

---

## Google Maps API Key (for production)

For the map to work on Android release builds, add your key to `app.json`:

```json
"android": {
  "config": {
    "googleMaps": { "apiKey": "YOUR_ANDROID_KEY" }
  }
}
```

In Expo Go during development, the map works without a key.

---

## Rider Registration Flow

```
Sign Up tab
    ↓ Fill details (name, email, phone, password, vehicle, national ID)
    ↓ POST /api/auth/rider/send-otp  →  OTP emailed + stored in memory
    ↓ Enter 6-digit code
    ↓ POST /api/auth/rider/register  →  user + rider created, JWT returned
    ↓ Auto-login  →  Profile screen shows pending approval
    ↓ Rider contacts Zesto team to get approved
    ↓ Super-admin approves in dashboard
    ↓ Rider toggles online → starts receiving deliveries
```
