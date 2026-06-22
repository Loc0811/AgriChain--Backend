// ============================================================
//  src/services/cropService.js
// ============================================================
const { getContracts } = require('../config/contracts');
const { callContract, buildTransaction, serializeResult } = require('../utils/blockchain');
const { Crop, CROP_EVENT_STATUS } = require('../models/Crop');
const { ProductOffer } = require('../models/Product');
const { ProductMapping } = require('../models/ProductMapping');
const Invitation = require('../models/Invitation');

// ─────────────────────────────────────────────────
//  READ — từ MongoDB (nhanh, có filter/sort)
// ─────────────────────────────────────────────────

/**
 * Lấy tất cả crops của supplier.
 */
async function getCropsBySupplier(supplierAddress, { page = 1, limit = 10, search } = {}) {
  page = Number(page);
  limit = Number(limit);
  const filter = { userId: supplierAddress.toLowerCase(), isActive: true };
  
  if (search) {
    filter.name = { $regex: search, $options: 'i' }; 
  }

  const skip = (page - 1) * limit;
  
  const [results, total] = await Promise.all([
    Crop.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $addFields: {
          latestEvent: {
            $arrayElemAt: [
              { $sortArray: { input: '$events', sortBy: { cropEventId: -1 } } },
              0
            ]
          }
        }
      },
      {
        $addFields: {
          cropStatus: {
            $cond: {
              if: { $eq: ['$latestEvent.status', 'Harvest'] },
              then: 'Harvested',
              else: 'Ongoing'
            }
          }
        }
      },
      { $project: { events: 0 } }
    ]),
    Crop.countDocuments(filter)
  ]);

  if (results.length === 0) {
    return {
      data: [],
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    };
  }

  const productIds = [...new Set(results.map(crop => crop.productId))];
  const products = await ProductOffer.find({ productOfferId: { $in: productIds } }).select('productOfferId name').lean();

  const productMap = new Map(products.map(p => [p.productOfferId, p.name]));

  const data = results.map(crop => ({
    ...crop,
    productName: productMap.get(crop.productId) || null,
  }));

  return {
    data,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
  };
}

/**
 * Lấy crops theo productId (productOffer).
 */
async function getCropsByProduct(productId, { page = 1, limit = 10, search } = {}) {
  page = Number(page);
  limit = Number(limit);
  const product = await ProductOffer.findOne({ 
    productOfferId: Number(productId), 
    isActive: true 
  }).select('productOfferId name').lean();

  if (!product) {
    return {
      product: null,
      data: [],
      total: 0,
      page: Number(page),
      pages: 0,
    };
  }

  const filter = { productId: Number(productId), isActive: true };
  
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }

  const skip = (page - 1) * limit;
  
  const [results, total] = await Promise.all([
    Crop.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $addFields: {
          latestEvent: {
            $arrayElemAt: [
              { $sortArray: { input: '$events', sortBy: { cropEventId: -1 } } },
              0
            ]
          }
        }
      },
      {
        $addFields: {
          cropStatus: {
            $cond: {
              if: { $eq: ['$latestEvent.status', 'Harvest'] },
              then: 'Harvested',
              else: 'Ongoing'
            }
          }
        }
      },
      { $project: { events: 0 } }
    ]),
    Crop.countDocuments(filter)
  ]);

  return {
    product: {
      productOfferId: product.productOfferId,
      name: product.name,
    },
    data: results,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
  };
}

async function getCropsOnGoingByProductWorkspace(productWorkspaceId, supplierId) {
  const mappings = await ProductMapping.find({ productWorkspaceId: Number(productWorkspaceId), isActive: true }).select('productOfferId').lean();
  const productOfferIds = mappings.map(m => m.productOfferId);

  const productOffer = await ProductOffer.findOne({ 
    productOfferId: { $in: productOfferIds }, 
    supplierId: supplierId.toLowerCase(),
    isActive: true
  }).select('productOfferId').lean();

  if (!productOffer) {
    return [];
  }

  const crops = await Crop.aggregate([
    {
      $match: { 
        productId: Number(productOffer.productOfferId), 
        isActive: true 
      }
    },
    {
      $addFields: {
        latestEvent: {
          $arrayElemAt: [
            { $sortArray: { input: '$events', sortBy: { cropEventId: -1 } } },
            0
          ]
        }
      }
    },
    {
      $match: {
        $or: [
          { 'latestEvent.status': { $ne: 'Harvest' } },
          { 'latestEvent': null }
        ]
      }
    },
    {
      $project: {
        cropId: 1,
        name: 1,
      }
    }
  ]);

  return crops;
}


/**
 * Lấy 1 crop theo cropId.
 */
async function getCrop(cropId) {
  const crop = await Crop.findOne({ cropId: Number(cropId) });
  if (!crop) throw new Error(`Crop #${cropId} không tồn tại`);
  return crop;
}

/**
 * Lấy 1 crop theo batchId (từ invitation).
 */
async function getCropByBatchId(batchId) {
  const invitation = await Invitation.findOne({ 
    batchId: Number(batchId), 
    invitationType: 'Supply',
    status: { $in: ['Accepted', 'Won'] },
  }).select('cropId').lean();

  if (!invitation) throw new Error(`Không tìm thấy crop nào cho batchId #${batchId}`);

  if (!invitation.cropId || invitation.cropId === 0) throw new Error(`Crop chưa được tạo cho batchId #${batchId}`);

  const crop = await Crop.findOne({ cropId: invitation.cropId}).lean();
  if (!crop) throw new Error(`Crop #${invitation.cropId} không tồn tại`);

  const product = await ProductOffer.findOne({ productOfferId: crop.productId }).select('name').lean();
  
  return { ...crop, productOfferName: product?.name || null };
}

/**
 * Lấy 1 CropEvent từ DB theo cropEventId.
 */
async function getCropEvent(cropEventId) {
  const crop = await Crop.findOne({ 'events.cropEventId': Number(cropEventId) }).select('events');
  if (!crop) throw new Error(`CropEvent #${cropEventId} không tồn tại`);
  const event = crop.events.find(e => e.cropEventId === Number(cropEventId));
  if (!event) throw new Error(`CropEvent #${cropEventId} không tồn tại`);
  return event;
}

/**
 * Lấy timeline nhật ký canh tác — events đã embedded, 1 query duy nhất.
 */
async function getCropTimeline(cropId) {
  const crop = await Crop.findOne({ cropId: Number(cropId) }).select('cropId events');
  if (!crop) throw new Error(`Crop #${cropId} không tồn tại`);
  return {
    cropId:      crop.cropId,
    timeline:    crop.events.sort((a, b) => a.cropEventId - b.cropEventId),
    totalEvents: crop.events.length,
  };
}

// ───────────────────────────────────────────────
//  READ — từ chain (chậm, không filter/sort)
// ───────────────────────────────────────────────

/**
 * Gọi getCrop() trực tiếp từ smart contract.
 * Dùng để debug / verify data DB vs chain (verifyJob).
 */
async function getCropFromChain(cropId) {
  const { cropManager } = getContracts();
  const result = await callContract(cropManager.methods.getCrop(cropId));
  return serializeResult(result);
}

/**
 * Gọi getCropEvents() trực tiếp từ smart contract.
 * Trả về CropEvent struct cho 1 cropEventId.
 */
async function getCropEventFromChain(cropEventId) {
  const { cropManager } = getContracts();
  const result = await callContract(cropManager.methods.getCropEvents(cropEventId));
  return serializeResult(result);
}

// ──────────────────────────────────────────────────────────
//  WRITE — lên chain, DB tự động cập nhật qua event indexer
// ──────────────────────────────────────────────────────────

/**
 * Tạo mùa vụ mới trên chain.
 */
async function createCrop({ name, startDate, expectedHarvestDate, productId, location, cultivationArea }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const { cropManager } = getContracts();
  const txData = await buildTransaction(
    cropManager.methods.createCrop(name, startDate, expectedHarvestDate, productId, location, cultivationArea),
    callerAddress,
    cropManager.options.address
  );
  
  return { txData };
}

/**
 * Cập nhật thông tin mùa vụ.
 * startDate và productId KHÔNG thể thay đổi sau khi tạo (theo contract).
 */
async function updateCrop({ cropId, name, expectedHarvestDate, location, cultivationArea }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const { cropManager } = getContracts();
  const txData = await buildTransaction(
    cropManager.methods.updateCrop(cropId, name, expectedHarvestDate, location, cultivationArea),
    callerAddress,
    cropManager.options.address
  );

  return { txData };
}

/**
 * Soft-delete mùa vụ (isActive = false trên chain).
 */
async function deleteCrop(cropId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const { cropManager } = getContracts();
  const txData = await buildTransaction(
    cropManager.methods.deleteCrop(cropId), 
    callerAddress,
    cropManager.options.address
  );
  
  return { txData };
}

/**
 * Thêm sự kiện nhật ký canh tác cho 1 mùa vụ.
 */
async function addCropEvent({ cropId, description, status }, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const statusIndex = CROP_EVENT_STATUS.indexOf(status);
  if (statusIndex === -1) throw new Error(`Invalid status: ${status}`);

  const { cropManager } = getContracts();
  const txData = await buildTransaction(
    cropManager.methods.addCropEvent(cropId, description, statusIndex), 
    callerAddress,
    cropManager.options.address
  );
  
  return { txData };
}

module.exports = {
  getCrop, 
  getCropByBatchId,
  getCropEvent, 
  getCropsBySupplier, 
  getCropsByProduct, 
  getCropsOnGoingByProductWorkspace,
  getCropTimeline,
  getCropFromChain, 
  getCropEventFromChain,
  createCrop, 
  updateCrop, 
  deleteCrop, 
  addCropEvent,
};
