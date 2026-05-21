// utils/logger.js
// Structured JSON logger. In development, output is readable.
// In production, pipe stdout to your log aggregator (Datadog, Loki, etc.)

const isProd = process.env.NODE_ENV === 'production';

function log(level, message, meta = {}) {
  const entry = {
    ts:    new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  if (isProd) {
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[0m';
    console.log(`${color}[${level.toUpperCase()}]\x1b[0m ${message}`, Object.keys(meta).length ? meta : '');
  }
}

module.exports = {
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
