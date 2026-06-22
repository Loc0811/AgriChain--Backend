// ============================================================
//  src/models/Crop.js
//
//  Mongoose model cho CropManager.sol
//  • Crop struct + embedded CropEvent timeline
//  • Dữ liệu được indexer đồng bộ từ blockchain
// ============================================================
const mongoose = require('mongoose');

const CROP_EVENT_STATUS = ['GeneralLog', 'Irrigation', 'Fertilization', 'PestControl', 'Harvest'];

// ─── CropEvent sub-document ───────────────────────────────────
const CropEventSchema = new mongoose.Schema({
  cropEventId: { type: Number, required: true },
  cropId:      { type: Number, required: true },
  status:      { type: String, enum: CROP_EVENT_STATUS, required: true },
  description: { type: String, required: true },
  timestamp:   { type: Date, required: true },
  txHash:      { type: String, required: true },
  blockNumber: { type: Number, required: true },
}, { _id: false });

// ─── Crop Schema ──────────────────────────────────────────────
const CropSchema = new mongoose.Schema(
  {
    cropId:    { type: Number, required: true, unique: true, index: true },
    name:      { type: String, required: true },

    startDate:           { type: Date, required: true },
    expectedHarvestDate: { type: Date, required: true },

    productId:       { type: Number, required: true, index: true },   // productOffer
    location:        { type: String, required: true },
    cultivationArea: { type: Number, required: true },                // m²

    userId:    { type: String, required: true, lowercase: true, index: true }, // supplier
    isActive:  { type: Boolean, default: true, index: true },

    // Embedded events — timeline nhật ký canh tác
    events: [CropEventSchema],

    // Blockchain metadata
    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'crops' }
);

// Index kết hợp cho các query phổ biến
CropSchema.index({ userId: 1, isActive: 1 });
CropSchema.index({ productId: 1, isActive: 1 });

// ─── Method: so sánh với dữ liệu trên chain ─────────────────
CropSchema.methods.matchesChainData = function (chainCrop) {
  return (
    this.name                === chainCrop.name &&
    this.startDate.getTime() === Number(chainCrop.startDate) * 1000 &&
    this.expectedHarvestDate.getTime() === Number(chainCrop.expectedHarvestDate) * 1000 &&
    Number(this.productId)   === Number(chainCrop.productId) &&
    this.location            === chainCrop.location &&
    Number(this.cultivationArea) === Number(chainCrop.cultivationArea) &&
    this.userId              === chainCrop.userId?.toLowerCase() &&
    this.isActive            === chainCrop.isActive
  );
};

module.exports = {
  Crop: mongoose.model('Crop', CropSchema),
  CROP_EVENT_STATUS
};