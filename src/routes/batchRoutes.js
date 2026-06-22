// ============================================================
//  src/routes/batchRoutes.js
// ============================================================
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const controller = require('../controllers/batchController');
const { validate, isEthAddress } = require('../middleware/validate');
const { writeLimiter } = require('../middleware/rateLimiter');
const { requireAuth, requireRole } = require('../middleware/auth');


const VALID_BATCH_STATUS = ['Pending','Producing','ReadyToShip','Shipping','Delivered','Stored','Cancelled'];

// GET /api/batches/:public/:id
router.get('/public/:id',
  param('id').isInt({ min: 1 }).withMessage('batchId phải là số nguyên dương'),
  validate,
  controller.getBatchPublic
);

// GET /api/batches/workspace/:workspaceId
router.get('/workspace/:workspaceId',
  [
    param('workspaceId').isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('isCompleted').optional().isBoolean().withMessage('isCompleted phải là boolean (true hoặc false)'),
  ],
  validate,
  controller.getBatchesByWorkspace
);

// GET /api/batches/workspace/:workspaceId/supplier
router.get('/workspace/:workspaceId/supplier',
  [
    param('workspaceId').isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('isCompleted').optional().isBoolean().withMessage('isCompleted phải là boolean (true hoặc false)'),
  ],
  validate,
  controller.getBatchesBySupplier
);

// GET /api/batches/workspace/:workspaceId/transporter
router.get('/workspace/:workspaceId/transporter',
  [
    param('workspaceId').isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('isCompleted').optional().isBoolean().withMessage('isCompleted phải là boolean (true hoặc false)'),
  ],
  validate,
  controller.getBatchesByTransporter
);

// GET /api/batches/workspace/:workspaceId/orders/supplier
router.get('/workspace/:workspaceId/orders/supplier',
  [
    param('workspaceId').isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  controller.getOrdersBySupplier
);

// GET /api/batches/workspace/:workspaceId/orders/transporter
router.get('/workspace/:workspaceId/orders/transporter',
  [
    param('workspaceId').isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  controller.getOrdersByTransporter
);

// GET /api/batches/:id/access-check
router.get('/:id/access-check',
  requireAuth,
  param('id').isInt({ min: 1 }),
  validate,
  controller.checkBatchAccess
);

// GET /api/batches/:id
router.get('/:id',
  param('id').isInt({ min: 1 }),
  validate,
  controller.getBatch
);

// GET /api/batches/:id/timeline
router.get('/:id/timeline',
  param('id').isInt({ min: 1 }),
  validate,
  controller.getBatchTimeline
);

// GET /api/batches/events/:eventId
router.get('/events/:eventId',
  param('eventId').isInt({ min: 1 }),
  validate,
  controller.getBatchEvent
);

// GET /api/batches/events/:eventId/timeline
router.get('/events/:eventId/timeline',
  param('eventId').isInt({ min: 1 }),
  validate,
  controller.getBatchEventTimeline
);

// GET /api/batches/events/details/:detailId
router.get('/events/details/:detailId',
  param('detailId').isInt({ min: 1 }),
  validate,
  controller.getBatchEventDetail
);

// GET /api/batches/:id/chain
router.get('/:id/chain',
  param('id').isInt({ min: 1 }),
  validate,
  controller.getBatchFromChain
);

// GET /api/batches/events/:eventId/chain
router.get('/events/:eventId/chain',
  param('eventId').isInt({ min: 1 }),
  validate,
  controller.getBatchEventFromChain
);

// GET /api/batches/events/details/:detailId/chain
router.get('/events/details/:detailId/chain',
  param('detailId').isInt({ min: 1 }),
  validate,
  controller.getBatchEventDetailFromChain
);

// POST /api/batches
router.post('/',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  (req, res, next) => { console.log('BODY:', JSON.stringify(req.body)); next(); },
  [
    body('productId').isInt({ min: 1 }).withMessage('productId phải là số nguyên dương'),
    body('quantity').isInt({ min: 1 }).withMessage('quantity phải là số nguyên dương'),
    body('supplierAssignmentType').isInt({ min: 0, max: 2 }).toInt().withMessage('supplierAssignmentType: 0=None, 1=Assigned, 2=Bidding'),
    body('supplierId').optional().custom(isEthAddress).withMessage('supplierId phải là địa chỉ Ethereum hợp lệ'),
    body('bidPrice').optional().isInt({ min: 0 }).withMessage('bidPrice phải là số nguyên không âm'),
  ],
  validate,
  controller.createBatch
);

// DELETE /api/batches/:id
router.delete('/:id',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  param('id').isInt({ min: 1 }),
  validate,
  controller.deleteBatch
);

// POST /api/batches/:id/events
router.post('/:id/events',
  requireAuth,
  writeLimiter,
  [
    param('id').isInt({ min: 1 }),
    body('status').isInt({ min: 0, max: 6 }).withMessage('status: 0=Pending, 1=Producing, 2=ReadyToShip, 3=Shipping, 4=Delivered, 5=Stored, 6=Cancelled'),
    body('note').optional().isString(),
    body('location').optional().isString(),
  ],
  validate,
  controller.addBatchEvent
);

// POST /api/batches/events/:eventId/details
router.post('/events/:eventId/details',
  requireAuth,
  writeLimiter,
  [
    param('eventId').isInt({ min: 1 }),
    body('location').isString().notEmpty().withMessage('location không được để trống'),
    body('description').optional().isString(),
  ],
  validate,
  controller.addBatchEventDetail
);

// POST /api/batches/:id/supplier-assignment
router.post('/:id/supplier-assignment',
  requireAuth,
  writeLimiter,
  [
    param('id').isInt({ min: 1 }),
    body('assignmentStatus').isInt({ min: 0, max: 2 }).withMessage('assignmentStatus: 0=None, 1=Assigned, 2=Bidding'),
  ],
  validate,
  controller.updateSupplierAssignment
);

// POST /api/batches/:id/transporter-assignment
router.post('/:id/transporter-assignment',
  requireAuth,
  writeLimiter,
  [
    param('id').isInt({ min: 1 }),
    body('assignmentStatus').isInt({ min: 0, max: 2 }).withMessage('assignmentStatus: 0=None, 1=Assigned, 2=Bidding'),
    body('pickupAddress').isString().notEmpty(),
    body('deliveryAddress').isString().notEmpty(),
  ],
  validate,
  controller.updateTransporterAssignment
);

module.exports = router;