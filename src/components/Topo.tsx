'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import Icone from './Icone';

const ABAS = [
  { href: '/', nome: 'Leitura' },
  { href: '/quadros', nome: 'Localização' },
  { href: '/indicadores', nome: 'Indicadores' },
  { href: '/painel', nome: 'Painel TV' },
];

/** Alterna claro/escuro e lembra a escolha neste aparelho (como no CRM) */
function BotaoTema() {
  const alternar = () => {
    const html = document.documentElement;
    const escuroAgora = html.dataset.tema
      ? html.dataset.tema === 'escuro'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const novo = escuroAgora ? 'claro' : 'escuro';
    html.dataset.tema = novo;
    try { localStorage.setItem('producao:tema', JSON.stringify(novo)); } catch { /* sem armazenamento */ }
  };
  return (
    <button type="button" onClick={alternar} className="btn-icone" title="Alternar tema claro/escuro" aria-label="Alternar tema">
      <Icone nome="tema" />
    </button>
  );
}

/**
 * Barra do topo no padrão do Shine CRM: marca, abas das telas e ações à
 * direita. No celular as abas descem para uma segunda linha e rolam de lado.
 */
export default function Topo({ children }: { children?: React.ReactNode }) {
  const atual = usePathname();
  return (
    <header className="nao-imprimir bg-superficie border-b border-linha">
      <div className="mx-auto max-w-6xl px-4 sm:px-5 py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
        <Link href="/" className="flex items-center gap-2 h-10 shrink-0" aria-label="Shine Produção — início">
          <Logo className="h-[18px] w-auto text-tinta" />
          <span className="font-titulo text-[17px] font-bold text-acento">Produção</span>
        </Link>
        <nav aria-label="Telas" className="order-last w-full sm:order-none sm:w-auto flex gap-0.5 sm:gap-1 overflow-x-auto">
          {ABAS.map((a) => {
            const ativa = a.href === '/' ? atual === '/' : atual.startsWith(a.href);
            return (
              <Link
                key={a.href}
                href={a.href}
                aria-current={ativa ? 'page' : undefined}
                className={`shrink-0 rounded-lg px-2.5 sm:px-3.5 py-2 text-sm sm:text-[15px] font-semibold ${
                  ativa ? 'bg-acento-suave text-acento' : 'text-tinta-suave hover:bg-superficie-hover hover:text-tinta'
                }`}
              >
                {a.nome}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {children}
          <BotaoTema />
        </div>
      </div>
    </header>
  );
}
