import Link from 'next/link';
import Logo from './Logo';
import Icone from './Icone';

/**
 * Barra das telas de gestão (localização, indicadores, telas). Logo à
 * esquerda, título, e um caminho de volta sempre visível — nenhuma tela deixa
 * a pessoa presa.
 */
export default function CabecalhoGestao({
  titulo,
  voltarPara = '/telas',
  voltarTexto = 'Telas',
  children,
}: {
  titulo: string;
  voltarPara?: string;
  voltarTexto?: string;
  /** Ações à direita (ex.: Imprimir) */
  children?: React.ReactNode;
}) {
  return (
    <header className="nao-imprimir bg-marca text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-5 min-h-16">
        <Link
          href={voltarPara}
          className="flex items-center gap-1.5 rounded-lg px-2 -ml-2 py-2 text-base font-bold text-marca-100 hover:bg-white/10"
        >
          <Icone nome="voltar" className="w-5 h-5" />
          {voltarTexto}
        </Link>
        <span className="h-7 w-px bg-white/25" aria-hidden />
        {/* No celular o título vale mais que o logo: sem espaço para os dois */}
        <Logo className="hidden sm:block h-7 w-auto shrink-0" />
        <h1 className="min-w-0 text-lg sm:text-xl font-bold leading-tight">{titulo}</h1>
        {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
