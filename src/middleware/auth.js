// ============================================================
//  src/middleware/auth.js
// ============================================================
const jwt = require('jsonwebtoken');
const { Web3 } = require('web3');
const env = require('../config/env');
const logger = require('../utils/logger');

const web3 = new Web3();

// ─── In-memory nonce store ────────────────────────────────────
// Production nên dùng Redis với TTL.
// Map<walletAddress_lowercase, { nonce, expiresAt }>
const nonceStore = new Map();
const NONCE_TTL_MS = 5 * 60 * 1000; // nonce hết hạn sau 5 phút
 
/**
 * Tạo nonce ngẫu nhiên và lưu vào store.
 * @param {string} wallet  - địa chỉ Ethereum lowercase
 * @returns {string} nonce
 */
function generateNonce(wallet) {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  nonceStore.set(wallet.toLowerCase(), {
    nonce,
    expiresAt: Date.now() + NONCE_TTL_MS,
  });
  return nonce;
}
 
/**
 * Lấy và xoá nonce (single-use).
 * @returns {string|null} nonce nếu còn hạn, null nếu không tồn tại / hết hạn
 */
function consumeNonce(wallet) {
  const entry = nonceStore.get(wallet.toLowerCase());
  if (!entry) return null;
  nonceStore.delete(wallet.toLowerCase());
  if (Date.now() > entry.expiresAt) return null;
  return entry.nonce;
}
 
// Dọn nonce hết hạn định kỳ (tránh memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of nonceStore.entries()) {
    if (now > val.expiresAt) nonceStore.delete(key);
  }
}, 60 * 1000);
 
// ─── Message builder ──────────────────────────────────────────
 
/**
 * Tạo message để ký — phải khớp chính xác với frontend.
 * Dùng prefix rõ ràng để tránh phishing.
 */
function buildSignMessage(wallet, nonce) {
  return [
    'Chào mừng đến AgriChain!',
    '',
    'Ký message này để xác thực danh tính.',
    'Thao tác này KHÔNG tốn phí và KHÔNG gửi transaction.',
    '',
    `Wallet: ${wallet.toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}
 
// ─── Signature verification ───────────────────────────────────
 
/**
 * Recover địa chỉ từ chữ ký MetaMask (eth_personalSign).
 * MetaMask tự thêm prefix "\x19Ethereum Signed Message:\n" + length
 * → web3.eth.accounts.recover đã xử lý điều này.
 *
 * @param {string} message   - message gốc (chưa có prefix)
 * @param {string} signature - hex string từ MetaMask
 * @returns {string} địa chỉ recovered, lowercase
 */
function recoverSigner(message, signature) {
  return web3.eth.accounts.recover(message, signature).toLowerCase();
}
 
// ─── JWT helpers ──────────────────────────────────────────────
 
const JWT_SECRET  = env.JWT_SECRET;
const JWT_EXPIRES = env.JWT_EXPIRES || '7d';
 
/**
 * Cấp JWT cho user đã xác thực.
 * @param {object} payload  - { address, role }
 */
function signJWT(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
 
/**
 * Verify JWT và trả về payload.
 * @throws nếu token không hợp lệ / hết hạn
 */
function verifyJWT(token) {
  return jwt.verify(token, JWT_SECRET);
}
 
// ─── Express middleware ───────────────────────────────────────
 
/**
 * requireAuth — bảo vệ route yêu cầu đăng nhập.
 *
 * Đặt vào route: router.post('/update', requireAuth, controller.update)
 * Sau middleware này, req.user = { address, role } từ JWT payload.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { type: 'UNAUTHORIZED', message: 'Thiếu Authorization header' },
    });
  }
 
  const token = authHeader.slice(7);
  try {
    const payload = verifyJWT(token);
    req.user = { address: payload.address, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: {
        type:    'UNAUTHORIZED',
        message: err.name === 'TokenExpiredError' ? 'Token đã hết hạn' : 'Token không hợp lệ',
      },
    });
  }
}
 
/**
 * requireRole — kiểm tra role sau requireAuth.
 *
 * @param {...string} roles  - các role được phép, e.g. requireRole('Admin')
 *
 * Dùng: router.patch('/grant-admin', requireAuth, requireRole('Admin'), controller.grantAdmin)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { type: 'UNAUTHORIZED', message: 'Chưa xác thực' },
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          type:    'FORBIDDEN',
          message: `Chỉ ${roles.join('/')} mới được thực hiện thao tác này`,
        },
      });
    }
    next();
  };
}
 
module.exports = {
  generateNonce,
  consumeNonce,
  buildSignMessage,
  recoverSigner,
  signJWT,
  verifyJWT,
  requireAuth,
  requireRole,
};