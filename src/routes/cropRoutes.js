// ============================================================
//  src/routes/cropRoutes.js
// ============================================================
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const controller = require('../controllers/cropController');
const { validate, isEthAddress } = require('../middleware/validate');
const { writeLimiter } = require('../middleware/rateLimiter');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_CROP_EVENT_STATUS = ['GeneralLog', 'Irrigation', 'Fertilization', 'PestControl', 'Harvest'];

// GET /crops/event/:cropEventId/chain 
router.get(
  '/event/:cropEventId/chain',
  param('cropEventId').isInt({ min: 1 }),
  validate,
  controller.getCropEventFromChain
);

// GET /crops/:id/chain  
router.get(
  '/:id/chain',
  param('id').isInt({ min: 1 }),
  validate,
  controller.getCropFromChain
);

// GET /crops/supplier
router.get(
  '/supplier',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
  ],
  validate,
  controller.getCropsBySupplier
);

// GET /crops/product/:productId
router.get(
  '/product/:productId',
  [
    param('productId').isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
  ],
  validate,
  controller.getCropsByProduct
);

// GET /crops/ongoing/product/:productId
router.get(
  '/ongoing/product/:productId',
  param('productId').isInt({ min: 1 }),
  validate,
  controller.getCropsOnGoingByProductWorkspace
);

// GET /crops/events/:cropEventId
router.get(
  '/events/:cropEventId',
  param('cropEventId').isInt({ min: 1 }),
  validate,
  controller.getCropEvent
);

// GET /crops/:id
router.get(
  '/:id',
  param('id').isInt({ min: 1 }),
  validate,
  controller.getCrop
);

// GET /crops/batch/:batchId
router.get(
  '/batch/:batchId',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.getCropByBatchId
);

// GET /crops/:id/timeline
router.get(
  '/:id/timeline',
  param('id').isInt({ min: 1 }),
  validate,
  controller.getCropTimeline
);

// POST /crops
router.post(
  '/',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter,
  [
    body('name').notEmpty().withMessage('Tên mùa vụ không được để trống'),
    body('startDate').isInt({ min: 1 }).withMessage('startDate phải là unix timestamp'),
    body('expectedHarvestDate').isInt({ min: 1 }).withMessage('expectedHarvestDate phải là unix timestamp'),
    body('productId').isInt({ min: 1 }).withMessage('productId phải là số nguyên dương'),
    body('location').notEmpty().withMessage('Địa điểm không được để trống'),
    body('cultivationArea').isInt({ min: 1 }).withMessage('cultivationArea phải là số nguyên dương'),
  ],
  validate,
  controller.createCrop
);

// PUT /crops/:id
router.put(
  '/:id',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter,
  [
    param('id').isInt({ min: 1 }),
    body('name').notEmpty().withMessage('Tên mùa vụ không được để trống'),
    body('expectedHarvestDate').isInt({ min: 1 }).withMessage('expectedHarvestDate phải là unix timestamp'),
    body('location').notEmpty().withMessage('Địa điểm không được để trống'),
    body('cultivationArea').isInt({ min: 1 }).withMessage('cultivationArea phải là số nguyên dương'),
  ],
  validate,
  controller.updateCrop
);

// DELETE /crops/:id
router.delete(
  '/:id',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter,
  param('id').isInt({ min: 1 }),
  validate,
  controller.deleteCrop
);

// POST /crops/:id/events
router.post(
  '/:id/events',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter,
  [
    param('id').isInt({ min: 1 }),
    body('description').notEmpty().withMessage('Mô tả sự kiện không được để trống'),
    body('status').isIn(VALID_CROP_EVENT_STATUS).withMessage(`status phải là một trong: ${VALID_CROP_EVENT_STATUS.join(', ')}`),
  ],
  validate,
  controller.addCropEvent
);

module.exports = router;
