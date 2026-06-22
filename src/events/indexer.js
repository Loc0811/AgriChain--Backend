const { getContracts, getWsContracts } = require('../config/contracts');
const { getWeb3 } = require('../config/web3');
const { callContract, serializeResult } = require('../utils/blockchain');
const env = require('../config/env');
const logger = require('../utils/logger');

const User = require('../models/User');
const Workspace = require('../models/Workspace');
const { Batch } = require('../models/Batch');
const Invitation = require('../models/Invitation');
const { Crop } = require('../models/Crop');
const Certification = require('../models/Certification');
const { ProductWorkspace, ProductOffer } = require('../models/Product');
const { ProductMapping, SupplyProposal } = require('../models/ProductMapping');
const SyncState = require('../models/SyncState');
const PendingUpload = require('../models/PendingUpload');

// Số blocks mỗi chunk khi scan lịch sử
const BLOCK_CHUNK = 10;

// Enum maps — khớp với Solidity
const ROLE_MAP = ['None','Admin','Distributor','Supplier','Transporter'];
const BATCH_STATUS = ['Pending','Producing','ReadyToShip','Shipping','Delivered','Stored','Cancelled'];
const REQUEST_STATUS = ['Pending','Approved','Rejected'];
const INVITE_STATUS = ['Pending','Accepted','Rejected','Won','Lost'];
const ASSIGNMENT_STATUS = ['None','Assigned','Bidding'];
const PROPOSAL_STATUS = ['Pending','Accepted','Rejected'];
const CROP_EVENT_STATUS = ['GeneralLog', 'Irrigation', 'Fertilization', 'PestControl', 'Harvest'];

// ─────────────────────────────────────────────────────────────
//  HANDLERS — xử lý từng loại event
//  Mỗi handler phải IDEMPOTENT: chạy lại nhiều lần không duplicate
// ─────────────────────────────────────────────────────────────

const userHandlers = {
  // event UserRegistered(address indexed wallet, string name, Role role)
  UserRegistered: async (ev) => {
    const { wallet, name, role } = ev.returnValues;

    // Lấy timestamp từ block để có registeredAt chính xác
    const web3 = getWeb3();
    let registeredAt = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) registeredAt = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    let chainData = {};
    try {
      const { userManager } = getContracts();
      const chain = await callContract(userManager.methods.getUser(wallet));
      chainData = serializeResult(chain);
    } catch (err) {
      logger.warn(`[Index]  chain fetch failed — ${err.message}`);
    }

    await User.findOneAndUpdate(
      { address: wallet.toLowerCase() },
      { $set: {
          address: wallet.toLowerCase(),
          name: chainData.name || name,
          avatarHash: chainData.avatarHash || '',
          role: ROLE_MAP[Number(role)] || 'None',
          email: chainData.email || '',
          phone: chainData.phone || '',
          isActive: true,
          registeredAt,
          txHash:       ev.transactionHash,
          blockNumber:  ev.blockNumber,
          isVerified:   true,
          verifiedAt:   new Date(),
      }},
      { upsert: true }
    );
    logger.info(`[Index] UserRegistered ${wallet} name="${name}" role=${ROLE_MAP[Number(role)]}`);
  },

  // event UserUpdated(address indexed wallet, string name, string avatarHash)
  UserUpdated: async (ev) => {
    const { wallet, name, avatarHash } = ev.returnValues;

    let chainData = {};
    try {
      const { userManager } = getContracts();
      const raw = await callContract(userManager.methods.getUser(wallet));
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index]  chain fetch failed — ${err.message}`);
    }

    let avatarFields = {};
    if (avatarHash && avatarHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash: avatarHash });
      if (pending) {
        avatarFields = {
          avatarUrl: pending.imageUrl,
          avatarCid: pending.imageCid
        };
      }
    }

    await User.findOneAndUpdate(
      { address: wallet.toLowerCase() },
      { $set: { 
        name: chainData.name || name,
        avatarHash,
        ...avatarFields,
        email: chainData.email || '',
        phone: chainData.phone || '',
        txHash: ev.transactionHash, 
        blockNumber: ev.blockNumber, 
        isVerified: true,
        verifiedAt: new Date(),
      },}
    );
    logger.debug(`[Index] UserUpdated ${wallet} name="${name}" avatar="${avatarHash}"`);
  },

  // event UserActiveUpdated(address indexed wallet, bool isActive)
  UserActiveUpdated: async (ev) => {
    const { wallet, isActive } = ev.returnValues;
    await User.findOneAndUpdate(
      { address: wallet.toLowerCase() },
      { $set: {
        isActive: Boolean(isActive),
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(),
      },}
    );
    logger.debug(`[Index] UserActiveUpdated ${wallet} isActive=${Boolean(isActive)}`);
  },

  // event GrantAdmin(address indexed wallet)
  GrantAdmin: async (ev) => {
    const { wallet } = ev.returnValues;

    await User.findOneAndUpdate(
      { address: wallet.toLowerCase() },
      { $set: {
        role: 'Admin',
        txHash: ev.transactionHash,
        blockNumber: Number(ev.blockNumber),
        isVerified: true,
        verifiedAt: new Date(),
      },
      $setOnInsert: {
        address: wallet.toLowerCase(),
        name: 'Admin',
        email: '',
        phone: '',
        isActive: true,
        createdAt: new Date(),
      }},
      { upsert: true }
    );
    logger.debug(`[Index] GrantAdmin ${wallet} → role = Admin`);
  },
};

const workspaceHandlers = {
  WorkspaceCreated: async (ev) => {
    const { workspaceId, name, owner, imageHash } = ev.returnValues;

    const web3 = getWeb3();
    let createdAt = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) createdAt = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    let chainData = {};
    try {
      const { workspaceManager } = getContracts();
      const raw = await callContract(workspaceManager.methods.getWorkspace(Number(workspaceId)));
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index]  chain fetch failed — ${err.message}`);
    }

    let imageUrl = '';
    let imageCid = '';
    if (imageHash && imageHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash });
      if (pending) {
        imageUrl = pending.imageUrl;
        imageCid = pending.imageCid;
      }
    }
    await Workspace.findOneAndUpdate(
      { workspaceId: Number(workspaceId) },
      { $set: {
          workspaceId: Number(workspaceId),
          name: chainData.name || name,
          owner: owner.toLowerCase(),
          description: chainData.description || '',
          imageHash,
          imageUrl,
          imageCid,
          isActive: true,
          createdAt: new Date(),
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      },},
      { upsert: true },
    );
    logger.debug(`[Index] WorkspaceCreated #${workspaceId}`);
  },

  // event WorkspaceUpdated(uint256 indexed workspaceId, string name, string description, string imageHash)
  WorkspaceUpdated: async (ev) => {
    const { workspaceId, name, description, imageHash } = ev.returnValues;

    let imageFields = {};
    if (imageHash && imageHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash });
      if (pending) {
        imageFields = {
          imageUrl: pending.imageUrl,
          imageCid: pending.imageCid
        };
      }
    }
    
    await Workspace.findOneAndUpdate(
      { workspaceId: Number(workspaceId) },
      { $set: { 
        name, 
        description, 
        imageHash,
        ...imageFields,
        txHash: ev.transactionHash, 
        blockNumber: ev.blockNumber, 
        isVerified: true 
      },}
    );
    logger.debug(`[Index] WorkspaceUpdated #${workspaceId}`)
  },

  // Cascade: workspace xóa → tất cả members inactive
  // Thay thế hoàn toàn cho loop on-chain
  WorkspaceRemoved: async (ev) => {
    const { workspaceId } = ev.returnValues;
    const wsId = Number(workspaceId);

    await Workspace.findOneAndUpdate(
      { workspaceId: wsId },
      { $set: {
          isActive:    false,
          'members.$[m].isActive': false, // set tất cả member trong workspace này thành inactive
          txHash:      ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified:  true,
          verifiedAt:  new Date(),
      }},
      { arrayFilters: [{ 'm.isActive': true }] }
    );

    logger.debug(`[Index] WorkspaceRemoved #${wsId}`);
  },

  AddMember: async (ev) => {
    const { workspaceId, userId, representativeName, role } = ev.returnValues;
    const wsId = Number(workspaceId);
    const addrLow = userId.toLowerCase();
    const roleStr = ROLE_MAP[Number(role)] || 'None';

    let ws = null;
    for (let i = 0; i < 5; i++) { 
      ws = await Workspace.findOne({ workspaceId: wsId, isActive: true });
      if (ws) break;
      await new Promise(res => setTimeout(res, 1000 * (i + 1))); 
    }

    if (!ws) {
      logger.warn(`[Index] AddMember skipped — workspace #${wsId} not found or inactive`);
      return;
    }

    const idx = ws.members.findIndex(m => m.address === addrLow);
    if (idx >= 0) {
      ws.members[idx].isActive = true;
      ws.members[idx].representativeName = representativeName;
      ws.members[idx].joinTxHash = ev.transactionHash;
    } else {
      ws.members.push({ address: addrLow, representativeName, role: roleStr, joinedAt: new Date(), isActive: true, joinTxHash: ev.transactionHash });
    }
    await ws.save();
    logger.debug(`[Index] AddMember ws=${wsId} user=${userId}`);
  },

  RemoveMember: async (ev) => {
    const { workspaceId, userId } = ev.returnValues;
    const wsId = Number(workspaceId);
    const addrLow = userId.toLowerCase();

    await Workspace.findOneAndUpdate(
      { workspaceId: wsId, 'members.address': addrLow },
      { $set: { 'members.$.isActive': false }}
    );

    logger.debug(`[Index] RemoveMember ws=${wsId} user=${userId}`);
  },

  // event JoinRequestCreated(uint256 indexed requestId, address indexed userId, uint256 indexed workspaceId)
  JoinRequestCreated: async (ev) => {
    const { requestId, userId, workspaceId } = ev.returnValues;
    const wsId = Number(workspaceId);
    
    const workspace = await Workspace.findOne({ workspaceId: wsId });
    if (!workspace || !workspace.isActive) {
      logger.warn(`[Index] JoinRequestCreated skipped — workspace #${wsId} is inactive`);
      return;
    }

    let chainData = {};
    try {
      const { workspaceManager } = getContracts();
      const raw = await callContract(workspaceManager.methods.getJoinRequest(Number(requestId)));
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index]  chain fetch failed — ${err.message}`);
    }
    
    await Workspace.findOneAndUpdate(
      { workspaceId: wsId },
      { $push: { joinRequests: {
          requestId: Number(requestId),
          userId: userId.toLowerCase(),
          representativeName: chainData.representativeName || '',
          message: chainData.message || '',
          status: 'Pending',
          requestedAt: chainData.requestedAt ? new Date(Number(chainData.requestedAt) * 1000) : new Date(),
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
      }}}
    );
    logger.debug(`[Index] JoinRequestCreated #${requestId} for workspace #${wsId}`);
  },

  JoinRequestProcessed: async (ev) => {
    const { requestId, workspaceId, status } = ev.returnValues;
    await Workspace.findOneAndUpdate(
      { workspaceId: Number(workspaceId), 'joinRequests.requestId': Number(requestId) },
      { $set: {
          'joinRequests.$.status':      REQUEST_STATUS[Number(status)] || 'Pending',
          'joinRequests.$.txHash':      ev.transactionHash,
          'joinRequests.$.blockNumber': ev.blockNumber,
      }}
    );
    logger.debug(`[Index] JoinRequestProcessed #${requestId}`);
  },
};

const batchHandlers = {
  // event BatchCreated(uint256 indexed batchId, uint256 productId, uint256 workspaceId, uint256 quantity)
  BatchCreated: async (ev) => {
    const { batchId, productId, workspaceId, quantity } = ev.returnValues;

    const web3 = getWeb3();
    let createdAt = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) createdAt = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    let chainData = {};
    try {
      const { batchManager } = getContracts();
      const raw = await callContract(batchManager.methods.getBatch(Number(batchId)));
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] BatchCreated #${batchId}: không fetch được chain detail — ${err.message}`);
    }

    let imageQRUrl = '';
    let imageQRCid = '';
    const imageQRHash = chainData.imageQRHash || '0x' + '0'.repeat(64);
    if (imageQRHash && imageQRHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash: imageQRHash });
      if (pending) {
        imageQRUrl = pending.imageUrl;
        imageQRCid = pending.imageCid;
      }
    }

    await Batch.findOneAndUpdate(
      { batchId: Number(batchId) },
      { $set: {
          batchId: Number(batchId),
          productId: Number(productId),
          workspaceId: Number(workspaceId),
          quantity: Number(quantity),
          status: 'Pending',
          isActive: true,
          supplierAssignmentStatus: ASSIGNMENT_STATUS[Number(chainData.supplierAssignmentStatus ?? 0)] || 'None',
          transporterAssignmentStatus: 'None',
          imageQRHash,
          imageQRUrl,
          imageQRCid,
          createdAt,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      },},
      { upsert: true }
    );
    logger.info(`[Index] BatchCreated #${batchId} product=${productId} workspace=${workspaceId} qty=${quantity}`);
  },

  // event BatchStatusUpdated(uint256 indexed batchId, BatchStatus status)
  BatchStatusUpdated: async (ev) => {
    const { batchId, status } = ev.returnValues;
    const statusStr = BATCH_STATUS[Number(status)] || 'Pending';

    await Batch.findOneAndUpdate(
      { batchId: Number(batchId) },
      { $set: { 
        status: statusStr, 
        txHash: ev.transactionHash, 
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(),
      }}
    );
    logger.debug(`[Index] BatchStatusUpdated #${batchId} to ${statusStr}`);
  },

  // event BatchEventAdded(uint256 indexed batchEventId, uint256 indexed batchId, BatchStatus status)
  BatchEventAdded: async (ev) => {
    const { batchEventId, batchId, status } = ev.returnValues;
    const statusStr = BATCH_STATUS[Number(status)];

    const web3 = getWeb3();
    let timestamp = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) timestamp = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    let chainEv = {};
    try {
      const { batchManager } = getContracts();
      const raw = await callContract(batchManager.methods.getBatchEvent(Number(batchEventId)));
      chainEv = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] BatchEventAdded: failed to fetch event details for eventId=${batchEventId} — ${err.message}`);
    }

    const batchIdNum = Number(batchId);
    const eventIdNum = Number(batchEventId);

    const newEvent = {
      batchEventId: eventIdNum,
      status: statusStr,
      timestamp,
      updatedBy: chainEv.updatedBy || '',
      note: chainEv.note || '',
      location: chainEv.location || '',
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
    };

    const update = await Batch.findOneAndUpdate(
      { batchId: batchIdNum, 'events.batchEventId': eventIdNum },
      { $set: { 
        status: statusStr, 
        'events.$.status': statusStr,
        'events.$.timestamp': timestamp,
        'events.$.updatedBy': chainEv.updatedBy || '',
        'events.$.note': chainEv.note || '',
        'events.$.location': chainEv.location || '',
        'events.$.txHash': ev.transactionHash,
        'events.$.blockNumber': ev.blockNumber,
      },},
    );

    if (!update) {
      await Batch.findOneAndUpdate(
        { batchId: batchIdNum },
        { 
          $set: { status: statusStr },
          $push: { events: newEvent },
        },
      );
    }
    
    logger.debug(`[Index] BatchEventAdded event=#${batchEventId} batch=#${batchId} status=${statusStr}`);
  },

  // event BatchEventDetailAdded(uint256 indexed batchEventDetailId, uint256 indexed batchEventId, string location)
  BatchEventDetailAdded: async (ev) => {
    const { batchEventDetailId, batchEventId, location } = ev.returnValues;

    const web3 = getWeb3();
    let timestamp = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) timestamp = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    let chainDetail = {};
    try {
      const { batchManager } = getContracts();
      const raw = await callContract(batchManager.methods.getBatchEventDetail(Number(batchEventDetailId)));
      chainDetail = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] BatchEventDetailAdded: không lấy được detail #${batchEventDetailId}: ${err.message}`);
    }

    await Batch.findOneAndUpdate(
      { 'events.batchEventId': Number(batchEventId) },
      { $push: { 'events.$.details': {
        detailId: Number(batchEventDetailId),
        location,
        description: chainDetail.description || '',
        timestamp,
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
      }}}
    );
    logger.debug(`[Index] BatchEventDetailAdded detail=#${batchEventDetailId} event=#${batchEventId} location="${location}" description="${chainDetail.description || ''}"`);
  },

  // event BatchDeleted(uint256 indexed batchId)
  BatchDeleted: async (ev) => {
    const { batchId } = ev.returnValues;
    await Batch.findOneAndUpdate(
      { batchId: Number(batchId) },
      { $set: { 
        isActive: false, 
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(),
      }}
    );
    logger.debug(`[Index] BatchDeleted #${batchId}`);
  },

  // event SupplierAssignmentTypeUpdated(uint256 indexed batchId, AssignmentStatus assignmentStatus)
  SupplierAssignmentTypeUpdated: async (ev) => {
    const { batchId, assignmentStatus } = ev.returnValues;
    const statusStr = ASSIGNMENT_STATUS[Number(assignmentStatus)] || 'None';
    await Batch.findOneAndUpdate(
      { batchId: Number(batchId) },
      { $set: { 
        supplierAssignmentStatus: statusStr, 
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(), 
      }}
    );
    logger.debug(`[Index] SupplierAssignmentTypeUpdated batch=${batchId} to=${statusStr}`);
  },

  // event TransporterAssignmentTypeUpdated(uint256 indexed batchId, AssignmentStatus assignmentStatus)
  TransporterAssignmentTypeUpdated: async (ev) => {
    const { batchId, assignmentStatus } = ev.returnValues;
    const statusStr = ASSIGNMENT_STATUS[Number(assignmentStatus)] || 'None';

    let chainBatch = {};
    try {
      const { batchManager } = getContracts();
      const raw = await callContract(batchManager.methods.getBatch(Number(batchId)));
      chainBatch = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] TransporterAssignmentTypeUpdated: không fetch được batch #${batchId} để lấy transporterId — ${err.message}`);
    }

    let locationUrl = '';
    let locationCid = '';
    const locationHash = chainBatch.locationHash || '0x' + '0'.repeat(64);
    if (locationHash && locationHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash: locationHash });
      if (pending) {
        locationUrl = pending.imageUrl;
        locationCid = pending.imageCid;
      }
    }

    let pickupAddress = '';
    let deliveryAddress = '';
    if (locationUrl) {
    try {
      const res = await fetch(locationUrl);
      const json = await res.json();
      pickupAddress = json.pickupAddress || '';
      deliveryAddress = json.deliveryAddress || '';
    } catch (err) {
      logger.warn(`[Index] Không fetch được location IPFS: ${err.message}`);
    }
  }

    await Batch.findOneAndUpdate(
      { batchId: Number(batchId) },
      { $set: { 
        transporterAssignmentStatus: statusStr, 
        locationHash,
        locationUrl,
        locationCid,
        pickupAddress,
        deliveryAddress,
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(), 
      }}
    );
    logger.debug(`[Index] TransporterAssignmentTypeUpdated batch=${batchId} to=${statusStr}`);
  },

  // event SupplierUpdated(uint256 indexed batchId, address indexed supplierId)
  SupplierUpdated: async (ev) => {
    const { batchId, supplierId } = ev.returnValues;
    await Batch.findOneAndUpdate(
      { batchId: Number(batchId) },
      { $set: { 
        supplierId: supplierId.toLowerCase(), 
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(),
      }}
    );
    logger.debug(`[Index] SupplierUpdated batch=#${batchId} supplier=${supplierId}`);
  },

  // event TransporterUpdated(uint256 indexed batchId, address indexed transporterId)
  TransporterUpdated: async (ev) => {
    const { batchId, transporterId } = ev.returnValues;
    await Batch.findOneAndUpdate(
      { batchId: Number(batchId) },
      { $set: { 
        transporterId: transporterId.toLowerCase(), 
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(),
      }}
    );
    logger.debug(`[Index] TransporterUpdated batch=#${batchId} transporter=${transporterId}`);
  },
};

const inviteHandlers = {
  // event SupplyInvitationCreated(uint256 indexed invitationId, uint256 indexed batchId, address indexed supplierId)
  SupplyInvitationCreated: async (ev) => {
    const { invitationId, batchId, supplierId } = ev.returnValues;

    let chain = {};
    try {
      const { inviteManager } = getContracts();
      chain = serializeResult(await callContract(inviteManager.methods.getSupplyInvitation(invitationId)));
    } catch (err) {
      logger.warn(`[Index] SupplyInvitationCreated #${invitationId}: không fetch được chain detail — ${err.message}`);
    }

    await Invitation.findOneAndUpdate(
      { invitationId: Number(invitationId) },
      { $set: {
          invitationId: Number(invitationId),
          batchId: Number(batchId),
          invitationType: 'Supply',
          supplierId: supplierId.toLowerCase(),
          status: 'Pending',
          bidPrice: Number(chain.bidPrice) || 0,
          bidTime: chain.bidTime ? new Date(Number(chain.bidTime) * 1000) : undefined,
          cropId: Number(chain.cropId) || 0,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      }},
      { upsert: true }
    );

    logger.debug(`[Index] SupplyInvitationCreated #${invitationId} batch=${batchId} supplier=${supplierId}`);
  },

  // event ShippingInvitationCreated(uint256 indexed invitationId, uint256 indexed batchId, address indexed transporterId)
  ShippingInvitationCreated: async (ev) => {
    const { invitationId, batchId, transporterId } = ev.returnValues;

    let chain = {};
    try {
      const { inviteManager } = getContracts();
      chain = serializeResult(await callContract(inviteManager.methods.getShippingInvitation(invitationId)));
    } catch (err) {
      logger.warn(`[Index] ShippingInvitationCreated #${invitationId}: không fetch được chain detail — ${err.message}`);
    }

    await Invitation.findOneAndUpdate(
      { invitationId: Number(invitationId) },
      { $set: {
          invitationId: Number(invitationId),
          batchId: Number(batchId),
          invitationType: 'Shipping',
          transporterId: transporterId.toLowerCase(),
          status: 'Pending',
          bidPrice: Number(chain.bidPrice) || 0,
          bidTime: chain.bidTime ? new Date(Number(chain.bidTime) * 1000) : undefined,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      }},
      { upsert: true }
    );

    logger.debug(`[Index] ShippingInvitationCreated #${invitationId} batch=${batchId} transporter=${transporterId}`);
  },

  /**
   * Event: SupplyInvitationStatusUpdated(invitationId, batchId, status)
   *
   * KEY LOGIC — Won cascade:
   *   - Won (status=3): set invitation Won + cascade set Lost cho tất cả supply invitation Pending còn lại trong cùng batch.
   *   - Accepted (status=1): cập nhật cropId từ chain (supplier đã confirm crop)
   *   - Rejected (status=2): chỉ cập nhật status
   *
   * "Lost" KHÔNG tồn tại on-chain — contract không emit Lost event.
   * Indexer tự derive và ghi vào DB để UI hiển thị đúng.
   */
  SupplyInvitationStatusUpdated: async (ev) => {
    const { invitationId, batchId, status } = ev.returnValues;
    const statusNum = Number(status);

    if (statusNum === 3) { // Won
      await Invitation.findOneAndUpdate(
        { invitationId: Number(invitationId), invitationType: 'Supply' },
        { $set: { 
          status: 'Won', 
          txHash: ev.transactionHash,
          lastUpdatedByEvent: ev.transactionHash,
          isVerified: true,
          verifiedAt: new Date(),
        }}
      );
      
      // Cascade: tất cả Pending còn lại của batch → Lost
      // derivedOffChain=true để auditInvitations bỏ qua (Lost không có trên chain)
      const cascadeResult = await Invitation.updateMany(
        { 
          batchId: Number(batchId), 
          invitationType: 'Supply',
          invitationId: { $ne: Number(invitationId) }, 
          status: 'Pending' 
        },
        { $set: { 
          status: 'Lost', 
          derivedOffChain: true, 
          lastUpdatedByEvent: ev.transactionHash 
        }}
      );

      logger.debug(`[Index] Supply bidding won: inv#${invitationId} batch=${batchId} → ${cascadeResult.modifiedCount} invitation set Lost`);
    } else if (statusNum === 1) { // Accepted
      // Khi supplier Accepted, contract cập nhật cropId on-chain
      // → fetch lại để lấy cropId mới nhất
      let cropId;
      let chain = {};
      try {
        const { inviteManager } = getContracts();
        chain = serializeResult(await callContract(inviteManager.methods.getSupplyInvitation(invitationId)));
        cropId = Number(chain.cropId);
      } catch (err) {
        logger.warn(`[Index] SupplyInvitationStatusUpdated #${invitationId}: không fetch được cropId — ${err.message}`);
      }

      const updateFields = {
        status: INVITE_STATUS[statusNum],
        txHash: ev.transactionHash,
        lastUpdatedByEvent: ev.transactionHash,
        isVerified: true,
        verifiedAt: new Date(),
      };
      if (cropId !== undefined && cropId > 0) updateFields.cropId = cropId;

      await Invitation.findOneAndUpdate(
        { invitationId: Number(invitationId), invitationType: 'Supply' },
        { $set: updateFields }
      );

      logger.debug(`[Index] SupplyInvitationStatusUpdated #${invitationId} to Accepted with cropId=${cropId}`);
    } else { // Rejected or other status
      await Invitation.findOneAndUpdate(
        { invitationId: Number(invitationId), invitationType: 'Supply' },
        { $set: { 
          status: INVITE_STATUS[statusNum] || 'Pending', 
          txHash: ev.transactionHash,
          lastUpdatedByEvent: ev.transactionHash,
          isVerified: true,
          verifiedAt: new Date(),
        }}
      );
      logger.debug(`[Index] SupplyInvitationStatusUpdated #${invitationId} to ${INVITE_STATUS[statusNum] || 'Pending'}`);
    }
  },

  /**
   * Event: ShippingInvitationStatusUpdated(invitationId, batchId, status)
   * Won cascade: set Lost cho tất cả Shipping Pending còn lại trong batch.
   */
  ShippingInvitationStatusUpdated: async (ev) => {
    const { invitationId, batchId, status } = ev.returnValues;
    const statusNum = Number(status);

    if (statusNum === 3) { // Won
      await Invitation.findOneAndUpdate(
        { invitationId: Number(invitationId), invitationType: 'Shipping' },
        { $set: { 
          status: 'Won', 
          txHash: ev.transactionHash,
          lastUpdatedByEvent: ev.transactionHash,
          isVerified: true,
          verifiedAt: new Date(),
        }}
      );

      const cascadeResult = await Invitation.updateMany(
        { 
          batchId: Number(batchId), 
          invitationType: 'Shipping',
          invitationId: { $ne: Number(invitationId) }, 
          status: 'Pending' 
        },
        { $set: { 
          status: 'Lost', 
          derivedOffChain: true, 
          lastUpdatedByEvent: ev.transactionHash 
        }}
      );

      logger.debug(`[Index] Shipping bidding won: inv#${invitationId} batch=${batchId} → ${cascadeResult.modifiedCount} invitation set Lost`);
    } else {
      await Invitation.findOneAndUpdate(
        { invitationId: Number(invitationId), invitationType: 'Shipping' },
        { $set: { 
          status: INVITE_STATUS[Number(status)], 
          txHash: ev.transactionHash,
          lastUpdatedByEvent: ev.transactionHash,
          isVerified: true,
          verifiedAt: new Date(),
        }}
      );
      logger.debug(`[Index] ShippingInvitationStatusUpdated #${invitationId} to ${INVITE_STATUS[Number(status)] || 'Pending'}`);
    }
  },
};

// ─── CropManager handlers ─────────────────────────────────────
const cropHandlers = {
  // event CropCreated(uint256 indexed cropId, address indexed userId, string name, uint256 productId)
  CropCreated: async (ev) => {
    const { cropId, userId, name, productId } = ev.returnValues;

    let chainData = {};
    try {
      const { cropManager } = getContracts();
      const raw = await callContract(cropManager.methods.getCrop(cropId));
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] CropCreated #${cropId}: không fetch được chain detail — ${err.message}`);
    }

    await Crop.findOneAndUpdate(
      { cropId: Number(cropId) },
      { $set: {
          cropId: Number(cropId),
          name: chainData.name || name,
          userId: (chainData.userId || userId).toLowerCase(),
          productId: Number(chainData.productId || productId),
          isActive: true,
          startDate: chainData.startDate ? new Date(Number(chainData.startDate) * 1000) : new Date(0),
          expectedHarvestDate: chainData.expectedHarvestDate ? new Date(Number(chainData.expectedHarvestDate) * 1000) : new Date(0),
          location: chainData.location || '',
          cultivationArea: Number(chainData.cultivationArea || 0),
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      }},
      { upsert: true }
    );
    logger.debug(`[Index] CropCreated #${cropId} supplier=${userId} product=${productId}`);
  },

  // event CropUpdated(uint256 indexed cropId, string name)
  CropUpdated: async (ev) => {
    const { cropId, name } = ev.returnValues;

    let chainData = {};
    try {
      const { cropManager } = getContracts();
      const raw = await callContract(cropManager.methods.getCrop(cropId));
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] CropUpdated #${cropId}: không fetch được chain detail — ${err.message}`);
    }

    const updateFields = {
      name: chainData.name || name,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      isVerified: true,
      verifiedAt: new Date(),
    };

    if (chainData.expectedHarvestDate) {
      updateFields.expectedHarvestDate = new Date(Number(chainData.expectedHarvestDate) * 1000);
    }
    if (chainData.location) {
      updateFields.location = chainData.location;
    }
    if (chainData.cultivationArea) {
      updateFields.cultivationArea = Number(chainData.cultivationArea);
    }

    await Crop.findOneAndUpdate(
      { cropId: Number(cropId) },
      { $set: updateFields }
    );
    
    logger.debug(`[Index] CropUpdated #${cropId}`);
  },

  CropDeleted: async (ev) => {
    const { cropId } = ev.returnValues;
    await Crop.findOneAndUpdate(
      { cropId: Number(cropId) },
      { $set: {
          isActive:    false,
          txHash:      ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified:  true,
          verifiedAt:  new Date(),
      }}
    );
    logger.debug(`[Index] CropDeleted #${cropId}`);
  },

  CropEventCreated: async (ev) => {
    const { cropEventId, cropId, description } = ev.returnValues;

    let timestamp = new Date();
    let statusStr = 'GeneralLog';
    try {
      const { cropManager } = getContracts();
      const raw = await callContract(cropManager.methods.getCropEvents(cropEventId));
      const chainEvent = serializeResult(raw);
      if (chainEvent.timestamp) {
        timestamp = new Date(Number(chainEvent.timestamp) * 1000);
      }
      if (chainEvent.status !== undefined) {
        statusStr = CROP_EVENT_STATUS[Number(chainEvent.status)] || 'GeneralLog';
      }
    } catch (err) { 
      logger.warn(`[Index] CropEventCreated #${cropEventId}: không fetch được event detail — ${err.message}`);
    }

    // Push vào embedded events array (idempotent: kiểm tra cropEventId trước)
    await Crop.findOneAndUpdate(
      { cropId: Number(cropId), 'events.cropEventId': { $ne: Number(cropEventId) } },
      { $push: { events: {
          cropEventId: Number(cropEventId),
          cropId: Number(cropId),
          status: statusStr,
          description,
          timestamp,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
      }}}
    );
    logger.debug(`[Index] CropEventCreated event#${cropEventId} crop#${cropId}`);
  },
};

// ─── ProductManager handlers ──────────────────────────────────
const productHandlers = {
  // event ProductWorkspaceCreated(uint256 indexed productWorkspaceId, uint256 indexed workspaceId, string name)
  ProductWorkspaceCreated: async (ev) => {
    const { productWorkspaceId, workspaceId, name } = ev.returnValues;

    const web3 = getWeb3();
    let createdAt = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) createdAt = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    // Fetch full data từ chain (event chỉ emit subset fields)
    let chainData = {};
    try {
      const { productManager } = getContracts();
      const raw = await callContract(
        productManager.methods.getProductWorkspace(productWorkspaceId)
      );
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] ProductWorkspaceCreated #${productWorkspaceId}: không fetch được workspace detail — ${err.message}`);
    }

    let imageUrl = '';
    let imageCid = '';
    const imageHash = chainData.imageHash || '0x' + '0'.repeat(64);
    if (imageHash && imageHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash });
      if (pending) {
        imageUrl = pending.imageUrl;
        imageCid = pending.imageCid;
      }
    }

    await ProductWorkspace.findOneAndUpdate(
      { productWorkspaceId: Number(productWorkspaceId) },
      { $set: {
          productWorkspaceId: Number(productWorkspaceId),
          workspaceId: Number(workspaceId),
          name: chainData.name || name,
          description: chainData.description || '',
          imageHash,
          imageUrl,
          imageCid,
          unit: chainData.unit || '',
          quantity: Number(chainData.quantity || 0),
          isActive: true,
          createdAt,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      },},
      { upsert: true }
    );
    logger.info(`[Index] ProductWorkspaceCreated #${productWorkspaceId} ws=${workspaceId} name="${name}"`);
  },

  // event ProductWorkspaceUpdated(uint256 indexed productWorkspaceId, uint256 indexed workspaceId, string name)
  ProductWorkspaceUpdated: async (ev) => {
    const { productWorkspaceId } = ev.returnValues;

    let chainData = {};
    try {
      const { productManager } = getContracts();
      const raw = await callContract(
        productManager.methods.getProductWorkspace(productWorkspaceId)
      );
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] ProductWorkspaceUpdated #${productWorkspaceId}: không fetch được workspace detail — ${err.message}`);
    }

    let imageFields = {};
    const imageHash = chainData.imageHash || '0x' + '0'.repeat(64);
    if (imageHash && imageHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash });
      if (pending) {
        imageFields = {
          imageUrl: pending.imageUrl,
          imageCid: pending.imageCid,
        };
      }
    }

    await ProductWorkspace.findOneAndUpdate(
      { productWorkspaceId: Number(productWorkspaceId) },
      { $set: {
          name: chainData.name || ev.returnValues.name,
          description: chainData.description || '',
          imageHash,
          ...imageFields,
          unit: chainData.unit || '',
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified:  true,
          verifiedAt:  new Date(),
        },}
      );
    logger.debug(`[Index] ProductWorkspaceUpdated #${productWorkspaceId}`);
  },

  // event ProductWorkspaceDeleted(uint256 indexed productWorkspaceId)
  ProductWorkspaceDeleted: async (ev) => {
    const { productWorkspaceId } = ev.returnValues;
    await ProductWorkspace.findOneAndUpdate(
      { productWorkspaceId: Number(productWorkspaceId) },
      { $set: {
          isActive: false,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      }}
    );
    logger.info(`[Index] ProductWorkspaceDeleted #${productWorkspaceId}`);
  },

  // event ProductQuantityAdjusted(uint256 indexed productWorkspaceId, int256 delta, uint256 oldQuantity, uint256 newQuantity)
  ProductQuantityAdjusted: async (ev) => {
    const { productWorkspaceId, delta, oldQuantity, newQuantity } = ev.returnValues;

    await ProductWorkspace.findOneAndUpdate(
      { productWorkspaceId: Number(productWorkspaceId) },
      { $set: {
          quantity: Number(newQuantity) || 0,
          txHash: ev.transactionHash,
          blockNumber: Number(ev.blockNumber),
          isVerified: true,
          verifiedAt: new Date(),
      }}
    );
    logger.debug(`[Index] ProductQuantityAdjusted #${productWorkspaceId} delta=${delta} old=${oldQuantity} new=${newQuantity}`);
  },

  // event ProductOfferCreated(uint256 indexed productOfferId, address indexed supplierId, string name)
  ProductOfferCreated: async (ev) => {
    const { productOfferId, supplierId, name } = ev.returnValues;

    const web3 = getWeb3();
    let createdAt = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) createdAt = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    let chainData = {};
    try {
      const { productManager } = getContracts();
      const raw = await callContract(
        productManager.methods.getProductOffer(productOfferId)
      );
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] ProductOfferCreated #${productOfferId}: không fetch được offer detail — ${err.message}`);
    }

    let imageUrl = '';
    let imageCid = '';
    const imageHash = chainData.imageHash || '0x' + '0'.repeat(64);
    if (imageHash && imageHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash });
      if (pending) {
        imageUrl = pending.imageUrl;
        imageCid = pending.imageCid;
      }
    }

    await ProductOffer.findOneAndUpdate(
      { productOfferId: Number(productOfferId) },
      { $set: {
          productOfferId: Number(productOfferId),
          name: chainData.name || name,
          imageHash,
          imageUrl,
          imageCid,
          description: chainData.description || '',
          supplierId: supplierId.toLowerCase(),
          isActive: true,
          createdAt,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      },},
      { upsert: true }
    );
    logger.info(`[Index] ProductOfferCreated #${productOfferId} supplier=${supplierId} name="${name}"`);
  },

  // event ProductOfferUpdated(uint256 indexed productOfferId, address indexed supplierId, string name)
  ProductOfferUpdated: async (ev) => {
    const { productOfferId, supplierId, name } = ev.returnValues;

    let chainData = {};
    try {
      const { productManager } = getContracts();
      const raw = await callContract(
        productManager.methods.getProductOffer(productOfferId)
      );
      chainData = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] ProductOfferUpdated #${productOfferId}: không fetch được offer detail — ${err.message}`);
    }

    let imageFields = {};
    const imageHash = chainData.imageHash || '0x' + '0'.repeat(64);
    if (imageHash && imageHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash });
      if (pending) {
        imageFields = {
          imageUrl: pending.imageUrl,
          imageCid: pending.imageCid
        };
      }
    }

    await ProductOffer.findOneAndUpdate(
      { productOfferId: Number(productOfferId) },
      { $set: {
        name: chainData.name || name,
        imageHash,
        ...imageFields,
        description: chainData.description || '',
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(),
      },}
    );
    logger.debug(`[Index] ProductOfferUpdated #${productOfferId}`);
  },

  // event ProductOfferDeleted(uint256 indexed productOfferId)
  ProductOfferDeleted: async (ev) => {
    const { productOfferId } = ev.returnValues;
    await ProductOffer.findOneAndUpdate(
      { productOfferId: Number(productOfferId) },
      { $set: {
          isActive:    false,
          txHash:      ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified:  true,
          verifiedAt:  new Date(),
      }}
    );
    logger.info(`[Index] ProductOfferDeleted #${productOfferId}`);
  },
};

// ─── ProductMappingManager handlers ───────────────────────────
const productMappingHandlers = {
  // event ProductMapped(uint256 indexed productWorkspaceId, uint256 indexed productOfferId, uint256 indexed workspaceId)
  ProductMapped: async (ev) => {
    const { productWorkspaceId, productOfferId, workspaceId } = ev.returnValues;

    const web3 = getWeb3();
    let createdAt = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) createdAt = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    await ProductMapping.findOneAndUpdate(
      { 
        productWorkspaceId: Number(productWorkspaceId), 
        productOfferId: Number(productOfferId) 
      },
      { $set: {
          productWorkspaceId: Number(productWorkspaceId),
          productOfferId: Number(productOfferId),
          workspaceId: Number(workspaceId),
          isActive: true,
          createdAt,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      },},
      { upsert: true }
    );
    logger.info(`[Index] ProductMapped pw=${productWorkspaceId} po=${productOfferId} ws=${workspaceId}`);
  },

  // event SupplyProposalCreated(uint256 indexed proposalId, uint256 indexed workspaceId, uint256 indexed productId, address userId)
  SupplyProposalCreated: async (ev) => {
    const { proposalId, workspaceId, productId, userId } = ev.returnValues;

    const web3 = getWeb3();
    let createdAt = new Date();
    try {
      const block = await web3.eth.getBlock(ev.blockNumber);
      if (block?.timestamp) createdAt = new Date(Number(block.timestamp) * 1000);
    } catch (_) { }

    await SupplyProposal.findOneAndUpdate(
      { proposalId: Number(proposalId) },
      { $set: {
        proposalId: Number(proposalId),
        workspaceId: Number(workspaceId),
        productId: Number(productId),
        status: 'Pending',
        userId: userId.toLowerCase(),
        createdAt,
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        isVerified: true,
        verifiedAt: new Date(),
      },},
      { upsert: true }
    );
    logger.info(`[Index] SupplyProposalCreated #${proposalId} ws=${workspaceId} product=${productId} user=${userId}`);
  },

  // event SupplyProposalProcessed(uint256 indexed proposalId, uint256 indexed workspaceId, ProposalStatus status)
  SupplyProposalProcessed: async (ev) => {
    const { proposalId, status } = ev.returnValues;
    const statusStr = PROPOSAL_STATUS[Number(status)] || 'Pending';

    await SupplyProposal.findOneAndUpdate(
      { proposalId: Number(proposalId) },
      { $set: {
          status: statusStr,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      }}
    );
    logger.info(`[Index] SupplyProposalProcessed #${proposalId} → ${statusStr}`);
  },
};

// ─── CertificationManager handlers ───────────────────────────
const certificationHandlers = {
  CertificationCreated: async (ev) => {
    const { certificationId, userId, name, expiryDate } = ev.returnValues;

    // Fetch full data từ chain (event chỉ emit subset fields)\
    let chain = {};
    try {
      const { certificationManager } = getContracts();
      const raw = await callContract(
        certificationManager.methods.getCertification(certificationId)
      );
      chain = serializeResult(raw);
    } catch (err) {
      logger.warn(`[Index] CertificationCreated #${certificationId}: không fetch chain detail — ${err.message}`);
    }

    let fileUrl = '';
    let fileCid = '';
    const fileHash = chain.fileHash || '0x' + '0'.repeat(64);
    if (fileHash && fileHash !== '0x' + '0'.repeat(64)) {
      const pending = await PendingUpload.findOne({ imageHash: fileHash });
      if (pending) {
        fileUrl = pending.imageUrl;
        fileCid = pending.imageCid;
      }
    }

    await Certification.findOneAndUpdate(
      { certificationId: Number(certificationId) },
      { $set: {
          certificationId: Number(certificationId),
          name,
          issuer: chain.issuer || '',
          issueDate: Number(chain.issueDate) ? new Date(Number(chain.issueDate) * 1000) : new Date(),
          expiryDate: new Date(Number(expiryDate) * 1000),
          fileHash,
          fileUrl,
          fileCid,
          userId: userId.toLowerCase(),
          isActive: true,
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified: true,
          verifiedAt: new Date(),
      },},
      { upsert: true }
    );

    logger.info(
      `[Index] CertificationCreated #${certificationId} user=${userId} ` +
      `expires=${new Date(Number(expiryDate) * 1000).toISOString()}`
    );
  },

  CertificationExpired: async (ev) => {
    const { certificationId, userId } = ev.returnValues;

    await Certification.findOneAndUpdate(
      { certificationId: Number(certificationId) },
      { $set: {
          isActive:    false,
          txHash:      ev.transactionHash,
          blockNumber: ev.blockNumber,
          isVerified:  true,
          verifiedAt:  new Date(),
      }}
    );

    logger.info(`[Index] CertificationExpired #${certificationId} user=${userId}`);
  },
};

// Tổng hợp tất cả handlers theo contract
const ALL_HANDLERS = {
  UserManager:           { contract: 'userManager',           handlers: userHandlers },
  WorkspaceManager:      { contract: 'workspaceManager',      handlers: workspaceHandlers },
  BatchManager:          { contract: 'batchManager',          handlers: batchHandlers },
  InviteManager:         { contract: 'inviteManager',         handlers: inviteHandlers },
  CropManager:           { contract: 'cropManager',           handlers: cropHandlers },
  ProductManager:        { contract: 'productManager',        handlers: productHandlers },
  ProductMappingManager: { contract: 'productMappingManager', handlers: productMappingHandlers },
  CertificationManager:  { contract: 'certificationManager',  handlers: certificationHandlers },
};

// ─────────────────────────────────────────────────────────────
//  TẦNG 1: Full Sync — scan lịch sử từ SyncState đến nay
// ─────────────────────────────────────────────────────────────

async function indexContract(contractName, contract, handlers) {
  const web3      = getWeb3();
  const state     = await SyncState.getOrCreate(contractName, env.START_BLOCK);
  const current   = Number(await web3.eth.getBlockNumber());
  const fromBlock = state.lastIndexedBlock + 1;

  if (fromBlock > current) {
    logger.debug(`[FullSync] ${contractName}: đã sync tới ${current}`);
    return;
  }

  logger.info(`[FullSync] ${contractName}: block ${fromBlock} → ${current}`);
  let totalProcessed = 0;

  for (let start = fromBlock; start <= current; start += BLOCK_CHUNK) {
    const end = Math.min(start + BLOCK_CHUNK - 1, current);

    for (const [eventName, handler] of Object.entries(handlers)) {
      try {
        const events = await contract.getPastEvents(eventName, { fromBlock: start, toBlock: end });
        for (const ev of events) {
          try { await handler(ev); totalProcessed++; }
          catch (err) { logger.error(`[FullSync] Handler ${eventName}: ${err.message}`); }
        }
      } catch (err) {
        logger.error(`[FullSync] getPastEvents(${eventName}) chunk ${start}-${end}: ${err.message}`);
      }
    }

    await SyncState.updateBlock(contractName, end, totalProcessed);
    totalProcessed = 0;
  }

  logger.info(`[FullSync] ${contractName}: ✅ done`);
}

async function runFullSync() {
  const contracts = getContracts();
  logger.info('[FullSync] 🔄 Bắt đầu full sync...');

  await Promise.allSettled(
    Object.entries(ALL_HANDLERS).map(([name, { contract: cKey, handlers }]) =>
      indexContract(name, contracts[cKey], handlers)
    )
  );

  logger.info('[FullSync] ✅ Hoàn thành');
}

// ─────────────────────────────────────────────────────────────
//  TẦNG 2: Realtime — WebSocket subscribe events mới
//
//  Vấn đề cũ: subscribeEvent đơn giản không xử lý:
//  1. WebSocket disconnect → bỏ lỡ events
//  2. Không biết đã bỏ lỡ bao nhiêu blocks
//
//  Giải pháp: Gap Healing
//  Mỗi khi nhận được event mới, ghi lại blockNumber
//  Khi WebSocket reconnect, scan lại blocks đã bị bỏ lỡ
// ─────────────────────────────────────────────────────────────

// Lưu lần cuối nhận được event của mỗi contract
const lastReceivedBlock = {};

/**
 * Subscribe 1 event với tự động reconnect và gap healing.
 *
 * @param {string}   contractName - tên để log
 * @param {object}   contract     - web3 contract instance
 * @param {string}   eventName    - tên event Solidity
 * @param {Function} handler      - async (event) => void
 */
function subscribeWithReconnect(contractName, contract, eventName, handler) {
  let retryCount   = 0;
  const MAX_RETRY  = 10;

  async function doSubscribe() {
    try {
      const subscription = await contract.events[eventName]();

      subscription.on('data', async (ev) => {
        logger.info(`[Realtime] RAW DATA ${contractName}.${eventName} block=${ev.blockNumber}`);
        ev.blockNumber = Number(ev.blockNumber); 
        retryCount = 0;

        if (!lastReceivedBlock[contractName] || ev.blockNumber > lastReceivedBlock[contractName]) {
          lastReceivedBlock[contractName] = ev.blockNumber;
          await SyncState.updateBlock(contractName, ev.blockNumber);
        }

        try {
          await handler(ev);
          logger.debug(`[Realtime] ${contractName}.${eventName} block=${ev.blockNumber}`);
        } catch (err) {
          logger.error(`[Realtime] Handler ${contractName}.${eventName}: ${err.message}`);
        }
      });

      subscription.on('error', async (err) => {
        logger.error(`[Realtime] ${contractName}.${eventName} error: ${err.message}`);
        await scheduleReconnect(contractName, contract, eventName, handler);
      });

    } catch (err) {
      logger.error(`[Realtime] Subscribe ${contractName}.${eventName} thất bại: ${err.message}`);
      await scheduleReconnect(contractName, contract, eventName, handler);
    }
  }

  async function scheduleReconnect(cName, c, eName, h) {
    if (retryCount >= MAX_RETRY) {
      logger.error(`[Realtime] ${cName}.${eName}: đã retry ${MAX_RETRY} lần, dừng.`);
      return;
    }

    // Exponential backoff: 2s, 4s, 8s... tối đa 60s
    const delay = Math.min(2000 * Math.pow(2, retryCount), 60000);
    retryCount++;
    logger.warn(`[Realtime] ${cName}.${eName}: reconnect sau ${delay/1000}s (lần ${retryCount})`);

    await new Promise(r => setTimeout(r, delay));

    // Gap healing: scan các blocks đã bị bỏ lỡ khi offline
    await healGap(cName, c, { [eName]: h });

    doSubscribe();
  }

  doSubscribe();
}

/**
 * Gap Healing: scan blocks đã bỏ lỡ khi WebSocket mất kết nối.
 * Gọi tự động khi reconnect.
 */
async function healGap(contractName, contract, handlers) {
  const web3    = getWeb3();
  const state   = await SyncState.getOrCreate(contractName, env.START_BLOCK);
  const current = Number(await web3.eth.getBlockNumber());
  const from    = state.lastIndexedBlock + 1;

  if (from > current) return;

  logger.info(`[GapHeal] ${contractName}: healing ${current - from + 1} blocks bị bỏ lỡ`);

  for (const [eventName, handler] of Object.entries(handlers)) {
    try {
      const missed = await contract.getPastEvents(eventName, { fromBlock: from, toBlock: current });
      logger.info(`[GapHeal] ${contractName}.${eventName}: ${missed.length} events bị bỏ lỡ`);

      for (const ev of missed) {
        try { await handler(ev); }
        catch (err) { logger.error(`[GapHeal] Handler error: ${err.message}`); }
      }
    } catch (err) {
      logger.error(`[GapHeal] ${contractName}.${eventName}: ${err.message}`);
    }
  }

  await SyncState.updateBlock(contractName, current);
  logger.info(`[GapHeal] ${contractName}: ✅ healed tới block ${current}`);
}

/**
 * Khởi động real-time indexer cho tất cả contracts.
 * Gọi SAU runFullSync() để không bỏ sót events khi đang sync.
 */
function startRealtimeIndexer() {
  const contracts = getWsContracts();
  logger.info('[Realtime] 👂 Khởi động real-time event indexer...');

  for (const [contractName, { contract: cKey, handlers }] of Object.entries(ALL_HANDLERS)) {
    const contract = contracts[cKey];
    for (const [eventName, handler] of Object.entries(handlers)) {
      subscribeWithReconnect(contractName, contract, eventName, handler);
    }
  }

  logger.info('[Realtime] ✅ Đang lắng nghe tất cả events qua WebSocket');
}

module.exports = { runFullSync, startRealtimeIndexer, healGap };