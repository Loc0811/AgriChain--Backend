const { validationResult } = require('express-validator');
const { isValidAddress } = require('../utils/blockchain');

/**
 * Chạy sau các validation rules.
 * Nếu có lỗi → throw để errorHandler xử lý.
 *
 * @example
 *   router.post('/register',
 *     [body('wallet').notEmpty(), body('name').notEmpty()],
 *     validate,           // ← chạy ở đây
 *     userController.register
 *   );
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed');
    err.type   = 'VALIDATION_ERROR';
    err.errors = errors.array().map(e => ({ field: e.path, message: e.msg }));
    return next(err);
  }
  next();
}

/**
 * Custom validator cho địa chỉ Ethereum.
 * Dùng trong express-validator chain:
 *   body('wallet').custom(isEthAddress)
 */
function isEthAddress(value) {
  if (!isValidAddress(value)) {
    throw new Error(`Địa chỉ Ethereum không hợp lệ: ${value}`);
  }
  return true;
}

/**
 * Custom validator cho số nguyên dương.
 */
function isPositiveInt(value) {
  const num = parseInt(value);
  if (isNaN(num) || num <= 0) {
    throw new Error('Phải là số nguyên dương');
  }
  return true;
}

module.exports = { validate, isEthAddress, isPositiveInt };