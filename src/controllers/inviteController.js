// ============================================================
//  src/controllers/inviteController.js
// ============================================================
const inviteService = require('../services/inviteService');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/invites/supply/batch/:batchId
const getSupplyInvitationsByBatch = asyncHandler(async (req, res) => {
  const data = await inviteService.getSupplyInvitationsByBatch(req.params.batchId);
  res.json({ success: true, data, count: data.length });
});

// GET /api/invites/shipping/batch/:batchId
const getShippingInvitationsByBatch = asyncHandler(async (req, res) => {
  const data = await inviteService.getShippingInvitationsByBatch(req.params.batchId);
  res.json({ success: true, data, count: data.length });
});

// GET /api/invites/supply/:invitationId
const getSupplyInvitation = asyncHandler(async (req, res) => {
  const data = await inviteService.getSupplyInvitation(req.params.invitationId);
  res.json({ success: true, data });
});

// GET /api/invites/shipping/:invitationId
const getShippingInvitation = asyncHandler(async (req, res) => {
  const data = await inviteService.getShippingInvitation(req.params.invitationId);
  res.json({ success: true, data });
});

// GET /api/invites/supply/batch/:batchId/supplier
const getSupplyInvitationsOfSupplier = asyncHandler(async (req, res) => {
  const data = await inviteService.getSupplyInvitationsOfSupplier(req.params.batchId);
  res.json({ success: true, data });
});

// GET /api/invites/shipping/batch/:batchId/transporter
const getShippingInvitationsOfTransporter = asyncHandler(async (req, res) => {
  const data = await inviteService.getShippingInvitationsOfTransporter(req.params.batchId);
  res.json({ success: true, data });
});

// GET /api/invites/supply/batch/:batchId/winner
const hasWonSupplyInvitation = asyncHandler(async (req, res) => {
  const result = await inviteService.hasWonSupplyInvitation(req.params.batchId);
  res.json({ success: true, data: result });
});

// GET /api/invites/shipping/batch/:batchId/winner
const hasWonShippingInvitation = asyncHandler(async (req, res) => {
  const result = await inviteService.hasWonShippingInvitation(req.params.batchId);
  res.json({ success: true, data: result });
});

// GET /api/invites/supply/:invitationId/chain
const getSupplyInvitationFromChain = asyncHandler(async (req, res) => {
  const data = await inviteService.getSupplyInvitationFromChain(req.params.invitationId);
  res.json({ success: true, data });
});

// GET /api/invites/shipping/:invitationId/chain
const getShippingInvitationFromChain = asyncHandler(async (req, res) => {
  const data = await inviteService.getShippingInvitationFromChain(req.params.invitationId);
  res.json({ success: true, data });
});

// GET /api/invites/supply/batch/:batchId/chain
const getSupplyInvitationIdsByBatchFromChain = asyncHandler(async (req, res) => {
  const data = await inviteService.getSupplyInvitationIdsByBatchFromChain(req.params.batchId);
  res.json({ success: true, data });
});

// GET /api/invites/shipping/batch/:batchId/chain
const getShippingInvitationIdsByBatchFromChain = asyncHandler(async (req, res) => {
  const data = await inviteService.getShippingInvitationIdsByBatchFromChain(req.params.batchId);
  res.json({ success: true, data });
});

// POST /api/invites/shipping/assign
const setAssignedTransporter = asyncHandler(async (req, res) => {
  const callerAddress = req.header('x-wallet-address');
  const result = await inviteService.setAssignedTransporter(req.body, callerAddress);
  res.status(201).json({ success: true, data: result });
});

// POST /api/invites/supply/:invitationId/respond
const respondSupplyInvitationAssigned = asyncHandler(async (req, res) => {
  const { status, cropId } = req.body;
  const callerAddress = req.header('x-wallet-address');
  const result = await inviteService.respondSupplyInvitationAssigned({invitationId: req.params.invitationId, status, cropId }, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/invites/shipping/:invitationId/respond
const respondShippingInvitationAssigned = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const callerAddress = req.header('x-wallet-address');
  const result = await inviteService.respondShippingInvitationAssigned({ invitationId: req.params.invitationId, status }, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/invites/supply/bidding
const createSupplyBidding = asyncHandler(async (req, res) => {
  const callerAddress = req.header('x-wallet-address');
  const { batchId, supplierId, cropId, bidPrice } = req.body;
  const result = await inviteService.createSupplyBidding({ batchId, supplierId, cropId, bidPrice }, callerAddress);
  res.status(201).json({ success: true, data: result });
});

// POST /api/invites/shipping/bidding
const createShippingBidding = asyncHandler(async (req, res) => {
  const callerAddress = req.header('x-wallet-address');
  const { batchId, transporterId, bidPrice } = req.body;
  const result = await inviteService.createShippingBidding({ batchId, transporterId, bidPrice }, callerAddress);
  res.status(201).json({ success: true, data: result });
});

// POST /api/invites/supply/:invitationId/select-winner
const selectBiddingWinnerSupply = asyncHandler(async (req, res) => {
  const callerAddress = req.header('x-wallet-address');
  const result = await inviteService.selectBiddingWinnerSupply(req.params.invitationId, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/invites/shipping/:invitationId/select-winner
const selectBiddingWinnerShipping = asyncHandler(async (req, res) => {
  const callerAddress = req.header('x-wallet-address');
  const result = await inviteService.selectBiddingWinnerShipping(req.params.invitationId, callerAddress);
  res.json({ success: true, data: result });
});

module.exports = {
  getSupplyInvitationsByBatch,
  getShippingInvitationsByBatch,
  getSupplyInvitation,
  getShippingInvitation,
  getSupplyInvitationsOfSupplier,
  getShippingInvitationsOfTransporter,
  hasWonSupplyInvitation,
  hasWonShippingInvitation,
  getSupplyInvitationFromChain,
  getShippingInvitationFromChain,
  getSupplyInvitationIdsByBatchFromChain,
  getShippingInvitationIdsByBatchFromChain,
  setAssignedTransporter,
  createSupplyBidding,
  createShippingBidding,
  respondSupplyInvitationAssigned,
  respondShippingInvitationAssigned,
  selectBiddingWinnerSupply,
  selectBiddingWinnerShipping,
};
