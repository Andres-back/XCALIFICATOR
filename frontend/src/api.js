import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';
let refreshPromise = null;
let isRedirectingToLogin = false;

const clearAuthStorage = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
};

const redirectToLoginOnce = () => {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  window.location.href = '/login';
};

const runRefreshTokenFlow = async () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        if (res.data?.user) {
          localStorage.setItem('user', JSON.stringify(res.data.user));
        }
        return res.data;
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
    return parsed || 'Error de validacion';
  }
  if (detail && typeof detail === 'object') {
    return detail.msg || detail.detail || detail.message || JSON.stringify(detail);
  }
  return 'Error inesperado';
};

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

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
        const currentDetail = String(error.response.data.detail || 'Limite de solicitudes alcanzado').trim();
        if (!currentDetail.toLowerCase().includes('intenta de nuevo en')) {
          error.response.data.detail = `${currentDetail} Intenta de nuevo en ${retryAfter}s.`;
        }
      }
    }

    const url = String(originalRequest?.url || '');
    const isAuthEndpoint = url.includes('/auth/login')
      || url.includes('/auth/register')
      || url.includes('/auth/refresh');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        await runRefreshTokenFlow();
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
