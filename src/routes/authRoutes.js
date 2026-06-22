// ============================================================
//  src/routes/authRoutes.js
// ============================================================
const router  = require('express').Router();
const { body, query } = require('express-validator');
const controller = require('../controllers/authController');
const { validate, isEthAddress } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter, apiLimiter } = require('../middleware/rateLimiter');

/**
 * GET /auth/nonce?wallet=0x...
 * Không cần auth. Rate limit nhẹ (apiLimiter).
 */
router.get('/nonce',
  query('wallet').custom(isEthAddress).withMessage('wallet phải là địa chỉ Ethereum hợp lệ'),
  validate,
  controller.getNonce
);

/**
 * POST /auth/login
 * body: { wallet, signature }
 */
router.post('/login',
  writeLimiter,
  [
    body('wallet').custom(isEthAddress).withMessage('wallet không hợp lệ'),
    body('signature').isString().notEmpty().withMessage('signature không được rỗng'),
  ],
  validate,
  controller.login
);

/**
 * POST /auth/register
 * body: { wallet, signature, name, role, email?, phone? }
 *
 * role: 2=Distributor, 3=Supplier, 4=Transporter
 * signature: phải ký cùng nonce đã lấy từ GET /auth/nonce
 */
router.post('/register',
  writeLimiter,
  [
    body('wallet').custom(isEthAddress).withMessage('wallet không hợp lệ'),
    body('name').trim().notEmpty().withMessage('name không được rỗng'),
    body('role')
      .isInt({ min: 2, max: 4 })
      .withMessage('role: 2=Distributor, 3=Supplier, 4=Transporter'),
    body('email').optional().isEmail().withMessage('email không hợp lệ'),
    body('phone').optional().isString(),
  ],
  validate,
  controller.register
);

router.post('/confirm-register',
  writeLimiter,
  [body('wallet').custom(isEthAddress).withMessage('wallet không hợp lệ')],
  validate,
  controller.confirmRegister
);

/**
 * POST /auth/refresh
 * body: { token }
 */
router.post('/refresh',
  [
    body('token').isString().notEmpty().withMessage('token không được rỗng'),
  ],
  validate,
  controller.refreshToken
);

/**
 * GET /auth/me
 * Header: Authorization: Bearer <JWT>
 */
router.get('/me',
  requireAuth,
  controller.getMe
);

module.exports = router;