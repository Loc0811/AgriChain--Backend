// ============================================================
//  src/controllers/workspaceController.js
// ============================================================

const workspaceService = require('../services/workspaceService');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/workspaces
const getAllWorkspaces = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await workspaceService.getAllWorkspaces({ page, limit, search });
  res.json({ success: true, ...result });
});

// GET /api/workspaces/:id
const getWorkspace = asyncHandler(async (req, res) => {
  const result = await workspaceService.getWorkspace(req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/workspaces/:id/members
const getWorkspaceMembers = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const members = await workspaceService.getWorkspaceMembers(req.params.id, { page, limit });
  res.json({ success: true, ...members });
});

// GET /api/workspaces/:id/transports
const getTransporterMembersByWorkspace = asyncHandler(async (req, res) => {
  const members = await workspaceService.getTransporterMembersByWorkspace(req.params.id);
  res.json({ success: true, data: members, count: members.length });
});

// GET /api/workspaces/:id/members/:address
const getMember = asyncHandler(async (req, res) => {
  const result = await workspaceService.getMember(req.params.id, req.params.address);
  res.json({ success: true, data: result });
});

// GET /api/workspaces/:id/join-requests
const getJoinRequestsByWorkspace = asyncHandler(async (req, res) => {
  const requests = await workspaceService.getJoinRequestsByWorkspace(req.params.id);
  res.json({ success: true, data: requests, count: requests.length });
});

// GET /api/workspaces/join-requests/:requestId
const getJoinRequest = asyncHandler(async (req, res) => {
  const result = await workspaceService.getJoinRequest(req.params.requestId);
  res.json({ success: true, data: result });
});

// GET /api/workspaces/user/:address
const getUserWorkspaces = asyncHandler(async (req, res) => {
  const { page, limit, search, productOfferId } = req.query;
  const result = await workspaceService.getUserWorkspaces(req.params.address, { page, limit, search, productOfferId });
  res.json({ success: true, ...result });
});

// GET /api/workspaces/user/:address/pending
const getPendingWorkspacesForUser = asyncHandler(async (req, res) => {
  const result = await workspaceService.getPendingWorkspacesForUser(req.params.address);
  res.json({ success: true, data: result });
});

// GET /api/workspaces/:id/chain
const getWorkspaceFromChain = asyncHandler(async (req, res) => {
  const result = await workspaceService.getWorkspaceFromChain(req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/workspaces/:id/members/:address/chain
const getMemberFromChain = asyncHandler(async (req, res) => {
  const result = await workspaceService.getMemberFromChain(req.params.id, req.params.address);
  res.json({ success: true, data: result });
});

// GET /api/workspaces/:id/is-member/:address
const isMemberWorkspace = asyncHandler(async (req, res) => {
  const result = await workspaceService.isMemberWorkspace(req.params.id, req.params.address);
  res.json({ success: true, data: result });
});

// GET /api/workspaces/join-requests/:requestId/chain
const getJoinRequestFromChain = asyncHandler(async (req, res) => {
  const result = await workspaceService.getJoinRequestFromChain(req.params.requestId);
  res.json({ success: true, data: result });
});

// POST /api/workspaces
const createWorkspace = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await workspaceService.createWorkspace({ name, description }, callerAddress, req.file);
  res.status(201).json({ success: true, data: result });
});

// PUT /api/workspaces/:id
const updateWorkspace = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await workspaceService.updateWorkspace({
    workspaceId: req.params.id,
    name,
    description
  }, callerAddress, req.file);
  res.json({ success: true, data: result });
});

// DELETE /api/workspaces/:id
const deleteWorkspace = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const result = await workspaceService.deleteWorkspace(req.params.id, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/workspaces/:id/leave
const leaveWorkspace = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const result = await workspaceService.leaveWorkspace(req.params.id, callerAddress);
  res.json({ success: true, data: result });
});

// DELETE /api/workspaces/:id/members/:address
const removeMember = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const result = await workspaceService.removeMember(req.params.id, req.params.address, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/workspaces/:id/join
const createJoinRequest = asyncHandler(async (req, res) => {
  const { representativeName, message } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await workspaceService.createJoinRequest(
    { workspaceId: req.params.id, representativeName, message },
    callerAddress
  );
  res.status(201).json({ success: true, data: result });
});

// POST /api/workspaces/join-requests/:requestId
const processJoinRequest = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const callerAddress = req.headers['x-wallet-address'];
  const result = await workspaceService.processJoinRequest({ requestId: req.params.requestId, status }, callerAddress);
  res.status(201).json({ success: true, data: result });
});

module.exports = {
  getAllWorkspaces,
  getWorkspace,
  getWorkspaceMembers,
  getTransporterMembersByWorkspace,
  getMember,
  getJoinRequestsByWorkspace,
  getJoinRequest,
  getUserWorkspaces,
  getPendingWorkspacesForUser,
  getWorkspaceFromChain,
  getMemberFromChain,
  isMemberWorkspace,
  getJoinRequestFromChain,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  leaveWorkspace,
  removeMember,
  createJoinRequest,
  processJoinRequest
};