// ============================================================
//  src/routes/inviteRoutes.js
// ============================================================
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const controller = require('../controllers/inviteController');
const { validate, isEthAddress } = require('../middleware/validate');
const { writeLimiter } = require('../middleware/rateLimiter');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /invites/supply/batch/:batchId
router.get('/supply/batch/:batchId',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.getSupplyInvitationsByBatch
);

// GET /invites/shipping/batch/:batchId
router.get('/shipping/batch/:batchId',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.getShippingInvitationsByBatch
);

// GET /invites/supply/:invitationId
router.get('/supply/:invitationId',
  param('invitationId').isInt({ min: 1 }),
  validate,
  controller.getSupplyInvitation
);

// GET /invites/shipping/:invitationId
router.get('/shipping/:invitationId',
  param('invitationId').isInt({ min: 1 }),
  validate,
  controller.getShippingInvitation
);

// GET /invites/supply/batch/:batchId/supplier
router.get('/supply/batch/:batchId/supplier',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.getSupplyInvitationsOfSupplier
);

// GET /invites/shipping/batch/:batchId/transporter
router.get('/shipping/batch/:batchId/transporter',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.getShippingInvitationsOfTransporter
);

// GET /invites/supply/batch/:batchId/winner
router.get('/supply/batch/:batchId/winner',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.hasWonSupplyInvitation
);

// GET /invites/shipping/batch/:batchId/winner
router.get('/shipping/batch/:batchId/winner',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.hasWonShippingInvitation
);

// GET /invites/supply/:invitationId/chain
router.get('/supply/:invitationId/chain',
  param('invitationId').isInt({ min: 1 }),
  validate,
  controller.getSupplyInvitationFromChain
);

// GET /invites/shipping/:invitationId/chain
router.get('/shipping/:invitationId/chain',
  param('invitationId').isInt({ min: 1 }),
  validate,
  controller.getShippingInvitationFromChain
);

// GET /invites/supply/batch/:batchId/chain
router.get('/supply/batch/:batchId/chain',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.getSupplyInvitationIdsByBatchFromChain
);

// GET /invites/shipping/batch/:batchId/chain
router.get('/shipping/batch/:batchId/chain',
  param('batchId').isInt({ min: 1 }),
  validate,
  controller.getShippingInvitationIdsByBatchFromChain
);

// POST /invites/shipping/assign
router.post('/shipping/assign',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  [
    body('batchId').isInt({ min: 1 }),
    body('transporterId').custom(isEthAddress),
    body('bidPrice').isInt({ min: 1 }).withMessage('bidPrice phải lớn hơn 0'),
    body('pickupAddress').optional().isString(),
    body('deliveryAddress').optional().isString(),
  ],
  validate,
  controller.setAssignedTransporter
);

// POST /invites/supply/:invitationId/respond
router.post('/supply/:invitationId/respond',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter,
  [
    param('invitationId').isInt({ min: 1 }),
    body('status').isInt({ min: 1, max: 2 }).withMessage('status: 1=Accepted, 2=Rejected'),
    body('cropId')
      .if(body('status').equals('1'))
      .isInt({ min: 1 }).withMessage('cropId bắt buộc và phải lớn hơn 0 khi chấp nhận'),
  ],
  validate,
  controller.respondSupplyInvitationAssigned
);

// POST /invites/shipping/:invitationId/respond
router.post('/shipping/:invitationId/respond',
  requireAuth,
  requireRole('Transporter'),
  writeLimiter,
  [
    param('invitationId').isInt({ min: 1 }),
    body('status').isInt({ min: 1, max: 2 }).withMessage('status: 1=Accepted, 2=Rejected'),
  ],
  validate,
  controller.respondShippingInvitationAssigned
);

// POST /invites/supply/bidding
router.post('/supply/bidding',
  requireAuth,
  writeLimiter,
  [
    body('batchId').isInt({ min: 1 }),
    body('supplierId').custom(isEthAddress),
    body('cropId').optional().isInt({ min: 0 }),
    body('bidPrice').isInt({ min: 1 }).withMessage('bidPrice phải lớn hơn 0'),
  ],
  validate,
  controller.createSupplyBidding
);

// POST /invites/shipping/bidding
router.post('/shipping/bidding',
  requireAuth,
  writeLimiter,
  [
    body('batchId').isInt({ min: 1 }),
    body('transporterId').custom(isEthAddress),
    body('bidPrice').isInt({ min: 1 }).withMessage('bidPrice phải lớn hơn 0'),
  ],
  validate,
  controller.createShippingBidding
);

// POST /invites/supply/:invitationId/select-winner
router.post('/supply/:invitationId/select-winner',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  param('invitationId').isInt({ min: 1 }),
  validate,
  controller.selectBiddingWinnerSupply
);

// POST /invites/shipping/:invitationId/select-winner
router.post('/shipping/:invitationId/select-winner',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  param('invitationId').isInt({ min: 1 }),
  validate,
  controller.selectBiddingWinnerShipping
);

module.exports = router;