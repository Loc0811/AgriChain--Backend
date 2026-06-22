// ============================================================
//  src/services/batchService.js
// ============================================================
const { getContracts } = require('../config/contracts');
const { callContract, buildTransaction, serializeResult } = require('../utils/blockchain');
const { getWeb3 } = require('../config/web3');
const { generateQRCodeBuffer } = require('../utils/qrcode');
const { uploadFileToIPFS, uploadLocationToIPFS } = require('../utils/ipfs');
const env = require('../config/env');
const { Batch } = require('../models/Batch');
const PendingUpload = require('../models/PendingUpload');
const { ProductWorkspace, ProductOffer } = require('../models/Product');
const Invitation = require('../models/Invitation');
const Workspace = require('../models/Workspace');
const Certification = require('../models/Certification');
const { Crop } = require('../models/Crop');

const getPublicBatchUrl = (batchId) => 
  `${process.env.FRONTEND_URL || 'http://localhost:5173'}/batches/${batchId}`;

const BATCH_STATUS = ['Pending', 'Producing', 'ReadyToShip', 'Shipping', 'Delivered', 'Stored', 'Cancelled'];
const ASSIGNMENT_STATUS = ['None', 'Assigned', 'Bidding'];

// Helpers
function toBytes32Hash(str) {
  return getWeb3().utils.keccak256(str);
}

// ─────────────────────────────────────────────
//  READ — từ MongoDB (nhanh, có filter/sort)
// ─────────────────────────────────────────────

/**
 * Lấy 1 batch theo batchId từ DB.
 */
async function getBatch(batchId) {
  const batch = await Batch.findOne({ batchId: Number(batchId) });
  if (!batch) throw Object.assign(new Error(`Batch #${batchId} không tồn tại`), { statusCode: 404 });
  return batch;
}

/**
 * Lấy toàn bộ lịch sử events của batch — đã embedded trong document.
 * 1 query duy nhất, không cần join.
 */
async function getBatchTimeline(batchId) {
  const batch = await Batch.findOne({ batchId: Number(batchId) }).select('batchId events status');
  if (!batch) throw Object.assign(new Error(`Batch #${batchId} không tồn tại`), { statusCode: 404 });
  return {
    batchId:     batch.batchId,
    status:      batch.status,
    timeline:    batch.events.sort((a, b) => b.batchEventId - a.batchEventId),
    totalEvents: batch.events.length,
  };
}

/**
 * Lấy chi tiết một event cụ thể.
 */
async function getBatchEvent(batchEventId) {
  const batch = await Batch.findOne({ 'events.batchEventId': Number(batchEventId) });
  if (!batch) throw Object.assign(new Error(`BatchEvent #${batchEventId} không tồn tại`), { statusCode: 404 });
  return batch.events.find(e => e.batchEventId === Number(batchEventId));
}

/**
 * Lấy toàn bộ lịch sử events detail của batch.
 */
async function getBatchEventTimeline(batchEventId) {
  const batch = await Batch.findOne({ 'events.batchEventId': Number(batchEventId) });
  if (!batch) throw Object.assign(new Error(`Event #${batchEventId} không tồn tại`), { statusCode: 404 });

  const ev = batch.events.find(e => e.batchEventId === Number(batchEventId));
  if (!ev) throw Object.assign(new Error(`Event #${batchEventId} không tồn tại`), { statusCode: 404 });

  return {
    batchEventId: ev.batchEventId,
    status:       ev.status,
    details:      ev.details.sort((a, b) => a.detailId - b.detailId),
    totalDetails: ev.details.length,
  };
}

/**
 * Lấy chi tiết một detail cụ thể.
 */
async function getBatchEventDetail(detailId) {
  const batch = await Batch.findOne({ 'events.details.detailId': Number(detailId) });
  if (!batch) throw Object.assign(new Error(`BatchEventDetail #${detailId} không tồn tại`), { statusCode: 404 });

  for (const ev of batch.events) {
    const detail = ev.details.find(d => d.detailId === Number(detailId));
    if (detail) return detail;
  }
  throw Object.assign(new Error(`BatchEventDetail #${detailId} không tồn tại`), { statusCode: 404 });
}

/**
 * Lấy batches của workspace — filter theo status, sort, pagination.
 * Dành cho owner workspace
 */
async function getBatchesByWorkspace(workspaceId, { page = 1, limit = 20, isCompleted } = {}) {
  const filter = { workspaceId: Number(workspaceId), isActive: true };

  if (isCompleted === 'true') {
    filter.status = 'Stored';
  } else if (isCompleted === 'false') {
    filter.status = { $nin: ['Stored', 'Cancelled'] };
  } else if (isCompleted === undefined) {
    // Mặc định trả về tất cả batches trừ đã hủy, bao gồm cả completed và in-progress
  }

  const skip  = (page - 1) * limit;
  const total = await Batch.countDocuments(filter);
  const batches  = await Batch.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const productIds = [...new Set(batches.map(batch => batch.productId))];
  const products = await ProductWorkspace.find({ productWorkspaceId: { $in: productIds } }).select('productWorkspaceId name imageUrl unit').lean();
  const productMap = new Map(products.map(p => [p.productWorkspaceId, {
    name: p.name,
    imageUrl: p.imageUrl,
    unit: p.unit,
  }]));

  const results = batches.map(batch => ({
    ...batch,
    events: (batch.events ?? []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    productName: productMap.get(batch.productId)?.name || null,
    imageUrl: productMap.get(batch.productId)?.imageUrl || null,
    unit: productMap.get(batch.productId)?.unit || null,
  }));

  return { data: results, total, page: Number(page), pages: Math.ceil(total / limit) };
}

/**
 * Lấy batches của supplier — filter theo status, sort, pagination.
 * Dành cho supplier.
 */
async function getBatchesBySupplier(supplierId, workspaceId, { page = 1, limit = 20, isCompleted } = {}) {
  const filter = { 
    supplierId: supplierId.toLowerCase(), 
    workspaceId: Number(workspaceId), 
    isActive: true 
  };

  if (isCompleted === 'true') {
    filter.status = 'Stored';
  } else if (isCompleted === 'false' || isCompleted === undefined) {
    filter.status = { $nin: ['Stored', 'Cancelled'] };
  }

  const skip = (page - 1) * limit;
  const total = await Batch.countDocuments(filter);
  const batches = await Batch.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const productIds = [...new Set(batches.map(batch => batch.productId))];
  const products = await ProductWorkspace.find({ productWorkspaceId: { $in: productIds } }).select('productWorkspaceId name unit').lean();
  const productMap = new Map(products.map(p => [p.productWorkspaceId, {
    name: p.name,
    unit: p.unit,
  }]));

  const results = batches.map(batch => ({
    ...batch,
    productName: productMap.get(batch.productId)?.name || null,
    unit: productMap.get(batch.productId)?.unit || null,
    events: (batch.events ?? []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  }));

  return { data: results, total, page: Number(page), pages: Math.ceil(total / limit) };
}

/**
 * Lấy batches của transporter — filter theo status, sort, pagination.
 * Dành cho transporter.
 */
async function getBatchesByTransporter(transporterId, workspaceId, { page = 1, limit = 20, isCompleted } = {}) {
  const filter = { 
    transporterId: transporterId.toLowerCase(), 
    workspaceId: Number(workspaceId), 
    isActive: true 
  };

  if (isCompleted === 'true') {
    filter.status = 'Stored';
  } else if (isCompleted === 'false' || isCompleted === undefined) {
    filter.status = { $nin: ['Stored', 'Cancelled'] };
  }

  const skip = (page - 1) * limit;
  const total = await Batch.countDocuments(filter);
  const batches = await Batch.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const productIds = [...new Set(batches.map(batch => batch.productId))];
  const products = await ProductWorkspace.find({ productWorkspaceId: { $in: productIds } }).select('productWorkspaceId name unit').lean();
  const productMap = new Map(products.map(p => [p.productWorkspaceId, {
    name: p.name,
    unit: p.unit,
  }]));

  const results = batches.map(batch => ({
    ...batch,
    productName: productMap.get(batch.productId)?.name || null,
    unit: productMap.get(batch.productId)?.unit || null,
    events: (batch.events ?? []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  }));

  return { data: results, total, page: Number(page), pages: Math.ceil(total / limit) };
}

/**
 * Lấy orders của supplier
 */
async function getOrdersBySupplier(supplierId, workspaceId, { page = 1, limit = 20 } = {}) {
  const supplierLow = supplierId.toLowerCase();
  const wsId = Number(workspaceId);

  const invites = await Invitation.find({
    supplierId: supplierLow,
    invitationType: 'Supply',
    status: { $in: ['Pending', 'Accepted', 'Won'] },
  }).select('batchId bidPrice');

  const invitedBatchIds = invites.map(inv => inv.batchId);
  const inviteBidPriceMap = new Map(invites.map(inv => [inv.batchId, inv.bidPrice]));

  const batchFilter = {
    workspaceId: wsId,
    isActive: true,
    $or: [
      { batchId: { $in: invitedBatchIds } },
      { supplierAssignmentStatus: 'Bidding', supplierId: { $in: [null, ''] } },
    ],
  };

  const skip = (page - 1) * limit;
  const total = await Batch.countDocuments(batchFilter);
  const batches = await Batch.find(batchFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-events')
    .lean();

  const productIds = [...new Set(batches.map(batch => batch.productId))];
  const products = await ProductWorkspace.find({ productWorkspaceId: { $in: productIds } }).select('productWorkspaceId name imageUrl unit').lean();
  const productMap = new Map(products.map(p => [p.productWorkspaceId, {
    name: p.name,
    imageUrl: p.imageUrl,
    unit: p.unit
  }]));

  const results = batches.map(batch => ({
    ...batch,
    productName: productMap.get(batch.productId)?.name || null,
    imageUrl: productMap.get(batch.productId)?.imageUrl || null,
    unit: productMap.get(batch.productId)?.unit || null,
    bidPrice: batch.supplierAssignmentStatus === 'Assigned' ? (inviteBidPriceMap.get(batch.batchId) ?? null) : null,
  }));

  return { data: results, total, page: Number(page), pages: Math.ceil(total / limit) };
}

/**
 * Lấy orders của transporter
 */
async function getOrdersByTransporter(transporterId, workspaceId, { page = 1, limit = 20 } = {}) {
  const transporterLow = transporterId.toLowerCase();
  const wsId = Number(workspaceId);

  const invites = await Invitation.find({
    transporterId: transporterLow,
    invitationType: 'Shipping',
    status: { $in: ['Pending', 'Accepted', 'Won'] },
  }).select('batchId bidPrice');
  const invitedBatchIds = invites.map(inv => inv.batchId);
  const inviteBidPriceMap = new Map(invites.map(inv => [inv.batchId, inv.bidPrice]));

  const batchFilter = {
    workspaceId: wsId,
    isActive: true,
    $or: [
      { batchId: { $in: invitedBatchIds } },
      { transporterAssignmentStatus: 'Bidding', transporterId: { $in: [null, ''] } },
    ],
  };

  const skip = (page - 1) * limit;
  const total = await Batch.countDocuments(batchFilter);
  const batches = await Batch.find(batchFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-events')
    .lean();

  const productIds = [...new Set(batches.map(batch => batch.productId))];
  const products = await ProductWorkspace.find({ productWorkspaceId: { $in: productIds } }).select('productWorkspaceId name imageUrl unit').lean();
  const productMap = new Map(products.map(p => [p.productWorkspaceId, {
    name: p.name,
    imageUrl: p.imageUrl,
    unit: p.unit
  }]));

  const results = batches.map(batch => ({
    ...batch,
    productName: productMap.get(batch.productId)?.name || null,
    imageUrl: productMap.get(batch.productId)?.imageUrl || null,
    unit: productMap.get(batch.productId)?.unit || null,
    bidPrice: batch.transporterAssignmentStatus === 'Assigned' ? (inviteBidPriceMap.get(batch.batchId) ?? null) : null,
  }));

  return { data: results, total, page: Number(page), pages: Math.ceil(total / limit) };
}

async function canAccessBatch(userId, batchId) {
  const userAddr = userId.toLowerCase();

  const batch = await Batch.findOne({ batchId: Number(batchId), isActive: true })
    .select('supplierId transporterId workspaceId')
    .lean();

  if (!batch) return false;

  if (batch.supplierId === userAddr || batch.transporterId === userAddr) return true;

  const workspace = await Workspace.findOne({ workspaceId: batch.workspaceId })
    .select('owner')
    .lean();
    
  return workspace?.owner === userAddr;
}

/**
 * Public API: lấy batch để verify nguồn gốc (dùng cho QR code scan).
 */
async function getBatchPublic(batchId) {
  const batch = await Batch.findOne({ batchId: Number(batchId), isActive: true });
  if (!batch) throw Object.assign(new Error(`Batch #${batchId} không tồn tại`), { statusCode: 404 });

  // ─── Crop (qua Invitation đã Accepted/Won) ────────────────
  let crop = null;
  const invitation = await Invitation.findOne({
    batchId: Number(batchId),
    invitationType: 'Supply',
    status: { $in: ['Accepted', 'Won'] },
  }).select('cropId').lean();

  if (invitation?.cropId) {
    const cropDoc = await Crop.findOne({ cropId: invitation.cropId, isActive: true }).lean();
    if (cropDoc) {
      const productOffer = await ProductOffer.findOne({ productOfferId: cropDoc.productId }).select('name').lean();
      crop = { ...cropDoc, productName: productOffer?.name || null };
    }
  }

  // ─── Workspace (lấy owner, tên workspace, members để lấy representativeName) ─
  const workspace = await Workspace.findOne({ workspaceId: batch.workspaceId })
    .select('owner name members')
    .lean();

  const memberName = (address) =>
    workspace?.members?.find((m) => m.address === address)?.representativeName || null;

  // ─── Product (ProductWorkspace) ────────────────────────────
  const productWorkspace = await ProductWorkspace.findOne({ productWorkspaceId: batch.productId })
    .select('name unit imageUrl')
    .lean();

  // ─── Certifications còn hạn cho owner/supplier/transporter ─
  const now = new Date();
  const certUserIds = [
    workspace?.owner,
    batch.supplierId,
    batch.transporterId,
  ].filter(Boolean);

  let certifications = [];
  if (certUserIds.length > 0) {
    certifications = await Certification.find({
      userId: { $in: certUserIds },
      isActive: true,
      expiryDate: { $gte: now },
    }).lean();
  }

  const certsByUser = (userId) =>
    certifications.filter((c) => c.userId === userId);

  return {
    batch: {
      ...batch.toObject(),
      events: batch.events.sort((a, b) => a.batchEventId - b.batchEventId),
    },

    productWorkspace: productWorkspace
      ? { name: productWorkspace.name, unit: productWorkspace.unit, imageUrl: productWorkspace.imageUrl || null }
      : null,

    crop,

    owner: workspace?.owner
      ? { address: workspace.owner, workspaceName: workspace.name, certifications: certsByUser(workspace.owner) }
      : null,
    supplier: batch.supplierId
      ? { address: batch.supplierId, representativeName: memberName(batch.supplierId), certifications: certsByUser(batch.supplierId) }
      : null,
    transporter: batch.transporterId
      ? { address: batch.transporterId, representativeName: memberName(batch.transporterId), certifications: certsByUser(batch.transporterId) }
      : null,

    // Links verify trực tiếp on-chain — không cần trust server
    etherscanUrl: `https://sepolia.etherscan.io/tx/${batch.txHash}`,
    contractAddr: process.env.BATCH_MANAGER_ADDRESS,
    verifyNote:   'Scan QR hoặc vào Etherscan để verify data trực tiếp từ blockchain',
  };
}

// ─────────────────────────────────────────────
//  READ — từ Blockchain (on-chain)
// ─────────────────────────────────────────────

/**
 * Gọi getBatch() trực tiếp từ smart contract.
 * Dùng để so sánh với DB hoặc debug.
 */
async function getBatchFromChain(batchId) {
  const { batchManager } = getContracts();
  const raw = await callContract(batchManager.methods.getBatch(batchId));
  const chain = serializeResult(raw);

  if (!chain || chain.id === '0' || Number(chain.id) === 0) throw Object.assign(new Error(`Batch #${batchId} không tồn tại trên blockchain`), { statusCode: 404 });
  return {
    batchId: Number(chain.id),
    productId: Number(chain.productId),
    workspaceId: Number(chain.workspaceId),
    quantity: Number(chain.quantity),
    supplierId: chain.supplierId?.toLowerCase() || null,
    supplierAssignmentType: ASSIGNMENT_STATUS[Number(chain.supplierAssignmentType)] || 'None',
    transporterId: chain.transporterId?.toLowerCase() || null,
    transporterAssignmentType: ASSIGNMENT_STATUS[Number(chain.transporterAssignmentType)] || 'None',
    status: BATCH_STATUS[Number(chain.status)] || 'Pending',
    locationHash: chain.locationHash,
    imageQRHash: chain.imageQRHash,
    createAt: new Date(Number(chain.createTime) * 1000),
    isActive: chain.isActive === true || chain.isActive === 'true',
  };
}

/**
 * Gọi getBatchEvent() trực tiếp từ smart contract.
 */
async function getBatchEventFromChain(batchEventId) {
  const { batchManager } = getContracts();
  const raw = await callContract(batchManager.methods.getBatchEvent(batchEventId));
  const chain = serializeResult(raw);
 
  if (!chain || chain.id === '0' || Number(chain.id) === 0) {
    throw Object.assign(new Error(`BatchEvent #${batchEventId} không tồn tại trên chain`), { statusCode: 404 });
  }
 
  return {
    batchEventId: Number(chain.id),
    batchId: Number(chain.batchId),
    status: BATCH_STATUS[Number(chain.status)] || 'Pending',
    timestamp: new Date(Number(chain.timestamp) * 1000),
    updatedBy: chain.updatedBy?.toLowerCase(),
    note: chain.note,
    location: chain.location,
  };
}

/**
 * Gọi getBatchEventDetail() trực tiếp từ smart contract.
 */
async function getBatchEventDetailFromChain(batchEventDetailId) {
  const { batchManager } = getContracts();
  const raw = await callContract(batchManager.methods.getBatchEventDetail(batchEventDetailId));
  const chain = serializeResult(raw);

  if (!chain || chain.id === '0' || Number(chain.id) === 0) {
    throw Object.assign(new Error(`BatchEventDetail #${batchEventDetailId} không tồn tại trên chain`), { statusCode: 404 });
  }

  return {
    detailId: Number(chain.id),
    batchEventId: Number(chain.batchEventId),
    location: chain.location,
    description: chain.description,
    timestamp: new Date(Number(chain.timestamp) * 1000),
  };
}

// ────────────────────────────────────────────────────
//  WRITE — lên blockchain (gọi các function có gas)
// ────────────────────────────────────────────────────

/**
 * Tạo batch mới.
 * @param {number} productId
 * @param {number} quantity
 * @param {number} supplierAssignmentType  1=Assigned, 2=Bidding
 * @param {number} supplierId
 * @param {number} bidPrice
 */
async function createBatch({ productId, quantity, supplierAssignmentType, supplierId, bidPrice }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const { batchManager, inviteManager } = getContracts();
  
  const lastBatch = await Batch.findOne({}, { batchId: 1 }).sort({ batchId: -1 }).lean();
  const nextBatchId = lastBatch ? lastBatch.batchId + 1 : 1;

  const publicUrl = getPublicBatchUrl(nextBatchId);
  const qrBuffer = await generateQRCodeBuffer(publicUrl, { width: 512 });

  const fileName = `batch-qr-${nextBatchId}-${Date.now()}.png`;
  const { cid, ipfsUrl, hash } = await uploadFileToIPFS(qrBuffer, fileName, 'batch-qr');
  await PendingUpload.findOneAndUpdate(
    { imageHash: hash },
    { imageUrl: ipfsUrl, imageCid: cid },
    { upsert: true }
  );


  const txData = await buildTransaction(
    inviteManager.methods.createBatchWithSupplier(productId, quantity, supplierAssignmentType, hash, supplierId || '0x' + '0'.repeat(40), bidPrice || 0),
    callerAddress,
    inviteManager.options.address
  );

  return { txData, qrCode: { qrCodeUrl: ipfsUrl, qrCodeCid: cid, qrCodeHash: hash } };
}

/**
 * Xóa mềm batch (isActive = false trên chain).
 * Chỉ workspace owner được gọi.
 */
async function deleteBatch(batchId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const batch = await getBatch(batchId);
  if (!batch) throw Object.assign(new Error(`Batch #${batchId} không tồn tại`), { statusCode: 404 });

  const { batchManager } = getContracts();
  const txData = await buildTransaction(
    batchManager.methods.deleteBatch(batchId),
    callerAddress,
    batchManager.options.address
  );

  return { txData };
}

/**
 * Thêm event vào timeline của batch.
 * Chỉ member của batch (supplier / transporter / workspace owner) được gọi.
 *
 * @param {number} batchId
 * @param {number} status     - BatchStatus enum index (0–6)
 * @param {string} note
 * @param {string} location   - địa điểm xảy ra event
 */
async function addBatchEvent({ batchId, status, note, location }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const batch = await getBatch(batchId);
  if (!batch) throw Object.assign(new Error(`Batch #${batchId} không tồn tại`), { statusCode: 404 });

  const { batchManager } = getContracts();
  const txData = await buildTransaction(
    batchManager.methods.addBatchEvent(batchId, status, note, location),
    callerAddress,
    batchManager.options.address
  );

  return { txData };
}

/**
 * Thêm detail vào một batch event.
 * Contract signature: addBatchEventDetail(batchEventId, location, description)
 *
 * @param {number} batchEventId
 * @param {string} location     - địa điểm ghi nhận chi tiết
 * @param {string} description
 */
async function addBatchEventDetail({ batchEventId, location, description }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const event = await getBatchEvent(batchEventId);
  if (!event) throw Object.assign(new Error(`BatchEvent #${batchEventId} không tồn tại`), { statusCode: 404 });

  const { batchManager } = getContracts();
  const txData = await buildTransaction(
    batchManager.methods.addBatchEventDetail(batchEventId, location, description),
    callerAddress,
    batchManager.options.address
  );

  return { txData };
}


/**
 * Cập nhật trạng thái assignment của supplier.
 * Chỉ workspace owner hoặc InviteManager được gọi.
 *
 * @param {number} batchId
 * @param {number} assignmentStatus  - 0=None, 1=Assigned, 2=Bidding
 */
async function updateSupplierAssignment({ batchId, assignmentStatus }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const batch = await getBatch(batchId);
  if (!batch) throw Object.assign(new Error(`Batch #${batchId} không tồn tại`), { statusCode: 404 });

  const { batchManager } = getContracts();
  const txData = await buildTransaction(
    batchManager.methods.updateSupplierAssignmentStatus(batchId, assignmentStatus),
    callerAddress,
    batchManager.options.address
  );
  return { txData };
}

/**
 * Cập nhật trạng thái assignment của transporter + location hash.
 * plaintext pickupAddress / deliveryAddress chỉ lưu DB (off-chain),
 * chỉ hash đi lên chain để bảo vệ thông tin địa chỉ.
 *
 * @param {number} batchId
 * @param {number} assignmentStatus
 * @param {string} pickupAddress    - plaintext
 * @param {string} deliveryAddress  - plaintext
 */
async function updateTransporterAssignment({ batchId, assignmentStatus, pickupAddress, deliveryAddress }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const batch = await getBatch(batchId);
  if (!batch) throw Object.assign(new Error(`Batch #${batchId} không tồn tại`), { statusCode: 404 });

  const { cid, ipfsUrl, hash } = await uploadLocationToIPFS(pickupAddress, deliveryAddress);
  await PendingUpload.findOneAndUpdate(
    { imageHash: hash },
    { imageCid: cid, imageUrl: ipfsUrl },
    { upsert: true }
  );

  const { batchManager } = getContracts();
  const txData = await buildTransaction(
    batchManager.methods.updateTransporterAssignmentStatus(batchId, assignmentStatus, hash),
    callerAddress,
    batchManager.options.address
  );

  return { txData, location: { locationIpfsUrl: ipfsUrl, locationCid: cid, locationHash: hash } };
}

module.exports = {
  getBatch,
  getBatchTimeline,
  getBatchEvent,
  getBatchEventTimeline,
  getBatchEventDetail,
  getBatchesByWorkspace,
  getBatchesBySupplier,
  getBatchesByTransporter,
  getOrdersBySupplier,
  getOrdersByTransporter,
  canAccessBatch,
  getBatchPublic,
  getBatchFromChain,
  getBatchEventFromChain,
  getBatchEventDetailFromChain,
  createBatch,
  deleteBatch,
  addBatchEvent,
  addBatchEventDetail,
  updateSupplierAssignment,
  updateTransporterAssignment,
};