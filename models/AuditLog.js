const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  action: {
    type: String,
    enum: [
      'document_uploaded',
      'document_viewed',
      'signature_placed',
      'share_link_generated',
      'signing_started',
      'document_signed',
      'document_rejected',
      'signed_pdf_generated',
      'document_downloaded'
    ],
    required: true
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actorName: {
    type: String,
    default: 'Anonymous'
  },
  actorEmail: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
