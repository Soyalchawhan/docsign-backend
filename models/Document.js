import mongoose from 'mongoose'

const signerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, default: '' },
  shareToken: { type: String, unique: true, sparse: true },
  shareTokenExpiry: { type: Date },
  status: { type: String, enum: ['pending', 'signed', 'rejected'], default: 'pending' },
  signedAt: { type: Date }
})

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  filename: { type: String, required: true },
  filePath: { type: String, required: true },
  fileSize: { type: Number },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['draft', 'pending', 'signed', 'rejected'],
    default: 'draft'
  },
  signers: [signerSchema],
  signedFilePath: { type: String },
  pages: { type: Number, default: 1 }
}, { timestamps: true })

export default mongoose.model('Document', documentSchema)
