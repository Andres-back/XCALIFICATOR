import { create } from 'zustand';
import api from './api';

function safeParseUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

const useAuthStore = create((set) => ({
  user: safeParseUser(),
  isAuthenticated: !!safeParseUser(),
  loading: false,

  login: async (correo, password) => {
    set({ loading: true });
    try {
      const res = await api.post('/auth/login', { correo, password });
      const { user } = res.data;
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true, loading: false });
      return user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (data) => {
    set({ loading: true });
    try {
      const res = await api.post('/auth/register', data);
      const { user } = res.data;
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true, loading: false });
      return user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
    ['access_token', 'refresh_token', 'user'].forEach((k) => localStorage.removeItem(k));
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    set({ user: userData });
  },
}));

export default useAuthStore;
