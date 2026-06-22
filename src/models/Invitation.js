const mongoose = require('mongoose');

const InvitationSchema = new mongoose.Schema(
  {
    invitationId:   { type: Number, required: true, index: true },
    batchId:        { type: Number, required: true, index: true },
    invitationType: { type: String, enum: ['Supply', 'Shipping'], required: true },

    // Supply fields
    supplierId:  { type: String, lowercase: true },
    cropId:      { type: Number , default: 0},

    // Shipping fields
    transporterId: { type: String, lowercase: true },

    // Common bid fields
    bidPrice:  { type: Number },
    bidTime:   { type: Date },

    status: {
      type:    String,
      enum:    ['Pending', 'Accepted', 'Rejected', 'Won', 'Lost'],
      default: 'Pending',
      index:   true,
    },

    // Nếu status được tính off-chain (Lost derived), đánh dấu để phân biệt
    derivedOffChain:       { type: Boolean, default: false },
    lastUpdatedByEvent:    { type: String }, // txHash của event gây ra thay đổi

    txHash:      { type: String, required: true },
    blockNumber: { type: Number, required: true },
    isVerified:  { type: Boolean, default: true },
    verifiedAt:  { type: Date },
  },
  { timestamps: true, collection: 'invitations' }
);

InvitationSchema.index({ batchId: 1, invitationType: 1 });
InvitationSchema.index({ batchId: 1, invitationType: 1, status: 1 });
InvitationSchema.index({ supplierId: 1, status: 1 });
InvitationSchema.index({ transporterId: 1, status: 1 });
InvitationSchema.index({ blockNumber: 1, derivedOffChain: 1, status: 1 });

module.exports = mongoose.model('Invitation', InvitationSchema);