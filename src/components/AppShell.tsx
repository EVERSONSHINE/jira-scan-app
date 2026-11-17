'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, LayoutDashboard, ScanLine, Truck, Tv, type LucideIcon } from 'lucide-react';
import Logo from './Logo';

interface NavItem { href: string; label: string; icon: LucideIcon; mobile: boolean }

const NAV: NavItem[] = [
  { href: '/',          label: 'Leitura',   icon: ScanLine,        mobile: true },
  { href: '/quadros',   label: 'Quadros',   icon: Boxes,           mobile: true },
  { href: '/resumo',    label: 'Resumo',    icon: LayoutDashboard, mobile: true },
  { href: '/expedicao', label: 'Expedição', icon: Truck,           mobile: true },
  // A TV abre o painel uma vez e fica nele; no celular não faz sentido
  { href: '/painel',    label: 'Painel TV', icon: Tv,              mobile: false },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * Estrutura das telas de uso: menu lateral no desktop, barra superior com o
 * logo e abas no rodapé no celular (alcance do polegar, uso com luva).
 * Telas de TV (painel, resumo?tv=1) não usam a estrutura: lá a tela é o conteúdo.
 */
export default function AppShell({
  title, actions, children, width = 'wide',
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  width?: 'narrow' | 'wide';
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Menu lateral — desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-slate-200 bg-white px-3 py-5 lg:flex">
        <Link href="/" className="mb-8 ml-3 block w-24 text-brand" aria-label="Início">
          <Logo className="w-full" />
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="Principal">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  on ? 'bg-brand-50 text-brand' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${on ? 'text-brand' : 'text-slate-400'}`} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-3 text-xs text-slate-500">Controle de produção · Jira</p>
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 lg:h-16 lg:px-8 ${width === 'narrow' ? 'max-w-xl lg:max-w-3xl' : 'max-w-7xl'}`}>
          <Link href="/" className="w-[72px] shrink-0 text-brand lg:hidden" aria-label="Início">
            <Logo className="w-full" />
          </Link>
          <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-slate-900 max-lg:border-l max-lg:border-slate-200 max-lg:pl-3 lg:text-lg">
            {title}
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
        </div>
      </header>

      <main className={`mx-auto px-4 pb-28 pt-4 lg:px-8 lg:pb-12 lg:pt-6 ${width === 'narrow' ? 'max-w-xl lg:max-w-3xl' : 'max-w-7xl'}`}>
        {children}
      </main>

      {/* Abas — celular */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {NAV.filter((n) => n.mobile).map(({ href, label, icon: Icon }) => {
            const on = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  on ? 'text-brand' : 'text-slate-500'
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.25 : 1.75} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Botão padrão do sistema. Primário em azul-marinho da marca. */
export function Button({
  variant = 'primary', size = 'md', className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
}) {
  const v = {
    primary:   'bg-brand text-white hover:bg-brand-600 active:bg-brand-700 shadow-card',
    secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 shadow-card',
    ghost:     'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  }[variant];
  const s = size === 'lg' ? 'h-14 px-5 text-base rounded-xl' : 'h-9 px-3.5 text-sm rounded-lg';
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 ${v} ${s} ${className}`}
    />
  );
}

/** Superfície padrão: cartão branco com borda fina. */
export function Panel({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-xl border border-slate-200 bg-white shadow-card ${className}`} />;
}
