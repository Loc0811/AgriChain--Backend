// ============================================================
//  src/routes/productRoutes.js
// ============================================================
const router = require('express').Router();
const { body, query, param } = require('express-validator');
const controller = require('../controllers/productController');
const { validate, isEthAddress } = require('../middleware/validate');
const { writeLimiter } = require('../middleware/rateLimiter');
const { uploadImage } = require('../middleware/upload');
const { requireAuth, requireRole } = require('../middleware/auth');

// Reuseable validators
const positiveInt = (field) => 
  param(field).isInt({ min: 1 }).withMessage(`${field} phải là số nguyên dương`);

const addressParam = (field = 'address') =>
  param(field).custom(isEthAddress).withMessage(`Địa chỉ Ethereum hợp lệ`);

// GET /api/products/:workspaceId/product-workspace
router.get('/:workspaceId/product-workspace',
  positiveInt('workspaceId'),
  [ 
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString().trim(),
  ],
  validate,
  controller.getAllProductWorkspaces
);

// GET /api/products/unmapped?workspaceId=123&productOfferId=456
router.get('/unmapped',
  [
    query('workspaceId').isInt({ min: 1 }).withMessage('workspaceId phải là số nguyên dương'),
    query('productOfferId').isInt({ min: 1 }).withMessage('productOfferId phải là số nguyên dương'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  controller.getUnmappedProductWorkspaces
);

// GET /api/products/mappings/suppliers/:productWorkspaceId
router.get('/mappings/suppliers/:productWorkspaceId',
  positiveInt('productWorkspaceId'),
  validate,
  controller.getSuppliersOfProductWorkspace
);

// GET /api/products/product-workspace/:id/chain
router.get('/product-workspace/:id/chain',
  positiveInt('id'),
  validate,
  controller.getProductWorkspaceFromChain
);

// GET /api/products/product-workspace/:id
router.get('/product-workspace/:id',
  positiveInt('id'),
  validate,
  controller.getProductWorkspace
);

// GET /api/products/:supplierId/product-offer
router.get('/:supplierId/product-offer',
  addressParam('supplierId'),
  [ 
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString().trim(),
  ],
  validate,
  controller.getAllProductOffers
);

// GET /api/products/product-offer/:id/chain
router.get('/product-offer/:id/chain',
  positiveInt('id'),
  validate,
  controller.getProductOfferFromChain
);

// GET /api/products/product-offer/:id
router.get('/product-offer/:id',
  positiveInt('id'),
  validate,
  controller.getProductOffer
);

// GET /api/products/product-mapping/check?productWorkspaceId=&productOfferId=
router.get('/product-mapping/check',
  [
    query('productWorkspaceId').isInt({ min: 1 }).withMessage('productWorkspaceId phải là số nguyên dương'),
    query('productOfferId').isInt({ min: 1 }).withMessage('productOfferId phải là số nguyên dương'),
  ],
  validate,
  controller.checkProductMapping
);

// GET /api/products/product-mapping/chain?productWorkspaceId=&productOfferId=
router.get('/product-mapping/chain',
  [
    query('productWorkspaceId').isInt({ min: 1 }).withMessage('productWorkspaceId phải là số nguyên dương'),
    query('productOfferId').isInt({ min: 1 }).withMessage('productOfferId phải là số nguyên dương'),
  ],
  validate,
  controller.getProductMappingFromChain
);

// GET /api/products/:workspaceId/proposals
router.get('/:workspaceId/proposals',
  positiveInt('workspaceId'),
  validate,
  controller.getPendingSupplyProposals
);

// GET /api/products/proposals/:proposalId/chain
router.get('/proposals/:proposalId/chain',
  positiveInt('proposalId'),
  validate,
  controller.getSupplyProposalFromChain
);

// GET /api/products/proposals/:proposalId
router.get('/proposals/:proposalId',
  positiveInt('proposalId'),
  validate,
  controller.getSupplyProposal
);

// POST /api/products/product-workspace
router.post('/product-workspace',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  uploadImage.single('image'),
  [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name phải có độ dài từ 2 đến 100 ký tự'),
    body('unit').trim().notEmpty().withMessage('Unit không được rỗng'),
    body('workspaceId').isInt({ min: 1 }).withMessage('workspaceId phải là số nguyên dương'),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  controller.createProductWorkspace
);

// PUT /api/products/product-workspace/:id
router.put('/product-workspace/:id',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  uploadImage.single('image'),
  [
    positiveInt('id'),
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name phải có độ dài từ 2 đến 100 ký tự'),
    body('unit').trim().notEmpty().withMessage('Unit không được rỗng'),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  controller.updateProductWorkspace
);

// DELETE /api/products/product-workspace/:id
router.delete('/product-workspace/:id',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  positiveInt('id'),
  validate,
  controller.deleteProductWorkspace
);

// PATCH /api/products/product-workspace/:id/quantity
router.patch('/product-workspace/:id/quantity',
  requireAuth,
  writeLimiter,
  [
    positiveInt('id'),
    body('delta').isInt().withMessage('Delta phải là số nguyên (có thể âm)'),
  ],
  validate,
  controller.adjustProductQuantity
);

// POST /api/products/product-offer
router.post('/product-offer',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter,
  uploadImage.single('image'),
  [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name phải có độ dài từ 2 đến 100 ký tự'),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  controller.createProductOffer
);

//PUT /api/products/product-offer/:id
router.put('/product-offer/:id',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter, 
  uploadImage.single('image'),
  [
    positiveInt('id'),
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name phải có độ dài từ 2 đến 100 ký tự'),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  controller.updateProductOffer
);

// DELETE /api/products/product-offer/:id
router.delete('/product-offer/:id',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter,
  positiveInt('id'),
  validate,
  controller.deleteProductOffer
);

// POST /api/products/mappings
router.post('/mappings',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  [
    body('productWorkspaceId').isInt({ min: 1 }).withMessage('productWorkspaceId phải là số nguyên dương'),
    body('productOfferId').isInt({ min: 1 }).withMessage('productOfferId phải là số nguyên dương'),
  ],
  validate,
  controller.mappingProduct
);

// POST /api/products/proposals
router.post('/proposals',
  requireAuth,
  requireRole('Supplier'),
  writeLimiter,
  [
    body('workspaceId').isInt({ min: 1 }).withMessage('workspaceId phải là số nguyên dương'),
    body('productId').isInt({ min: 1 }).withMessage('productId phải là số nguyên dương'),
  ],
  validate,
  controller.createSupplyProposal
);

// PATCH /api/products/proposals/:proposalId
router.patch('/proposals/:proposalId',
  requireAuth,
  requireRole('Distributor'),
  writeLimiter,
  uploadImage.single('image'),
  [
    positiveInt('proposalId'),
    body('status').isInt({ min: 1, max: 2 }).toInt().withMessage('Status phải là 1 (chấp nhận), 2 (từ chối)'),
    body('productWorkspaceId').optional().isInt({ min: 0 }).withMessage('productWorkspaceId phải là số nguyên >= 0'),
    body('name').optional().isString().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('unit').optional().isString(),
  ],
  validate,
  controller.processSupplyProposal
);

module.exports = router;