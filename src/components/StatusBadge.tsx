import { canonicalStatus, stageLabel } from '@/lib/status';

/**
 * Selo de etapa. Mesmo vocabulário do painel: cinza = pendente, âmbar =
 * produção, verde = concluído, azul = expedido. Fundo suave, texto um passo
 * escuro (≥ 4,5:1) e o ponto na cor cheia da etapa.
 */
const BADGE: Record<string, string> = {
  'Tarefas Pendentes': 'bg-slate-100 text-slate-700',
  'Em Andamento':      'bg-amber-50 text-amber-800',
  'Concluido':         'bg-emerald-50 text-emerald-800',
  'Expedido':          'bg-blue-50 text-blue-800',
};

export const STAGE_DOT: Record<string, string> = {
  'Tarefas Pendentes': 'bg-slate-500',
  'Em Andamento':      'bg-amber-600',
  'Concluido':         'bg-emerald-600',
  'Expedido':          'bg-blue-600',
};

export function StageDot({ status, className = 'h-2 w-2' }: { status: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${STAGE_DOT[canonicalStatus(status)] ?? 'bg-slate-400'} ${className}`}
    />
  );
}

export default function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const c = canonicalStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${BADGE[c] ?? 'bg-slate-100 text-slate-700'} ${
        size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <StageDot status={status} className="h-1.5 w-1.5" />
      {stageLabel(status)}
    </span>
  );
}
