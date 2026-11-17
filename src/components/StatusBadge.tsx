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

/**
 * Botões de etapa da Leitura: cada um na cor da etapa, para o operador achar
 * pelo olho, de longe e de luva. A etapa atual fica cheia (texto branco num
 * tom 700, ≥ 4,5:1); as outras ficam claras com borda e texto da mesma cor.
 */
export const STAGE_BUTTON: Record<string, { idle: string; active: string }> = {
  'Tarefas Pendentes': { idle: 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200',       active: 'border-slate-600 bg-slate-600 text-white ring-slate-600' },
  'Em Andamento':      { idle: 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',         active: 'border-amber-700 bg-amber-700 text-white ring-amber-700' },
  'Concluido':         { idle: 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100', active: 'border-emerald-700 bg-emerald-700 text-white ring-emerald-700' },
  'Expedido':          { idle: 'border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100',             active: 'border-blue-700 bg-blue-700 text-white ring-blue-700' },
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
