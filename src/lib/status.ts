// Sem imports de ./jira: este módulo também roda no browser (client components),
// e jira.ts usa Buffer/env no escopo do módulo.

/** Remove acentos e converte para minúsculas (cópia local de jira.ts) */
function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Statuses canônicos do fluxo de produção, na ordem do processo */
export const STATUS_ORDER = ['Tarefas Pendentes', 'Em Andamento', 'Concluido', 'Expedido'] as const;
export type CanonicalStatus = (typeof STATUS_ORDER)[number];

export const OUTROS = 'Outros';

/** Nomes alternativos usados em outros fluxos (épicos/tarefas usam "Aberto") */
const ALIASES: Record<string, string> = {
  aberto: 'Tarefas Pendentes',
};

/**
 * Casa o nome de status vindo do Jira com um canônico (ignora acento/caixa,
 * ex.: "Concluído" → "Concluido"; "Aberto" → "Tarefas Pendentes").
 * Desconhecidos viram "Outros" — contados, nunca descartados.
 */
export function canonicalStatus(raw: string): string {
  const n = normalize(raw);
  if (ALIASES[n]) return ALIASES[n];
  for (const s of STATUS_ORDER) {
    if (normalize(s) === n) return s;
  }
  return OUTROS;
}

/**
 * Como cada status aparece para as pessoas. O Jira guarda "Tarefas Pendentes"
 * e "Em Andamento"; na fábrica se fala pendente e em produção.
 */
export const STATUS_LABEL: Record<string, string> = {
  'Tarefas Pendentes': 'Pendente',
  'Em Andamento':      'Em produção',
  'Concluido':         'Concluído',
  'Expedido':          'Expedido',
  [OUTROS]:            'Outro',
};

export function statusLabel(raw: string): string {
  return STATUS_LABEL[canonicalStatus(raw)] ?? raw;
}

/** Selo de status: fundo claro + texto escuro do mesmo tom (≥ 7:1) */
export const STATUS_SELO: Record<string, string> = {
  'Tarefas Pendentes': 'bg-slate-200 text-slate-800',
  'Em Andamento':      'bg-amber-100 text-amber-900',
  'Concluido':         'bg-emerald-100 text-emerald-900',
  'Expedido':          'bg-blue-100 text-blue-900',
  [OUTROS]:            'bg-gray-200 text-gray-800',
};

export function statusSelo(raw: string): string {
  return STATUS_SELO[canonicalStatus(raw)] ?? STATUS_SELO[OUTROS];
}

/**
 * Cores de gráfico por status, validadas para contraste ≥ 3:1 e separação CVD
 * (scripts/validate_palette.js da skill dataviz). O cinza de "Tarefas Pendentes"
 * é intencional (estado neutro); todo gráfico acompanha legenda + números.
 *
 * Uma paleta só: painel da TV e desktop usam o mesmo tema claro, então o que
 * muda entre eles é a tipografia, não a cor.
 */
export const STATUS_CHART: Record<string, string> = {
  'Tarefas Pendentes': 'bg-slate-500',
  'Em Andamento':      'bg-amber-600',
  'Concluido':         'bg-emerald-600',
  'Expedido':          'bg-blue-600',
  [OUTROS]:            'bg-gray-400',
};
