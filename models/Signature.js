import mongoose from 'mongoose'

const signatureSchema = new mongoose.Schema({
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  signerEmail: { type: String, required: true },
  signerName: { type: String, required: true },
  signerRole: { type: String, default: '' },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, default: 20 },
  height: { type: Number, default: 8 },
  page: { type: Number, default: 1 },
  signatureType: { type: String, enum: ['typed', 'drawn', 'initials'], default: 'typed' },
  signatureData: { type: String },
  signatureText: { type: String },
  status: { type: String, enum: ['placed', 'signed', 'rejected'], default: 'placed' },
  rejectionReason: { type: String },
  signedAt: { type: Date },
  ipAddress: { type: String },
}, { timestamps: true })

export default mongoose.model('Signature', signatureSchema)
