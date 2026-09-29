const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const { getAdapter } = require('../platform');

const getProfileForUser = async (userId) => prisma.workerProfile.findUnique({ where: { userId } });

/** Create or update the authenticated worker's profile (onboarding). */
const upsertProfile = async (user, payload) => {
  if (user.role !== 'WORKER') throw new AppError('Only worker accounts have a worker profile', 403);
  const adapter = getAdapter(payload.platformCode);
  const data = {
    fullName: payload.fullName.trim(),
    city: payload.city.trim(),
    zone: payload.zone.trim(),
    platformCode: adapter.code,
    platformName: payload.platformName?.trim() || adapter.name,
    preferences: payload.preferences && typeof payload.preferences === 'object' ? payload.preferences : undefined
  };
  const existing = await prisma.workerProfile.findUnique({ where: { userId: user.id } });
  if (existing?.isSynthetic) throw new AppError('The synthetic demo profile is managed by the Judge Demo', 409);
  return existing
    ? prisma.workerProfile.update({ where: { userId: user.id }, data })
    : prisma.workerProfile.create({ data: { ...data, userId: user.id } });
};

module.exports = { getProfileForUser, upsertProfile };
