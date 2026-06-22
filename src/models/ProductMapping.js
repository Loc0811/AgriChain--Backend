// ============================================================
//  src/models/ProductMapping.js
//
//  Mongoose model cho ProductMappingManager.sol
//  • ProductMapping — mapping giữa ProductWorkspace và ProductOffer
//  • SupplyProposal — đề xuất cung cấp từ Supplier tới Workspace
//  • Dữ liệu được indexer đồng bộ từ blockchain
// ============================================================
const mongoose = require('mongoose');

// Enum khớp với Solidity: ProposalStatus { Pending, Accepted, Rejected }
const PROPOSAL_STATUS = ['Pending', 'Accepted', 'Rejected'];

// ─── ProductMapping Schema ────────────────────────────────────
// Lưu ý: trên chain là mapping(uint256 => mapping(uint256 => ProductMapping))
// nên không có unique ID riêng, key là (productWorkspaceId, productOfferId)
const ProductMappingSchema = new mongoose.Schema(
  {
    productWorkspaceId: { type: Number, required: true },
    productOfferId:     { type: Number, required: true },
    workspaceId:        { type: Number, required: true, index: true },
    isActive:           { type: Boolean, default: false },
    createdAt:          { type: Date },

    // Blockchain metadata
    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'product_mappings' }
);

// Compound unique index — khớp với mapping key trên chain
ProductMappingSchema.index({ productWorkspaceId: 1, productOfferId: 1 }, { unique: true });
ProductMappingSchema.index({ workspaceId: 1, isActive: 1 });

// ─── SupplyProposal Schema ────────────────────────────────────
const SupplyProposalSchema = new mongoose.Schema(
  {
    proposalId:  { type: Number, required: true, unique: true, index: true },
    workspaceId: { type: Number, required: true, index: true },
    productId:   { type: Number, required: true },  // productOffer
    status:      { type: String, enum: PROPOSAL_STATUS, default: 'Pending', index: true },
    userId:      { type: String, required: true, lowercase: true },
    createdAt:   { type: Date, required: true },

    // Blockchain metadata
    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'supply_proposals' }
);

SupplyProposalSchema.index({ workspaceId: 1, status: 1 });

const ProductMapping = mongoose.model('ProductMapping', ProductMappingSchema);
const SupplyProposal = mongoose.model('SupplyProposal', SupplyProposalSchema);

module.exports = { ProductMapping, SupplyProposal };