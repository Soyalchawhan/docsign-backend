import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema({
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  action: {
    type: String,
    enum: [
      'document_uploaded', 'document_viewed', 'signature_placed',
      'share_link_generated', 'signing_started', 'document_signed',
      'document_rejected', 'signed_pdf_generated', 'document_downloaded'
    ],
    required: true
  },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: { type: String },
  actorEmail: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true })

export default mongoose.model('AuditLog', auditLogSchema)
