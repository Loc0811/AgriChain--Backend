const mongoose = require('mongoose');

const ASSIGNMENT_STATUS = ['None', 'Assigned', 'Bidding'];
const BATCH_STATUS = ['Pending', 'Producing', 'ReadyToShip', 'Shipping', 'Delivered', 'Stored', 'Cancelled'];

const BatchEventDetailSchema = new mongoose.Schema({
  detailId:    { type: Number, required: true },
  location:    { type: String },
  description: { type: String },
  timestamp:   { type: Date },
  txHash:      { type: String, required: true },
  blockNumber: { type: Number, required: true },
}, { _id: false });

const BatchEventSchema = new mongoose.Schema({
  batchEventId: { type: Number, required: true },
  status:       { type: String, enum: BATCH_STATUS },
  timestamp:    { type: Date, required: true },
  updatedBy:    { type: String, lowercase: true },
  note:         { type: String },
  location:     { type: String },
  details:      [BatchEventDetailSchema],
  txHash:       { type: String, required: true },
  blockNumber:  { type: Number, required: true },
}, { _id: false });

const BatchSchema = new mongoose.Schema(
  {
    batchId:     { type: Number, required: true, unique: true, index: true },
    productId:   { type: Number, required: true, index: true },
    workspaceId: { type: Number, required: true, index: true },
    quantity:    { type: Number, required: true },

    supplierId:               { type: String, lowercase: true },
    supplierAssignmentStatus: { type: String, enum: ASSIGNMENT_STATUS, default: 'None' },

    transporterId:               { type: String, lowercase: true },
    transporterAssignmentStatus: { type: String, enum: ASSIGNMENT_STATUS, default: 'None' },

    status: { type: String, enum: BATCH_STATUS, default: 'Pending', index: true },

    isActive: { type: Boolean, default: true, index: true },

    // bytes32 hash lưu on-chain, plaintext lưu DB
    imageQRHash:   { type: String },   // bytes32
    imageQRUrl:    { type: String },   // IPFS URL thực tế để hiển thị
    imageQRCid:    { type: String },   // IPFS CID gốc, dùng để tính hash và lưu on-chain
    locationHash:  { type: String },   // bytes32
    locationCid:  { type: String },   // IPFS CID gốc, dùng để tính hash và lưu on-chain
    locationUrl:  { type: String },   // IPFS URL thực tế để hiển thị
    pickupAddress: { type: String },   // plaintext
    deliveryAddress:{ type: String },  // plaintext

    // Embedded events — timeline truy xuất nguồn gốc
    events: [BatchEventSchema],

    createdAt:   { type: Date, required: true },
    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'batches' }
);

BatchSchema.index({ workspaceId: 1, status: 1 });
BatchSchema.index({ workspaceId: 1, isActive: 1 });
BatchSchema.index({ supplierId: 1 });
BatchSchema.index({ transporterId: 1 });
BatchSchema.index({ productId: 1, isActive: 1 });

BatchSchema.methods.matchesChainData = function (chainBatch) {
  const BATCH_STATUS_MAP      = ['Pending','Producing','ReadyToShip','Shipping','Delivered','Stored','Cancelled'];
  const ASSIGNMENT_STATUS_MAP = ['None','Assigned','Bidding'];

  return (
    this.productId  === Number(chainBatch.productId) &&
    this.quantity   === Number(chainBatch.quantity) &&
    (this.supplierId || '') === (chainBatch.supplierId?.toLowerCase() || '') &&
    (this.transporterId || '') === (chainBatch.transporterId?.toLowerCase() || '') &&
    this.status     === BATCH_STATUS[Number(chainBatch.status)] &&
    this.supplierAssignmentStatus === ASSIGNMENT_STATUS[Number(chainBatch.supplierAssignmentStatus)] &&
    this.transporterAssignmentStatus === ASSIGNMENT_STATUS[Number(chainBatch.transporterAssignmentStatus)] &&
    (this.locationHash || '') === (chainBatch.locationHash || '') &&
    (this.isActive !== undefined ? this.isActive : true) === (chainBatch.isActive === true || chainBatch.isActive === 'true')
  );
};

const Batch = mongoose.model('Batch', BatchSchema);

module.exports = { Batch };