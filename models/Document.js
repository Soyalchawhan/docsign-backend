const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'signed', 'rejected'],
    default: 'draft'
  },
  signerEmail: {
    type: String,
    default: null
  },
  signerName: {
    type: String,
    default: null
  },
  shareToken: {
    type: String,
    default: null,
    unique: true,
    sparse: true
  },
  shareTokenExpiry: {
    type: Date,
    default: null
  },
  signedFilePath: {
    type: String,
    default: null
  },
  pages: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
