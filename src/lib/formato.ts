// Formatação compartilhada (roda no servidor e no navegador).
// Datas do Jira ("2026-11-23") são dias de calendário, sem fuso: toda conta
// de "hoje" usa o dia de Brasília, não o UTC do servidor da Vercel.

export const FUSO = 'America/Sao_Paulo';

/** "2026-11-16" — hoje em Brasília */
export function hojeISO(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}

/** Dia de calendário → número de dias desde 1970 (sem fuso) */
export function diaNum(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
}

/** Dias de `de` até `ate` (positivo = no futuro) */
export function diasEntre(de: string, ate: string): number {
  return diaNum(ate) - diaNum(de);
}

function partes(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

/** "23/11" */
export function dataCurta(iso: string | null): string {
  if (!iso) return '';
  return partes(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

/** "23/11/2026" */
export function dataLonga(iso: string | null): string {
  if (!iso) return '';
  return partes(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/** "SEG", "TER"… */
export function diaSemana(iso: string): string {
  return ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][partes(iso).getUTCDay()];
}

/** "novembro" */
export function nomeMes(iso: string): string {
  return partes(iso).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
}

/** "novembro" → "Novembro" (só a primeira letra; o CSS capitalize pegaria o "de" também) */
export const inicial = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 1 obra · 2 obras */
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "hoje", "amanhã", "em 4 dias", "atrasada 3 dias" */
export function prazoRelativo(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias > 1) return `em ${dias} dias`;
  if (dias === -1) return 'atrasada 1 dia';
  return `atrasada ${-dias} dias`;
}

/** "R$ 850.000" */
export function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** "R$ 850 mil", "R$ 1,2 mi" — para leitura de longe */
export function reaisCurto(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (abs >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString('pt-BR')} mil`;
  return reais(v);
}

export const nf = (n: number) => n.toLocaleString('pt-BR');

/** ULTI_MATT_BLACK → ULTI MATT BLACK */
export const legivel = (s: string) => s.replace(/_/g, ' ');

/** Medida do Jira ("990" ou "990.0") → "990". Sem ponto de milhar: na fábrica é "2049", não "2.049" */
export const mm = (v: string) =>
  v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1, useGrouping: false }) : '';

/** Nome da obra para exibir: o Cliente; sem ele, o resumo do Épico */
export function nomeObra(o: { cliente?: string; summary?: string; key: string }): string {
  return o.cliente || o.summary || o.key;
}
