// Worker scoping. The worker whose data is accessed is ALWAYS derived server-side:
//  • /me/*                      → the authenticated user's own worker profile
//  • /admin/workers/:workerId/* → any worker, but only for ADMIN users
// Client-supplied worker ids in bodies/queries are never used.

const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const requireOwnWorker = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'WORKER') throw new AppError('Worker account required', 403);
  const worker = await prisma.workerProfile.findUnique({ where: { userId: req.user.id } });
  if (!worker) throw new AppError('Worker profile not found. Complete onboarding first.', 409);
  req.worker = worker;
  next();
});

const requireAdminWorkerParam = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'ADMIN') throw new AppError('Admin access required', 403);
  const { workerId } = req.params;
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(workerId || '')) throw new AppError('Invalid worker id', 400);
  const worker = await prisma.workerProfile.findUnique({ where: { id: workerId } });
  if (!worker) throw new AppError('Worker not found', 404);
  req.worker = worker;
  next();
});

module.exports = { requireOwnWorker, requireAdminWorkerParam };
