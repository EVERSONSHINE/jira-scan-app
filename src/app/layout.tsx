import type { Metadata, Viewport } from 'next';
import { Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// As fontes do Shine CRM: Outfit nos títulos, Plus Jakarta Sans no texto
const titulo = Outfit({
  weight: ['500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--fonte-titulo',
  display: 'swap',
});
const corpo = Plus_Jakarta_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--fonte-corpo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Shine Produção',
  description: 'Leitura de etiquetas, localização das peças e acompanhamento da produção',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Aplica o tema salvo antes de desenhar a página, para não piscar (igual ao
 * CRM). Sem escolha salva, o CSS segue o tema do aparelho.
 */
const TEMA = `(function(){try{var t=JSON.parse(localStorage.getItem('producao:tema'));if(t)document.documentElement.dataset.tema=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${corpo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
