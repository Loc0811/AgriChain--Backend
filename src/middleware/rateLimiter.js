const rateLimit = require('express-rate-limit');

// Rate limit cho tất cả API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { type: 'RATE_LIMIT', message: 'Quá nhiều request, thử lại sau' } },
});

// Rate limit chặt hơn cho write operations (gửi tx)
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  message: { success: false, error: { type: 'RATE_LIMIT', message: 'Quá nhiều transaction, thử lại sau' } },
});

module.exports = { apiLimiter, writeLimiter };