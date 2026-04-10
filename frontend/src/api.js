import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';
const AUTH_STORAGE_KEYS = ['access_token', 'refresh_token', 'user'];

const clearAuthStorage = () => {
  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
};

const normalizeApiDetail = (detail) => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parsed = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.msg || item.detail || item.message || JSON.stringify(item);
        }
        return null;
      })
      .filter(Boolean)
      .join(', ');
    return parsed || 'Error de validación';
  }
  if (detail && typeof detail === 'object') {
    return detail.msg || detail.detail || detail.message || JSON.stringify(detail);
  }
  return 'Error inesperado';
};

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401 and refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error?.response?.data && Object.prototype.hasOwnProperty.call(error.response.data, 'detail')) {
      error.response.data.detail = normalizeApiDetail(error.response.data.detail);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_URL}/api/auth/refresh`, {
            refresh_token: refreshToken,
          });
          const { access_token, refresh_token: newRefresh } = res.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', newRefresh);
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch {
          clearAuthStorage();
          window.location.href = '/login';
        }
      } else {
        clearAuthStorage();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
