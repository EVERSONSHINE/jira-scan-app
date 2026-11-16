import type { Config } from 'tailwindcss';

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
        // Azul-marinho do logo (#120c30) e os tons que saem dele
        marca: {
          DEFAULT: '#120c30',
          800: '#1d1647',
          700: '#2b2363',
          600: '#3d3480',
          200: '#d6d3e8',
          100: '#e9e7f3',
          50: '#f4f3f9',
        },
        // Fundo levemente quente: menos ofuscante que branco puro no galpão
        fundo: '#f3f2ee',
        // Texto: o próprio marinho da marca (15:1 sobre branco)
        tinta: {
          DEFAULT: '#120c30',
          // Texto secundário — 8,9:1 sobre branco, 8:1 sobre o fundo
          suave: '#47435c',
        },
        linha: '#d8d6e0',
      },
      fontFamily: {
        sans: ['var(--fonte)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
