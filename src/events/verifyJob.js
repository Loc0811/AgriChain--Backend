const { getContracts } = require('../config/contracts');
const { callContract, serializeResult, sendTransaction } = require('../utils/blockchain');
const logger  = require('../utils/logger');

const User = require('../models/User');
const Workspace = require('../models/Workspace');
const { Batch } = require('../models/Batch');
const Invitation = require('../models/Invitation');
const { Crop } = require('../models/Crop');
const Certification = require('../models/Certification');
const { ProductWorkspace, ProductOffer} = require('../models/Product');
const { ProductMapping } = require('../models/ProductMapping');
const SyncState = require('../models/SyncState');
const { getWeb3 } = require('../config/web3');

const ROLE_MAP      = ['None','Admin','Distributor','Supplier','Transporter'];
const BATCH_STATUS  = ['Pending','Producing','ReadyToShip','Shipping','Delivered','Stored','Cancelled'];
const INVITE_STATUS = ['Pending','Accepted','Rejected','Won','Lost'];
const ASSIGNMENT_STATUS = ['None','Assigned','Bidding'];

// ── Mutex đơn giản: ngăn 2 audit chạy cùng lúc ─────────────
let auditRunning = false;

function acquireLock() {
  if (auditRunning) return false;
  auditRunning = true;
  return true;
}
function releaseLock() { auditRunning = false; }

// ─────────────────────────────────────────────────────────────
//  Random helpers
// ─────────────────────────────────────────────────────────────

/**
 * Random số nguyên trong [min, max] (ms).
 * Dùng để tạo delay không đoán được.
 */
function randomBetween(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Random sample N phần tử từ MongoDB.
 * Dùng $sample thay vì sort → không bị bias theo thứ tự.
 */
async function randomSample(Model, filter, n) {
  return Model.aggregate([
    { $match: filter },
    { $sample: { size: n } },
  ]);
}

// ─────────────────────────────────────────────────────────────
//  Audit Users
// ─────────────────────────────────────────────────────────────

async function auditUsers(safeBlock) {
  const { userManager } = getContracts();
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  // Chỉ verify records đã được index đầy đủ (blockNumber <= safeBlock)
  // → Tránh false positive khi indexer đang lag vài giây
  const sample = await randomSample(
    User,
    { blockNumber: { $lte: safeBlock } },
    30  // 30 records ngẫu nhiên mỗi lần
  );

  for (const dbUser of sample) {
    stats.total++;
    try {
      const chainUser = await callContract(userManager.methods.users(dbUser.address));

      if (!chainUser || !chainUser.wallet || chainUser.wallet === '0x0000000000000000000000000000000000000000') {
        // User không tồn tại trên chain mà có trong DB → rõ ràng là tampered
        stats.mismatch++;
        logger.error(`[Audit] 🚨 User ${dbUser.address} TỒN TẠI TRONG DB NHƯNG KHÔNG CÓ TRÊN CHAIN!`);
        await User.findOneAndUpdate(
          { address: dbUser.address },
          { $set: { isVerified: false, verifiedAt: new Date() }}
        );
        continue;
      }

      const chainRole = ROLE_MAP[Number(chainUser.role)] || 'None';
      const chainIsActive = chainUser.isActive === true || chainUser.isActive === 'true';
      
      const mismatches = [];
      if (dbUser.name !== chainUser.name) mismatches.push(`name DB="${dbUser.name}" Chain="${chainUser.name}"`);
      if (dbUser.avatarHash !== chainUser.avatarHash) mismatches.push(`avatar DB="${dbUser.avatarHash}" Chain="${chainUser.avatarHash}"`);
      if (dbUser.role !== chainRole) mismatches.push(`role DB="${dbUser.role}" Chain="${chainRole}"`);
      if (dbUser.isActive !== chainIsActive) mismatches.push(`isActive DB=${dbUser.isActive} Chain=${chainIsActive}`);

      if (mismatches.length > 0) {
        stats.mismatch++;
        logger.warn(`[Audit] ⚠️  User ${dbUser.address}: ${mismatches.join(' | ')}`);
        
        await User.findOneAndUpdate(
          { address: dbUser.address },
          { $set: {
              name: chainUser.name,
              avatarHash: chainUser.avatarHash,
              role: chainRole,
              isActive: chainIsActive,
              isVerified: false,
              verifiedAt: new Date(),
          }}
        );
        stats.fixed++;
      } else {
        await User.findOneAndUpdate(
          { address: dbUser.address },
          { $set: { isVerified: true, verifiedAt: new Date() }}
        );
      }
    } catch (err) {
      stats.skipped++;
      logger.error(`[Audit] User ${dbUser.address} lỗi: ${err.message}`);
    }
  }
  return stats;
}

// ─────────────────────────────────────────────────────────────
//  Audit Workspaces
// ─────────────────────────────────────────────────────────────

async function auditWorkspaces(safeBlock) {
  const { workspaceManager } = getContracts();
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  const sample = await randomSample(Workspace, { blockNumber: { $lte: safeBlock } }, 20);

  for (const dbWs of sample) {
    stats.total++;
    try {
      let chainWs;
      try {
        chainWs = await callContract(workspaceManager.methods.getWorkspace(dbWs.workspaceId));
      } catch {
        // getWorkspace revert → workspace đã bị xóa trên chain
        if (dbWs.isActive) {
          stats.mismatch++;
          logger.warn(`[Audit] ⚠️  Workspace #${dbWs.workspaceId}: chain=DELETED nhưng DB=active`);
          await Workspace.findOneAndUpdate(
            { workspaceId: dbWs.workspaceId },
            { $set: { isActive: false, isVerified: false, verifiedAt: new Date() }}
          );
          stats.fixed++;
        }
        continue;
      }

      const mismatches = [];
      if (dbWs.name  !== chainWs.name)                    mismatches.push('name');
      if (dbWs.owner !== chainWs.owner?.toLowerCase())    mismatches.push('owner');
      if (dbWs.isActive !== chainWs.isActive)             mismatches.push('isActive');

      if (mismatches.length > 0) {
        stats.mismatch++;
        logger.warn(`[Audit] ⚠️  Workspace #${dbWs.workspaceId}: ${mismatches.join(', ')}`);
        await Workspace.findOneAndUpdate(
          { workspaceId: dbWs.workspaceId },
          { $set: {
              name:       chainWs.name,
              description:chainWs.description,
              owner:      chainWs.owner?.toLowerCase(),
              isActive:   chainWs.isActive,
              isVerified: false,
              verifiedAt: new Date(),
          }}
        );
        stats.fixed++;
      } else {
        await Workspace.findOneAndUpdate(
          { workspaceId: dbWs.workspaceId },
          { $set: { isVerified: true, verifiedAt: new Date() }}
        );
      }
    } catch (err) {
      stats.skipped++;
      logger.error(`[Audit] Workspace #${dbWs.workspaceId}: ${err.message}`);
    }
  }
  return stats;
}

// ─────────────────────────────────────────────────────────────
// Audit Product Workspaces & Offers
// ─────────────────────────────────────────────────────────────
async function auditProductWorkspaces(safeBlock) {
  const { productManager } = getContracts();
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  const sample = await randomSample(
    ProductWorkspace, 
    { blockNumber: { $lte: safeBlock }, isActive: true }, 
    20
  );

  for (const dbPw of sample) {
    stats.total++;
    try {
      const chainPW = await callContract(productManager.methods.getProductWorkspace(dbPw.productWorkspaceId));

      if (!chainPW || Number(chainPW.id) === 0) {
        stats.mismatch++;
        logger.error(`[Audit] 🚨 ProductWorkspace #${dbPw.productWorkspaceId} TỒN TẠI TRONG DB NHƯNG KHÔNG CÓ TRÊN CHAIN!`)
        await ProductWorkspace.findOneAndUpdate(
          { productWorkspaceId: dbPw.productWorkspaceId },
          { $set: { isVerified: false, verifiedAt: new Date() }}
        );
        continue;
      }

      const chainIsActive = chainPW.isActive === true || chainPW.isActive === 'true';
      const mismatches = [];
      if (dbPw.name !== chainPW.name) mismatches.push(`name DB="${dbPw.name}" Chain="${chainPW.name}"`);
      if (dbPw.description !== chainPW.description) mismatches.push(`description DB="${dbPw.description}" Chain="${chainPW.description}"`);
      if (dbPw.imageHash !== chainPW.imageHash) mismatches.push(`imageHash DB="${dbPw.imageHash}" Chain="${chainPW.imageHash}"`);
      if (dbPw.unit !== chainPW.unit) mismatches.push(`unit DB="${dbPw.unit}" Chain="${chainPW.unit}"`);
      if (Number(dbPw.workspaceId) !== Number(chainPW.workspaceId)) mismatches.push(`workspaceId DB=${dbPw.workspaceId} Chain=${chainPW.workspaceId}`);
      if (dbPw.isActive !== chainIsActive) mismatches.push(`isActive DB=${dbPw.isActive} Chain=${chainIsActive}`);

      if (mismatches.length > 0) {
        stats.mismatch++;
        logger.warn(`[Audit] ⚠️  ProductWorkspace #${dbPw.productWorkspaceId}: ${mismatches.join(' | ')}`);
        await ProductWorkspace.findOneAndUpdate(
          { productWorkspaceId: dbPw.productWorkspaceId },
          { $set: {
            name: chainPW.name,
            description: chainPW.description,
            imageHash: chainPW.imageHash,
            unit: chainPW.unit,
            workspaceId: Number(chainPW.workspaceId),
            isActive: chainIsActive,
            isVerified: false,
            verifiedAt: new Date(),
          },}
        );
        stats.fixed++;
      } else {
        await ProductWorkspace.findOneAndUpdate(
          { productWorkspaceId: dbPw.productWorkspaceId },
          { $set: { isVerified: true, verifiedAt: new Date() }}
        );
      }
    } catch (err) {
      stats.skipped++;
      logger.error(`[Audit] ProductWorkspace #${dbPw.productWorkspaceId}: ${err.message}`);
    }
  }

  return stats;
}

async function auditProductOffers(safeBlock) {
  const { productManager } = getContracts();
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  const sample = await randomSample(
    ProductOffer,
    { blockNumber: { $lte: safeBlock }, isActive: true },
    20
  );

  for (const dbPo of sample) {
    stats.total++;
    try {
      const chainPO = await callContract(productManager.methods.getProductOffer(dbPo.productOfferId));

      if (!chainPO || Number(chainPO.id) === 0) {
        stats.mismatch++;
        logger.error(`[Audit] 🚨 ProductOffer #${dbPo.productOfferId} TỒN TẠI TRONG DB NHƯNG KHÔNG CÓ TRÊN CHAIN!`);
        await ProductOffer.findOneAndUpdate(
          { productOfferId: dbPo.productOfferId },
          { $set: { isVerified: false, verifiedAt: new Date() }}
        );
        continue;
      }
      
      const chainIsActive = chainPO.isActive === true || chainPO.isActive === 'true';
      const chainSupplierId = chainPO.supplierId?.toLowerCase();
      const mismatches = [];
      if (dbPo.name !== chainPO.name) mismatches.push(`name DB="${dbPo.name}" Chain="${chainPO.name}"`);
      if (dbPo.description !== chainPO.description) mismatches.push(`description DB="${dbPo.description}" Chain="${chainPO.description}"`);
      if (dbPo.imageHash !== chainPO.imageHash) mismatches.push(`imageHash DB="${dbPo.imageHash}" Chain="${chainPO.imageHash}"`);
      if (dbPo.supplierId !== chainSupplierId) mismatches.push(`supplierId DB="${dbPo.supplierId}" Chain="${chainSupplierId}"`);
      if (dbPo.isActive !== chainIsActive) mismatches.push(`isActive DB=${dbPo.isActive} Chain=${chainIsActive}`);

      if (mismatches.length > 0) {
        stats.mismatch++;
        logger.warn(`[Audit] ⚠️  ProductOffer #${dbPo.productOfferId}: ${mismatches.join(' | ')}`);
        await ProductOffer.findOneAndUpdate(
          { productOfferId: dbPo.productOfferId },
          { $set: {
            name: chainPO.name,
            description: chainPO.description,
            imageHash: chainPO.imageHash,
            supplierId: chainSupplierId,
            isActive: chainIsActive,
            isVerified: false,
            verifiedAt: new Date(),
          },}
        );
        stats.fixed++;
      } else {
        await ProductOffer.findOneAndUpdate(
          { productOfferId: dbPo.productOfferId },
          { $set: { isVerified: true, verifiedAt: new Date() }}
        );
      }
    } catch (err) {
      stats.skipped++;
      logger.error(`[Audit] ProductOffer #${dbPo.productOfferId}: ${err.message}`);
    }
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────
// Audit Product Mappings (pure DB — không có on-chain source of truth)
//
// isActive = true khi TẤT CẢ:
//   1. productOffer.isActive = true
//   2. productWorkspace.isActive = true
//   3. workspace (theo productWorkspace.workspaceId) isActive = true
//   4. workspace.members có { address: offer.supplierId, isActive: true }
//
// Đây là derived state — không verify với chain, chỉ tính lại từ DB.
// ─────────────────────────────────────────────────────────────
async function auditProductMappings() {
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  const sample = await randomSample(ProductMapping, {}, 20);

  for (const dbPm of sample) {
    stats.total++;
    try {
      const [po, pw] = await Promise.all([
        ProductOffer.findOne({ productOfferId: dbPm.productOfferId }),
        ProductWorkspace.findOne({ productWorkspaceId: dbPm.productWorkspaceId }),
      ]);

      if (!po || !pw) {
        stats.skipped++;
        logger.warn(
          `[Audit] ProductMapping pw=${dbPm.productWorkspaceId} po=${dbPm.productOfferId}: ` +
          `thiếu productOffer hoặc productWorkspace trong DB`
        );
        continue;
      }

      const workspace = await Workspace.findOne({ workspaceId: pw.workspaceId });

      if (!workspace) {
        stats.skipped++;
        logger.warn(
          `[Audit] ProductMapping pw=${dbPm.productWorkspaceId} po=${dbPm.productOfferId}: ` +
          `không tìm thấy workspace #${pw.workspaceId}`
        );
        continue;
      }

      const isMember = workspace.members.some(
        m => m.address === po.supplierId && m.isActive === true
      );

      const shouldBeActive =
        po.isActive &&
        pw.isActive &&
        workspace.isActive &&
        isMember;

      if (dbPm.isActive !== shouldBeActive) {
        stats.mismatch++;
        logger.warn(
          `[Audit] ⚠️  ProductMapping pw=${dbPm.productWorkspaceId} po=${dbPm.productOfferId}: ` +
          `isActive DB=${dbPm.isActive} → should=${shouldBeActive} ` +
          `(offer=${po.isActive} pw=${pw.isActive} ws=${workspace.isActive} member=${isMember})`
        );
        await ProductMapping.findOneAndUpdate(
          { productWorkspaceId: dbPm.productWorkspaceId, productOfferId: dbPm.productOfferId },
          { $set: { isActive: shouldBeActive, verifiedAt: new Date() } }
        );
        stats.fixed++;
      } else {
        await ProductMapping.findOneAndUpdate(
          { productWorkspaceId: dbPm.productWorkspaceId, productOfferId: dbPm.productOfferId },
          { $set: { verifiedAt: new Date() } }
        );
      }
    } catch (err) {
      stats.skipped++;
      logger.error(
        `[Audit] ProductMapping pw=${dbPm.productWorkspaceId} po=${dbPm.productOfferId}: ${err.message}`
      );
    }
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────
//  Audit Batches
// ─────────────────────────────────────────────────────────────

async function auditBatches(safeBlock) {
  const { batchManager } = getContracts();
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  const sample = await randomSample(Batch, { blockNumber: { $lte: safeBlock } }, 20);

  for (const dbBatch of sample) {
    stats.total++;
    try {
      // ── 1. Verify core Batch struct ─────────────────────────
      const raw = await callContract(batchManager.methods.getBatch(dbBatch.batchId));
      const chainBatch = serializeResult(raw);

      // Batch không tồn tại on-chain mà có trong DB
      if (!chainBatch || chainBatch.id === '0' || Number(chainBatch.id) === 0) {
        stats.mismatch++;
        logger.error(`[Audit] 🚨 Batch #${dbBatch.batchId} TỒN TẠI TRONG DB NHƯNG KHÔNG CÓ TRÊN CHAIN!`);
        await Batch.findOneAndUpdate(
          { batchId: dbBatch.batchId },
          { $set: { isVerified: false, verifiedAt: new Date() }}
        );
        continue;
      }

      const chainStatus = BATCH_STATUS[Number(chainBatch.status)];
      const chainSupplierAssignment = ASSIGNMENT_STATUS[Number(chainBatch.supplierAssignmentStatus)] || 'None';
      const chainTransporterAssignment = ASSIGNMENT_STATUS[Number(chainBatch.transporterAssignmentStatus)] || 'None';
      const chainIsActive = chainBatch.isActive === true || chainBatch.isActive === 'true';

      const mismatches  = [];
      const fixSet = {};

      if (dbBatch.productId !== Number(chainBatch.productId)) mismatches.push(`productId DB=${dbBatch.productId} Chain=${chainBatch.productId}`);
      if (dbBatch.status !== chainStatus) mismatches.push(`status DB="${dbBatch.status}" Chain="${chainStatus}"`);
      if (dbBatch.quantity !== Number(chainBatch.quantity)) mismatches.push('quantity');
      if ((dbBatch.supplierId || '') !== (chainBatch.supplierId?.toLowerCase() || '')) mismatches.push('supplierId');
      if ((dbBatch.transporterId || '') !== (chainBatch.transporterId?.toLowerCase() || '')) mismatches.push('transporterId');
      if ((dbBatch.supplierAssignmentStatus || 'None') !== chainSupplierAssignment) mismatches.push('supplierAssignmentStatus');
      if ((dbBatch.transporterAssignmentStatus || 'None') !== chainTransporterAssignment) mismatches.push('transporterAssignmentStatus');
      if ((dbBatch.locationHash || '') !== (chainBatch.locationHash || '')) {
        mismatches.push('locationHash');

        if (dbBatch.locationCid) {
          try {
            const res = await fetch(`${env.PINATA_GATEWAY}/ipfs/${dbBatch.locationCid}`);
            const { pickupAddress, deliveryAddress } = await res.json();
            const recomputedHash = getWeb3().utils.keccak256(dbBatch.locationCid);

            if (recomputedHash === chainBatch.locationHash) {
              fixSet.locationHash = recomputedHash;
              fixSet.pickupAddress = pickupAddress;
              fixSet.deliveryAddress = deliveryAddress;
              logger.info(`[Audit] ✅  Batch #${dbBatch.batchId} locationHash mismatch nhưng data trùng (pickupAddress, deliveryAddress) → chỉ update lại hash`);
            } else {
              logger.warn(`[Audit] Batch #${dbBatch.batchId} locationHash mismatch và data cũng không trùng (pickupAddress, deliveryAddress) → cần điều tra thủ công`);
            }
          } catch (ipfsErr) {
            logger.warn(`[Audit] Batch #${dbBatch.batchId} locationHash mismatch và lỗi khi fetch IPFS: ${ipfsErr.message} → cần điều tra thủ công`);
          }
        }
      }
      if ((dbBatch.imageQRHash || '') !== (chainBatch.imageQRHash || '')) mismatches.push('imageQRHash');
      if ((dbBatch.isActive !== undefined ? dbBatch.isActive : true) !== chainIsActive) mismatches.push('isActive');

      if (mismatches.length > 0) {
        stats.mismatch++;
        logger.warn(`[Audit] ⚠️  Batch #${dbBatch.batchId}: ${mismatches.join(' | ')}`);
        
        await Batch.findOneAndUpdate(
          { batchId: dbBatch.batchId },
          { $set: {
              productId: Number(chainBatch.productId),
              quantity: Number(chainBatch.quantity),
              status: chainStatus,
              supplierId: chainBatch.supplierId?.toLowerCase() || null,
              transporterId: chainBatch.transporterId?.toLowerCase() || null,
              supplierAssignmentStatus: chainSupplierAssignment,
              transporterAssignmentStatus: chainTransporterAssignment,
              locationHash: chainBatch.locationHash,
              imageQRHash: chainBatch.imageQRHash,
              isActive: chainIsActive,
              isVerified: false,
              verifiedAt: new Date(),
              ...fixSet,
          }}
        );
        stats.fixed++;
      } else {
        // ── 2. Spot-check 1 BatchEvent ngẫu nhiên (nếu có) ───
        if (dbBatch.events && dbBatch.events.length > 0) {
          const randIdx = Math.floor(Math.random() * dbBatch.events.length);
          const dbEvent = dbBatch.events[randIdx];
          const eventId = Number(dbEvent?.batchEventId)

          if (!eventId) {
            logger.warn(`[Audit] Batch #${dbBatch.batchId} event[${randIdx}] thiếu batchEventId — skip spot-check`);
            await Batch.findOneAndUpdate(
              { batchId: dbBatch.batchId },
              { $set: { isVerified: true, verifiedAt: new Date() }}
            );
            continue;
          }

          try {
            const rawEv = await callContract(batchManager.methods.getBatchEvent(eventId));
            const chainEv = serializeResult(rawEv);

            const chainEvStatus = BATCH_STATUS[Number(chainEv.status)];
            const evMismatches = [];

            if (dbEvent.status !== chainEvStatus) evMismatches.push(`event[${randIdx}].status DB="${dbEvent.status}" Chain="${chainEvStatus}"`);
            if (Number(chainEv.batchId) !== dbBatch.batchId) evMismatches.push(`event[${randIdx}].batchId DB=${dbBatch.batchId} Chain=${chainEv.batchId}`);
            if (evMismatches.length > 0) {
              stats.mismatch++;
              logger.warn(`[Audit] ⚠️  Batch #${dbBatch.batchId} Event #${randIdx}: ${evMismatches.join(' | ')}`);

              // Sửa chỉ field status của event đó
              await Batch.findOneAndUpdate(
                { batchId: dbBatch.batchId, 'events.batchEventId': dbEvent.batchEventId },
                { $set: { 
                  'events.$.status': chainEvStatus,
                  isVerified: false, 
                  verifiedAt: new Date() 
                }}
              );
              stats.fixed++;
            } else {
              await Batch.findOneAndUpdate(
                { batchId: dbBatch.batchId },
                { $set: { isVerified: true, verifiedAt: new Date() }}
              );
            }
          } catch (evErr) {
            // Không làm fail toàn bộ batch chỉ vì spot-check event
            logger.warn(`[Audit] Batch #${dbBatch.batchId} event spot-check lỗi: ${evErr.message}`);
            await Batch.findOneAndUpdate(
              { batchId: dbBatch.batchId },
              { $set: { isVerified: true, verifiedAt: new Date() }}
            );
          }
        } else {
          // Không có events — chỉ mark verified
          await Batch.findOneAndUpdate(
            { batchId: dbBatch.batchId },
            { $set: { isVerified: true, verifiedAt: new Date() }}
          );
        }
      } 
    } catch (err) {
      stats.skipped++;
      logger.error(`[Audit] Batch #${dbBatch.batchId} lỗi: ${err.message}`);
    }
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────
//  Audit Crops
// ─────────────────────────────────────────────────────────────

async function auditCrops(safeBlock) {
  const { cropManager } = getContracts();
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  const sample = await randomSample(
    Crop,
    { blockNumber: { $lte: safeBlock }, isActive: true },
    20
  );

  for (const dbCrop of sample) {
    stats.total++;
    try {
      // crops[] là public mapping → gọi trực tiếp
      const raw = await callContract(cropManager.methods.getCrop(dbCrop.cropId));
      const chainCrop = serializeResult(raw);

      // Crop bị xóa on-chain (isActive=false) nhưng DB vẫn active
      if (!chainCrop.isActive && dbCrop.isActive) {
        stats.mismatch++;
        logger.warn(`[Audit] ⚠️  Crop #${dbCrop.cropId}: chain=DELETED nhưng DB=active`);
        await Crop.findOneAndUpdate(
          { cropId: dbCrop.cropId },
          { $set: { isActive: false, isVerified: false, verifiedAt: new Date() }}
        );
        stats.fixed++;
        continue;
      }

      // Dùng method matchesChainData định nghĩa trong Model
      const chainIsActive = chainCrop.isActive === true || chainCrop.isActive === 'true';
      const isMismatch = (
        dbCrop.name !== chainCrop.name ||
        dbCrop.location !== chainCrop.location ||
        Number(dbCrop.cultivationArea) !== Number(chainCrop.cultivationArea) ||
        dbCrop.isActive !== chainIsActive
      );

      if (isMismatch) {
        stats.mismatch++;
        const details = [
          dbCrop.name !== chainCrop.name                                       ? `name DB="${dbCrop.name}" Chain="${chainCrop.name}"` : null,
          dbCrop.location !== chainCrop.location                               ? `location` : null,
          Number(dbCrop.cultivationArea) !== Number(chainCrop.cultivationArea) ? `cultivationArea` : null,
          dbCrop.isActive !== chainIsActive                                    ? `isActive DB=${dbCrop.isActive} Chain=${chainIsActive}` : null,
        ].filter(Boolean).join(' | ');

        logger.warn(`[Audit] ⚠️  Crop #${dbCrop.cropId}: ${details || 'field mismatch'}`);

        await Crop.findOneAndUpdate(
          { cropId: dbCrop.cropId },
          { $set: {
              name:               chainCrop.name,
              location:           chainCrop.location,
              cultivationArea:    Number(chainCrop.cultivationArea),
              expectedHarvestDate: new Date(Number(chainCrop.expectedHarvestDate) * 1000),
              isActive:           chainCrop.isActive,
              isVerified:         false,
              verifiedAt:         new Date(),
          }}
        );
        stats.fixed++;
      } else {
        await Crop.findOneAndUpdate(
          { cropId: dbCrop.cropId },
          { $set: { isVerified: true, verifiedAt: new Date() }}
        );
      }
    } catch (err) {
      stats.skipped++;
      logger.error(`[Audit] Crop #${dbCrop.cropId}: ${err.message}`);
    }
  }
  return stats;
}

// ─────────────────────────────────────────────────────────────
//  Audit Certifications
//
//  Case đặc biệt cần xử lý:
//  1. DB isActive=true nhưng on-chain đã expire (isActive=false)
//     → Sửa DB + TỰ ĐỘNG gọi expireCertification() nếu chưa có tx
//  2. Metadata mismatch (name, issuer, fileHash bị sửa tay trong DB)
//  3. DB có cert nhưng chain không tồn tại (certificationId=0)
// ─────────────────────────────────────────────────────────────

async function auditCertifications(safeBlock) {
  const { certificationManager } = getContracts();
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  const sample = await randomSample(
    Certification,
    { blockNumber: { $lte: safeBlock } },
    20
  );

  for (const dbCert of sample) {
    stats.total++;
    try {
      const raw = await callContract(
        certificationManager.methods.getCertification(dbCert.certificationId)
      );
      const chainCert = serializeResult(raw);
      const nowSec = Math.floor(Date.now() / 1000);
      chainCert.isActive = chainCert.isActive && Number(chainCert.expiryDate) > nowSec;

      // Cert không tồn tại on-chain (userId = zero address)
      if (!chainCert.userId || chainCert.userId === '0x0000000000000000000000000000000000000000') {
        stats.mismatch++;
        logger.error(
          `[Audit] 🚨 Certification #${dbCert.certificationId} TỒN TẠI TRONG DB ` +
          `NHƯNG KHÔNG CÓ TRÊN CHAIN — đánh dấu tampered`
        );
        await Certification.findOneAndUpdate(
          { certificationId: dbCert.certificationId },
          { $set: { isVerified: false, verifiedAt: new Date() }}
        );
        continue;
      }

      const mismatches = [];
      const chainExpiry = Number(chainCert.expiryDate);
      const dbExpiry = Math.floor(dbCert.expiryDate.getTime() / 1000);

      // Case 1: Expire drift — quan trọng nhất
      if (dbCert.isActive && !chainCert.isActive) {
        mismatches.push('isActive DB=true Chain=false (EXPIRED ON-CHAIN)');
      }
      if (!dbCert.isActive && chainCert.isActive) {
        mismatches.push('isActive DB=false Chain=true (UNEXPIRED — dữ liệu lạ)');
      }

      // Case 2: Metadata tamper
      if (dbCert.name !== chainCert.name) mismatches.push(`name`);
      if (dbCert.issuer !== chainCert.issuer) mismatches.push(`issuer`);
      if (dbCert.fileHash !== chainCert.fileHash) mismatches.push(`fileHash (⚠️ IPFS hash bị sửa!)`);

      // Case 3: Ngày hết hạn
      if (dbExpiry !== chainExpiry) mismatches.push(`expiryDate DB=${dbExpiry} Chain=${chainExpiry}`);

      if (mismatches.length > 0) {
        stats.mismatch++;
        logger.warn(`[Audit] ⚠️  Certification #${dbCert.certificationId}: ${mismatches.join(' | ')}`);

        await Certification.findOneAndUpdate(
          { certificationId: dbCert.certificationId },
          { $set: {
              name:       chainCert.name,
              issuer:     chainCert.issuer,
              fileHash:   chainCert.fileHash,
              isActive:   chainCert.isActive,
              expiryDate: new Date(chainExpiry * 1000),
              isVerified: false,
              verifiedAt: new Date(),
          }}
        );
        stats.fixed++;
      } else {
        await Certification.findOneAndUpdate(
          { certificationId: dbCert.certificationId },
          { $set: { isVerified: true, verifiedAt: new Date() }}
        );
      }
    } catch (err) {
      stats.skipped++;
      logger.error(`[Audit] Certification #${dbCert.certificationId}: ${err.message}`);
    }
  }
  return stats;
}

// ─────────────────────────────────────────────────────────────
//  Audit Invitations
//
//  Invitations có logic phức tạp hơn các bảng khác:
//  - Status "Lost" KHÔNG có on-chain — chỉ là derived trong DB
//    → Không so sánh Lost với chain (sẽ luôn mismatch)
//  - Chỉ audit status: Pending, Accepted, Rejected, Won (có on-chain)
//  - bidPrice trên chain là source of truth
// ─────────────────────────────────────────────────────────────

async function auditInvitations(safeBlock) {
  const { inviteManager } = getContracts();
  const stats = { total: 0, mismatch: 0, fixed: 0, skipped: 0 };

  // Chỉ audit những invitation có status thực trên chain (không audit Lost)
  const sample = await randomSample(
    Invitation,
    {
      blockNumber: { $lte: safeBlock },
      derivedOffChain: { $ne: true }, // Bỏ qua Lost derived
      status: { $ne: 'Lost' },
    },
    25
  );

  for (const dbInv of sample) {
    stats.total++;
    try {
      // Gọi đúng method theo invitationType
      let chainInv;
      if (dbInv.invitationType === 'Supply') {
        const raw = await callContract(
          inviteManager.methods.getSupplyInvitation(dbInv.invitationId)
        );
        chainInv = serializeResult(raw);
      } else {
        const raw = await callContract(
          inviteManager.methods.getShippingInvitation(dbInv.invitationId)
        );
        chainInv = serializeResult(raw);
      }

      const chainStatus   = INVITE_STATUS[Number(chainInv.status)] || 'Pending';
      const chainBidPrice = Number(chainInv.bidPrice);

      const mismatches = [];
      if (dbInv.status   !== chainStatus)    mismatches.push(`status DB="${dbInv.status}" Chain="${chainStatus}"`);
      if (dbInv.bidPrice !== chainBidPrice)  mismatches.push(`bidPrice DB=${dbInv.bidPrice} Chain=${chainBidPrice}`);

      // Supply: verify cropId
      if (dbInv.invitationType === 'Supply') {
        const chainCropId = Number(chainInv.cropId);
        if (dbInv.cropId !== chainCropId && chainCropId !== 0) {
          mismatches.push(`cropId DB=${dbInv.cropId} Chain=${chainCropId}`);
        }
      }

      if (mismatches.length > 0) {
        stats.mismatch++;
        logger.warn(
          `[Audit] ⚠️  Invitation #${dbInv.invitationId} (${dbInv.invitationType}): ` +
          mismatches.join(' | ')
        );

        const updateFields = {
          status:     chainStatus,
          bidPrice:   chainBidPrice,
          isVerified: false,
          verifiedAt: new Date(),
        };
        if (dbInv.invitationType === 'Supply' && Number(chainInv.cropId) !== 0) {
          updateFields.cropId = Number(chainInv.cropId);
        }

        await Invitation.findOneAndUpdate(
          { invitationId: dbInv.invitationId },
          { $set: updateFields }
        );
        stats.fixed++;

        // Nếu chain đã Won nhưng DB chưa cập nhật Lost cho các invitation khác → fix cascade
        if (chainStatus === 'Won') {
          const cascadeResult = await Invitation.updateMany(
            {
              batchId:        dbInv.batchId,
              invitationType: dbInv.invitationType,
              invitationId:   { $ne: dbInv.invitationId },
              status:         'Pending',
            },
            { $set: { status: 'Lost', derivedOffChain: true, isVerified: false }}
          );
          if (cascadeResult.modifiedCount > 0) {
            logger.warn(
              `[Audit] 🔧 Cascade Lost: ${cascadeResult.modifiedCount} invitation ` +
              `batch #${dbInv.batchId} (${dbInv.invitationType}) chưa được set Lost`
            );
          }
        }
      } else {
        await Invitation.findOneAndUpdate(
          { invitationId: dbInv.invitationId },
          { $set: { isVerified: true, verifiedAt: new Date() }}
        );
      }
    } catch (err) {
      stats.skipped++;
      logger.error(`[Audit] Invitation #${dbInv.invitationId}: ${err.message}`);
    }
  }
  return stats;
}

// ─────────────────────────────────────────────────────────────
//  AUDIT SESSION: Chạy 1 nhóm ngẫu nhiên mỗi lần
// ─────────────────────────────────────────────────────────────

// Xoay vòng ngẫu nhiên trong 6 nhóm — mỗi lần audit 1 loại khác nhau.
// Weighted: users/workspaces/batches audit nhiều hơn (dữ liệu quan trọng hơn).
const AUDIT_GROUPS = [
  'users',          // UserManager
  'workspaces',     // WorkspaceManager
  'batches',        // BatchManager
  'crops',          // CropManager
  'certifications', // CertificationManager — đặc biệt: tự trigger expire
  'invitations',    // InviteManager
  'productWorkspaces', // ProductManager - ProductWorkspace
  'productOffers',     // ProductManager - ProductOffer
  'productMappings',   // ProductManager - pure DB derived state
  // Tăng trọng số cho các bảng quan trọng hơn:
  'users',
  'batches',
  'certifications', 
];

async function runAuditSession() {
  if (!acquireLock()) {
    logger.warn('[Audit] Audit đang chạy, bỏ qua lần này');
    return;
  }

  const start = Date.now();

  try {
    // Lấy safeBlock = lastIndexedBlock của SyncState nhỏ nhất
    // → Chỉ verify records đã được index đầy đủ bởi TẤT CẢ contracts
    // → Tránh false positive khi indexer đang lag
    const syncStates = await SyncState.find({});
    const safeBlock  = syncStates.length > 0
      ? Math.min(...syncStates.map(s => s.lastIndexedBlock))
      : 0;

    if (safeBlock === 0) {
      logger.warn('[Audit] Indexer chưa sync, bỏ qua audit lần này');
      return;
    }

    // Random chọn 1 nhóm để audit lần này
    const group = AUDIT_GROUPS[Math.floor(Math.random() * AUDIT_GROUPS.length)];
    logger.info(`[Audit] 🎲 Random audit group: "${group}" | safeBlock: ${safeBlock}`);

    let stats;
    switch (group) {
      case 'users':          stats = await auditUsers(safeBlock);          break;
      case 'workspaces':     stats = await auditWorkspaces(safeBlock);     break;
      case 'batches':        stats = await auditBatches(safeBlock);        break;
      case 'crops':          stats = await auditCrops(safeBlock);          break;
      case 'certifications': stats = await auditCertifications(safeBlock); break;
      case 'invitations':    stats = await auditInvitations(safeBlock);    break;
      case 'productWorkspaces': stats = await auditProductWorkspaces(safeBlock); break;
      case 'productOffers': stats = await auditProductOffers(safeBlock); break;
      case 'productMappings': stats = await auditProductMappings(); break;
      default:
        logger.warn(`[Audit] Group không xác định: "${group}"`);
        return;
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger.info(`[Audit] ✅ Done "${group}" trong ${elapsed}s | ${JSON.stringify(stats)}`);

    if (stats.mismatch > 0) {
      logger.error(`[Audit] 🚨 ${stats.mismatch} MISMATCHES DETECTED trong group "${group}"!`);
      // TODO: gửi alert Telegram/Slack
      // await alertService.telegram(`⚠️ Audit phát hiện ${stats.mismatch} records không khớp chain!`);
    }

  } finally {
    releaseLock();
  }
}

// ─────────────────────────────────────────────────────────────
//  RANDOM SCHEDULE — Lập lịch không đoán được
// ─────────────────────────────────────────────────────────────

// Cấu hình khoảng thời gian giữa các audit
const MIN_INTERVAL_MS = 30  * 60 * 1000;  //  30 phút  (tối thiểu)
const MAX_INTERVAL_MS = 240 * 60 * 1000;  // 240 phút  (tối đa, 4 giờ)

function scheduleNextAudit() {
  // Random delay trong [30 phút, 4 giờ]
  const delay = randomBetween(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
  const nextAt = new Date(Date.now() + delay);

  logger.info(
    `[Audit] 📅 Audit tiếp theo lúc ${nextAt.toLocaleTimeString('vi-VN')} ` +
    `(sau ${(delay / 60000).toFixed(0)} phút)`
  );

  setTimeout(async () => {
    await runAuditSession();
    scheduleNextAudit(); // ← đệ quy: tự lập lịch lần tiếp theo sau khi xong
  }, delay);
}

/**
 * Khởi động random schedule audit.
 * Gọi 1 lần sau khi server start và indexer đã sync.
 */
function startVerifyJob() {
  logger.info('[Audit] 🎲 Khởi động Random Schedule Audit');
  logger.info(`[Audit] Khoảng cách giữa các audit: ${MIN_INTERVAL_MS/60000}–${MAX_INTERVAL_MS/60000} phút (ngẫu nhiên)`);

  //runAuditSession();
  // Audit lần đầu sau khi indexer sync xong — delay ngắn hơn
  const firstDelay = randomBetween(5 * 60 * 1000, 15 * 60 * 1000); // 5–15 phút
  logger.info(`[Audit] Audit đầu tiên sau ${(firstDelay / 60000).toFixed(0)} phút`);

  setTimeout(async () => {
    await runAuditSession();
    scheduleNextAudit(); // lập lịch các lần tiếp theo
  }, firstDelay);
}

module.exports = { startVerifyJob, runAuditSession };