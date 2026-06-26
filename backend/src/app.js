const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const path = require('path')

const app = express()
const frontendPath = path.join(__dirname, '../../frontend-src')

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.flutterwave.com', 'https://cdn.socket.io', 'https://unpkg.com'],
      scriptSrcElem: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
      styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://tile.openstreetmap.org'],
      connectSrc: ["'self'", 'https://api.flutterwave.com', 'https://tile.openstreetmap.org'],
      frameSrc: ["'self'", 'https://checkout.flutterwave.com'],
    },
  },
}))

app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:5500'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))



app.use(express.static(frontendPath))

// ── Existing routes (unchanged) ───────────────────────────────
// app.use('/api/register',    require('./routes/register'))
// app.use('/api/signin',      require('./routes/signin'))
app.use('/api/products',    require('./routes/products'))
app.use('/api/restaurants', require('./routes/restaurants'))
app.use('/api/cart',        require('./routes/cart'))
app.use('/api/auth',        require('./routes/auth'))
app.use('/api/orders',      require('./routes/orders'))
app.use('/api/payments',    require('./routes/payments'))
app.use('/api/admin',       require('./routes/admin'))          // legacy admin kept intact

// ── New marketplace routes ────────────────────────────────────
app.use('/api/super-admin', require('./routes/superAdmin'))     // super_admin
app.use('/api/restaurant',  require('./routes/restaurantAdmin')) // restaurant_admin

app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(frontendPath, 'order.html'))
  }
  return res.status(404).json({ error: 'Route not found' })
})

app.use((err, req, res, _next) => {
  console.error('[UNHANDLED ERROR]', err)
  return res.status(500).json({ success: false, message: 'Internal server error.' })
})

module.exports = app