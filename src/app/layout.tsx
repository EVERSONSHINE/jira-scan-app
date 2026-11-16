import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible } from 'next/font/google';
import './globals.css';

/**
 * Atkinson Hyperlegible: desenhada pelo Braille Institute para baixa visão —
 * letras que não se confundem (I/l/1, O/0, B/8) e aberturas largas.
 */
const fonte = Atkinson_Hyperlegible({
  weight: ['400', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--fonte',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Shine Windows — Produção',
  description: 'Leitura de etiquetas, localização das peças e acompanhamento da produção',
};

// Sem maximumScale: quem enxerga pouco precisa poder ampliar com os dedos.
// O zoom automático do iPhone ao tocar num campo é evitado com letra ≥ 16px
// nos campos, não travando o zoom.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#120c30',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={fonte.variable}>
      <body className="bg-fundo text-tinta min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
