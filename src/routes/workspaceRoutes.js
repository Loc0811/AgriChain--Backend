// ============================================================
//  src/routes/workspaceRoutes.js
// ============================================================
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const controller = require('../controllers/workspaceController');
const { validate, isEthAddress } = require('../middleware/validate');
const { writeLimiter } = require('../middleware/rateLimiter');
const { uploadImage } = require('../middleware/upload');
const { requireAuth, requireRole } = require('../middleware/auth');

// Reusable validations
const workspaceIdParam = param('id')
  .isInt({ min: 1 }).withMessage('ID phải là số nguyên dương');
const requestIdParam = param('requestId')
  .isInt({ min: 1 }).withMessage('Request ID phải là số nguyên dương');
const addressParam = param('address')
  .custom(isEthAddress)
  .withMessage('Địa chỉ phải là địa chỉ Ethereum hợp lệ');


// GET /api/workspaces/join-requests/:requestId
router.get('/join-requests/:requestId',
  requestIdParam,
  validate,
  controller.getJoinRequest
);

// GET /api/workspaces/join-requests/:requestId/chain
router.get('/join-requests/:requestId/chain',
  requestIdParam,
  validate,
  controller.getJoinRequestFromChain
);

// PATCH /api/workspaces/join-requests/:requestId
router.patch('/join-requests/:requestId',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  [
    requestIdParam,
    body('status')
      .isInt({ min: 1, max: 2 })
      .withMessage('Status phải là 1 (Approved) hoặc 2 (Rejected)')
  ],
  validate,
  controller.processJoinRequest
);

// GET /api/workspaces/user/:address
router.get('/user/:address',
  addressParam,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page phải >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit phải trong 1-100'),
    query('search').optional().isString(),
    query('productOfferId').optional().isInt({ min: 1 }).withMessage('Product Offer ID phải là số nguyên dương'),
  ],
  validate,
  controller.getUserWorkspaces
);

// GET /api/workspaces/user/:address/pending
router.get('/user/:address/pending',
  addressParam,
  validate,
  controller.getPendingWorkspacesForUser
);

// GET /api/workspaces
router.get('/', 
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page phải >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit phải trong 1-100'),
    query('search').optional().isString(),
  ],
  validate,
  controller.getAllWorkspaces
);

// GET /api/workspaces/:id
router.get('/:id', 
  workspaceIdParam,
  validate,
  controller.getWorkspace
);

// GET /api/workspaces/:id/members
router.get('/:id/members',
  workspaceIdParam,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page phải >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit phải trong 1-100'),
  ],
  validate,
  controller.getWorkspaceMembers
);

// GET /api/workspaces/:id/transporters
router.get('/:id/transporters',
  workspaceIdParam,
  validate,
  controller.getTransporterMembersByWorkspace
);

// GET /api/workspaces/:id/members/:address
router.get('/:id/members/:address',
  [workspaceIdParam, addressParam],
  validate,
  controller.getMember
);

// GET /api/workspaces/:id/join-requests
router.get('/:id/join-requests',
    workspaceIdParam,
    validate,
    controller.getJoinRequestsByWorkspace
);

// GET /api/workspaces/:id/chain
router.get('/:id/chain',
  workspaceIdParam,
  validate,
  controller.getWorkspaceFromChain
);

// GET /api/workspaces/:id/is-member/:address
router.get('/:id/is-member/:address',
  [workspaceIdParam, addressParam],
  validate,
  controller.isMemberWorkspace
);

// GET /api/workspaces/:id/members/:address/chain
router.get('/:id/members/:address/chain',
  [workspaceIdParam, addressParam],
  validate,
  controller.getMemberFromChain
);

// POST /api/workspaces
router.post('/', 
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  uploadImage.single('image'),
  [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name không được rỗng và tối đa 100 ký tự'),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  controller.createWorkspace
);

// PUT /api/workspaces/:id
router.put('/:id',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  uploadImage.single('image'),
  [
    workspaceIdParam,
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name không được rỗng và tối đa 100 ký tự'),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  controller.updateWorkspace
);

// DELETE /api/workspaces/:id
router.delete('/:id',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  workspaceIdParam,
  validate,
  controller.deleteWorkspace
);

// POST /api/workspaces/:id/leave
router.post('/:id/leave',
  requireAuth,
  writeLimiter,
  workspaceIdParam,
  validate,
  controller.leaveWorkspace
);

// DELETE /api/workspaces/:id/members/:address
router.delete('/:id/members/:address',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  [workspaceIdParam, addressParam],
  validate,
  controller.removeMember
);

// POST /api/workspaces/:id/join
router.post('/:id/join', 
  requireAuth,
  writeLimiter,
  [
    workspaceIdParam,
    body('representativeName').trim().notEmpty().isLength({ max: 100 }).withMessage('Representative Name không được rỗng và tối đa 100 ký tự'),
    body('message').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  controller.createJoinRequest
);

module.exports = router;