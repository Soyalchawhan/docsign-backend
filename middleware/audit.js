import AuditLog from '../models/AuditLog.js'

export const createAuditLog = async (req, action, documentId, user, actorEmail = null) => {
  try {
    const ipAddress = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
    const userAgent = req.headers?.['user-agent'] || ''

    await AuditLog.create({
      document: documentId,
      action,
      actor: user?._id || null,
      actorName: user?.name || actorEmail || 'Anonymous',
      actorEmail: user?.email || actorEmail || '',
      ipAddress,
      userAgent
    })
  } catch (err) {
    console.error('Audit log error:', err.message)
  }
}
