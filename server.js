import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
dotenv.config()

import connectDB from './config/db.js'
import authRoutes from './routes/auth.js'
import docRoutes from './routes/docs.js'
import signatureRoutes from './routes/signatures.js'
import auditRoutes from './routes/audit.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

connectDB()

const uploadsDir = path.join(__dirname, process.env.UPLOADS_DIR || 'uploads')
const signedDir = path.join(uploadsDir, 'signed')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir, { recursive: true })

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(uploadsDir))

app.use('/api/auth', authRoutes)
app.use('/api/docs', docRoutes)
app.use('/api/signatures', signatureRoutes)
app.use('/api/audit', auditRoutes)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`🚀 DocSign API running on port ${PORT}`))
