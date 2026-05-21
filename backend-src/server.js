// server.js — application entry point
require('dotenv').config();

// ── Validate required environment variables before anything else ─────────────
const REQUIRED_ENV = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DB_PASSWORD',
  'DB_NAME',
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌  Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const logger    = require('./utils/logger');
const AppError  = require('./utils/AppError');

const authRouter        = require('./routes/auth');
const categoriesRouter  = require('./routes/categories');
const restaurantsRouter = require('./routes/restaurants');
const cartRouter        = require('./routes/cart');
const ordersRouter      = require('./routes/orders');
const paymentRouter     = require('./routes/payment');

const app = express();

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:  process.env.CORS_ORIGIN || false,  // must be explicitly set; no wildcard default
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

// ── HTTP request logging ─────────────────────────────────────────────────────
app.use(morgan('dev'));

// ── Webhook route: must receive raw body BEFORE express.json() parses it ─────
// We attach the parsed object separately so the route handler has both.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, _res, next) => {
  try {
    req.parsedBody = JSON.parse(req.body.toString());
  } catch {
    req.parsedBody = {};
  }
  next();
});

// ── Body parsing (all other routes) ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
}));
app.use('/api/auth/login',    rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many login attempts' } }));
app.use('/api/auth/register', rateLimit({ windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Too many registration attempts' } }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRouter);
app.use('/api/categories',  categoriesRouter);
app.use('/api/restaurants', restaurantsRouter);
app.use('/api/cart',        cartRouter);
app.use('/api/orders',      ordersRouter);
app.use('/api/payments',    paymentRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
// All routes call next(err) — this is the single place errors are formatted.
app.use((err, req, res, _next) => {
  if (err.name === 'AppError') {
    // Business logic / validation error — safe to send message to client
    return res.status(err.status).json({ error: err.message });
  }

  // Unexpected error — log full details, send generic message
  logger.error('Unhandled error', {
    method:  req.method,
    url:     req.originalUrl,
    userId:  req.user?.id,
    message: err.message,
    stack:   err.stack,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT   = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

// ── Graceful shutdown (SIGTERM from container orchestrators) ─────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    const db = require('./db');
    await db.end();
    logger.info('MySQL pool closed. Exiting.');
    process.exit(0);
  });
});
