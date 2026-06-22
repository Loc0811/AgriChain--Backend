// ============================================================
//  src/controllers/productController.js
// ============================================================
const productService = require('../services/productService');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/products/:workspaceId/product-workspace
const getAllProductWorkspaces = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await productService.getAllProductWorkspaces(req.params.workspaceId, { page, limit, search });
  res.json({ success: true, ...result });
});

// GET /api/products/unmapped?workspaceId=123&productOfferId=456
const getUnmappedProductWorkspaces = asyncHandler(async (req, res) => {
  const { workspaceId, productOfferId, page, limit } = req.query;
  const result = await productService.getUnmappedProductWorkspaces(workspaceId, productOfferId, { page, limit });
  res.json({ success: true, ...result });
});

// GET /api/products/product-workspace/:id
const getProductWorkspace = asyncHandler(async (req, res) => {
  const result = await productService.getProductWorkspace(req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/products/:supplierId/product-offer
const getAllProductOffers = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await productService.getAllProductOffers(req.params.supplierId, { page, limit, search });
  res.json({ success: true, ...result });
});

// GET /api/products/product-offer/:id
const getProductOffer = asyncHandler(async (req, res) => {
  const result = await productService.getProductOffer(req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/products/product-mapping/check
const checkProductMapping = asyncHandler(async (req, res) => {
  const { productWorkspaceId, productOfferId } = req.query;
  const result = await productService.checkProductMapping(productWorkspaceId, productOfferId);
  res.json({ success: true, data: result });
});

// GET /api/products/mappings/suppliers/:productWorkspaceId
const getSuppliersOfProductWorkspace = asyncHandler(async (req, res) => {
  const result = await productService.getSuppliersOfProductWorkspace(req.params.productWorkspaceId);
  res.json({ success: true, data: result });
});

// GET /api/products/proposals/:proposalId
const getSupplyProposal = asyncHandler(async (req, res) => {
  const result = await productService.getSupplyProposal(req.params.proposalId);
  res.json({ success: true, data: result });
});

// GET /api/products/:workspaceId/proposals
const getPendingSupplyProposals = asyncHandler(async (req, res) => {
  const result = await productService.getPendingSupplyProposals(req.params.workspaceId);
  res.json({ success: true, data: result, count: result.length });
});

// GET /api/products/product-workspace/:id/chain
const getProductWorkspaceFromChain = asyncHandler(async (req, res) => {
  const result = await productService.getProductWorkspaceFromChain(req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/products/product-offer/:id/chain
const getProductOfferFromChain = asyncHandler(async (req, res) => {
  const result = await productService.getProductOfferFromChain(req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/products/mappings/chain
const getProductMappingFromChain = asyncHandler(async (req, res) => {
  const { productWorkspaceId, productOfferId } = req.query;
  const result = await productService.getProductMappingFromChain(productWorkspaceId, productOfferId);
  res.json({ success: true, data: result });
});

// GET /api/products/proposals/:proposalId/chain
const getSupplyProposalFromChain = asyncHandler(async (req, res) => {
  const result = await productService.getSupplyProposalFromChain(req.params.proposalId);
  res.json({ success: true, data: result });
});

// POST /api/products/product-workspace
const createProductWorkspace = asyncHandler(async (req, res) => {
  const { name, description, unit, workspaceId } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.createProductWorkspace({ name, description, unit, workspaceId }, callerAddress, req.file);
  res.status(201).json({ success: true, data: result });
});

// PUT /api/products/product-workspace/:id
const updateProductWorkspace = asyncHandler(async (req, res) => {
  const { name, description, unit } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.updateProductWorkspace({
    productWorkspaceId: req.params.id,
    name, description, unit
   }, callerAddress, req.file);
  res.json({ success: true, data: result });
});

// DELETE /api/products/product-workspace/:id
const deleteProductWorkspace = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.deleteProductWorkspace(req.params.id, callerAddress);
  res.json({ success: true, data: result });
});

// PATCH /api/products/product-workspace/:id/quantity
const adjustProductQuantity = asyncHandler(async (req, res) => {
  const { delta } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.adjustProductQuantity(req.params.id, delta, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/products/product-offer
const createProductOffer = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.createProductOffer({ name, description }, callerAddress, req.file);
  res.status(201).json({ success: true, data: result });
});

// PUT /api/products/product-offer/:id
const updateProductOffer = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.updateProductOffer({
    productOfferId: req.params.id,
    name, description
  }, callerAddress, req.file);
  res.json({ success: true, data: result });
});

// DELETE /api/products/product-offer/:id
const deleteProductOffer = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.deleteProductOffer(req.params.id, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/products/mappings
const mappingProduct = asyncHandler(async (req, res) => {
  const { productWorkspaceId, productOfferId } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.mappingProduct({productWorkspaceId, productOfferId}, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/products/proposals
const createSupplyProposal = asyncHandler(async (req, res) => {
  const { workspaceId, productId } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.createSupplyProposal({ workspaceId, productId }, callerAddress);
  res.json({ success: true, data: result });
});

// PATCH /api/products/proposals/:proposalId
const processSupplyProposal = asyncHandler(async (req, res) => {
  const { status, productWorkspaceId, name, description, unit } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await productService.processSupplyProposal(
    { proposalId: req.params.proposalId, status, productWorkspaceId, name, description, unit },
    callerAddress,
    req.file
  );
  res.json({ success: true, data: result });
});

module.exports = {
  getAllProductWorkspaces,
  getUnmappedProductWorkspaces,
  getProductWorkspace,
  getAllProductOffers,
  getProductOffer,
  checkProductMapping,
  getSuppliersOfProductWorkspace,
  getSupplyProposal,
  getPendingSupplyProposals,
  getProductWorkspaceFromChain,
  getProductOfferFromChain,
  getProductMappingFromChain,
  getSupplyProposalFromChain,
  createProductWorkspace,
  updateProductWorkspace,
  deleteProductWorkspace,
  adjustProductQuantity,
  createProductOffer,
  updateProductOffer,
  deleteProductOffer,
  mappingProduct,
  createSupplyProposal,
  processSupplyProposal,
}


