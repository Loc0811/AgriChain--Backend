// ============================================================
//  src/services/inviteService.js
// ============================================================
const { getContracts } = require('../config/contracts');
const { callContract, buildTransaction, serializeResult } = require('../utils/blockchain');
const Invitation = require('../models/Invitation');
const { Batch } = require('../models/Batch');
const Workspace = require('../models/Workspace');
const PendingUpload = require('../models/PendingUpload');
const { uploadLocationToIPFS } = require('../utils/ipfs');

// ─────────────────────────────────────────────────
//  READ — từ MongoDB (nhanh, có filter/sort)
// ─────────────────────────────────────────────────

/**
 * Lấy tất cả supply invitations của 1 batch.
 */
async function getSupplyInvitationsByBatch(batchId) {
  const invitations = await Invitation.find({
    batchId: Number(batchId),
    invitationType: 'Supply',
  }).sort({ invitationId: 1 }).lean();

  const supplierIds = invitations.map(inv => inv.supplierId);
  const batch = await Batch.findOne({ batchId: Number(batchId) }).select('workspaceId').lean();
  const workspaceId = batch 
    ? await Workspace.findOne({ workspaceId: batch.workspaceId }).select('members').lean()
    : null;

  const membersMap = new Map(
    (workspaceId?.members ?? []).map(m => [m.address, m.representativeName])
  );

  return invitations.map(inv => ({
    ...inv,
    representativeName: membersMap.get(inv.supplierId) ?? null,
  }));
}

/**
 * Lấy tất cả shipping invitations của 1 batch.
 */
async function getShippingInvitationsByBatch(batchId) {
  const invitations = await Invitation.find({
    batchId: Number(batchId),
    invitationType: 'Shipping',
  }).sort({ invitationId: 1 }).lean();

  const batch = await Batch.findOne({ batchId: Number(batchId) }).select('workspaceId').lean();
  const workspace = batch
    ? await Workspace.findOne({ workspaceId: batch.workspaceId }).select('members').lean()
    : null;

  const memberMap = new Map(
    (workspace?.members ?? []).map(m => [m.address, m.representativeName])
  );

  return invitations.map(inv => ({
    ...inv,
    representativeName: memberMap.get(inv.transporterId) ?? null,
  }));
}

/**
 * Lấy tất cả supply invitations public cho supplier
 */
async function getSupplyInvitationsOfSupplier(batchId) {
  const invitations = await Invitation.find({
    batchId: Number(batchId),
    invitationType: 'Supply',
  }).sort({ invitationId: 1 }).select('-bidPrice').lean();

  const batch = await Batch.findOne({ batchId: Number(batchId) }).select('workspaceId').lean();
  const workspace = batch
    ? await Workspace.findOne({ workspaceId: batch.workspaceId }).select('members').lean()
    : null;

  const memberMap = new Map(
    (workspace?.members ?? []).map(m => [m.address, m.representativeName])
  );

  return invitations.map(inv => ({
    ...inv,
    representativeName: memberMap.get(inv.supplierId) ?? null,
  }));
}

/**
 * Lấy tất cả shipping invitations public cho transporter
 */
async function getShippingInvitationsOfTransporter(batchId) {
  const invitations = await Invitation.find({
    batchId: Number(batchId),
    invitationType: 'Shipping',
  }).sort({ invitationId: 1 }).select('-bidPrice').lean();

  const batch = await Batch.findOne({ batchId: Number(batchId) }).select('workspaceId').lean();
  const workspace = batch
    ? await Workspace.findOne({ workspaceId: batch.workspaceId }).select('members').lean()
    : null;

  const memberMap = new Map(
    (workspace?.members ?? []).map(m => [m.address, m.representativeName])
  );

  return invitations.map(inv => ({
    ...inv,
    representativeName: memberMap.get(inv.transporterId) ?? null,
  }));
}

/**
 * Lấy 1 supply invitation theo invitationId.
 */
async function getSupplyInvitation(invitationId) {
  const inv = await Invitation.findOne({
    invitationId: Number(invitationId),
    invitationType: 'Supply',
  });
  if (!inv) throw new Error(`Supply invitation #${invitationId} không tồn tại`);
  return inv;
}

/**
 * Lấy 1 shipping invitation theo invitationId.
 */
async function getShippingInvitation(invitationId) {
  const inv = await Invitation.findOne({
    invitationId: Number(invitationId),
    invitationType: 'Shipping',
  });
  if (!inv) throw new Error(`Shipping invitation #${invitationId} không tồn tại`);
  return inv;
}

/**
 * Check batch có supply invitation có status Won hay chưa
 */
async function hasWonSupplyInvitation(batchId) {
  const inv = await Invitation.findOne({
    batchId: Number(batchId),
    invitationType: 'Supply',
    status: {$in: ['Won', 'Accepted']} 
  });
  
  if (inv) return true;
  return false;
}

/**
 * Check batch có shipping invitation có status Won hay chưa
 */
async function hasWonShippingInvitation(batchId) {
  const inv = await Invitation.findOne({
    batchId: Number(batchId),
    invitationType: 'Shipping',
    status: {$in: ['Won', 'Accepted']},
  });

  if (inv) return true;
  return false;
}

// ───────────────────────────────────────────────────────
//  READ — trực tiếp từ blockchain (view functions)
// ───────────────────────────────────────────────────────

/**
 * Gọi getSupplyInvitation() trực tiếp từ smart contract.
 */
async function getSupplyInvitationFromChain(invitationId) {
  const { inviteManager } = getContracts();
  const result = await callContract(inviteManager.methods.getSupplyInvitation(invitationId));
  return serializeResult(result);
}

/**
 * Gọi getShippingInvitation() trực tiếp từ smart contract.
 */
async function getShippingInvitationFromChain(invitationId) {
  const { inviteManager } = getContracts();
  const result = await callContract(inviteManager.methods.getShippingInvitation(invitationId));
  return serializeResult(result);
}


/**
 * Gọi getSupplyInvitationsByBatch() trực tiếp từ smart contract.
 * Trả về array các invitationId (uint256[]).
 */
async function getSupplyInvitationIdsByBatchFromChain(batchId) {
  const { inviteManager } = getContracts();
  const result = await callContract(inviteManager.methods.getSupplyInvitationsByBatch(batchId));
  return serializeResult(result);
}

/**
 * Gọi getShippingInvitationsByBatch() trực tiếp từ smart contract.
 * Trả về array các invitationId (uint256[]).
 */
async function getShippingInvitationIdsByBatchFromChain(batchId) {
  const { inviteManager } = getContracts();
  const result = await callContract(inviteManager.methods.getShippingInvitationsByBatch(batchId));
  return serializeResult(result);
}

// ───────────────────────────────────────────────────────
//  WRITE — lên blockchain (state-changing functions)
// ───────────────────────────────────────────────────────

/**
 * Gán transporter trực tiếp (Assigned mode).
 * Contract: setAssignedTransporterForBatch(batchId, transporterId, bidPrice, locationHash)
 *
 * locationHash: bytes32 — frontend tự tính hoặc truyền bytes32(0) nếu chưa có.
 */
async function setAssignedTransporter({ batchId, transporterId, bidPrice, pickupAddress, deliveryAddress }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  if (bidPrice <= 0) throw new Error('Bid price phải lớn hơn 0');

  const { cid, ipfsUrl, hash } = await uploadLocationToIPFS(pickupAddress, deliveryAddress);
  await PendingUpload.findOneAndUpdate(
    { imageHash: hash },
    { imageCid: cid, imageUrl: ipfsUrl },
    { upsert: true }
  );

  const { inviteManager } = getContracts();
  const txData = await buildTransaction(
    inviteManager.methods.setAssignedTransporterForBatch(batchId, transporterId, bidPrice, hash),
    callerAddress,
    inviteManager.options.address
  );

  return { txData, location: { locationIpfsUrl: ipfsUrl, locationCid: cid, locationHash: hash } };
}

/**
 * Tạo supply bidding (Bidding mode).
 * Mời supplier tham gia đấu giá cho batch.
 * Contract: createSupplyInvitation(batchId, supplierId, cropId, bidPrice)
 */
async function createSupplyBidding({ batchId, supplierId, cropId, bidPrice }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  if (bidPrice <= 0) throw new Error('Bid price phải lớn hơn 0');

  const { inviteManager } = getContracts();
  const txData = await buildTransaction(
    inviteManager.methods.createSupplyInvitation(batchId, supplierId, cropId || 0, bidPrice),
    callerAddress,
    inviteManager.options.address
  );

  return { txData };
}

/**
 * Tạo shipping bidding (Bidding mode).
 * Mời transporter tham gia đấu giá cho batch.
 * Contract: createShippingInvitation(batchId, transporterId, bidPrice)
 */
async function createShippingBidding({ batchId, transporterId, bidPrice }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  if (bidPrice <= 0) throw new Error('Bid price phải lớn hơn 0');

  const { inviteManager } = getContracts();
  const txData = await buildTransaction(
    inviteManager.methods.createShippingInvitation(batchId, transporterId, bidPrice),
    callerAddress,
    inviteManager.options.address
  );

  return { txData };
}

/**
 * Supplier chấp nhận/từ chối supply invitation (Assigned mode).
 * Contract: updateStatusSupplyInvitationAssigned(invitationId, status, cropId)
 *   - status 1 (Accepted): contract gọi batchManager.setSupplier() + cập nhật cropId
 *   - status 2 (Rejected): contract gọi batchManager.updateSupplierAssignmentStatus(Bidding)
 * Indexer nhận SupplyInvitationStatusUpdated → cập nhật status trong DB.
 *
 * @param {{ invitationId, status: 1|2, cropId }} params
 *   status: 1=Accepted, 2=Rejected
 *   cropId: bắt buộc khi Accepted — crop cụ thể mà supplier dùng để supply
 */
async function respondSupplyInvitationAssigned({ invitationId, status, cropId }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  // Pre-check từ DB: invitation có tồn tại và đang Pending không?
  const inv = await Invitation.findOne({
    invitationId: Number(invitationId),
    invitationType: 'Supply',
  });
  if (!inv) throw new Error(`Supply invitation #${invitationId} không tồn tại`);
  if (inv.status !== 'Pending') {
    throw new Error(`Invitation #${invitationId} không còn ở trạng thái Pending (hiện: ${inv.status})`);
  }

  if (status === 1 && (!cropId || cropId <= 0)) {
    throw new Error('Khi chấp nhận invitation, cropId phải là số nguyên dương');
  }

  const { inviteManager } = getContracts();
  const txData = await buildTransaction(
    inviteManager.methods.updateStatusSupplyInvitationAssigned(invitationId, status, cropId || 0),
    callerAddress,
    inviteManager.options.address
  );
  return { txData };
}

/**
 * Transporter chấp nhận/từ chối shipping invitation.
 * @param {{ invitationId, status: 1|2 }} params
 */
async function respondShippingInvitationAssigned({ invitationId, status }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const inv = await Invitation.findOne({
    invitationId: Number(invitationId),
    invitationType: 'Shipping',
  });
  if (!inv) throw new Error(`Shipping invitation #${invitationId} không tồn tại`);
  if (inv.status !== 'Pending') {
    throw new Error(`Invitation #${invitationId} không còn ở trạng thái Pending (hiện: ${inv.status})`);
  }

  const { inviteManager } = getContracts();
  const txData = await buildTransaction(
    inviteManager.methods.updateStatusShippingInvitationAssigned(invitationId, status),
    callerAddress,
    inviteManager.options.address
  );
  return { txData };
}

/**
 * Workspace owner chọn winner supply (Bidding mode).
 *
 * Contract chỉ set Won cho 1 invitation → emit event.
 * Indexer nhận event → set Won + cascade set Lost cho các Pending còn lại.
 * Không cần loop on-chain.
 */
async function selectBiddingWinnerSupply(invitationId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  // Pre-check: invitation tồn tại và đang Pending
  const inv = await Invitation.findOne({
    invitationId: Number(invitationId),
    invitationType: 'Supply',
  });
  if (!inv) throw new Error(`Supply invitation #${invitationId} không tồn tại`);
  if (inv.status !== 'Pending') {
    throw new Error(`Invitation #${invitationId} không ở trạng thái Pending (hiện: ${inv.status})`);
  }

  // Pre-check: batch chưa có winner nào chưa
  const existingWinner = await Invitation.findOne({
    batchId: inv.batchId,
    invitationType: 'Supply',
    status: 'Won',
  });
  if (existingWinner) {
    throw new Error(`Batch #${inv.batchId} đã có supply winner (inv #${existingWinner.invitationId})`);
  }

  const { inviteManager } = getContracts();
  const txData = await buildTransaction(
    inviteManager.methods.updateStatusSupplyInvitationBidding(invitationId),
    callerAddress,
    inviteManager.options.address
  );
  return { txData };
}

/**
 * Workspace owner chọn winner shipping (Bidding mode).
 */
async function selectBiddingWinnerShipping(invitationId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const inv = await Invitation.findOne({
    invitationId: Number(invitationId),
    invitationType: 'Shipping',
  });
  if (!inv) throw new Error(`Shipping invitation #${invitationId} không tồn tại`);
  if (inv.status !== 'Pending') {
    throw new Error(`Invitation #${invitationId} không ở trạng thái Pending (hiện: ${inv.status})`);
  }

  const existingWinner = await Invitation.findOne({
    batchId: inv.batchId,
    invitationType: 'Shipping',
    status: 'Won',
  });
  if (existingWinner) {
    throw new Error(`Batch #${inv.batchId} đã có shipping winner (inv #${existingWinner.invitationId})`);
  }

  const { inviteManager } = getContracts();
  const txData = await buildTransaction(
    inviteManager.methods.updateStatusShippingInvitationBidding(invitationId),
    callerAddress,
    inviteManager.options.address
  );
  return { txData };
}

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
