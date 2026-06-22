// ============================================================
//  src/models/SyncState.js
//
//  Lưu block đã index đến đâu.
//  Dùng để: khi server restart, không index lại từ đầu.
//  Quan trọng: nếu thiếu model này → mỗi lần start lại
//  phải scan toàn bộ chain từ START_BLOCK → rất chậm.
// ============================================================
const mongoose = require('mongoose');

const SyncStateSchema = new mongoose.Schema(
  {
    // key = tên contract, e.g. "UserManager", "BatchManager"
    contract:         { type: String, required: true, unique: true },
    lastIndexedBlock: { type: Number, required: true, default: 0 },
    lastIndexedAt:    { type: Date, default: Date.now },
    // Số events đã xử lý tổng cộng
    totalEventsProcessed: { type: Number, default: 0 },
    // Trạng thái: 'synced' | 'syncing' | 'error'
    status:           { type: String, default: 'synced' },
    lastError:        { type: String },
  },
  { timestamps: true, collection: 'sync_states' }
);

// Static method: lấy hoặc tạo mới SyncState cho 1 contract
SyncStateSchema.statics.getOrCreate = async function (contractName, startBlock = 0) {
  let state = await this.findOne({ contract: contractName });
  if (!state) {
    state = await this.create({
      contract:         contractName,
      lastIndexedBlock: startBlock,
    });
  }
  return state;
};

SyncStateSchema.statics.updateBlock = async function (contractName, blockNumber, eventsCount = 0) {
  return this.findOneAndUpdate(
    { contract: contractName },
    {
      $set: { lastIndexedBlock: blockNumber, lastIndexedAt: new Date(), status: 'synced' },
      $inc: { totalEventsProcessed: eventsCount },
    },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('SyncState', SyncStateSchema);