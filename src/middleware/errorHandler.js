const logger = require('../utils/logger');
const { BlockchainError } = require('../utils/blockchain');

function errorHandler(err, req, res, next) {
  logger.error(`[${req.method}] ${req.path} → ${err.message}`, {
    stack: err.stack,
    code:  err.code,
  });

  if (err instanceof BlockchainError || err.name === 'BlockchainError') {
    return res.status(400).json({
      success: false,
      error: { type: 'BLOCKCHAIN_ERROR', code: err.code, message: err.message },
    });
  }

  if (err.type === 'VALIDATION_ERROR') {
    return res.status(422).json({
      success: false,
      error: { type: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: err.errors },
    });
  }

  if (err.status === 404 || err.statusCode === 404) {
    return res.status(404).json({
      success: false,
      error: { type: 'NOT_FOUND', message: err.message || 'Không tìm thấy' },
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      type:    'SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Lỗi server nội bộ' : err.message,
    },
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };