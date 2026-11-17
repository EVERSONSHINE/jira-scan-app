import { searchAllIssues, normalize, cfValue, CF } from './jira';
import { canonicalStatus, STATUS_ORDER } from './status';

/**
 * Uma issue do projeto, já classificada no nível de domínio. A fonte de verdade
 * do nível é o campo Modelo (Projeto/Caixilho/Marco/Folha); o issue type só
 * decide quando o Modelo está vazio.
 */
export interface Row {
  key: string;
  summary: string;
  status: string;
  parentKey: string;
  modeloRaw: string;
  nivel: 'projeto' | 'caixilho' | 'quadro';
  tipo: string;
  modelo: string;
  loc: string;
  largura: string;
  altura: string;
  cor: string;
  cliente: string;
  documento: string;
  created: string;
  updated: string;
  /** Data de entrega (campo duedate do Jira) */
  duedate: string | null;
  /** Data de início da obra */
  inicio: string | null;
  /** Valor em R$; null quando não preenchido */
  valor: number | null;
}

/** Uma obra (Épico) com seus caixilhos e quadros */
export interface Obra {
  row: Row;
  caixilhos: Row[];
  quadros: Row[];
}

export interface Hierarquia {
  rows: Row[];
  obras: Obra[];
  /** Caixilhos sem projeto acima */
  orfaos: Row[];
}

const FIELDS = [
  'summary', 'status', 'issuetype', 'parent', 'created', 'updated', 'duedate',
  ...Object.values(CF),
];

function toRow(i: { key: string; fields: Record<string, unknown> }): Row {
  const f = i.fields;
  const issuetype = f.issuetype as { name?: string; subtask?: boolean } | undefined;
  const modeloRaw = cfValue(f, CF.modelo);
  const m = normalize(modeloRaw);
  const tipoIssue = normalize(issuetype?.name ?? '');
  let nivel: Row['nivel'];
  if (m === 'projeto') nivel = 'projeto';
  else if (m === 'caixilho') nivel = 'caixilho';
  else if (m === 'marco' || m === 'folha') nivel = 'quadro';
  else if (issuetype?.subtask) nivel = 'quadro';
  else if (tipoIssue === 'epic' || tipoIssue === 'epico') nivel = 'projeto';
  else nivel = 'caixilho';
  const valorRaw = f[CF.valor];
  return {
    key: i.key,
    summary: String((f.summary as string) ?? ''),
    status: canonicalStatus(String((f.status as { name?: string })?.name ?? '')),
    parentKey: String((f.parent as { key?: string })?.key ?? ''),
    modeloRaw,
    nivel,
    tipo: cfValue(f, CF.tipo),
    modelo: modeloRaw,
    loc: cfValue(f, CF.localizacao),
    largura: cfValue(f, CF.largura),
    altura: cfValue(f, CF.altura),
    cor: cfValue(f, CF.cor),
    cliente: cfValue(f, CF.cliente),
    documento: cfValue(f, CF.documento),
    created: String((f.created as string) ?? ''),
    updated: String((f.updated as string) ?? ''),
    duedate: (f.duedate as string | null) ?? null,
    inicio: (f[CF.inicio] as string | null) ?? null,
    valor: typeof valorRaw === 'number' && Number.isFinite(valorRaw) ? valorRaw : null,
  };
}

/**
 * Lê o projeto inteiro numa busca só (o que não foi arquivado) e monta a
 * árvore obra → caixilhos → quadros.
 */
export async function carregarHierarquia(project: string): Promise<Hierarquia> {
  const issues = await searchAllIssues(`project = "${project}" ORDER BY created ASC`, FIELDS);
  const rows = issues.map(toRow);

  const projetos = rows.filter((r) => r.nivel === 'projeto');
  const projetoKeys = new Set(projetos.map((p) => p.key));

  const quadrosPorCaixilho = new Map<string, Row[]>();
  for (const q of rows) {
    if (q.nivel !== 'quadro') continue;
    const l = quadrosPorCaixilho.get(q.parentKey) ?? [];
    l.push(q);
    quadrosPorCaixilho.set(q.parentKey, l);
  }
  const caixilhosPorProjeto = new Map<string, Row[]>();
  const orfaos: Row[] = [];
  for (const c of rows) {
    if (c.nivel !== 'caixilho') continue;
    if (projetoKeys.has(c.parentKey)) {
      const l = caixilhosPorProjeto.get(c.parentKey) ?? [];
      l.push(c);
      caixilhosPorProjeto.set(c.parentKey, l);
    } else {
      orfaos.push(c);
    }
  }

  const obras = projetos.map((p) => {
    const caixilhos = caixilhosPorProjeto.get(p.key) ?? [];
    return { row: p, caixilhos, quadros: caixilhos.flatMap((c) => quadrosPorCaixilho.get(c.key) ?? []) };
  });

  return { rows, obras, orfaos };
}

/** Contagem por status canônico, com as quatro etapas sempre presentes */
export function contarStatus(rows: Array<{ status: string }>): Record<string, number> {
  const porStatus: Record<string, number> = {};
  for (const s of STATUS_ORDER) porStatus[s] = 0;
  for (const r of rows) porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
  return porStatus;
}

export const pronto = (status: string) => status === 'Concluido' || status === 'Expedido';
