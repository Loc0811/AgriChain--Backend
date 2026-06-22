// ============================================================
//  src/services/productService.js
// ============================================================
const { getContracts } = require('../config/contracts');
const { callContract, buildTransaction, serializeResult } = require('../utils/blockchain');
const { uploadFileToIPFS } = require('../utils/ipfs');
const { ProductWorkspace, ProductOffer } = require('../models/Product');
const { ProductMapping, SupplyProposal } = require('../models/ProductMapping');
const Workspace = require('../models/Workspace');
const PendingUpload = require('../models/PendingUpload');

const PRODUCT_STATUS = ['Pending', 'Approved', 'Rejected'];

// ─────────────────────────────────────────────
//  READ — từ DB
// ─────────────────────────────────────────────

/**
 * Lấy danh sách ProductWorkspaces active của 1 workspace từ DB.
 */
async function getAllProductWorkspaces(workspaceId, {page = 1, limit = 20, search= '' } = {}) {
  const filter = { 
    workspaceId: Number(workspaceId),
    isActive: true,
  };
  
  if (search && search.trim()) filter.name = { $regex: search, $options: 'i' };

  const skip = (page - 1) * limit;
  const total = await ProductWorkspace.countDocuments(filter);
  const data = await ProductWorkspace.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-__v');

  return { data, total, page: Number(page), pages: Math.ceil(total / limit) };
}

/**
 * Lấy danh sách ProductWorkspaces của workspace mà chưa được mapping với productOfferId nào từ DB.
 */ 
async function getUnmappedProductWorkspaces(workspaceId, productOfferId, { page = 1, limit = 20 } = {}) {
  // 1. Lấy tất cả productWorkspaceId đã được mapping với productOfferId này
  const existingMappings = await ProductMapping.find({
    productOfferId: Number(productOfferId),
    isActive: true
  }).select('productWorkspaceId');
  
  const mappedProductWorkspaceIds = existingMappings.map(m => m.productWorkspaceId);
  
  // 2. Xây dựng filter cho ProductWorkspace
  const filter = {
    workspaceId: Number(workspaceId),
    isActive: true
  };
  
  // Nếu đã có mapping, loại trừ những ID đã được map
  if (mappedProductWorkspaceIds.length > 0) {
    filter.productWorkspaceId = { $nin: mappedProductWorkspaceIds };
  }
  
  // 3. Query với pagination
  const skip = (page - 1) * limit;
  const total = await ProductWorkspace.countDocuments(filter);
  const data = await ProductWorkspace.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-__v');
  
  return {
    data,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit)
  };
}

/**
 * Lấy 1 ProductWorkspace theo ID.
 */
async function getProductWorkspace(productWorkspaceId) {
  const p = await ProductWorkspace.findOne({ productWorkspaceId: Number(productWorkspaceId), isActive: true })
    .select('-__v');
  if (!p) throw Object.assign(new Error(`ProductWorkspace #${productWorkspaceId} không tồn tại hoặc không còn hoạt động`), { statusCode: 404 });
  
  return p;
}

/**
 * Lấy danh sách ProductOffers active của 1 workspace từ DB.
 */
async function getAllProductOffers(supplierId, {page = 1, limit = 20, search= '' } = {}) {
  const filter = { 
    supplierId: supplierId,
    isActive: true,
  };
  
  if (search && search.trim()) filter.name = { $regex: search, $options: 'i' };

  const skip = (page - 1) * limit;
  const total = await ProductOffer.countDocuments(filter);

  const data = await ProductOffer.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-__v');

  return { data, total, page: Number(page), pages: Math.ceil(total / limit) };
}

/**
 * Lấy 1 ProductOffer theo ID.
 */
async function getProductOffer(productOfferId) {
  const p = await ProductOffer.findOne({ productOfferId: Number(productOfferId), isActive: true })
    .select('-__v');
  if (!p) throw Object.assign(new Error(`ProductOffer #${productOfferId} không tồn tại hoặc không còn hoạt động`), { statusCode: 404 });
  
  return p;
}

/**
 * Kiểm tra mapping giữa ProductWorkspace và ProductOffer từ DB.
 */
async function checkProductMapping(productWorkspaceId, productOfferId) {
  const mapping = await ProductMapping.findOne({ 
    productWorkspaceId: Number(productWorkspaceId), 
    productOfferId: Number(productOfferId),
  });
  if (!mapping) return { isMapped: false };

  return {
    isMapped: true,
    isActive: mapping.isActive,
    txHash: mapping.txHash,
    blockNumber: mapping.blockNumber,
  };
}

/**
 * Lấy tất cả SupplierId đang được map active vào ProductWorkspace.
 */
async function getSuppliersOfProductWorkspace(productWorkspaceId) {
  const pw = await ProductWorkspace.findOne({ productWorkspaceId: Number(productWorkspaceId), isActive: true });
  if (!pw) throw Object.assign(new Error(`ProductWorkspace #${productWorkspaceId} không tồn tại hoặc không còn hoạt động`), { statusCode: 404 });

  const mappings = await ProductMapping.find({ productWorkspaceId: Number(productWorkspaceId), isActive: true });
  if (mappings.length === 0) return [];

  const productOfferIds = [...new Set(mappings.map(m => m.productOfferId))];
  const supplierDocs = await ProductOffer.find({ productOfferId: { $in: productOfferIds }, isActive: true }).select('supplierId');
  const supplierIds = supplierDocs.map(doc => doc.supplierId.toLowerCase());
  
  const workspaces = await Workspace.find(
    { 
      'members.address': { $in: supplierIds },
      'members.isActive': true,
      isActive: true,
    },
    { 'members.$': 1 }
  ).lean();

  const members = await Workspace.aggregate([
    { $match: { isActive: true } },
    { $unwind: '$members' },
    { $match: { 
      'members.address': { $in: supplierIds }, 
      'members.role': 'Supplier',
      'members.isActive': true 
    }},
    { $group: {
      _id: '$members.address',
      representativeName: { $first: '$members.representativeName' }
    }},
    { $project: { _id: 0, address: '$_id', representativeName: 1 } }
  ]);

  return members.map(m => ({ supplierId: m.address, representativeName: m.representativeName }));
}

/**
 * Lấy 1 SupplyProposal từ DB theo proposalId.
 */
async function getSupplyProposal(proposalId) {
  const p = await SupplyProposal.findOne({ proposalId: Number(proposalId) }).select('-__v');
  if (!p) throw Object.assign(new Error(`SupplyProposal #${proposalId} không tồn tại`), { statusCode: 404 });
  return p;
}

/**
 * Lấy SupplyProposals của workspace theo status Pending.
 */
async function getPendingSupplyProposals(workspaceId) {
  const proposals = await SupplyProposal.find({ 
    workspaceId: Number(workspaceId), 
    status: 'Pending' 
  })
  .sort({ createdAt: -1 })
  .lean();

  if (!proposals.length) return [];

  const userIds = [...new Set(proposals.map(p => p.userId))];

  const ws = await Workspace.findOne(
    { workspaceId: Number(workspaceId) },
    { members: 1 } 
  ).lean();

  const memberMap = new Map();
  if (ws && ws.members) {
    ws.members.forEach(m => {
      if (m.address && m.representativeName) {
        memberMap.set(m.address.toLowerCase(), m.representativeName);
      }
    });
  }

  const productIds = [...new Set(proposals.map(p => p.productId))];

  const productOffers = await ProductOffer.find({ 
    productOfferId: { $in: productIds }, 
    isActive: true 
  })
  .select('productOfferId name imageUrl')
  .lean();

  const productOfferMap = new Map(
    productOffers.map(po => [po.productOfferId, po])
  );

  const enrichedProposals = proposals.map(p => ({
    ...p,
    representativeName: memberMap.get(p.userId.toLowerCase()) || 'Unknown',
    product: productOfferMap.get(p.productId) || null,
  }));
  
  return enrichedProposals;
}

// ─────────────────────────────────────────────
//  READ — view functions trực tiếp từ chain
// ─────────────────────────────────────────────

/**
 * Gọi getProductWorkspace() từ chain.
 */
async function getProductWorkspaceFromChain(productWorkspaceId) {
  const { productManager } = getContracts();
  const result = await callContract(productManager.methods.getProductWorkspace(productWorkspaceId));
  return serializeResult(result);
}

/**
 * Gọi getProductOffer() từ chain.
 */
async function getProductOfferFromChain(productOfferId) {
  const { productManager } = getContracts();
  const result = await callContract(productManager.methods.getProductOffer(productOfferId));
  return serializeResult(result);
}

/**
 * Gọi getProductMapping() từ chain.
 */
async function getProductMappingFromChain(productWorkspaceId, productOfferId) {
  const { productMappingManager } = getContracts();
  const result = await callContract(productMappingManager.methods.getProductMapping(productWorkspaceId, productOfferId));
  return serializeResult(result);
}

/**
 * Gọi getSupplyProposal() từ chain.
 */
async function getSupplyProposalFromChain(proposalId) {
  const { productMappingManager } = getContracts();
  const result = await callContract(supplyProposalManager.methods.getSupplyProposal(proposalId));
  const raw = serializeResult(result);
  return { ...raw, status: PRODUCT_STATUS[raw.status] || 'Pending' };
}

// ─────────────────────────────────────────────
//  WRITE — tạo tx, gửi tx, update DB sau khi có receipt
// ─────────────────────────────────────────────

/**
 * Tạo ProductWorkspace mới.
 * Contract: chỉ workspace owner mới được tạo.
 */
async function createProductWorkspace({ name, description = '', unit, workspaceId }, callerAddress, file) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const ws = await Workspace.findOne({ workspaceId: Number(workspaceId) });
  if (!ws) throw Object.assign(new Error(`Workspace #${workspaceId} không tồn tại`), { statusCode: 404 });
  if (!ws.isActive) throw new Error('Workspace không còn hoạt động');

  let imageUrl = '';
  let imageCid = '';
  let imageHash = '0x' + '0'.repeat(64);

  if (file) {
    const { cid, ipfsUrl, hash } = await uploadFileToIPFS(file, 'product-workspaces');
    imageUrl = ipfsUrl;
    imageCid = cid;
    imageHash = hash;

    await PendingUpload.findOneAndUpdate(
      { imageHash },
      { imageUrl, imageCid },
      { upsert: true }
    );
  }

  const { productManager } = getContracts();
  const txData = await buildTransaction(
    productManager.methods.createProductWorkspace(name, description, imageHash, unit, workspaceId),
    callerAddress,
    productManager.options.address
  );
 
  return { txData, image: file ? { imageCid, imageUrl, imageHash } : null };
}
 
/**
 * Cập nhật ProductWorkspace.
 * Contract: onlyProductWorkspaceOwner (workspace owner).
 */
async function updateProductWorkspace({ productWorkspaceId, name, description = '', unit }, callerAddress, file) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const existing = await ProductWorkspace.findOne({ productWorkspaceId: Number(productWorkspaceId) });
  if (!existing) throw Object.assign(
    new Error(`ProductWorkspace #${productWorkspaceId} không tồn tại`), { statusCode: 404 }
  );
  if (!existing.isActive) throw new Error('ProductWorkspace đã bị xóa');
 
  let imageUrl = existing.imageUrl || '';
  let imageCid = existing.imageCid || '';
  let imageHash = existing.imageHash || '0x' + '0'.repeat(64);

  if (file) {
    const result = await uploadFileToIPFS(file, 'product-workspaces');
    imageUrl = result.ipfsUrl;
    imageCid = result.cid;
    imageHash = result.hash;

    await PendingUpload.findOneAndUpdate(
      { imageHash },
      { imageUrl, imageCid },
      { upsert: true }
    );
  }

  const { productManager } = getContracts();
  const txData = await buildTransaction(
    productManager.methods.updateProductWorkspace(productWorkspaceId, name, description, imageHash, unit), 
    callerAddress,
    productManager.options.address
  );

  return { txData, image: file ? { imageCid, imageUrl, imageHash } : null };
}
 
/**
 * Xóa (deactivate) ProductWorkspace.
 * Contract: onlyProductWorkspaceOwner.
 */
async function deleteProductWorkspace(productWorkspaceId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const existing = await ProductWorkspace.findOne({ productWorkspaceId: Number(productWorkspaceId) });
  if (!existing) throw Object.assign(
    new Error(`ProductWorkspace #${productWorkspaceId} không tồn tại`), { statusCode: 404 }
  );
  if (!existing.isActive) throw new Error('ProductWorkspace đã bị xóa trước đó');
 
  const { productManager } = getContracts();
  const txData = await buildTransaction(
    productManager.methods.deleteProductWorkspace(productWorkspaceId),
    callerAddress,
    productManager.options.address
  );
 
  return { txData };
}

/**
 * Điều chỉnh số lượng sản phẩm trong ProductWorkspace.
 * Contract: onlyProductWorkspaceOwner.
 */
async function adjustProductQuantity(productWorkspaceId, delta, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const existing = await ProductWorkspace.findOne({ productWorkspaceId: Number(productWorkspaceId) });
  if (!existing) throw Object.assign(
    new Error(`ProductWorkspace #${productWorkspaceId} không tồn tại`), { statusCode: 404 }
  );
  if (!existing.isActive) throw new Error('ProductWorkspace đã bị xóa');

  const newQuantity = existing.quantity + Number(delta);
  if (newQuantity < 0) throw new Error('Số lượng sản phẩm không được âm');

  const { productManager } = getContracts();
  const txData = await buildTransaction(
    productManager.methods.adjustProductQuantity(productWorkspaceId, Number(delta)),
    callerAddress,
    productManager.options.address
  );

  return { txData };
}
 
/**
 * Tạo ProductOffer mới.
 * Contract: chỉ Supplier role. callerAddress = msg.sender (Supplier).
 */
async function createProductOffer({ name, description = '' }, callerAddress, file) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
 
  let imageUrl = '';
  let imageCid = '';
  let imageHash = '0x' + '0'.repeat(64);

  if (file) {
    const { cid, ipfsUrl, hash } = await uploadFileToIPFS(file, 'product-offers');
    imageUrl = ipfsUrl;
    imageCid = cid;
    imageHash = hash;

    await PendingUpload.findOneAndUpdate(
      { imageHash },
      { imageUrl, imageCid },
      { upsert: true }
    );``
  }

  const { productManager } = getContracts();
  const txData = await buildTransaction(
    productManager.methods.createProductOffer(name, description, imageHash),
    callerAddress,
    productManager.options.address
  );

  return { txData, image: file ? { imageCid, imageUrl, imageHash } : null };
}
 
/**
 * Cập nhật ProductOffer.
 * Contract: onlyProductOfferSupplier — msg.sender phải là supplier của offer đó.
 */
async function updateProductOffer({ productOfferId, name, description = ''}, callerAddress, file) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
 
  const existing = await ProductOffer.findOne({ productOfferId: Number(productOfferId) });
  if (!existing) throw Object.assign(
    new Error(`ProductOffer #${productOfferId} không tồn tại`), { statusCode: 404 }
  );
  if (!existing.isActive) throw new Error('ProductOffer đã bị xóa');
 
  let imageUrl = existing.imageUrl || '';
  let imageCid = existing.imageCid || '';
  let imageHash = existing.imageHash || '0x' + '0'.repeat(64);

  if (file) {
    const result = await uploadFileToIPFS(file, 'product-offers');
    imageUrl = result.ipfsUrl;
    imageCid = result.cid;
    imageHash = result.hash;

    await PendingUpload.findOneAndUpdate(
      { imageHash },
      { imageUrl, imageCid },
      { upsert: true }
    );
  }

  const { productManager } = getContracts();
  const txData = await buildTransaction(
    productManager.methods.updateProductOffer(productOfferId, name, description, imageHash),
    callerAddress,
    productManager.options.address
  );

  return { txData, image: file ? { imageCid, imageUrl, imageHash } : null };
}
 
/**
 * Xóa (deactivate) ProductOffer.
 * Contract: onlyProductOfferSupplier.
 */
async function deleteProductOffer(productOfferId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
 
  const existing = await ProductOffer.findOne({ productOfferId: Number(productOfferId) });
  if (!existing) throw Object.assign(
    new Error(`ProductOffer #${productOfferId} không tồn tại`), { statusCode: 404 }
  );
  if (!existing.isActive) throw new Error('ProductOffer đã bị xóa trước đó');
 
  const { productManager } = getContracts();
  const txData = await buildTransaction(
    productManager.methods.deleteProductOffer(productOfferId),
    callerAddress,
    productManager.options.address
  );
 
  return { txData };
}
 
/**
 * Map ProductWorkspace ↔ ProductOffer.
 * Contract: chỉ workspace owner của ProductWorkspace đó.
 */
async function mapProduct({ productWorkspaceId, productOfferId }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  const [pw, po] = await Promise.all([
    ProductWorkspace.findOne({ productWorkspaceId: Number(productWorkspaceId) }),
    ProductOffer.findOne({ productOfferId: Number(productOfferId) }),
  ]);
  if (!pw) throw Object.assign(new Error(`ProductWorkspace #${productWorkspaceId} không tồn tại`), { statusCode: 404 });
  if (!po) throw Object.assign(new Error(`ProductOffer #${productOfferId} không tồn tại`), { statusCode: 404 });
  if (!pw.isActive) throw new Error('ProductWorkspace đã bị xóa');
  if (!po.isActive) throw new Error('ProductOffer đã bị xóa');
 
  const existingMapping = await ProductMapping.findOne({
    productWorkspaceId: Number(productWorkspaceId),
    productOfferId:     Number(productOfferId),
    isActive:           true,
  });
  if (existingMapping) throw new Error('Mapping này đã tồn tại và đang active');
 
  const { productMappingManager } = getContracts();
  const txData = await buildTransaction(
    productMappingManager.methods.mapProduct(productWorkspaceId, productOfferId),
    callerAddress,
    productMappingManager.options.address
  );
 
  return { txData };
}
 
/**
 * Supplier tạo SupplyProposal vào workspace.
 * Contract: phải là workspace member VÀ là supplier của productOffer đó.
 * callerAddress = msg.sender (Supplier).
 */
async function createSupplyProposal({ workspaceId, productId }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
 
  const po = await ProductOffer.findOne({ productOfferId: Number(productId) });
  if (!po) throw Object.assign(new Error(`ProductOffer #${productId} không tồn tại`), { statusCode: 404 });
  if (!po.isActive) throw new Error('ProductOffer đã bị xóa');
  if (po.supplierId !== callerAddress.toLowerCase()) {
    throw new Error('Chỉ supplier của ProductOffer này mới được tạo proposal');
  }
 
  const { productMappingManager } = getContracts();
  const txData = await buildTransaction(
    productMappingManager.methods.createSupplyProposal(workspaceId, productId),
    callerAddress,
    productMappingManager.options.address
  );
  
  return { txData };
}
 
/**
 * Workspace owner xử lý SupplyProposal.
 * Contract: chỉ workspace owner.
 *
 * Khi Accepted (status=1), owner chọn 1 trong 2:
 *   - Tạo ProductWorkspace mới: productWorkspaceId = 0, cần name + unit
 *   - Map vào ProductWorkspace đã có: productWorkspaceId > 0
 *
 * @param {object} params
 * @param {number} params.proposalId
 * @param {number} params.status               - 1 (Accepted) | 2 (Rejected)
 * @param {number} [params.productWorkspaceId] - 0 = tạo mới, >0 = map existing
 * @param {string} [params.name]               - bắt buộc nếu productWorkspaceId = 0 + Accepted
 * @param {string} [params.description]
 * @param {string} [params.image]
 * @param {string} [params.unit]               - bắt buộc nếu productWorkspaceId = 0 + Accepted
 */
async function processSupplyProposal({
  proposalId,
  status,
  productWorkspaceId = 0,
  name = '',
  description = '',
  unit = '',
}, callerAddress, file) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const validStatus = [1, 2]; // Accepted hoặc Rejected
  if (!validStatus.includes(Number(status))) {
    throw new Error('Status không hợp lệ. Chỉ nhận: 1 (Accepted) hoặc 2 (Rejected)');
  }

  const { productMappingManager } = getContracts();

  if (Number(status) === 2) {
    const txData = await buildTransaction(
      productMappingManager.methods.processSupplyProposal(proposalId, status, 0, '', '', '0x' + '0'.repeat(64), ''),
      callerAddress,
      productMappingManager.options.address
    );

    return { txData };
  }
  
  const isCreatingNew = Number(status) === 1 && Number(productWorkspaceId) === 0;
 
  if (isCreatingNew) {
    if (!name?.trim())  throw new Error('name là bắt buộc khi tạo ProductWorkspace mới');
    if (!unit?.trim())  throw new Error('unit là bắt buộc khi tạo ProductWorkspace mới');
  }
 
  const existing = await getSupplyProposal(proposalId);
  if (existing.status !== 'Pending') {
    throw new Error(`SupplyProposal #${proposalId} đã được xử lý (${existing.status})`);
  }

  let imageUrl = '';
  let imageCid = '';
  let imageHash = '0x' + '0'.repeat(64);

  if (file && isCreatingNew) {
    const result = await uploadFileToIPFS(file, 'product-workspaces');
    imageUrl = result.ipfsUrl;
    imageCid = result.cid;
    imageHash = result.hash;

    await PendingUpload.findOneAndUpdate(
      { imageHash },
      { imageUrl, imageCid },
      { upsert: true }
    );
  }

  const txData = await buildTransaction(
    productMappingManager.methods.processSupplyProposal(
      proposalId, status, productWorkspaceId, name, description, imageHash, unit
    ),
    callerAddress,
    productMappingManager.options.address
  );
 
  return { txData, image: file ? { imageCid, imageUrl, imageHash } : null };
}

module.exports = {
  getAllProductWorkspaces,
  getUnmappedProductWorkspaces,
  getProductWorkspace,
  getAllProductOffers,
  getProductOffer,
  checkProductMapping,
  getSuppliersOfProductWorkspace,
  getSupplyProposal,
  getPendingSupplyProposals,
  getProductWorkspaceFromChain,
  getProductOfferFromChain,
  getProductMappingFromChain,
  getSupplyProposalFromChain,
  createProductWorkspace,
  updateProductWorkspace,
  deleteProductWorkspace,
  adjustProductQuantity,
  createProductOffer,
  updateProductOffer,
  deleteProductOffer,
  mapProduct,
  createSupplyProposal,
  processSupplyProposal,
}