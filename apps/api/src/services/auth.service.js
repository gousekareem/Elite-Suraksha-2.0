const crypto = require('crypto');
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const env = require('../config/env');

const MAX_OTP_ATTEMPTS = 5;

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) => {
  return crypto.createHash('sha256').update(otp).digest('hex');
};

const isValidIndianPhone = (phone) => {
  return /^[6-9]\d{9}$/.test(phone);
};

const sendOtp = async (phone) => {
  if (!phone) {
    throw new AppError('Phone number is required', 400);
  }

  if (!isValidIndianPhone(phone)) {
    throw new AppError('Enter a valid 10-digit Indian mobile number', 400);
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  let user = await prisma.user.findUnique({
    where: { phone }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        role: 'WORKER',
        status: 'PENDING_VERIFICATION'
      }
    });
  }

  await prisma.otpRequest.create({
    data: {
      userId: user.id,
      phone,
      otpHash,
      expiresAt
    }
  });

  return {
    phone,
    expiresAt,
    devOtp: env.exposeDevOtp ? otp : undefined
  };
};

const verifyOtp = async (phone, otp) => {
  if (!phone) {
    throw new AppError('Phone number is required', 400);
  }

  if (!otp) {
    throw new AppError('OTP is required', 400);
  }

  if (!isValidIndianPhone(phone)) {
    throw new AppError('Enter a valid 10-digit Indian mobile number', 400);
  }

  const user = await prisma.user.findUnique({
    where: { phone }
  });

  if (!user) {
    throw new AppError('User not found for this phone number', 404);
  }

  const latestOtpRequest = await prisma.otpRequest.findFirst({
    where: {
      phone,
      verifiedAt: null
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (!latestOtpRequest) {
    throw new AppError('No OTP request found. Please request a new OTP.', 400);
  }

  if (latestOtpRequest.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts. Please request a new OTP.', 429);
  }

  if (latestOtpRequest.expiresAt < new Date()) {
    throw new AppError('OTP has expired. Please request a new OTP.', 400);
  }

  const otpHash = hashOtp(otp);

  if (latestOtpRequest.otpHash !== otpHash) {
    await prisma.otpRequest.update({
      where: { id: latestOtpRequest.id },
      data: {
        attempts: {
          increment: 1
        }
      }
    });

    throw new AppError('Invalid OTP', 400);
  }

  await prisma.otpRequest.update({
    where: { id: latestOtpRequest.id },
    data: {
      verifiedAt: new Date()
    }
  });

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      status: 'ACTIVE'
    },
    include: {
      workerProfile: true
    }
  });

  return issueSession(updatedUser);
};

const issueSession = (user) => {
  const tokenPayload = { userId: user.id, phone: user.phone, role: user.role };
  return {
    user: { id: user.id, phone: user.phone, role: user.role, status: user.status, workerProfile: user.workerProfile },
    accessToken: generateAccessToken(tokenPayload),
    refreshToken: generateRefreshToken(tokenPayload)
  };
};

const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { workerProfile: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return {
    id: user.id,
    phone: user.phone,
    role: user.role,
    status: user.status,
    workerProfile: user.workerProfile
  };
};

module.exports = {
  issueSession,
  sendOtp,
  verifyOtp,
  getCurrentUser
};