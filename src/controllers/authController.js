// ============================================================
//  src/controllers/authController.js
// ============================================================
const authService = require('../services/authService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /auth/nonce?wallet=0x...
 *
 * Bước 1 của login/register: lấy message để ký.
 * Frontend dùng message này để gọi MetaMask eth_personalSign.
 */
const getNonce = asyncHandler(async (req, res) => {
  const { wallet } = req.query;
  const result = await authService.getNonce(wallet);
  res.json({ success: true, data: result });
});

/**
 * POST /auth/login
 * body: { wallet, signature }
 *
 * Bước 2: gửi chữ ký lên, nhận JWT.
 */
const login = asyncHandler(async (req, res) => {
  const { wallet, signature } = req.body;
  const result = await authService.login({ wallet, signature });
  res.json({ success: true, data: result });
});

/**
 * POST /auth/register
 * body: { wallet, signature, name, role, email?, phone? }
 *
 * Đăng ký user mới + nhận JWT ngay.
 * Yêu cầu signature để xác nhận sở hữu wallet.
 */
const register = asyncHandler(async (req, res) => {
  const { wallet, signature, name, role, email, phone } = req.body;
  const result = await authService.register({ wallet, signature, name, role, email, phone });
  res.status(201).json({ success: true, data: result });
});

const confirmRegister = asyncHandler(async (req, res) => {
  const { wallet } = req.body;
  const result = await authService.confirmRegister({ wallet });
  res.status(200).json({ success: true, data: result });
});

/**
 * POST /auth/refresh
 * body: { token }
 *
 * Gia hạn JWT còn hạn — không cần ký lại.
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const result = await authService.refreshToken(token);
  res.json({ success: true, data: result });
});

/**
 * GET /auth/me
 * Header: Authorization: Bearer <token>
 *
 * Lấy thông tin user hiện tại. Yêu cầu JWT hợp lệ.
 */
const getMe = asyncHandler(async (req, res) => {
  const result = await authService.getMe(req.user.address);
  res.json({ success: true, data: result });
});

module.exports = { getNonce, login, register, confirmRegister, refreshToken, getMe };