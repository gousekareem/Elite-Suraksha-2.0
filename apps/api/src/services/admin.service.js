// Investigator / admin console queries (cross-worker, ADMIN only).
const prisma = require('../lib/prisma');

const overview = async () => {
  const [workers, anomalies, byStatus, retains, recalls, failures] = await Promise.all([
    prisma.workerProfile.count(),
    prisma.anomaly.count({ where: { severity: { in: ['SIGNIFICANT_CHANGE', 'INVESTIGATION_RECOMMENDED'] } } }),
    prisma.investigation.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.memoryEvent.count({ where: { operation: 'RETAIN', status: 'OK' } }),
    prisma.memoryEvent.count({ where: { operation: 'RECALL', status: { in: ['OK', 'EMPTY'] } } }),
    prisma.memoryEvent.count({ where: { status: { in: ['UNAVAILABLE', 'FAILED'] } } })
  ]);
  return {
    workers,
    significantAnomalies: anomalies,
    investigations: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    memory: { retained: retains, recalls, failures }
  };
};

const workers = () => prisma.workerProfile.findMany({
  include: { user: { select: { phone: true, status: true } }, _count: { select: { sessions: true, anomalies: true, investigations: true } } },
  orderBy: { createdAt: 'desc' }
});

const anomalies = () => prisma.anomaly.findMany({
  where: { severity: { not: 'NORMAL' } },
  include: { worker: { select: { id: true, fullName: true } }, investigations: { select: { id: true, caseNumber: true, status: true } } },
  orderBy: { localDate: 'desc' },
  take: 100
});

const investigations = () => prisma.investigation.findMany({
  include: { worker: { select: { id: true, fullName: true } }, outcome: true, _count: { select: { evidence: true, reports: true } } },
  orderBy: { createdAt: 'desc' },
  take: 100
});

const memoryActivity = () => prisma.memoryEvent.findMany({
  include: { worker: { select: { id: true, fullName: true } } },
  orderBy: { createdAt: 'desc' },
  take: 150
});

const auditTrail = () => prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 150 });

module.exports = { overview, workers, anomalies, investigations, memoryActivity, auditTrail };
