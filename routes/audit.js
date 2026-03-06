import express from 'express'
import AuditLog from '../models/AuditLog.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

router.get('/:docId', protect, async (req, res) => {
  try {
    const logs = await AuditLog.find({ document: req.params.docId })
      .sort({ createdAt: -1 })
      .populate('actor', 'name email')
    res.json({ logs })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
