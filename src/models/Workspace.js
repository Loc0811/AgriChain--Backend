const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
  address:            { type: String, required: true, lowercase: true },
  representativeName: { type: String, required: true },
  role:               { type: String, enum: ['Supplier', 'Transporter', 'Distributor'] },
  joinedAt:           { type: Date },
  isActive:           { type: Boolean, default: true },
  // tx của JoinRequest được approve
  joinTxHash:         { type: String },
}, { _id: false });

const JoinRequestSchema = new mongoose.Schema({
  requestId:          { type: Number, required: true },
  userId:             { type: String, required: true, lowercase: true },
  representativeName: { type: String },
  message:            { type: String },
  status:             { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  requestedAt:        { type: Date },
  txHash:             { type: String, required: true },
  blockNumber:        { type: Number, required: true },
}, { _id: false });

const WorkspaceSchema = new mongoose.Schema(
  {
    workspaceId:  { type: Number, required: true, unique: true, index: true },
    name:         { type: String, required: true },
    description:  { type: String, default: '' },
    imageHash:        { type: String, default: '' },
    imageUrl:         { type: String, default: '' },
    imageCid:         { type: String, default: '' },
    owner:        { type: String, required: true, lowercase: true, index: true },
    isActive:     { type: Boolean, default: true, index: true },
    createdAt:    { type: Date, required: true },

    // Embedded documents — query nhanh không cần JOIN
    members:      [MemberSchema],
    joinRequests: [JoinRequestSchema],

    // Blockchain metadata
    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'workspaces' }
);

WorkspaceSchema.index({ isActive: 1, createdAt: -1 }); 
WorkspaceSchema.index({ 'members.address': 1, isActive: 1 }); 
WorkspaceSchema.index({ 'joinRequests.userId': 1, 'joinRequests.status': 1 });
WorkspaceSchema.index({ name: 'text' });

WorkspaceSchema.methods.matchesChainData = function (chainWs) {
  return (
    this.name        === chainWs.name &&
    this.imageHash   === chainWs.imageHash &&
    this.description === chainWs.description &&
    this.owner       === chainWs.owner.toLowerCase() &&
    this.isActive    === chainWs.isActive
  );
};

module.exports = mongoose.model('Workspace', WorkspaceSchema);