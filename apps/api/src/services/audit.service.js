// Audit trail: who / what / when / why for important investigation actions.
const prisma = require('../lib/prisma');
const logger = require('../lib/logger');

const audit = async ({ actorUserId = null, workerId = null, action, entityType, entityId = null, details = null }) => {
  try {
    return await prisma.auditLog.create({ data: { actorUserId, workerId, action, entityType, entityId, details } });
  } catch (err) {
    logger.warn('AUDIT', `failed to write audit log: ${err.message}`);
    return null;
  }
};

module.exports = { audit };
