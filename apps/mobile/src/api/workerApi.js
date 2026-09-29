import { apiClient } from './client';

// EliteSuraksha 2.0 worker endpoints (same API as the web app; worker is
// derived server-side from the access token).
export const getOnboardingProfileApi = async () => (await apiClient.get('/onboarding/profile')).data;
export const saveOnboardingProfileApi = async (payload) => (await apiClient.put('/onboarding/profile', payload)).data;
export const getDashboardApi = async () => (await apiClient.get('/me/dashboard')).data;
export const getSystemStatusApi = async () => (await apiClient.get('/health/system')).data;
export const askAgentApi = async (question) => (await apiClient.post('/me/agent/ask', { question })).data;
export const getInvestigationsApi = async () => (await apiClient.get('/me/investigations')).data;
