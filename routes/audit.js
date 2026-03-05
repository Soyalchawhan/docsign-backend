const express = require('express');
const AuditLog = require('../models/AuditLog');
const Document = require('../models/Document');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit/:docId - Get audit trail for a document
router.get('/:docId', protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.docId, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const logs = await AuditLog.find({ document: req.params.docId })
      .sort({ createdAt: -1 })
      .populate('actor', 'name email');

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
