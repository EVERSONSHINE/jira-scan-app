// Formatação em pt-BR, usada no browser e no servidor

const brlInteiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** R$ 612.400 */
export function brl(n: number): string {
  return brlInteiro.format(Math.round(n));
}

/** R$ 612 mil · R$ 1,2 mi — para eixos e blocos apertados */
export function brlCurto(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `R$ ${Math.round(n / 1_000).toLocaleString('pt-BR')} mil`;
  return brl(n);
}

export function num(n: number): string {
  return n.toLocaleString('pt-BR');
}

/** "AAAA-MM-DD" → "18/12" */
export function diaMes(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-11" → "novembro" */
export function nomeMes(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}

/** "2026-11" → "nov" */
export function mesCurto(mes: string): string {
  return nomeMes(mes).slice(0, 3);
}

/** Prazo relativo: "hoje", "amanhã", "em 5 dias", "atrasada 3 dias" */
export function prazoRelativo(dias: number | null): string {
  if (dias === null) return 'sem data';
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias > 1) return `em ${dias} dias`;
  return dias === -1 ? 'atrasada 1 dia' : `atrasada ${-dias} dias`;
}

/** "1 obra", "3 obras" */
export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
