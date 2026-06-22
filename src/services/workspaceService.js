// ============================================================
//  src/services/workspaceService.js
// ============================================================
const { getContracts } = require('../config/contracts');
const { callContract, buildTransaction, serializeResult } = require('../utils/blockchain');
const Workspace = require('../models/Workspace');
const PendingUpload = require('../models/PendingUpload');
const User = require('../models/User');
const { ProductMapping, SupplyProposal } = require('../models/ProductMapping');
const { get } = require('../routes/userRoutes');
const { uploadFileToIPFS } = require('../utils/ipfs');

// ─────────────────────────────────────────────
//  READ — từ MongoDB
// ─────────────────────────────────────────────
/**
 * Lấy danh sách workspaces với pagination.
 */
async function getAllWorkspaces({ page =1, limit = 10, search } = {}) {
  const filter = { isActive: true,};

  if (search)
    filter.name = { $regex: search, $options: 'i' };

  const skip  = (page - 1) * limit;
  const total = await Workspace.countDocuments(filter);

  const workspaces = await Workspace.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('--joinRequests -__v'); // bỏ field thừa

  return { 
    data:  workspaces,
    total,
    page:  Number(page),
    pages: Math.ceil(total / limit),
   };
}

/**
 * Lấy 1 workspace theo ID từ DB.
 */
async function getWorkspace(workspaceId) {
  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) })
    .select('-__v');
  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });
  return ws;
}

/**
 * Lấy members đang active của workspace từ DB.
 */
async function getWorkspaceMembers(workspaceId, { page = 1, limit = 10 } = {}) {
  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) })
    .select('members isActive');

  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });

  const activeMembers = ws.members.filter(m => m.isActive === true);

  const skip = (page - 1) * limit;
  const total = activeMembers.length;
  const paginatedMembers = activeMembers.slice(skip, skip + limit);

  const addresses = paginatedMembers.map(m => m.address);
  const users = await User.find({ 
    address: { $in: addresses } 
  })
  .select('address name email phone avatarUrl')
  .lean();
  const userMap = new Map(users.map(u => [u.address.toLowerCase(), u]));

  const enrichedMembers = paginatedMembers.map(member => ({
    ...member.toObject?.() || member,
    user: userMap.get(member.address.toLowerCase()) || null
  }));

  return {
    data:  enrichedMembers,
    total: total,
    page:  Number(page),
    limit: Number(limit),
    pages: Math.ceil(total / limit),
  };

}

/**
 * Get all members have role = 'Transporter' of workspace.
 */
async function getTransporterMembersByWorkspace(workspaceId) {
  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) })
    .select('members isActive');

  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });

  const transporterMembers = ws.members.filter(m => m.role === 'Transporter' && m.isActive === true);

  return transporterMembers;
}

/**
 * Lấy thông tin 1 member cụ thể trong workspace từ DB.
 */
async function getMember(workspaceId, userId) {
  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) })
    .select('members')
  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });

  const member = ws.members.find(m => m.address === userId.toLowerCase());
  if (!member) throw Object.assign(new Error(`User ${userId} không phải là member của workspace #${workspaceId}`), { statusCode: 404 });
  
  return member;
}

/**
 * Lấy join requests của workspace theo trạng thái Pending.
 */
async function getJoinRequestsByWorkspace(workspaceId) {
  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) })
    .select('joinRequests');
  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });

  const requests = ws.joinRequests.filter(r => r.status === 'Pending');
  
  const userIds = requests.map(r => r.userId);
  const users = await User.find({
    address: { $in: userIds }
  }).select('address name avatarUrl').lean();
  const userMap = new Map(users.map(u => [u.address.toLowerCase(), u]));

  const enrichedRequests = requests.map(request => ({
    ...request.toObject?.() || request,
    user: userMap.get(request.userId.toLowerCase()) || null
  }));

  return enrichedRequests;
}

/**
 * Lấy 1 join request theo requestId từ DB (tìm trong tất cả workspaces).
 */
async function getJoinRequest(requestId) {
  const ws = await Workspace.findOne(
    { 'joinRequests.requestId': requestId },
    { 'joinRequests.$': 1 } 
  )
  if (!ws || !ws.joinRequests?.[0]) throw Object.assign(new Error(`Join request #${requestId} không tồn tại`), { statusCode: 404 });

  return ws.joinRequests[0];
}

/**
 * Workspaces mà 1 user đang tham gia (là member active).
 */
async function getUserWorkspaces(userId, { page = 1, limit = 10, search, productOfferId } = {}) {
  const filter = {
    isActive: true,
    members: {
      $elemMatch: {
        address: userId.toLowerCase(),
        isActive: true,
      },
    },
  };

  if (search) filter.name = { $regex: search, $options: 'i' };

  const skip  = (page - 1) * limit;
  const total = await Workspace.countDocuments(filter);

  const workspaces = await Workspace.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-joinRequests -__v');

  let statuses = {};
  if (productOfferId) {
    const ids = workspaces.map((w) => w.workspaceId);

    if (ids.length > 0) {
      const [mappings, proposals] = await Promise.all([
        ProductMapping.find({
          productOfferId: Number(productOfferId),
          workspaceId: { $in: ids },
          isActive: true,
        }).select('workspaceId'),
        SupplyProposal.find({
          productId: Number(productOfferId),
          workspaceId: { $in: ids },
          status: 'Pending',
        }).select('workspaceId'),
      ]);

      const mappedIds = new Set(mappings.map((m) => m.workspaceId));
      const pendingIds = new Set(proposals.map((p) => p.workspaceId));

      statuses = ids.reduce((acc, id) => {
        acc[id] = mappedIds.has(id) ? 'mapped' : pendingIds.has(id) ? 'pending' : 'none';
        return acc;
      }, {});
    }
  }

  return { 
    data:  workspaces,
    total,
    page:  Number(page),
    pages: Math.ceil(total / limit),
    ...(productOfferId ? { statuses } : {}),
   };
}

/**
 * Workspaces mà 1 user đã gửi join request nhưng chưa được duyệt (status Pending).
 */
async function getPendingWorkspacesForUser(userId) {
  const workspaces = await Workspace.find({
    joinRequests: {
      $elemMatch: {
        userId: userId.toLowerCase(),
        status: 'Pending',
      },
    },
    isActive: true,
  }
  ).select('-members -__v');

  return workspaces;
}

// ─────────────────────────────────────────────
//  READ — view functions trực tiếp từ chain
// ─────────────────────────────────────────────

/**
 * Gọi getWorkspace() từ chain. Revert nếu workspace không active.
 */
async function getWorkspaceFromChain(workspaceId) {
  const { workspaceManager } = getContracts();
  const result = await callContract(
    workspaceManager.methods.getWorkspace(workspaceId)
  );
  return serializeResult(result);
}

/**
 * Gọi isMemberWorkspace() từ chain.
 * Trả về boolean — không revert.
 */
async function isMemberWorkspace(workspaceId, userId) {
  const { workspaceManager } = getContracts();
  const isMember = await callContract(
    workspaceManager.methods.isMemberWorkspace(workspaceId, userId)
  );
  return {
    workspaceId: Number(workspaceId),
    userId:      userId.toLowerCase(),
    isMember:    Boolean(isMember),
  };
}

/**
 * Gọi getMember() từ chain.
 * Trả về MemberWorkspace struct — không revert, trả về zero-value nếu không tồn tại.
 */
async function getMemberFromChain(workspaceId, userId) {
  const { workspaceManager } = getContracts();
  const result = await callContract(
    workspaceManager.methods.getMember(workspaceId, userId)
  );
  const raw = serializeResult(result);
  return {
    ...raw,
    role: ROLE_MAP[Number(raw.role)] || 'None',
  };
}

/**
 * Gọi getJoinRequest() từ chain.
 * Trả về JoinRequest struct. Không revert với requestId bất kỳ (trả zero-value).
 */
async function getJoinRequestFromChain(requestId) {
  const { workspaceManager } = getContracts();
  const result = await callContract(
    workspaceManager.methods.getJoinRequest(requestId)
  );
  const raw = serializeResult(result);
  return {
    ...raw,
    status: REQUEST_STATUS[Number(raw.status)] || 'Pending',
  };
}
 
// ─────────────────────────────────────────────
//  WRITE — gửi tx lên chain, DB tự cập nhật qua indexer
// ─────────────────────────────────────────────

/**
 * Tạo workspace mới.
 * Contract: chỉ Distributor role mới được tạo.
 */
async function createWorkspace({ name, description = '' }, callerAddress, file) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  let imageUrl = '';
  let imageCid = '';
  let imageHash = '0x' + '0'.repeat(64);

  if (file) {
    try {
      const { cid, ipfsUrl, hash } = await uploadFileToIPFS(file, 'workspaces');
      imageUrl = ipfsUrl;
      imageCid = cid;
      imageHash = hash;

      await PendingUpload.findOneAndUpdate(
        { imageHash },
        { imageCid: cid, imageUrl: ipfsUrl },
        { upsert: true }
      );
    } catch (err) {
      console.error('[createWorkspace] IPFS upload FAILED:', err.message);
    }
  }

  const { workspaceManager } = getContracts();
  const txData = await buildTransaction(
    workspaceManager.methods.createWorkspace(name, description, imageHash),
    callerAddress,
    workspaceManager.options.address
  );

  return { txData, image: file ? { imageCid, imageUrl, imageHash } : null };
}

/**
 * Cập nhật thông tin workspace.
 * Contract: onlyWorkspaceOwner — backend wallet phải là owner.
 *
 * @param {object} params
 * @param {number} params.workspaceId
 * @param {string} params.name
 * @param {string} params.description
 * @param {string} params.image
 */
async function updateWorkspace({ workspaceId, name, description = '', image = '' }, callerAddress, file) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) });
  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });
  if (!ws.isActive) throw new Error('Workspace đã bị xóa trước đó');

  let imageUrl = ws.imageUrl || '';
  let imageCid = ws.imageCid || '';
  let imageHash = ws.imageHash || '0x' + '0'.repeat(64);

  if (file) {
    const result = await uploadFileToIPFS(file, 'workspaces');
    imageUrl = result.ipfsUrl;
    imageCid = result.cid;
    imageHash = result.hash;

    await PendingUpload.findOneAndUpdate(
      { imageHash },
      { imageCid, imageUrl },
      { upsert: true }
    );
  }

  const { workspaceManager } = getContracts();
  const txData = await buildTransaction(
    workspaceManager.methods.updateWorkspace(workspaceId, name, description, imageHash),
    callerAddress,
    workspaceManager.options.address
  );

  return { txData, image: file ? { imageCid, imageUrl, imageHash } : null };
}

/**
 * Xóa (deactivate) workspace.
 * Contract: onlyWorkspaceOwner.
 *
 * @param {number} workspaceId
 */
async function deleteWorkspace(workspaceId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) });
  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });
  if (!ws.isActive) throw new Error('Workspace đã bị xóa trước đó');

  const { workspaceManager } = getContracts();
  const txData = await buildTransaction(
    workspaceManager.methods.deleteWorkspace(workspaceId),
    callerAddress,
    workspaceManager.options.address
  );

  return { txData };
}

/**
 * Rời workspace (member tự rời).
 *
 * @param {number} workspaceId
 * @param {string} callerAddress - địa chỉ ký tx (msg.sender)
 */
async function leaveWorkspace(workspaceId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const { workspaceManager } = getContracts();
  const txData = await buildTransaction(
    workspaceManager.methods.leaveWorkspace(workspaceId),
    callerAddress,
    workspaceManager.options.address
  );

  return { txData };
}

/**
 * Kick member ra khỏi workspace.
 * Contract: onlyWorkspaceOwner.
 *
 * @param {number} workspaceId
 * @param {string} userId - địa chỉ member bị kick
 */
async function removeMember(workspaceId, userId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const { workspaceManager } = getContracts();
  const txData = await buildTransaction(
    workspaceManager.methods.removeMember(workspaceId, userId),
    callerAddress,
    workspaceManager.options.address
  );

  return { txData }
}

/**
 * Tạo join request vào workspace.
 * Contract: chỉ Supplier hoặc Transporter, chưa là member.
 *
 * @param {object} params
 * @param {number} params.workspaceId
 * @param {string} params.representativeName
 * @param {string} params.message
 * @param {string} callerAddress - địa chỉ ký tx
 */
async function createJoinRequest({ workspaceId, representativeName, message = '' }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) });
  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });
  if (!ws.isActive) throw new Error('Workspace đã bị xóa trước đó');

  const { workspaceManager } = getContracts();
  const txData = await buildTransaction(
    workspaceManager.methods.createJoinRequest(workspaceId, representativeName, message),
    callerAddress,
    workspaceManager.options.address
  );

  return { txData };
}

/**
 * Duyệt hoặc từ chối join request.
 * Contract: onlyWorkspaceOwner(joinRequests[requestId].workspaceId).
 * status: 0=Pending (không hợp lệ), 1=Approved, 2=Rejected
 *
 * @param {object} params
 * @param {number} params.requestId
 * @param {number} params.status   - 1 (Approved) hoặc 2 (Rejected)
 */
async function processJoinRequest({ requestId, status }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const validStatus = [1, 2]; // Approved hoặc Rejected
  if (!validStatus.includes(Number(status))) {
    throw new Error('Status không hợp lệ. Chỉ chấp nhận: Approved(1) hoặc Rejected(2)');
  }

  const existing = await getJoinRequest(requestId);
  if (existing.status !== 'Pending') throw new Error(`Join request #${requestId} đã được xử lý trước đó`);
  
  const { workspaceManager } = getContracts();
  const txData = await buildTransaction(
    workspaceManager.methods.processJoinRequest(requestId, status),
    callerAddress,
    workspaceManager.options.address
  );

  return { txData };
}

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
  isMemberWorkspace,
  getMemberFromChain,
  getJoinRequestFromChain,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  createJoinRequest,
  processJoinRequest,
  leaveWorkspace,
  removeMember,
};