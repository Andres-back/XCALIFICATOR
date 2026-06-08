/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/index.css",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Brand: naranja mango (CTA principal, energía, aprendizaje) ─
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // ── Accent: indigo (confianza, seriedad institucional) ───────
        accent: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // ── Brand / shared primary ────────────────────────────────────
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // ── Role: Administrador (violet/purple) ───────────────────────
        admin: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // ── Role: Profesor (indigo) ────────────────────────────────────
        profesor: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // ── Role: Estudiante (emerald/teal) ───────────────────────────
        estudiante: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // ── Semantic surfaces ──────────────────────────────────────────
        surface: {
          DEFAULT: '#f8fafc',
          card:    '#ffffff',
          muted:   '#f1f5f9',
          border:  '#e2e8f0',
        },
      },

      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },

      boxShadow: {
        'card':     '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card-md':  '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)',
        'card-lg':  '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08)',
        'inner-sm': 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'glow-blue':    '0 0 0 3px rgb(59 130 246 / 0.15)',
        'glow-violet':  '0 0 0 3px rgb(139 92 246 / 0.15)',
        'glow-indigo':  '0 0 0 3px rgb(99 102 241 / 0.15)',
        'glow-emerald': '0 0 0 3px rgb(16 185 129 / 0.15)',
      },

      borderRadius: {
        '4xl': '2rem',
      },

      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-left': {
          '0%':   { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up':       'fade-up 0.3s ease-out',
        'fade-in':       'fade-in 0.25s ease-out',
        'slide-in-left': 'slide-in-left 0.2s ease-out',
        'scale-in':      'scale-in 0.2s ease-out',
        'shimmer':       'shimmer 1.5s linear infinite',
      },

      backgroundImage: {
        'admin-gradient':      'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)',
        'profesor-gradient':   'linear-gradient(135deg, #4f46e5 0%, #4338ca 50%, #3730a3 100%)',
        'estudiante-gradient': 'linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%)',
        'brand-gradient':      'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
        'shimmer-gradient':    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
      },
    },
  },
  plugins: [],
};
