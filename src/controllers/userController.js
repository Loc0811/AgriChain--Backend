// ============================================================
//  src/controllers/userController.js
//  Controller mỏng — chỉ nhận request, gọi service, trả response
//  Không có business logic ở đây
// ============================================================
const userService = require('../services/userService');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/users/:address
const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserByAddress(req.params.address);
  res.json({ success: true, data: user });
});

// GET /api/users
const getAllUsers = asyncHandler(async (req, res) => {
  const { page, limit , role, isActive, search } = req.query;
  const result = await userService.getAllUsers({ page, limit, role, isActive, search });
  res.json({ success: true, ...result });
});

// GET /api/users/:address/verified
const getUserVerified = asyncHandler(async (req, res) => {
  const result = await userService.getUserVerified(req.params.address);
  res.json({ success: true, data: result });
});

// GET /api/users/:address/chain
const getUserFromChain = asyncHandler(async (req, res) => {
  const result = await userService.getUserFromChain(req.params.address);
  res.json({ success: true, data: result });
});

// GET /api/users/:address/role
const getUserRole = asyncHandler(async (req, res) => {
  const result = await userService.getUserRole(req.params.address);
  res.json({ success: true, data: result });
});

// GET /api/users/:address/isActive
const isActiveUser = asyncHandler(async (req, res) => {
  const result = await userService.isActiveUser(req.params.address);
  res.json({ success: true, data: result });
});

// PUT /api/users/update
const updateUserInfo = asyncHandler(async (req, res) => {
  const { name, email, phone } = req.body;
  const callerAddress = req.header('x-wallet-address');
  const result = await userService.updateUserInfo({ name, email, phone }, callerAddress, req.file);
  res.json({ success: true, data: result });
});

// POST /api/users/:address/grant-admin
const grantAdmin = asyncHandler(async (req, res) => {
  const callerAddress = req.header('x-wallet-address');
  const result = await userService.grantAdmin(req.params.address, callerAddress);
  res.json({ success: true, data: result });
});

// POST /api/users/:address/toggle-active
const toggleUserActive = asyncHandler(async (req, res) => {
  const callerAddress = req.header('x-wallet-address');
  const result = await userService.toggleUserActive(req.params.address, callerAddress);
  res.json({ success: true, data: result });
});

module.exports = { 
  getUser, 
  getAllUsers, 
  getUserVerified, 
  getUserFromChain, 
  getUserRole, 
  isActiveUser,
  updateUserInfo, 
  grantAdmin, 
  toggleUserActive 
};