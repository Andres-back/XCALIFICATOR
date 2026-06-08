import { useEffect, useState, useCallback, useLayoutEffect } from 'react';

const STORAGE_KEY = 'xcalificator-theme';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function hasUserPreference() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark';
}

/**
 * useTheme: gestiona el modo claro/oscuro con persistencia en localStorage.
 * - Lee la preferencia al montar (localStorage > prefers-color-scheme)
 * - Aplica la clase 'dark' al <html> en layoutEffect (sin FOUC)
 * - Solo escribe a localStorage cuando el usuario elige explícitamente
 * - Sincroniza con cambios del sistema SOLO si no hay preferencia del usuario
 */
export default function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme);

  // Aplicar ANTES del primer paint (evita flash de tema claro)
  useIsoLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Persistir solo cuando el usuario eligió explícitamente
  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark') return;
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Sync con sistema SOLO si no hay preferencia explícita del usuario
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      if (!hasUserPreference()) {
        setThemeState(e.matches ? 'dark' : 'light');
        // NO escribir a localStorage — el sistema es la fuente de verdad
      }
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return { theme, setTheme, toggleTheme };
}
