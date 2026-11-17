import type { Config } from 'tailwindcss';

/**
 * Cores por variável CSS (globals.css): a mesma linguagem do sistema de
 * Estoque — fundo #F7F8FA, superfície branca, texto #1A1D26, acento índigo.
 */
const v = (nome: string) => `rgb(var(--${nome}) / <alpha-value>)`;

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
        fundo: v('fundo'),
        superficie: v('superficie'),
        elevado: v('elevado'),
        linha: v('linha'),
        'linha-forte': v('linha-forte'),
        tinta: v('tinta'),
        suave: v('suave'),
        apagado: v('apagado'),
        acento: v('acento'),
        'acento-forte': v('acento-forte'),
        /** Azul-marinho do logo da Shine */
        marca: v('marca'),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        titulo: ['Outfit', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
