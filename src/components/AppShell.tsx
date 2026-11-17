'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icone from './Icone';

const ITENS = [
  { href: '/', rotulo: 'Leitura', icone: 'qr' },
  { href: '/quadros', rotulo: 'Quadros', icone: 'lista' },
  { href: '/indicadores', rotulo: 'Indicadores', icone: 'grafico' },
  { href: '/painel', rotulo: 'Painel TV', icone: 'tv' },
  { href: '/expedicao', rotulo: 'Expedição', icone: 'caminhao' },
];

/**
 * Moldura das telas de trabalho (não das telas de TV). Mesmo desenho do
 * sistema de Estoque: barra lateral a partir do tablet deitado, barra
 * inferior no celular — onde o polegar alcança.
 */
export default function AppShell({
  titulo, subtitulo, acoes, children, largura = 'max-w-6xl',
}: {
  titulo: string; subtitulo?: React.ReactNode; acoes?: React.ReactNode;
  children: React.ReactNode; largura?: string;
}) {
  const path = usePathname();
  const ativo = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <div className="min-h-[100dvh] lg:flex">
      {/* Lateral (tablet deitado e desktop) */}
      <aside className="nao-imprimir hidden lg:flex lg:flex-col w-60 shrink-0 bg-superficie border-r border-linha sticky top-0 h-[100dvh]">
        <div className="px-5 pt-5 pb-4 border-b border-linha">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-shine.svg" alt="Shine — Portas e janelas de PVC" className="h-11 w-auto" />
          <p className="rotulo mt-3">Controle de produção</p>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {ITENS.map((i) => (
            <Link key={i.href} href={i.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                ativo(i.href) ? 'bg-acento/10 text-acento' : 'text-suave hover:bg-elevado hover:text-tinta'
              }`}>
              <Icone nome={i.icone} className="w-[18px] h-[18px]" />
              {i.rotulo}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Cabeçalho */}
        <header className="nao-imprimir sticky top-0 z-20 bg-superficie/95 backdrop-blur border-b border-linha">
          <div className={`mx-auto ${largura} flex items-center gap-3 px-4 md:px-6 min-h-16 py-2`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-shine-nome.svg" alt="Shine" className="lg:hidden h-6 w-auto shrink-0 mr-1" />
            <div className="min-w-0 mr-auto">
              <h1 className="font-titulo font-bold text-lg md:text-xl leading-tight truncate">{titulo}</h1>
              {subtitulo && <p className="text-xs text-apagado truncate">{subtitulo}</p>}
            </div>
            {acoes}
          </div>
        </header>

        <main className={`flex-1 w-full mx-auto ${largura} px-4 md:px-6 pt-4 md:pt-6 pb-28 lg:pb-10`}>
          {children}
        </main>
      </div>

      {/* Barra inferior (celular e tablet em pé) */}
      <nav className="nao-imprimir lg:hidden fixed bottom-0 inset-x-0 z-30 bg-superficie/95 backdrop-blur border-t border-linha
        grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {ITENS.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-semibold ${
              ativo(i.href) ? 'text-acento' : 'text-apagado'
            }`}>
            <Icone nome={i.icone} className="w-[22px] h-[22px]" />
            {i.rotulo}
          </Link>
        ))}
      </nav>
    </div>
  );
}
