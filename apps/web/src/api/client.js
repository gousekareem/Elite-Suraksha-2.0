import axios from 'axios';

// Same-origin by default (Vite proxies /api in development).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({ baseURL: API_BASE_URL, headers: { 'Content-Type': 'application/json' }, timeout: 120000 });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errorMessage = (err, fallback = 'Something went wrong') => {
  if (err?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (!err?.response) return 'Cannot reach the EliteSuraksha API. Is the server running?';
  const d = err.response.data;
  if (d?.details?.length) return `${d.message}: ${d.details.map((x) => x.message || x).join(', ')}`;
  return d?.message || fallback;
};

const unwrap = (p) => p.then((r) => r.data.data);

export const api = {
  get: (url, params) => unwrap(apiClient.get(url, { params })),
  post: (url, body) => unwrap(apiClient.post(url, body)),
  put: (url, body) => unwrap(apiClient.put(url, body)),
  patch: (url, body) => unwrap(apiClient.patch(url, body)),
  upload: (url, form) => unwrap(apiClient.post(url, form, { headers: { 'Content-Type': 'multipart/form-data' } })),
  raw: (url) => apiClient.get(url, { responseType: 'text' }).then((r) => r.data)
};
