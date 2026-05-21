// utils/AppError.js
// Typed error class so the global handler can distinguish
// business-logic failures (4xx) from unexpected crashes (5xx).

class AppError extends Error {
  /**
   * @param {string} message  — message sent to the client
   * @param {number} status   — HTTP status code
   */
  constructor(message, status = 400) {
    super(message);
    this.name   = 'AppError';
    this.status = status;
  }
}

module.exports = AppError;
