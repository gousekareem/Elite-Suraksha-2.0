const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');
const asyncHandler = require('../utils/asyncHandler');

const requireAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authorization token is required', 401);
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    throw new AppError('Invalid or expired token', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { workerProfile: true }
  });

  if (!user) {
    throw new AppError('User not found', 401);
  }

  req.user = user;
  next();
});

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (req.user.role !== 'ADMIN') {
    return next(new AppError('Admin access required', 403));
  }

  next();
};

module.exports = {
  requireAuth,
  requireAdmin
};