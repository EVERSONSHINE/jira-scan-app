import { etapa, ORDEM } from '@/lib/etapas';

/** Chip de etapa: bolinha + nome, com fundo claro da cor da etapa */
export function EtapaChip({ status, curto = false }: { status: string; curto?: boolean }) {
  const e = etapa(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${e.claro}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.barra}`} aria-hidden />
      {curto ? e.curto : e.rotulo}
    </span>
  );
}

/**
 * Barra empilhada por etapa. Sempre acompanhada de números escritos: o cinza
 * do pendente e o âmbar ficam abaixo de 3:1 sobre o branco, e a cor sozinha
 * não pode carregar o dado. Segmentos separados por 2px da superfície.
 */
export function BarraEtapas({ porStatus, total, altura = 'h-2', className = '' }: {
  porStatus: Record<string, number>; total: number; altura?: string; className?: string;
}) {
  if (total === 0) return <div className={`${altura} rounded-full bg-elevado ${className}`} />;
  const presentes = ORDEM.filter((s) => porStatus[s]);
  return (
    <div className={`flex gap-[2px] ${altura} rounded-full overflow-hidden ${className}`} role="img"
      aria-label={presentes.map((s) => `${etapa(s).rotulo}: ${porStatus[s]}`).join(', ')}>
      {presentes.map((s) => (
        <div key={s} className={etapa(s).barra} style={{ flex: `${porStatus[s]} 1 0` }} />
      ))}
    </div>
  );
}
