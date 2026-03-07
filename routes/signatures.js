import express from 'express'
import Document from '../models/Document.js'
import Signature from '../models/Signature.js'
import { protect } from '../middleware/auth.js'
import { createAuditLog } from '../middleware/audit.js'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// Place signature field
router.post('/', protect, async (req, res) => {
  try {
    const { documentId, signerEmail, signerName, signerRole, x, y, width, height, page } = req.body
    const doc = await Document.findOne({ _id: documentId, owner: req.user._id })
    if (!doc) return res.status(404).json({ message: 'Document not found' })

    const signer = doc.signers.find(s => s.email === signerEmail)
    if (!signer) return res.status(400).json({ message: 'Signer not found in document' })

    const sig = await Signature.create({
      document: documentId,
      signerEmail,
      signerName: signerName || signer.name,
      signerRole: signerRole || signer.role || '',
      x, y, width, height, page
    })

    await createAuditLog(req, 'signature_placed', documentId, req.user)
    res.status(201).json({ signature: sig })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Get signatures for document
router.get('/:docId', protect, async (req, res) => {
  try {
    const sigs = await Signature.find({ document: req.params.docId })
    res.json({ signatures: sigs })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Update signature position
router.patch('/:id', protect, async (req, res) => {
  try {
    const sig = await Signature.findByIdAndUpdate(req.params.id, req.body, { new: true })
    res.json({ signature: sig })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Delete signature field
router.delete('/:id', protect, async (req, res) => {
  try {
    await Signature.findByIdAndDelete(req.params.id)
    res.json({ message: 'Signature deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// External signer submits signature via share token
router.post('/sign/:token', async (req, res) => {
  try {
    const { signatureType, signatureData, signatureText, rejected, rejectionReason } = req.body

    const doc = await Document.findOne({ 'signers.shareToken': req.params.token })
    if (!doc) return res.status(404).json({ message: 'Document not found' })

    const signer = doc.signers.find(s => s.shareToken === req.params.token)
    if (!signer) return res.status(404).json({ message: 'Invalid token' })
    if (signer.status === 'signed') return res.status(400).json({ message: 'Already signed' })

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress

    if (rejected) {
      signer.status = 'rejected'
      doc.status = 'rejected'
      await Signature.updateMany(
        { document: doc._id, signerEmail: signer.email },
        { status: 'rejected', rejectionReason, ipAddress: ip }
      )
    } else {
      signer.status = 'signed'
      signer.signedAt = new Date()

      await Signature.updateMany(
        { document: doc._id, signerEmail: signer.email, status: 'placed' },
        { status: 'signed', signatureType, signatureData, signatureText, signedAt: new Date(), ipAddress: ip }
      )

      const allSigned = doc.signers.every(s => s.status === 'signed')
      if (allSigned) doc.status = 'signed'
    }

    await doc.save()
    await createAuditLog({ headers: req.headers, socket: req.socket }, rejected ? 'document_rejected' : 'document_signed', doc._id, null, signer.email)

    res.json({ message: rejected ? 'Document rejected' : 'Document signed', doc })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Finalize - embed signatures into PDF
router.post('/finalize/:docId', protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.docId, owner: req.user._id })
    if (!doc) return res.status(404).json({ message: 'Document not found' })

    const signatures = await Signature.find({ document: doc._id, status: 'signed' })
    if (!signatures.length) return res.status(400).json({ message: 'No signed signatures found' })

    const pdfBytes = fs.readFileSync(doc.filePath)
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const pages = pdfDoc.getPages()

    for (const sig of signatures) {
  const pageIndex = (sig.page || 1) - 1
  const page = pages[pageIndex]
  if (!page) continue

  const { width: pageWidth, height: pageHeight } = page.getSize()

  // Convert percentage to PDF points
  const x = (sig.x / 100) * pageWidth
  const w = (sig.width / 100) * pageWidth
  const h = (sig.height / 100) * pageHeight
  // PDF y-axis is bottom-up, browser is top-down
  const y = pageHeight - ((sig.y / 100) * pageHeight) - h

  console.log(`SIGN: ${sig.signerName} x=${x.toFixed(0)} y=${y.toFixed(0)} w=${w.toFixed(0)} h=${h.toFixed(0)} page=${pageWidth}x${pageHeight}`)

  // Draw white background box
  page.drawRectangle({
    x: x,
    y: y,
    width: w,
    height: h,
    color: rgb(1, 1, 0.8),
    borderColor: rgb(0, 0, 1),
    borderWidth: 2,
    opacity: 1
  })

  // Large visible signature text
  page.drawText(sig.signatureText || sig.signerName, {
    x: x + 2,
    y: y + h - 14,
    size: 10,
    font: boldFont,
    color: rgb(0, 0, 0.8),
    opacity: 1
  })

  page.drawText(sig.signerName, {
    x: x + 2,
    y: y + h - 24,
    size: 7,
    font: font,
    color: rgb(0, 0, 0),
    opacity: 1
  })

  if (sig.signerRole) {
    page.drawText(sig.signerRole, {
      x: x + 2,
      y: y + h - 32,
      size: 7,
      font: font,
      color: rgb(0.2, 0.2, 0.2),
      opacity: 1
    })
  }

  page.drawText(new Date(sig.signedAt || Date.now()).toLocaleDateString(), {
    x: x + 2,
    y: y + 3,
    size: 6,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
    opacity: 1
  })
}

    const signedDir = path.join(process.env.UPLOADS_DIR || 'uploads', 'signed')
    if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir, { recursive: true })

    const signedFilename = `signed-${doc.filename}`
    const signedPath = path.join(signedDir, signedFilename)
    fs.writeFileSync(signedPath, await pdfDoc.save())

    doc.signedFilePath = signedPath
    await doc.save()

    await createAuditLog(req, 'signed_pdf_generated', doc._id, req.user)
    res.json({ message: 'Signed PDF generated', signedFilename })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
