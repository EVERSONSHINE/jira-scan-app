// Formatação em pt-BR. Sem imports de ./jira: roda no browser.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('pt-BR');

/** R$ 412.300 */
export const reais = (v: number | null | undefined) => (v === null || v === undefined ? '—' : brl.format(v));

/** R$ 412 mil · R$ 1,2 mi — para caber em pouco espaço */
export function reaisCurto(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (a >= 10_000) return `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`;
  return brl.format(v);
}

export const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : num.format(v));

export const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;

/** "2026-11-23" → "23/11" */
export function diaMes(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** "2026-11-23" → "23/11/26" */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export function diaSemana(iso: string): string {
  return DIAS_SEMANA[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()];
}

/** Prazo em palavras: "atrasada 3 dias", "hoje", "amanhã", "em 6 dias" */
export function prazoTexto(dias: number | null): string {
  if (dias === null) return 'sem data';
  if (dias < -1) return `atrasada ${-dias} dias`;
  if (dias === -1) return 'atrasada 1 dia';
  if (dias === 0) return 'entrega hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

export const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
