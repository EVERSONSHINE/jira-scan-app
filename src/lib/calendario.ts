// Sem imports de ./jira: este módulo também roda no browser.

/**
 * Datas da fábrica. Tudo em horário de Brasília: a Vercel roda em UTC, e às
 * 22h de um dia 30 o servidor já está no mês seguinte.
 */
export const FUSO = 'America/Sao_Paulo';

/** "2026-11-17" no fuso da fábrica */
export function hojeISO(agora = new Date()): string {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}

/** "2026-11" */
export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

export function mesAtual(agora = new Date()): string {
  return mesDe(hojeISO(agora));
}

/** Mês anterior/seguinte de "2026-11" → "2026-10" / "2026-12" */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Último dia do mês: "2026-11" → "2026-11-30" */
export function fimDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return `${mes}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-11" → "novembro" */
export function nomeDoMes(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}

/** "2026-11" → "nov/26" */
export function mesCurto(mes: string): string {
  return `${nomeDoMes(mes).slice(0, 3)}/${mes.slice(2, 4)}`;
}

/** Diferença em dias corridos entre duas datas ISO (b − a) */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

// ─── Feriados ────────────────────────────────────────────────────────────────

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function somarDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Feriados nacionais + Carnaval e Corpus Christi (a fábrica para nesses dias).
 * Feriados locais entram pela variável FERIADOS_EXTRAS da Vercel, separados
 * por vírgula: "2026-12-24,2026-12-31".
 */
export function feriados(ano: number, extras: string[] = []): Set<string> {
  const p = pascoa(ano);
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']
    .map((md) => `${ano}-${md}`);
  return new Set([
    ...fixos,
    iso(somarDias(p, -48)), // Carnaval (segunda)
    iso(somarDias(p, -47)), // Carnaval (terça)
    iso(somarDias(p, -2)),  // Sexta-feira Santa
    iso(somarDias(p, 60)),  // Corpus Christi
    ...extras.filter((e) => e.startsWith(String(ano))),
  ]);
}

/** Dias úteis (segunda a sexta, sem feriado) de um mês, em ordem */
export function diasUteisDoMes(mes: string, extras: string[] = []): string[] {
  const ano = Number(mes.slice(0, 4));
  const fer = feriados(ano, extras);
  const out: string[] = [];
  const ultimo = Number(fimDoMes(mes).slice(8, 10));
  for (let dia = 1; dia <= ultimo; dia++) {
    const data = `${mes}-${String(dia).padStart(2, '0')}`;
    const dow = new Date(`${data}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6 && !fer.has(data)) out.push(data);
  }
  return out;
}

export interface DiasUteis {
  total: number;
  /** Já trabalhados, sem contar hoje */
  passados: number;
  hojeUtil: boolean;
  /** Que ainda dá para trabalhar, contando hoje */
  restantes: number;
}

export function contarDiasUteis(mes: string, hoje: string, extras: string[] = []): DiasUteis {
  const dias = diasUteisDoMes(mes, extras);
  const passados = dias.filter((d) => d < hoje).length;
  return {
    total: dias.length,
    passados,
    hojeUtil: dias.includes(hoje),
    restantes: dias.length - passados,
  };
}
