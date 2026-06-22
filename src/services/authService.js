// ============================================================
//  src/services/authService.js
//
//  Xử lý toàn bộ authentication flow:
//  - getNonce      → bước 1: tạo nonce cho wallet
//  - login         → bước 2: verify signature → cấp JWT
//  - register      → đăng ký on-chain + trả JWT ngay
//  - refreshToken  → gia hạn JWT còn hạn
//  - getMe         → lấy thông tin user hiện tại từ JWT
// ============================================================
const {
  generateNonce,
  consumeNonce,
  buildSignMessage,
  recoverSigner,
  signJWT,
  verifyJWT,
} = require('../middleware/auth');
const { getContracts } = require('../config/contracts');
const { callContract, sendTransaction, serializeResult } = require('../utils/blockchain');
const User = require('../models/User');
const logger = require('../utils/logger');
const userServices = require('./userService');

const ROLE_MAP = ['None', 'Admin', 'Distributor', 'Supplier', 'Transporter'];

// ─── Step 1: Tạo nonce ───────────────────────────────────────

/**
 * Tạo nonce cho wallet — frontend sẽ ký message này.
 *
 * @param {string} wallet  - địa chỉ MetaMask của user
 * @returns {{ message: string, nonce: string, expiresInSeconds: number }}
 */
async function getNonce(wallet) {
  if (!wallet) throw new Error('Thiếu wallet address');

  const addr  = wallet.toLowerCase();
  const nonce = generateNonce(addr);
  const message = buildSignMessage(addr, nonce);

  return {
    wallet:           addr,
    nonce,
    message,           // frontend ký đúng message này
    expiresInSeconds:  300,  // 5 phút
  };
}

// ─── Step 2: Login (verify signature → JWT) ──────────────────

/**
 * Xác thực chữ ký MetaMask và cấp JWT.
 *
 * Flow:
 * 1. Tái tạo message từ nonce đã cấp
 * 2. ecrecover chữ ký → so sánh với wallet
 * 3. Kiểm tra user tồn tại và active trên chain
 * 4. Cấp JWT chứa { address, role }
 *
 * @param {string} wallet     - địa chỉ Ethereum
 * @param {string} signature  - hex signature từ MetaMask
 * @returns {{ token: string, user: object }}
 */
async function login({ wallet, signature }) {
  if (!wallet || !signature) throw new Error('Thiếu wallet hoặc signature');

  const addr = wallet.toLowerCase();

  // ── 1. Lấy và xoá nonce (single-use) ──────────────────────
  const nonce = consumeNonce(addr);
  if (!nonce) {
    throw Object.assign(
      new Error('Nonce không tồn tại hoặc đã hết hạn. Vui lòng lấy nonce mới.'),
      { statusCode: 401 }
    );
  }

  // ── 2. Verify chữ ký ───────────────────────────────────────
  const message  = buildSignMessage(addr, nonce);
  const recovered = recoverSigner(message, signature);

  if (recovered !== addr) {
    throw Object.assign(
      new Error('Chữ ký không hợp lệ. Vui lòng ký đúng message được cấp.'),
      { statusCode: 401 }
    );
  }

  // ── 3. Kiểm tra user tồn tại và active trên chain ─────────
  const { userManager } = getContracts();
  const isActive = await callContract(userManager.methods.isActiveUser(addr));
  if (!isActive) {
    // Phân biệt: chưa đăng ký vs đang bị block
    const chainUser = await callContract(userManager.methods.users(addr));
    const chainSerialized = serializeResult(chainUser);

    if (!chainSerialized || chainSerialized.wallet === '0x0000000000000000000000000000000000000000') {
      throw Object.assign(
        new Error('Wallet chưa được đăng ký. Vui lòng đăng ký trước.'),
        { statusCode: 403, code: 'NOT_REGISTERED' }
      );
    }
    throw Object.assign(
      new Error('Tài khoản của bạn đang bị khoá. Liên hệ admin.'),
      { statusCode: 403, code: 'ACCOUNT_BLOCKED' }
    );
  }

  // ── 4. Lấy role từ chain ───────────────────────────────────
  const roleIndex = await callContract(userManager.methods.getUserRole(addr));
  const role      = ROLE_MAP[Number(roleIndex)] || 'None';

  // ── 5. Cấp JWT ─────────────────────────────────────────────
  const token = signJWT({ address: addr, role });

  // ── 6. Lấy thông tin user từ DB (nếu có) để trả về ────────
  const dbUser = await User.findOne({ address: addr }).select('-__v').lean();

  logger.info(`[Auth] Login thành công: ${addr} role=${role}`);

  return {
    token,
    expiresIn: '7d',
    user: dbUser || { address: addr, role },
  };
}

// ─── Register ─────────────────────────────────────────────────

/**
 * Đăng ký user mới lên blockchain.
 */
async function register({ wallet, name, role, email, phone }) {
  if (!wallet) throw new Error('Thiếu wallet');

  const addr = wallet.toLowerCase();

  // ── 2. Kiểm tra chưa đăng ký ──────────────────────────────
  const existingInDB = await User.findOne({ address: addr });
  if (existingInDB) throw new Error('Địa chỉ này đã được đăng ký');

  const { userManager } = getContracts();
  const chainUser    = await callContract(userManager.methods.users(addr));
  const chainSer     = serializeResult(chainUser);
  if (chainSer?.wallet && chainSer.wallet !== '0x0000000000000000000000000000000000000000') {
    throw new Error('Địa chỉ này đã được đăng ký trên blockchain');
  }

  // ── 3. Validate role ───────────────────────────────────────
  const validRoles = [2, 3, 4]; // Distributor, Supplier, Transporter
  if (!validRoles.includes(Number(role))) {
    throw new Error('Role không hợp lệ. Chỉ chấp nhận: Distributor(2), Supplier(3), Transporter(4)');
  }

  // ── 4. Gửi tx lên chain ────────────────────────────────────
  // ⚠️  Đúng thứ tự params theo contract: (name, role, wallet, email, phone)
  const txResult = await userServices.registerUser({ name, role, wallet, email, phone });


  return {
    txData: txResult.txData,
  };
}


async function confirmRegister({ wallet }) {
  const addr = wallet.toLowerCase();
  for (let i = 0; i < 30; i++) {
    const user = await User.findOne({ address: addr });
    if (user) {
      const token = signJWT({ address: addr, role: user.role });
      return { token, expiresIn: '7d', user };
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw Object.assign(new Error('Timeout: transaction chưa được confirm'), { statusCode: 408 });
}

// ─── Refresh Token ────────────────────────────────────────────

/**
 * Gia hạn JWT — chỉ chấp nhận token còn hạn.
 * Không cần ký lại signature.
 *
 * @param {string} token  - JWT hiện tại còn hạn
 */
async function refreshToken(token) {
  let payload;
  try {
    payload = verifyJWT(token);
  } catch (err) {
    throw Object.assign(
      new Error('Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'),
      { statusCode: 401 }
    );
  }

  // Verify user vẫn còn active trên chain
  const { userManager } = getContracts();
  const isActive = await callContract(userManager.methods.isActiveUser(payload.address));
  if (!isActive) {
    throw Object.assign(
      new Error('Tài khoản của bạn đang bị khoá.'),
      { statusCode: 403 }
    );
  }

  // Lấy role mới nhất từ chain (phòng trường hợp được grant admin)
  const roleIndex = await callContract(userManager.methods.getUserRole(payload.address));
  const role      = ROLE_MAP[Number(roleIndex)] || 'None';

  const newToken = signJWT({ address: payload.address, role });
  return { token: newToken, expiresIn: '7d' };
}

// ─── Get Me ───────────────────────────────────────────────────

/**
 * Lấy thông tin user hiện tại từ JWT đã decode (req.user).
 * Kết hợp DB data + role mới nhất từ chain.
 *
 * @param {string} address  - từ req.user.address (đã verify JWT)
 */
async function getMe(address) {
  const dbUser = await User.findOne({ address: address.toLowerCase() }).select('-__v').lean();
  if (!dbUser) {
    throw Object.assign(new Error('User không tồn tại'), { statusCode: 404 });
  }
  return dbUser;

  // Lấy role live từ chain (phòng trường hợp đã grant admin)
  // const { userManager } = getContracts();
  // const roleIndex = await callContract(userManager.methods.getUserRole(address));
  // const role      = ROLE_MAP[Number(roleIndex)] || 'None';

  // return { ...dbUser, role };
}

module.exports = { getNonce, login, register, confirmRegister, refreshToken, getMe };