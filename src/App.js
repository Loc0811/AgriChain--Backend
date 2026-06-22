const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
 
const { apiLimiter }   = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Routes - dùng routes/index.js để quản lý tất cả routes
const routes = require('./routes');

const app = express();
 
// ─── Security middleware ───
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
 
// ─── Request parsing ───
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
 
// ─── Logging ───
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ─── Rate limiting ───
app.use('/api/', apiLimiter);
 
// ─── Health check ───
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
 
// ─── API Routes ───
app.use('/api', routes);
 
// ─── 404 handler ───
app.use((req, res, next) => {
  const err = new Error(`Route không tồn tại: ${req.method} ${req.path}`);
  err.statusCode = 404;
  next(err);
});
 
// ─── Global error handler (phải đặt CUỐI CÙNG) ───
app.use(errorHandler);
 
module.exports = app;