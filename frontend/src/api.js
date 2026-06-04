import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';
const AUTH_STORAGE_KEYS = ['access_token', 'refresh_token', 'user'];
let refreshPromise = null;
let isRedirectingToLogin = false;

const clearAuthStorage = () => {
  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
};

const redirectToLoginOnce = () => {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  window.location.href = '/login';
};

const decodeJwtPayload = (token) => {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const isTokenExpiredOrNearExpiry = (token, skewSeconds = 20) => {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return false;
  return (Date.now() + skewSeconds * 1000) >= exp * 1000;
};

const runRefreshTokenFlow = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/api/auth/refresh`, { refresh_token: refreshToken })
      .then((res) => {
        const { access_token, refresh_token: newRefresh } = res.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', newRefresh);
        return { access_token, refresh_token: newRefresh };
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
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

// Request interceptor - add auth token and pre-refresh when token is expired
api.interceptors.request.use(async (config) => {
  const url = String(config?.url || '');
  if (url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')) {
    return config;
  }

  let token = localStorage.getItem('access_token');
  if (token && isTokenExpiredOrNearExpiry(token)) {
    try {
      const refreshed = await runRefreshTokenFlow();
      token = refreshed.access_token;
    } catch {
      clearAuthStorage();
      redirectToLoginOnce();
      throw new axios.Cancel('Sesión expirada');
    }
  }

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

    if (error?.response?.status === 429 && error?.response?.data) {
      const retryAfterHeader = error.response?.headers?.['retry-after'];
      const retryAfter = Number.parseInt(retryAfterHeader, 10);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        const currentDetail = String(error.response.data.detail || 'Límite de solicitudes alcanzado').trim();
        if (!currentDetail.toLowerCase().includes('intenta de nuevo en')) {
          error.response.data.detail = `${currentDetail} Intenta de nuevo en ${retryAfter}s.`;
        }
      }
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshed = await runRefreshTokenFlow();
        originalRequest.headers.Authorization = `Bearer ${refreshed.access_token}`;
        return api(originalRequest);
      } catch {
        clearAuthStorage();
        redirectToLoginOnce();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
