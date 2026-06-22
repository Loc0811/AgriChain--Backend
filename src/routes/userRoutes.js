// ============================================================
//  src/routes/userRoutes.js
// ============================================================
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const controller = require('../controllers/userController');
const { validate, isEthAddress } = require('../middleware/validate');
const { writeLimiter } = require('../middleware/rateLimiter');
const { uploadImage } = require('../middleware/upload');
const { requireAuth, requireRole } = require('../middleware/auth');

// Reusable address param validation
const addressParam = param('address')
  .custom(isEthAddress)
  .withMessage('Địa chỉ phải là địa chỉ Ethereum hợp lệ');

// GET /api/users
router.get('/', 
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isInt({ min: 1, max: 4 }),
    query('isActive').optional().isBoolean(),
    query('search').optional().isString(),
  ],
  validate,
  controller.getAllUsers
);

// GET /api/users/:address
router.get('/:address',
  addressParam,
  validate,
  controller.getUser
);

// GET /api/users/:address/verified
router.get('/:address/verified',
  addressParam,
  validate,
  controller.getUserVerified
);

// GET /api/users/:address/chain
router.get('/:address/chain',
  addressParam,
  validate,
  controller.getUserFromChain
);

// GET /api/users/:address/role
router.get('/:address/role',
  addressParam,
  validate,
  controller.getUserRole
);

// GET /api/users/:address/isActive
router.get('/:address/isActive',
  addressParam,
  validate,
  controller.isActiveUser
);

// PUT /api/users/update
router.put('/update',
  requireAuth,  // Yêu cầu phải có JWT
  writeLimiter,
  uploadImage.single('avatar'),
  [
    body('name').trim().notEmpty().withMessage('Tên không được rỗng'),
    body('email').optional().isEmail().withMessage('Email không hợp lệ'),
    body('phone').optional().isString().withMessage('Số điện thoại không hợp lệ'),
  ],
  validate,
  controller.updateUserInfo
);

// PATCH /api/users/:address/grant-admin
router.patch('/:address/grant-admin',
  requireAuth,
  requireRole('Admin'),
  writeLimiter,
  addressParam,
  validate,
  controller.grantAdmin
);

// PATCH /api/users/:address/toggle-active
router.patch('/:address/toggle-active',
  requireAuth,
  requireRole('Admin'),
  writeLimiter,
  addressParam,
  validate,
  controller.toggleUserActive
);

module.exports = router;