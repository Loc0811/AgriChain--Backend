// ============================================================
//  src/models/Product.js
// ============================================================
const mongoose = require('mongoose');

// ─── ProductWorkspace Schema ──────────────────────────────────
const ProductWorkspaceSchema = new mongoose.Schema(
  {
    productWorkspaceId: { type: Number, required: true, unique: true, index: true },
    name:               { type: String, required: true },
    description:        { type: String, default: '' },
    imageHash:          { type: String }, // bytes32
    imageCid:           { type: String }, // CID gốc để tham chiếu
    imageUrl:           { type: String }, // IPFS URL
    unit:               { type: String, required: true },
    quantity:           { type: Number, default: 0 },
    workspaceId:        { type: Number, required: true, index: true },
    isActive:           { type: Boolean, default: true, index: true },
    createdAt:          { type: Date, required: true },

    // Blockchain metadata
    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'product_workspaces' }
);

ProductWorkspaceSchema.index({ workspaceId: 1, isActive: 1 });
ProductWorkspaceSchema.index({ workspaceId: 1, name: 1 });

ProductWorkspaceSchema.methods.matchesChainData = function (chainProduct) {
  return (
    this.name         === chainProduct.name &&
    this.description  === chainProduct.description &&
    this.imageHash    === chainProduct.imageHash &&
    this.unit         === chainProduct.unit &&
    Number(this.quantity) === Number(chainProduct.quantity) &&
    Number(this.workspaceId) === Number(chainProduct.workspaceId) &&
    this.isActive     === chainProduct.isActive
  );
};

// ─── ProductOffer Schema ──────────────────────────────────────
const ProductOfferSchema = new mongoose.Schema(
  {
    productOfferId: { type: Number, required: true, unique: true, index: true },
    name:           { type: String, required: true },
    imageHash:      { type: String }, // bytes32
    imageCid:       { type: String }, // CID gốc để tham chiếu
    imageUrl:       { type: String }, // IPFS URL
    description:    { type: String, default: '' },
    supplierId:     { type: String, required: true, lowercase: true, index: true },
    isActive:       { type: Boolean, default: true, index: true },
    createdAt:      { type: Date, required: true },

    // Blockchain metadata
    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'product_offers' }
);

ProductOfferSchema.index({ supplierId: 1, isActive: 1 });
ProductWorkspaceSchema.index({ supplierId: 1, name: 1 });

ProductOfferSchema.methods.matchesChainData = function (chainOffer) {
  return (
    this.name        === chainOffer.name &&
    this.imageHash    === chainOffer.imageHash &&
    this.description === chainOffer.description &&
    this.supplierId  === chainOffer.supplierId?.toLowerCase() &&
    this.isActive    === chainOffer.isActive
  );
};

const ProductWorkspace = mongoose.model('ProductWorkspace', ProductWorkspaceSchema);
const ProductOffer     = mongoose.model('ProductOffer', ProductOfferSchema);

module.exports = { ProductWorkspace, ProductOffer };