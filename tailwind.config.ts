import type { Config } from 'tailwindcss';

/**
 * Cores = variáveis CSS do globals.css, as mesmas do Shine CRM. O tema claro
 * e o escuro trocam os valores das variáveis; as classes não mudam.
 * (Por serem variáveis, modificadores de opacidade como bg-x/50 não valem.)
 */
const v = (nome: string) => `var(--${nome})`;

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
        fundo: v('bg'),
        superficie: { DEFAULT: v('surface'), hover: v('surface-hover') },
        elevada: { DEFAULT: v('surface-raised'), hover: v('surface-raised-hover') },
        linha: { DEFAULT: v('border'), forte: v('border-strong') },
        tinta: { DEFAULT: v('text-primary'), suave: v('text-secondary') },
        acento: { DEFAULT: v('accent'), forte: v('accent-strong'), hover: v('accent-strong-hover'), suave: v('accent-muted') },
        ok: { DEFAULT: v('success'), bg: v('success-bg') },
        atencao: { DEFAULT: v('warning'), bg: v('warning-bg') },
        perigo: { DEFAULT: v('danger'), bg: v('danger-bg') },
        info: { DEFAULT: v('info'), bg: v('info-bg') },
        roxo: { DEFAULT: v('purple'), bg: v('purple-bg') },
        serie: v('serie-1'),
        st: {
          pendente: v('st-pendente'),
          andamento: v('st-andamento'),
          concluido: v('st-concluido'),
          expedido: v('st-expedido'),
        },
      },
      fontFamily: {
        sans: [v('fonte-corpo'), 'system-ui', 'sans-serif'],
        titulo: [v('fonte-titulo'), 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm2: '8px',
        md2: '10px',
        lg2: '12px',
      },
      boxShadow: {
        cartao: v('shadow-card'),
        pop: v('shadow-pop'),
      },
    },
  },
  plugins: [],
};

export default config;
