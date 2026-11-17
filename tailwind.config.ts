import type { Config } from 'tailwindcss';

/**
 * Cinzas levemente puxados para o azul-marinho da marca (#120c30), no lugar
 * do slate padrão do Tailwind: o sistema inteiro herda o tom da Shine sem
 * trocar classe por classe. 500 é o cinza mais claro que ainda passa 4,5:1
 * sobre branco; 400 fica para bordas e ícones, nunca para texto.
 */
const slate = {
  50:  '#f7f7fa',
  100: '#efeef4',
  200: '#e3e2eb',
  300: '#cdcbda',
  400: '#9c9aaf',
  500: '#6b6982',
  600: '#53516a',
  700: '#3d3a55',
  800: '#25223f',
  900: '#16132e',
  950: '#0c0a20',
};

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        slate,
        brand: {
          DEFAULT: '#120c30',
          50:  '#f3f2f9',
          100: '#e9e7f3',
          200: '#d4d0e8',
          600: '#2b2552',
          700: '#1d1840',
          800: '#120c30',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(18 12 48 / 0.05)',
        pop:  '0 8px 24px -6px rgb(18 12 48 / 0.25), 0 2px 6px rgb(18 12 48 / 0.08)',
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translate(-50%, 8px)', filter: 'blur(2px)' },
          to:   { opacity: '1', transform: 'translate(-50%, 0)', filter: 'blur(0)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
