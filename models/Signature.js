const mongoose = require('mongoose');

const signatureSchema = new mongoose.Schema({
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  signer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  signerName: {
    type: String,
    required: true
  },
  signerEmail: {
    type: String,
    required: true
  },
  // Position coordinates (as percentage of page dimensions for responsiveness)
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, default: 200 },
  height: { type: Number, default: 60 },
  page: { type: Number, default: 1 },
  // Signature data
  signatureType: {
    type: String,
    enum: ['typed', 'drawn', 'initials'],
    default: 'typed'
  },
  signatureData: {
    type: String, // Base64 image for drawn, text for typed
    default: null
  },
  signatureText: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['placed', 'signed', 'rejected'],
    default: 'placed'
  },
  rejectionReason: {
    type: String,
    default: null
  },
  signedAt: {
    type: Date,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Signature', signatureSchema);
