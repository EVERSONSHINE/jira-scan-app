// Sem imports de ./jira: este módulo roda no browser (client components),
// e jira.ts usa Buffer/env no escopo do módulo.

/** Volta para "Aguardando expedição" 10 min após o épico ficar 100% expedido */
export const COMPLETE_IDLE_MS = 10 * 60_000;
/** ...ou 30 min sem nenhum novo quadro expedido (expedição parada no meio) */
export const INACTIVE_IDLE_MS = 30 * 60_000;

/** Resposta de /api/expedicao */
export interface ExpedicaoData {
  idle: boolean;
  subtask?: { key: string; summary: string };
  expeditedAt?: string | null;
  epic?: { key: string; summary: string; cliente: string; documento: string } | null;
  counts?: { total: number; expedido: number; porStatus: Record<string, number> } | null;
  pendentes?: { total: number; porLocal: Array<{ loc: string; total: number }> } | null;
  fetchedAt: string;
}

export interface ExpedicaoView {
  total: number;
  expedido: number;
  faltam: number;
  /** Todos os quadros do épico já expedidos */
  completo: boolean;
  pct: number;
  /** Expedição ociosa há tempo demais — a tela volta a "Aguardando" */
  stale: boolean;
  /** Mostrar o estado de espera em vez do épico em expedição */
  showIdle: boolean;
}

/**
 * Deriva o estado da tela de expedição. Uma só fonte para /expedicao e /painel:
 * as duas telas precisam concordar sobre "está expedindo agora".
 */
export function expedicaoView(data: ExpedicaoData | null, now = Date.now()): ExpedicaoView {
  const counts = data?.counts ?? null;
  const total = counts?.total ?? 0;
  const expedido = counts?.expedido ?? 0;
  const completo = total > 0 && expedido >= total;

  const expeditedMs = data?.expeditedAt ? new Date(data.expeditedAt).getTime() : NaN;
  const sinceLast = isNaN(expeditedMs) ? 0 : now - expeditedMs;
  const stale =
    !isNaN(expeditedMs) &&
    (sinceLast > INACTIVE_IDLE_MS || (completo && sinceLast > COMPLETE_IDLE_MS));

  return {
    total,
    expedido,
    faltam: Math.max(total - expedido, 0),
    completo,
    pct: total > 0 ? Math.round((expedido / total) * 100) : 0,
    stale,
    showIdle: !data || data.idle || stale,
  };
}

/** true = há expedição acontecendo agora (a TV deve mostrar a tela de expedição) */
export function expedicaoAtiva(data: ExpedicaoData | null, now = Date.now()): boolean {
  if (!data || data.idle) return false;
  return !expedicaoView(data, now).showIdle;
}
