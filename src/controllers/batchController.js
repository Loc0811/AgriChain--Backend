// ============================================================
//  src/controllers/batchController.js
// ============================================================
const batchService = require('../services/batchService');
const { asyncHandler } = require('../middleware/errorHandler');
const { getCache, setCache } = require('../utils/cache');

// GET /api/batches/:id
const getBatch = asyncHandler(async (req, res) => {
  const batch = await batchService.getBatch(req.params.id);
  res.json({ success: true, data: batch });
});

// GET /api/batches/:id/timeline
const getBatchTimeline = asyncHandler(async (req, res) => {
  const result = await batchService.getBatchTimeline(req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/batches/events/:eventId
const getBatchEvent = asyncHandler(async (req, res) => {
  const result = await batchService.getBatchEvent(req.params.eventId);
  res.json({ success: true, data: result });
});

// GET /api/batches/events/:eventId/timeline
const getBatchEventTimeline = asyncHandler(async (req, res) => {
  const result = await batchService.getBatchEventTimeline(req.params.eventId);
  res.json({ success: true, data: result });
});

// GET /api/batches/events/details/:detailId
const getBatchEventDetail = asyncHandler(async (req, res) => {
  const result = await batchService.getBatchEventDetail(req.params.detailId);
  res.json({ success: true, data: result });
});

// GET /api/batches/workspace/:workspaceId
const getBatchesByWorkspace = asyncHandler(async (req, res) => {
  const { page, limit, isCompleted } = req.query;
  const result = await batchService.getBatchesByWorkspace( req.params.workspaceId, { page, limit, isCompleted });
  res.json({ success: true, ...result });
});

// GET /api/batches/workspace/:workspaceId/supplier
const getBatchesBySupplier = asyncHandler(async (req, res) => {
  const supplierId = req.headers['x-supplier-id'];
  const { page, limit, isCompleted } = req.query;
  const result = await batchService.getBatchesBySupplier(supplierId, req.params.workspaceId, { page, limit, isCompleted });
  res.json({ success: true, ...result });
});

// GET /api/batches/workspace/:workspaceId/transporter
const getBatchesByTransporter = asyncHandler(async (req, res) => {
  const transporterId = req.headers['x-transporter-id'];
  const { page, limit, isCompleted } = req.query;
  const result = await batchService.getBatchesByTransporter(transporterId, req.params.workspaceId, { page, limit, isCompleted });
  res.json({ success: true, ...result });
});

// GET /api/batches/workspace/:workspaceId/orders/supplier
const getOrdersBySupplier = asyncHandler(async (req, res) => {
  const supplierId = req.headers['x-supplier-id'];
  const { page, limit } = req.query;
  const result = await batchService.getOrdersBySupplier(supplierId, req.params.workspaceId, { page, limit });
  res.json({ success: true, ...result });
});

// GET /api/batches/workspace/:workspaceId/orders/transporter
const getOrdersByTransporter = asyncHandler(async (req, res) => {
  const transporterId = req.headers['x-transporter-id'];
  const { page, limit } = req.query;
  const result = await batchService.getOrdersByTransporter(transporterId, req.params.workspaceId, { page, limit });
  res.json({ success: true, ...result });
});

// GET /api/batches/:id/access-check
const checkBatchAccess = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const allowed = await batchService.canAccessBatch(callerAddress, req.params.id);
  res.json({ success: true, data: { allowed } });
});

// GET /api/batches/public/:id
const getBatchPublic = asyncHandler(async (req, res) => {
  const cacheKey = `batch_public_${req.params.id}`;
  
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  const result = await batchService.getBatchPublic(req.params.id);
  
  const response = { success: true, data: result };
  setCache(cacheKey, response, 60 * 60); // 1 giờ
  
  res.json(response);
});

// GET /api/batches/:id/chain
const getBatchFromChain = asyncHandler(async (req, res) => {
  const result = await batchService.getBatchFromChain(req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/batches/events/:eventId/chain
const getBatchEventFromChain = asyncHandler(async (req, res) => {
  const result = await batchService.getBatchEventFromChain(req.params.eventId);
  res.json({ success: true, data: result });
});

// GET /api/batches/events/details/:detailId/chain
const getBatchEventDetailFromChain = asyncHandler(async (req, res) => {
  const result = await batchService.getBatchEventDetailFromChain(req.params.detailId);
  res.json({ success: true, data: result });
});

// POST /api/batches
const createBatch = asyncHandler(async (req, res) => {
  const { productId, quantity, supplierAssignmentType, supplierId, bidPrice } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await batchService.createBatch({ productId, quantity, supplierAssignmentType, supplierId, bidPrice }, callerAddress);
  res.status(201).json({ success: true, data: result });
});

// DELETE /api/batches/:id
const deleteBatch = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const result = await batchService.deleteBatch(req.params.id, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/batches/:id/events
const addBatchEvent = asyncHandler(async (req, res) => {
  const { status, note, location } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await batchService.addBatchEvent({ batchId: req.params.id, status, note, location }, callerAddress);
  res.status(201).json({ success: true, data: result });
});

// POST /api/batches/events/:eventId/details
const addBatchEventDetail = asyncHandler(async (req, res) => {
  const { location, description } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await batchService.addBatchEventDetail({ batchEventId: req.params.eventId, location, description }, callerAddress);
  res.status(201).json({ success: true, data: result });
});

// PATCH /api/batches/:id/supplier-assignment
const updateSupplierAssignment = asyncHandler(async (req, res) => {
  const { assignmentStatus } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await batchService.updateSupplierAssignment({ batchId: req.params.id, assignmentStatus }, callerAddress);
  res.json({ success: true, data: result });
});

// PATCH /api/batches/:id/transporter-assignment
const updateTransporterAssignment = asyncHandler(async (req, res) => {
  const { assignmentStatus, pickupAddress, deliveryAddress } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await batchService.updateTransporterAssignment({
    batchId: req.params.id,
    assignmentStatus,
    pickupAddress,
    deliveryAddress,
  }, callerAddress);
  res.json({ success: true, data: result });
});

module.exports = {
  getBatch,
  getBatchTimeline,
  getBatchEvent,
  getBatchEventTimeline,
  getBatchEventDetail,
  getBatchesByWorkspace,
  getBatchesBySupplier,
  getBatchesByTransporter,
  getOrdersBySupplier,
  getOrdersByTransporter,
  checkBatchAccess,
  getBatchPublic,
  getBatchFromChain,
  getBatchEventFromChain,
  getBatchEventDetailFromChain,
  createBatch,
  deleteBatch,
  addBatchEvent,
  addBatchEventDetail,
  updateSupplierAssignment,
  updateTransporterAssignment,
};