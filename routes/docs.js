import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import DocModel from '../models/Document.js'
import Signature from '../models/Signature.js'
import { protect, optionalAuth } from '../middleware/auth.js'
import { createAuditLog } from '../middleware/audit.js'

const router = express.Router()

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOADS_DIR || 'uploads'
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files allowed'))
  },
  limits: { fileSize: 20 * 1024 * 1024 }
})

// Upload document
router.post('/upload', protect, upload.single('pdf'), async (req, res) => {
  try {
    const { title, signers } = req.body
    let parsedSigners = []
    if (signers) {
      parsedSigners = typeof signers === 'string' ? JSON.parse(signers) : signers
    }

    const doc = await DocModel.create({
      title,
      filename: req.file.filename,
      filePath: req.file.path,
      fileSize: req.file.size,
      owner: req.user._id,
      signers: parsedSigners.map(s => ({
        name: s.name,
        email: s.email,
        role: s.role || ''
      }))
    })

    await createAuditLog(req, 'document_uploaded', doc._id, req.user)
    res.status(201).json({ doc })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Get all documents for user
router.get('/', protect, async (req, res) => {
  try {
    const { status, search } = req.query
    const query = { owner: req.user._id }
    if (status) query.status = status
    if (search) query.title = { $regex: search, $options: 'i' }
    const docs = await DocModel.find(query).sort({ createdAt: -1 })
    res.json({ docs })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Get single document
router.get('/:id', protect, async (req, res) => {
  try {
    const doc = await DocModel.findOne({ _id: req.params.id, owner: req.user._id })
    if (!doc) return res.status(404).json({ message: 'Document not found' })
    await createAuditLog(req, 'document_viewed', doc._id, req.user)
    res.json({ doc })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Get document by share token (public)
router.get('/public/:token', optionalAuth, async (req, res) => {
  try {
    const doc = await DocModel.findOne({ 'signers.shareToken': req.params.token })
    if (!doc) return res.status(404).json({ message: 'Document not found' })

    const signer = doc.signers.find(s => s.shareToken === req.params.token)
    if (!signer) return res.status(404).json({ message: 'Invalid share token' })
    if (signer.shareTokenExpiry && new Date() > signer.shareTokenExpiry) {
      return res.status(410).json({ message: 'Share link has expired' })
    }

    await createAuditLog(req, 'document_viewed', doc._id, null, signer.email)
    res.json({ doc, signer })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Generate share links for all signers
router.post('/:id/share', protect, async (req, res) => {
  try {
    const { expiryDays = 7 } = req.body
    const doc = await DocModel.findOne({ _id: req.params.id, owner: req.user._id })
    if (!doc) return res.status(404).json({ message: 'Document not found' })

    const expiry = new Date()
    expiry.setDate(expiry.getDate() + Number(expiryDays))

    doc.signers = doc.signers.map(signer => ({
      ...signer.toObject(),
      shareToken: signer.shareToken || uuidv4(),
      shareTokenExpiry: expiry
    }))

    doc.status = 'pending'
    await doc.save()

    const shareLinks = doc.signers.map(s => ({
      name: s.name,
      email: s.email,
      role: s.role,
      shareUrl: `${process.env.CLIENT_URL}/sign/${s.shareToken}`,
      status: s.status
    }))

    await createAuditLog(req, 'share_link_generated', doc._id, req.user)
    res.json({ shareLinks, doc })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Update document
router.patch('/:id', protect, async (req, res) => {
  try {
    const doc = await DocModel.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      req.body,
      { new: true }
    )
    if (!doc) return res.status(404).json({ message: 'Document not found' })
    res.json({ doc })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Delete document
router.delete('/:id', protect, async (req, res) => {
  try {
    const doc = await DocModel.findOneAndDelete({ _id: req.params.id, owner: req.user._id })
    if (!doc) return res.status(404).json({ message: 'Document not found' })
    if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath)
    if (doc.signedFilePath && fs.existsSync(doc.signedFilePath)) fs.unlinkSync(doc.signedFilePath)
    await Signature.deleteMany({ document: doc._id })
    res.json({ message: 'Document deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Download document
router.get('/:id/download', protect, async (req, res) => {
  try {
    const doc = await DocModel.findOne({ _id: req.params.id, owner: req.user._id })
    if (!doc) return res.status(404).json({ message: 'Document not found' })
    const filePath = req.query.signed === 'true' && doc.signedFilePath ? doc.signedFilePath : doc.filePath
    await createAuditLog(req, 'document_downloaded', doc._id, req.user)
    res.download(filePath)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
