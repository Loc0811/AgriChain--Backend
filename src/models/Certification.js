// ============================================================
//  src/models/Certification.js
//
//  Mongoose model cho CertificationManager.sol
//  • Certification struct
//  • Dữ liệu được indexer đồng bộ từ blockchain
// ============================================================
const mongoose = require('mongoose');

const CertificationSchema = new mongoose.Schema(
  {
    certificationId: { type: Number, required: true, unique: true, index: true },
    name:            { type: String, required: true },
    issuer:          { type: String, required: true },
    issueDate:       { type: Date, required: true },
    expiryDate:      { type: Date, required: true, index: true },
    fileHash:        { type: String, required: true },           // IPFS hash
    fileUrl:         { type: String },                            // URL truy cập file (từ IPFS)
    fileCid:         { type: String },                            // CID của file trên IPFS
    userId:          { type: String, required: true, lowercase: true, index: true },
    isActive:        { type: Boolean, default: true, index: true },

    // Blockchain metadata
    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'certifications' }
);

// Index kết hợp cho các query phổ biến
CertificationSchema.index({ userId: 1, isActive: 1 });
CertificationSchema.index({ isActive: 1, expiryDate: 1 });

// ─── Method: so sánh với dữ liệu trên chain ─────────────────
CertificationSchema.methods.matchesChainData = function (chainCert) {
  return (
    this.name                === chainCert.name &&
    this.issuer              === chainCert.issuer &&
    this.issueDate.getTime() === Number(chainCert.issueDate) * 1000 &&
    this.expiryDate.getTime() === Number(chainCert.expiryDate) * 1000 &&
    this.fileHash            === chainCert.fileHash &&
    this.userId              === chainCert.userId?.toLowerCase() &&
    this.isActive            === chainCert.isActive
  );
};

module.exports = mongoose.model('Certification', CertificationSchema);