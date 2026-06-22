// ============================================================
//  src/services/userService.js
// ============================================================
const { getContracts } = require('../config/contracts');
const { callContract, buildTransaction, serializeResult } = require('../utils/blockchain');
const User = require('../models/User');
const PendingUpload = require('../models/PendingUpload');
const { uploadFileToIPFS } = require('../utils/ipfs');

const ROLE_MAP = ['None', 'Admin', 'Distributor', 'Supplier', 'Transporter'];

// ─────────────────────────────────────────────
//  READ — từ MongoDB (nhanh, có filter/sort)
// ─────────────────────────────────────────────
async function getAllUsers({ page = 1, limit = 20, role, isActive, search } = {}) {
  const filter = {};

  if (role !== undefined && role !== '') 
    filter.role = ROLE_MAP[Number(role)] || role;
  if (isActive !== undefined && isActive !== '') 
    filter.isActive  = isActive === 'true' || isActive === true;
  if (search)
    filter.name = { $regex: search, $options: 'i' };

  const skip  = (page - 1) * limit;
  const total = await User.countDocuments(filter);

  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-__v'); // bỏ field thừa

  return {
    data:  users,
    total,
    page:  Number(page),
    pages: Math.ceil(total / limit),
  };
}

/**
 * Lấy 1 user từ DB — kèm thông tin verify.
 */
async function getUserByAddress(address) {
  const user = await User.findOne({ address: address.toLowerCase() });
  if (!user) throw Object.assign(new Error('User không tồn tại trong DB'), { statusCode: 404 });
  return user;
}

/**
 * Lấy user từ DB + verify ngay với chain.
 * Dùng khi cần đảm bảo 100% accuracy (e.g. trang profile quan trọng).
 */
async function getUserVerified(address) {
  const { userManager } = getContracts();
  const addr = address.toLowerCase();

  const [dbUser, chainRaw] = await Promise.all([
    User.findOne({ address: addr }),
    callContract(userManager.methods.users(addr)),
  ]);

  if (!dbUser) throw Object.assign(new Error('User không tồn tại trong DB'), { statusCode: 404 });

  const chainUser = serializeResult(chainRaw);
  const isMatch = dbUser.matchesChainData(chainUser);

  return {
    ...dbUser.toObject(),
    chain: chainUser,
    isVerified: isMatch,
    verificationNote: isMatch
      ? '✅ DB khớp với blockchain'
      : '⚠️ DB không khớp chain — đang được tự động fix',
    etherscanUrl: `https://sepolia.etherscan.io/tx/${dbUser.txHash}`,
  };
}

// ─────────────────────────────────────────────
//  READ — trực tiếp từ blockchain (view functions)
// ─────────────────────────────────────────────

async function getUserFromChain(address) {
  const { userManager } = getContracts();
  const chainRaw = await callContract(userManager.methods.users(address));
  const chain = serializeResult(chainRaw);

  if (!chain?.wallet || chain.wallet === '0x0000000000000000000000000000000000000000') {
    throw Object.assign(new Error('User không tồn tại trên blockchain'), { statusCode: 404 });
  }

  return {
    address: chain.wallet?.toLowerCase(),
    name: chain.name,
    avatarHash: chain.avatarHash,
    email: chain.email,
    phone: chain.phone,
    role: ROLE_MAP[Number(chain.role)] || 'None',
    isActive: chain.isActive === true || chain.isActive === 'true',
    registeredAt: new Date(Number(chain.registeredAt) * 1000),
  };
}

async function getUserRole(address) {
  const { userManager } = getContracts();
  const roleIndex = await callContract(userManager.methods.getUserRole(address));
  return {
    address: address.toLowerCase(),
    roleIndex: Number(roleIndex),
    role: ROLE_MAP[Number(roleIndex)] || 'None',
  };
}

async function isActiveUser(address) {
  const { userManager } = getContracts();
  const isActive = await callContract(userManager.methods.isActiveUser(address));
  return {
    address: address.toLowerCase(),
    isActive: Boolean(isActive),
  };
}

// ─────────────────────────────────────────────
//  WRITE — lên blockchain, DB tự cập nhật qua indexer
// ─────────────────────────────────────────────

/**
 * Đăng ký user mới.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.phone
 * @param {number} params.role   - enum index: 2 | 3 | 4
 * @param {string} params.wallet - địa chỉ Ethereum
 */
async function registerUser({ name, email, phone, role, wallet }) {
  const validRoles = [2, 3, 4]; // Distributor, Supplier, Transporter
  if (!validRoles.includes(Number(role))) {
    throw new Error('Role không hợp lệ. Chỉ chấp nhận: Distributor(2), Supplier(3), Transporter(4)');
  }

  const existing = await User.findOne({ address: wallet.toLowerCase() });
  if (existing) throw new Error('Địa chỉ này đã được đăng ký');

  const { userManager } = getContracts();
  const txData = await buildTransaction(
    userManager.methods.registerUser(name, role, wallet, email, phone),
    wallet,
    userManager.options.address,
  );

  return { txData };
}

/**
 * Cập nhật tên và avatar của user.
 * Contract: onlyExistingUser(msg.sender) + onlyActiveUser(msg.sender).
 * → callerAddress phải là chính user đó.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.phone
 * @param {string} callerAddress - địa chỉ ký tx (msg.sender trên chain)
 */
async function updateUserInfo({ name, email, phone }, callerAddress, file) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  
  const addr = callerAddress.toLowerCase();
  const existing = await User.findOne({ address: addr });
  if (!existing) throw Object.assign(new Error('User không tồn tại'), { statusCode: 404 });
  if (!existing.isActive) throw Object.assign(new Error('User đang bị block'), { statusCode: 403 });
  
  let avatarUrl = existing.avatarUrl || '';
  let avatarCid = existing.avatarCid || '';
  let avatarHash = existing.avatarHash || '0x' + '0'.repeat(64);

  if (file) {
    const result = await uploadFileToIPFS(file, 'users');
    avatarUrl = result.ipfsUrl;
    avatarCid = result.cid;
    avatarHash = result.hash;

    await PendingUpload.findOneAndUpdate(
      { imageHash: avatarHash },
      { imageUrl: avatarUrl, imageCid: avatarCid },
      { upsert: true }
    );
  }

  const { userManager } = getContracts();
  const txData = await buildTransaction(
    userManager.methods.updateInfoUser(name, avatarHash, email, phone),
    callerAddress,
    userManager.options.address,
  );

  return { txData, avatar: file ? { avatarUrl, avatarCid, avatarHash } : null };
}

/**
 * Grant admin role cho một user đã tồn tại.
 * Contract: onlyOwner + onlyExistingUser(_wallet).
 * → Backend wallet phải là contract owner.
 *
 * @param {string} wallet - địa chỉ user được grant admin
 * @param {string} callerAddress - địa chỉ wallet của người gọi hàm
 */
async function grantAdmin(wallet, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  
  const existing = await User.findOne({ address: wallet.toLowerCase() });
  if (existing) throw Object.assign(new Error('Address này đã tham gia hệ thống'), { statusCode: 400 });

  const { userManager } = getContracts();
  const txData = await buildTransaction(
    userManager.methods.grantAdmin(wallet),
    callerAddress,
    userManager.options.address,
  );
  
  return { txData };
}

/**
 * Toggle active/inactive cho user (block/unblock).
 * Contract: onlyAdmin.
 * → Backend wallet phải có role Admin trên chain.
 *
 * @param {string} address - địa chỉ của user cần toggle
 */
async function toggleUserActive(address, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const existing = await User.findOne({ address: address.toLowerCase() });
  if (!existing) throw Object.assign(new Error('User không tồn tại'), { statusCode: 404 });

  const { userManager } = getContracts();
  const txData = await buildTransaction(
    userManager.methods.updateActiveUser(address),
    callerAddress,
    userManager.options.address
  );

  return { txData };
}

module.exports = {
  getAllUsers,
  getUserByAddress,
  getUserVerified,
  getUserFromChain,
  getUserRole,
  isActiveUser,
  registerUser,
  updateUserInfo,
  grantAdmin,
  toggleUserActive,
};