# Zesto Food Ordering Platform

Real-time food ordering app with a static frontend, Express backend, MariaDB data layer, Socket.IO updates, and Flutterwave payment support.

## Project Structure

```text
.gitignore
.github/
  workflows/
    static.yml
backend/
  .env
  package.json
  node_modules/
  scripts/
  sql/
    schema.sql
  src/
    app.js
    index.js
    config/
    controllers/
    events/
    middleware/
    routes/
frontend-src/
  order.html
  cart.html
  admin/
  css/
    order.css
    cart.css
    admin.css
  images/
  script/
    order&cart.js
    auth.js
```

The new order/cart files that were previously in `public/` now live in `frontend-src/`, and the API/server files that were previously in `server/`, `scripts/`, and `sql/` now live under `backend/`.

## Run Locally

```bash
cd backend
npm install
npm run dev
```

The backend serves `../frontend-src` as static files. Visit `http://localhost:3000` or the `PORT` configured in `backend/.env`.

## Database

Load the schema from:

```bash
mysql -u root -p < backend/sql/schema.sql
```

Configure database and payment values in `backend/.env`.

## Main API Routes

```text
GET    /api/products
GET    /api/products/:id
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/cart
POST   /api/cart
PUT    /api/cart/:id
DELETE /api/cart/:id
DELETE /api/cart
POST   /api/orders
GET    /api/orders
POST   /api/orders/:id/verify
```

## Notes

- `frontend-src/order.html` uses `css/order.css` and `script/order&cart.js`.
- `frontend-src/cart.html` uses `css/cart.css` and `script/order&cart.js`.
- Socket.IO is mounted by `backend/src/index.js`.
- Backend static serving is configured in `backend/src/app.js`.
