// ============================================================
//  src/routes/certificationRoutes.js
// ============================================================
const router = require('express').Router();
const multer = require('multer');
const { body, param, query } = require('express-validator');
const controller = require('../controllers/certificationController');
const { validate, isEthAddress } = require('../middleware/validate');
const { writeLimiter } = require('../middleware/rateLimiter');
const { uploadPDF } = require('../middleware/upload');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /certifications/user
router.get(
  '/user',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page phải là số nguyên dương'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit phải là số nguyên dương tối đa 100'),
    query('isActive').optional().isBoolean().withMessage('isActive phải là boolean'),
    query('search').optional().isString().withMessage('Search phải là chuỗi'),
  ],
  validate,
  controller.getCertificationsByUser
);

// GET /certifications/:id/chain — đọc certification trực tiếp từ smart contract
router.get(
  '/:id/chain',
  param('id').isInt({ min: 1 }),
  validate,
  controller.getCertificationFromChain
);

// GET /certifications/:id
router.get(
  '/:id',
  param('id').isInt({ min: 1 }),
  validate,
  controller.getCertification
);

// POST /certifications
router.post(
  '/',
  requireAuth,
  writeLimiter,
  uploadPDF.single('file'),
  (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File PDF certification không được để trống' });
    }
    next();
  },
  validate,
  controller.issueCertificationFromPdf
);

// POST /certifications/:id/expire
// Ai cũng có thể gọi — contract tự reject nếu chưa đến hạn
router.post(
  '/:id/expire',
  requireAuth,
  writeLimiter,
  param('id').isInt({ min: 1 }),
  validate,
  controller.expireCertification
);

module.exports = router;