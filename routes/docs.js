const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Document = require('../models/Document');
const Signature = require('../models/Signature');
const { protect, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { createAuditLog } = require('../middleware/audit');

const router = express.Router();

// POST /api/docs/upload
router.post('/upload', protect, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const { title, signerEmail, signerName } = req.body;

    const doc = await Document.create({
      title: title || req.file.originalname.replace('.pdf', ''),
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      owner: req.user._id,
      signerEmail: signerEmail || null,
      signerName: signerName || null
    });

    await createAuditLog({
      document: doc._id,
      action: 'document_uploaded',
      actor: req.user,
      req,
      metadata: { filename: req.file.originalname, size: req.file.size }
    });

    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/docs - List user's documents
router.get('/', protect, async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = { owner: req.user._id };
    if (status) query.status = status;
    if (search) query.title = { $regex: search, $options: 'i' };

    const docs = await Document.find(query)
      .sort({ createdAt: -1 })
      .populate('owner', 'name email');

    res.json(docs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/docs/:id - Get specific document
router.get('/:id', protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id })
      .populate('owner', 'name email');

    if (!doc) return res.status(404).json({ message: 'Document not found' });

    await createAuditLog({
      document: doc._id,
      action: 'document_viewed',
      actor: req.user,
      req
    });

    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/docs/public/:token - Get doc via share token
router.get('/public/:token', optionalAuth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      shareToken: req.params.token,
      shareTokenExpiry: { $gt: new Date() }
    }).populate('owner', 'name email');

    if (!doc) return res.status(404).json({ message: 'Document not found or link expired' });

    await createAuditLog({
      document: doc._id,
      action: 'signing_started',
      actor: req.user || null,
      actorName: doc.signerName || 'External Signer',
      actorEmail: doc.signerEmail,
      req
    });

    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/docs/:id/share - Generate share link
router.post('/:id/share', protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const { signerEmail, signerName, expiryDays = 7 } = req.body;

    const shareToken = uuidv4();
    const shareTokenExpiry = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    doc.shareToken = shareToken;
    doc.shareTokenExpiry = shareTokenExpiry;
    doc.signerEmail = signerEmail || doc.signerEmail;
    doc.signerName = signerName || doc.signerName;
    doc.status = 'pending';
    await doc.save();

    await createAuditLog({
      document: doc._id,
      action: 'share_link_generated',
      actor: req.user,
      req,
      metadata: { signerEmail: doc.signerEmail, expiryDays }
    });

    const shareUrl = `${process.env.CLIENT_URL}/sign/${shareToken}`;
    res.json({ shareToken, shareUrl, shareTokenExpiry, doc });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/docs/:id - Update document
router.patch('/:id', protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const allowedUpdates = ['title', 'signerEmail', 'signerName', 'status'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) doc[field] = req.body[field];
    });
    await doc.save();

    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/docs/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // Delete files
    if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
    if (doc.signedFilePath && fs.existsSync(doc.signedFilePath)) fs.unlinkSync(doc.signedFilePath);

    await Signature.deleteMany({ document: doc._id });
    await doc.deleteOne();

    res.json({ message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/docs/:id/download - Download signed or original PDF
router.get('/:id/download', protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const filePath = req.query.signed === 'true' && doc.signedFilePath
      ? doc.signedFilePath
      : doc.filePath;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    await createAuditLog({
      document: doc._id,
      action: 'document_downloaded',
      actor: req.user,
      req,
      metadata: { signed: req.query.signed === 'true' }
    });

    res.download(filePath, doc.originalName);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
