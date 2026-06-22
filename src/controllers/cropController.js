// ============================================================
//  src/controllers/cropController.js
// ============================================================
const cropService = require('../services/cropService');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/crops/supplier
const getCropsBySupplier = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const supplierId = req.headers['x-supplier-id']; 
  const result = await cropService.getCropsBySupplier(supplierId, { page, limit, search });
  res.json({ success: true, ...result });
});

// GET /api/crops/product/:productId
const getCropsByProduct = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await cropService.getCropsByProduct(req.params.productId, { page, limit, search });
  res.json({ success: true, ...result });
});

// GET /api/crops/:id
const getCrop = asyncHandler(async (req, res) => {
  const crop = await cropService.getCrop(req.params.id);
  res.json({ success: true, data: crop });
});

// GET /api/crops/batch/:batchId
const getCropByBatchId = asyncHandler(async (req, res) => {
  const crop = await cropService.getCropByBatchId(req.params.batchId);
  res.json({ success: true, data: crop });
});

// GET /api/crops/ongoing/product/:productId
const getCropsOnGoingByProductWorkspace = asyncHandler(async (req, res) => {
  const supplierId = req.headers['x-supplier-id'];
  const crops = await cropService.getCropsOnGoingByProductWorkspace(req.params.productId, supplierId);
  res.json({ success: true, data: crops });
});

// GET /api/crops/events/:cropEventId
const getCropEvent = asyncHandler(async (req, res) => {
  const event = await cropService.getCropEvent(req.params.cropEventId);
  res.json({ success: true, data: event });
});

// GET /api/crops/:id/timeline
const getCropTimeline = asyncHandler(async (req, res) => {
  const timeline = await cropService.getCropTimeline(req.params.id);
  res.json({ success: true, data: timeline });
});

// GET /api/crops/:id/chain
const getCropFromChain = asyncHandler(async (req, res) => {
  const data = await cropService.getCropFromChain(req.params.id);
  res.json({ success: true, data });
});

// GET /api/crops/events/:cropEventId/chain
const getCropEventFromChain = asyncHandler(async (req, res) => {
  const data = await cropService.getCropEventFromChain(req.params.cropEventId);
  res.json({ success: true, data });
});

// POST /api/crops
const createCrop = asyncHandler(async (req, res) => {
  const { name, startDate, expectedHarvestDate, productId, location, cultivationArea } = req.body;
  const callerAddress = req.header('x-wallet-address');

  const result = await cropService.createCrop({
    name, startDate, expectedHarvestDate, productId, location, cultivationArea,
  }, callerAddress);
  res.status(201).json({ success: true, data: result });
});

// PUT /api/crops/:id
const updateCrop = asyncHandler(async (req, res) => {
  const { name, expectedHarvestDate, location, cultivationArea } = req.body;
  const callerAddress = req.header('x-wallet-address');
  const result = await cropService.updateCrop({
    cropId: req.params.id,
    name, expectedHarvestDate, location, cultivationArea,
  }, callerAddress);
  res.json({ success: true, data: result });
});

// DELETE /api/crops/:id
const deleteCrop = asyncHandler(async (req, res) => {
  const callerAddress = req.header('x-wallet-address');
  const result = await cropService.deleteCrop(req.params.id, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/crops/:id/events
const addCropEvent = asyncHandler(async (req, res) => {
  const { description, status } = req.body;
  const callerAddress = req.header('x-wallet-address');
  const result = await cropService.addCropEvent({
    cropId: req.params.id, description, status
  }, callerAddress);
  res.status(201).json({ success: true, data: result });
});

module.exports = {
  getCropsBySupplier,
  getCropsByProduct,
  getCrop,
  getCropByBatchId,
  getCropsOnGoingByProductWorkspace,
  getCropEvent,
  getCropTimeline,
  getCropFromChain,
  getCropEventFromChain,
  createCrop,
  updateCrop,
  deleteCrop,
  addCropEvent,
};
