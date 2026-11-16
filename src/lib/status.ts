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
 * Como cada status aparece. Os mesmos nomes do Jira — os operadores conhecem
 * por eles —, só com o acento que o Jira não tem em "Concluido".
 */
export const STATUS_LABEL: Record<string, string> = {
  'Tarefas Pendentes': 'Tarefas Pendentes',
  'Em Andamento':      'Em Andamento',
  'Concluido':         'Concluído',
  'Expedido':          'Expedido',
  [OUTROS]:            'Outro',
};

export function statusLabel(raw: string): string {
  return STATUS_LABEL[canonicalStatus(raw)] ?? raw;
}

/**
 * Etiqueta de status: fundo suave + texto do mesmo tom, as cores do CRM
 * (neutro, atenção, sucesso, info). Funciona no tema claro e no escuro.
 */
export const STATUS_SELO: Record<string, string> = {
  'Tarefas Pendentes': 'bg-elevada text-tinta-suave',
  'Em Andamento':      'bg-atencao-bg text-atencao',
  'Concluido':         'bg-ok-bg text-ok',
  'Expedido':          'bg-info-bg text-info',
  [OUTROS]:            'bg-elevada text-tinta-suave',
};

export function statusSelo(raw: string): string {
  return STATUS_SELO[canonicalStatus(raw)] ?? STATUS_SELO[OUTROS];
}
