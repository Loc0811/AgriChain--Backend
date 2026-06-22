const mongoose = require('mongoose');

// Enum khớp với Solidity: enum Role { None, Admin, Distributor, Supplier, Transporter }
const ROLES = ['None', 'Admin', 'Distributor', 'Supplier', 'Transporter'];

const UserSchema = new mongoose.Schema(
  {
    // ── Dữ liệu từ blockchain ──────────────────────────────
    address: {
      type:     String,
      required: true,
      unique:   true,
      lowercase: true,
      index:    true,
    },
    name:   { type: String, required: true },
    avatarHash: { type: String, default: '' },
    avatarUrl:  { type: String, default: '' },
    avatarCid:  { type: String, default: '' },
    email:  { type: String, default: '' },
    phone:  { type: String, default: '' },
    role: {
      type:    String,
      enum:    ROLES,
      required: true,
      index:   true,
    },
    isActive: { type: Boolean, default: true, index: true },
    registeredAt: { type: Date, required: true }, // từ block.timestamp

    // ── Metadata blockchain (dùng để verify) ──────────────
    // Mỗi lần có thay đổi quan trọng, cập nhật txHash + blockNumber
    txHash:      { type: String, required: true },  // tx tạo/update cuối cùng
    blockNumber: { type: Number, required: true },   // block của tx đó

    // ── Integrity tracking ────────────────────────────────
    // isVerified: false nếu DB bị sửa tay (job verify sẽ detect)
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
    // Lần cuối verify job chạy và compare với chain
    lastVerifyBlock: { type: Number, default: 0 },
  },
  {
    timestamps: true, // createdAt, updatedAt tự động
    collection: 'users',
  }
);

// Index kết hợp cho các query phổ biến
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ isActive: 1, createdAt: -1 });

// ── Virtual: link đến Etherscan ──────────────────────────
UserSchema.virtual('etherscanUrl').get(function () {
  return `https://sepolia.etherscan.io/tx/${this.txHash}`;
});

// ── Method: kiểm tra data có khớp chain không ────────────
UserSchema.methods.matchesChainData = function (chainUser) {
  return (
    this.name     === chainUser.name &&
    this.avatarHash   === chainUser.avatarHash &&
    this.role     === ROLES[Number(chainUser.role)] &&
    this.isActive === chainUser.isActive &&
    this.email    === chainUser.email &&
    this.phone    === chainUser.phone
  );
};

module.exports = mongoose.model('User', UserSchema);