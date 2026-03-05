const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({ document, action, actor, actorName, actorEmail, req, metadata = {} }) => {
  try {
    const ipAddress = req?.headers['x-forwarded-for']?.split(',')[0] || 
                      req?.connection?.remoteAddress || 
                      req?.socket?.remoteAddress || 
                      'unknown';
    const userAgent = req?.headers['user-agent'] || 'unknown';

    await AuditLog.create({
      document,
      action,
      actor: actor?._id || actor || null,
      actorName: actorName || actor?.name || 'Anonymous',
      actorEmail: actorEmail || actor?.email || null,
      ipAddress,
      userAgent,
      metadata
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = { createAuditLog };
