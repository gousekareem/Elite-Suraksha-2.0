import { apiClient } from './client';

export const sendOtpApi = async (phone) => {
  const response = await apiClient.post('/auth/send-otp', { phone });
  return response.data;
};

export const verifyOtpApi = async (phone, otp) => {
  const response = await apiClient.post('/auth/verify-otp', { phone, otp });
  return response.data;
};

export const getMeApi = async () => {
  const response = await apiClient.get('/auth/me');
  return response.data;
};