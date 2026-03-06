import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

const generateTokens = (id) => {
  const accessToken = jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  })
  const refreshToken = jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  })
  return { accessToken, refreshToken }
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    const exists = await User.findOne({ email })
    if (exists) return res.status(400).json({ message: 'Email already registered' })
    const user = await User.create({ name, email, password })
    const tokens = generateTokens(user._id)
    res.status(201).json({ user, ...tokens })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await User.findOne({ email }).select('+password')
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }
    const tokens = generateTokens(user._id)
    res.json({ user, ...tokens })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' })
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    const tokens = generateTokens(decoded.id)
    res.json(tokens)
  } catch (err) {
    res.status(401).json({ message: 'Invalid refresh token' })
  }
})

router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user })
})

export default router
