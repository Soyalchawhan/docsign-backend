const express = require('express');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const Document = require('../models/Document');
const Signature = require('../models/Signature');
const { protect, optionalAuth } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/audit');

const router = express.Router();

// POST /api/signatures - Save signature position(s)
router.post('/', protect, async (req, res) => {
  try {
    const { documentId, x, y, width, height, page, signerEmail, signerName } = req.body;

    const doc = await Document.findOne({ _id: documentId, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const signature = await Signature.create({
      document: documentId,
      signer: req.user._id,
      signerName: signerName || req.user.name,
      signerEmail: signerEmail || req.user.email,
      x, y,
      width: width || 200,
      height: height || 60,
      page: page || 1
    });

    await createAuditLog({
      document: documentId,
      action: 'signature_placed',
      actor: req.user,
      req,
      metadata: { x, y, page }
    });

    res.status(201).json(signature);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/signatures/:docId - Get all signatures for a document
router.get('/:docId', optionalAuth, async (req, res) => {
  try {
    const signatures = await Signature.find({ document: req.params.docId })
      .populate('signer', 'name email');
    res.json(signatures);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/signatures/:id - Update signature (position)
router.patch('/:id', protect, async (req, res) => {
  try {
    const sig = await Signature.findById(req.params.id).populate('document');
    if (!sig) return res.status(404).json({ message: 'Signature not found' });

    // Only document owner can update placed signatures
    if (sig.document.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { x, y, width, height, page } = req.body;
    if (x !== undefined) sig.x = x;
    if (y !== undefined) sig.y = y;
    if (width !== undefined) sig.width = width;
    if (height !== undefined) sig.height = height;
    if (page !== undefined) sig.page = page;
    await sig.save();

    res.json(sig);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/signatures/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const sig = await Signature.findById(req.params.id).populate('document');
    if (!sig) return res.status(404).json({ message: 'Signature not found' });
    if (sig.document.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await sig.deleteOne();
    res.json({ message: 'Signature removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/signatures/sign/:token - External signer signs via token
router.post('/sign/:token', optionalAuth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      shareToken: req.params.token,
      shareTokenExpiry: { $gt: new Date() }
    });
    if (!doc) return res.status(404).json({ message: 'Invalid or expired link' });

    const { signatureData, signatureType, signatureText, signerName, signerEmail, action, rejectionReason } = req.body;

    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] ||
                      req.connection?.remoteAddress || 'unknown';

    if (action === 'reject') {
      // Reject all signatures
      await Signature.updateMany(
        { document: doc._id, status: 'placed' },
        { status: 'rejected', rejectionReason: rejectionReason || 'No reason given', signedAt: new Date(), ipAddress }
      );
      doc.status = 'rejected';
      await doc.save();

      await createAuditLog({
        document: doc._id,
        action: 'document_rejected',
        actorName: signerName || doc.signerName,
        actorEmail: signerEmail || doc.signerEmail,
        req,
        metadata: { rejectionReason }
      });

      return res.json({ message: 'Document rejected' });
    }

    // Sign
    await Signature.updateMany(
      { document: doc._id, status: 'placed' },
      {
        status: 'signed',
        signatureData,
        signatureType: signatureType || 'typed',
        signatureText,
        signedAt: new Date(),
        ipAddress,
        signerName: signerName || doc.signerName,
        signerEmail: signerEmail || doc.signerEmail
      }
    );
    doc.status = 'signed';
    await doc.save();

    await createAuditLog({
      document: doc._id,
      action: 'document_signed',
      actorName: signerName || doc.signerName,
      actorEmail: signerEmail || doc.signerEmail,
      req,
      metadata: { signatureType }
    });

    res.json({ message: 'Document signed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/signatures/finalize/:docId - Embed signatures into PDF
router.post('/finalize/:docId', protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.docId, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.status !== 'signed') {
      return res.status(400).json({ message: 'Document must be signed first' });
    }

    const signatures = await Signature.find({ document: doc._id, status: 'signed' });
    if (!signatures.length) {
      return res.status(400).json({ message: 'No signed signatures found' });
    }

    // Read original PDF
    const pdfBytes = fs.readFileSync(doc.filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    for (const sig of signatures) {
      const pageIndex = (sig.page || 1) - 1;
      const page = pages[pageIndex] || pages[0];
      const { width: pageWidth, height: pageHeight } = page.getSize();

      // Convert percentage coordinates back to absolute
      const absX = (sig.x / 100) * pageWidth;
      const absY = pageHeight - (sig.y / 100) * pageHeight - sig.height;

      // Draw signature box
      page.drawRectangle({
        x: absX,
        y: absY,
        width: sig.width,
        height: sig.height,
        borderColor: rgb(0.2, 0.4, 0.8),
        borderWidth: 1,
        color: rgb(0.95, 0.97, 1)
      });

      // Draw signature text
      const displayText = sig.signatureText || sig.signerName;
      page.drawText(displayText, {
        x: absX + 8,
        y: absY + sig.height / 2,
        size: 14,
        font,
        color: rgb(0.1, 0.2, 0.6)
      });

      // Draw signed by label
      page.drawText(`Signed by: ${sig.signerEmail}`, {
        x: absX + 8,
        y: absY + 8,
        size: 7,
        font,
        color: rgb(0.4, 0.4, 0.4)
      });

      // Draw timestamp
      const ts = sig.signedAt ? new Date(sig.signedAt).toISOString() : new Date().toISOString();
      page.drawText(`Date: ${ts}`, {
        x: absX + 8,
        y: absY + 18,
        size: 7,
        font,
        color: rgb(0.4, 0.4, 0.4)
      });
    }

    const signedBytes = await pdfDoc.save();
    const signedDir = path.join(__dirname, '..', 'uploads', 'signed');
    if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir, { recursive: true });

    const signedFilename = `signed-${doc.filename}`;
    const signedFilePath = path.join(signedDir, signedFilename);
    fs.writeFileSync(signedFilePath, signedBytes);

    doc.signedFilePath = signedFilePath;
    await doc.save();

    await createAuditLog({
      document: doc._id,
      action: 'signed_pdf_generated',
      actor: req.user,
      req
    });

    res.json({ message: 'Signed PDF generated', signedFilePath: `/uploads/signed/${signedFilename}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
