import { searchAllIssues, cfValue, normalize, CF, jiraFetch } from './jira';
import { canonicalStatus } from './status';
import {
  hojeISO, mesAtual, mesDe, fimDoMes, contarDiasUteis, diasEntre, somarMeses,
  type DiasUteis,
} from './calendario';

/**
 * Modelo da produção a partir do Jira, compartilhado por Painel, Indicadores
 * e o relatório de Quadros. Hierarquia pelo campo Modelo:
 *   Projeto (Épico = obra) → Caixilho (Task) → Marco/Folha (Subtask = peça)
 *
 * "Produzido no mês" = peças que entraram em Concluido no mês. Toda peça passa
 * por Concluido antes de Expedido (conferido no Jira), então nada escapa.
 * O valor produzido de uma obra é proporcional às peças: Valor × feitas/total.
 */

/** Meta mensal de produção em R$. Ajustável na Vercel sem mexer no código. */
export const META_MENSAL = Number(process.env.META_MENSAL_PRODUCAO) || 850_000;

const FERIADOS_EXTRAS = (process.env.FERIADOS_EXTRAS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** Em Andamento sem nenhuma peça mexida há mais que isso = parada */
export const PARADO_DIAS = 7;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Peca {
  key: string; status: string; modelo: string; codigo: string;
  largura: string; altura: string; loc: string; updated: string;
}
export interface Caixilho {
  key: string; tipo: string; cor: string; status: string; pecas: Peca[];
}
export interface Obra {
  key: string; summary: string; cliente: string; documento: string;
  status: string; entrega: string | null; valor: number | null;
  created: string; updated: string; caixilhos: Caixilho[];
}

const PRONTO = new Set(['Concluido', 'Expedido']);
export const pronto = (status: string) => PRONTO.has(status);

// ─── Carga do Jira (com cache curto) ─────────────────────────────────────────

type Nivel = 'projeto' | 'caixilho' | 'peca';

/** Fonte de verdade: campo Modelo; issue type só quando vazio */
function nivelDe(modelo: string, issuetype?: { name?: string; subtask?: boolean }): Nivel {
  const m = normalize(modelo);
  if (m === 'projeto') return 'projeto';
  if (m === 'caixilho') return 'caixilho';
  if (m === 'marco' || m === 'folha') return 'peca';
  if (issuetype?.subtask) return 'peca';
  const t = normalize(issuetype?.name ?? '');
  if (t === 'epic' || t === 'epico') return 'projeto';
  return 'caixilho';
}

function numero(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && isFinite(Number(v))) return Number(v);
  return null;
}

async function carregarObras(project: string): Promise<Obra[]> {
  const fields = [
    'summary', 'status', 'issuetype', 'parent', 'updated', 'created', 'duedate',
    ...Object.values(CF),
  ];
  // Projeto inteiro: só o que não foi arquivado. Teto alto porque obras
  // expedidas ficam vivas até o fechamento do mês (lib/arquivo.ts)
  const issues = await searchAllIssues(`project = "${project}" ORDER BY key ASC`, fields, {
    maxPaginas: 80,
  });

  const obras = new Map<string, Obra>();
  const caixilhos = new Map<string, Caixilho & { parent: string }>();
  const pecas: Array<Peca & { parent: string }> = [];

  for (const i of issues) {
    const f = i.fields;
    const modelo = cfValue(f, CF.modelo);
    const nivel = nivelDe(modelo, f.issuetype as { name?: string; subtask?: boolean });
    const status = canonicalStatus(String((f.status as { name?: string })?.name ?? ''));
    const parent = String((f.parent as { key?: string })?.key ?? '');
    if (nivel === 'projeto') {
      obras.set(i.key, {
        key: i.key,
        summary: String(f.summary ?? ''),
        cliente: cfValue(f, CF.cliente),
        documento: cfValue(f, CF.documento),
        status,
        entrega: (f.duedate as string | null) ?? null,
        valor: numero(f[CF.valor]),
        created: String(f.created ?? ''),
        updated: String(f.updated ?? ''),
        caixilhos: [],
      });
    } else if (nivel === 'caixilho') {
      caixilhos.set(i.key, {
        key: i.key, parent, status,
        tipo: cfValue(f, CF.tipo),
        cor: cfValue(f, CF.cor),
        pecas: [],
      });
    } else {
      pecas.push({
        key: i.key, parent, status,
        modelo,
        codigo: cfValue(f, CF.codigo),
        largura: cfValue(f, CF.largura),
        altura: cfValue(f, CF.altura),
        loc: cfValue(f, CF.localizacao),
        updated: String(f.updated ?? ''),
      });
    }
  }

  for (const { parent, ...p } of pecas) caixilhos.get(parent)?.pecas.push(p);
  for (const { parent, ...c } of caixilhos.values()) obras.get(parent)?.caixilhos.push(c);
  return [...obras.values()];
}

/** Chaves que entraram em Concluido no mês (peças e caixilhos) */
async function concluidosNoMes(project: string, mes: string): Promise<Set<string>> {
  const fim = mes === mesAtual() ? 'now()' : `"${fimDoMes(mes)} 23:59"`;
  const rows = await searchAllIssues(
    `project = "${project}" AND status CHANGED TO "Concluido" DURING ("${mes}-01", ${fim})`,
    ['status'],
    { maxPaginas: 50 },
  );
  return new Set(rows.map((r) => r.key));
}

/** Obras (Épicos) que foram para Expedido no mês */
async function entreguesNoMes(project: string, mes: string): Promise<Set<string>> {
  const fim = mes === mesAtual() ? 'now()' : `"${fimDoMes(mes)} 23:59"`;
  const rows = await searchAllIssues(
    `project = "${project}" AND issuetype = Epic AND status CHANGED TO "Expedido" DURING ("${mes}-01", ${fim})`,
    ['status'],
  );
  return new Set(rows.map((r) => r.key));
}

/** Peças expedidas no mês (contagem aproximada do Jira; null se falhar) */
async function pecasExpedidasNoMes(project: string): Promise<number | null> {
  try {
    const r = await jiraFetch('/rest/api/3/search/approximate-count', {
      method: 'POST',
      body: JSON.stringify({
        jql: `project = "${project}" AND issuetype in subTaskIssueTypes() AND status CHANGED TO "Expedido" DURING (startOfMonth(), now())`,
      }),
    });
    return typeof r?.count === 'number' ? r.count : null;
  } catch {
    return null;
  }
}

export interface Base {
  obras: Obra[];
  mes: string;
  hoje: string;
  concluidos: Set<string>;
  entregues: Set<string>;
  pecasExpedidasMes: number | null;
  carregadoEm: string;
}

let cache: { at: number; base: Promise<Base> } | null = null;
/** TV, celulares e diretoria batem na mesma carga: segura 20s no lambda quente */
const CACHE_MS = 20_000;

export function carregarBase(project: string): Promise<Base> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.base;
  const mes = mesAtual();
  const base = (async (): Promise<Base> => {
    const [obras, concluidos, entregues, pecasExpedidasMes] = await Promise.all([
      carregarObras(project),
      concluidosNoMes(project, mes),
      entreguesNoMes(project, mes).catch(() => new Set<string>()),
      pecasExpedidasNoMes(project),
    ]);
    return {
      obras, mes, hoje: hojeISO(), concluidos, entregues, pecasExpedidasMes,
      carregadoEm: new Date().toISOString(),
    };
  })();
  cache = { at: Date.now(), base };
  // Falhou: não guarda o erro, a próxima chamada tenta de novo
  base.catch(() => { if (cache?.base === base) cache = null; });
  return base;
}

/** Carga sem cache para um mês fechado (usada pelo fechamento mensal) */
export async function carregarMesFechado(project: string, mes: string) {
  const [obras, concluidos, entregues] = await Promise.all([
    carregarObras(project),
    concluidosNoMes(project, mes),
    entreguesNoMes(project, mes),
  ]);
  return { obras, concluidos, entregues };
}

// ─── Cálculos (puros) ────────────────────────────────────────────────────────

export const todasPecas = (o: Obra) => o.caixilhos.flatMap((c) => c.pecas);

export interface ProducaoMes {
  valor: number;
  pecas: number;
  caixilhos: number;
  /** Obras que produziram no mês mas estão sem Valor no Jira */
  obrasSemValor: number;
  porObra: Array<{ key: string; cliente: string; valor: number | null; pecas: number; caixilhos: number }>;
}

/** Valor proporcional às peças concluídas no mês em cada obra */
export function producaoDoMes(obras: Obra[], concluidos: Set<string>): ProducaoMes {
  const out: ProducaoMes = { valor: 0, pecas: 0, caixilhos: 0, obrasSemValor: 0, porObra: [] };
  for (const o of obras) {
    const pecas = todasPecas(o);
    // Só conta o que continua pronto: uma peça que voltou de status não foi produzida
    const feitas = pecas.filter((p) => concluidos.has(p.key) && pronto(p.status)).length;
    const cx = o.caixilhos.filter((c) => concluidos.has(c.key) && pronto(c.status)).length;
    if (feitas === 0 && cx === 0) continue;
    const valor = o.valor !== null && pecas.length > 0 ? (o.valor * feitas) / pecas.length : null;
    out.pecas += feitas;
    out.caixilhos += cx;
    if (valor === null) out.obrasSemValor++;
    else out.valor += valor;
    out.porObra.push({ key: o.key, cliente: o.cliente || o.summary, valor, pecas: feitas, caixilhos: cx });
  }
  out.valor = Math.round(out.valor * 100) / 100;
  out.porObra.sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1));
  return out;
}

export interface MetaMes {
  mes: string;
  meta: number;
  produzido: number;
  pct: number;
  /** Quanto já deveria estar produzido ao fim de hoje, no ritmo da meta */
  esperadoHoje: number;
  faltam: number;
  /** R$ por dia útil que ainda falta, contando hoje */
  porDiaNecessario: number | null;
  /** Fechamento do mês no ritmo atual */
  projecao: number | null;
  dias: DiasUteis;
}

export function metaDoMes(mes: string, hoje: string, produzido: number, meta = META_MENSAL): MetaMes {
  const dias = contarDiasUteis(mes, hoje, FERIADOS_EXTRAS);
  const ateHoje = dias.passados + (dias.hojeUtil ? 1 : 0);
  const faltam = Math.max(meta - produzido, 0);
  // Meio dia de hoje: a produção de hoje já está no numerador
  const decorridos = dias.passados + (dias.hojeUtil ? 0.5 : 0);
  return {
    mes, meta, produzido,
    pct: meta > 0 ? Math.round((produzido / meta) * 1000) / 10 : 0,
    esperadoHoje: dias.total > 0 ? Math.round((meta * ateHoje) / dias.total) : 0,
    faltam,
    porDiaNecessario: dias.restantes > 0 ? Math.round(faltam / dias.restantes) : null,
    projecao: decorridos >= 1 ? Math.round((produzido / decorridos) * dias.total) : null,
    dias,
  };
}

/** Etapa da obra pelas peças (o status do Épico pode estar defasado) */
export function etapaDaObra(o: Obra): string {
  const pecas = todasPecas(o);
  if (pecas.length === 0) return o.status;
  if (pecas.every((p) => p.status === 'Expedido')) return 'Expedido';
  if (pecas.every((p) => pronto(p.status))) return 'Concluido';
  if (pecas.some((p) => p.status !== 'Tarefas Pendentes')) return 'Em Andamento';
  return 'Tarefas Pendentes';
}

export interface ObraResumo {
  key: string; cliente: string; summary: string; documento: string;
  etapa: string; entrega: string | null;
  /** Dias até a entrega (negativo = atrasada) */
  diasParaEntrega: number | null;
  valor: number | null;
  /** Valor que ainda falta produzir (proporcional às peças) */
  valorPendente: number | null;
  caixilhos: { total: number; prontos: number };
  pecas: { total: number; prontas: number; porStatus: Record<string, number> };
  pct: number;
  /** Onde estão as peças ainda não expedidas */
  locais: string[];
  ultimaMov: string | null;
  diasSemMov: number | null;
  parada: boolean;
  atrasada: boolean;
}

export function resumirObra(o: Obra, hoje: string): ObraResumo {
  const pecas = todasPecas(o);
  const porStatus: Record<string, number> = {};
  for (const p of pecas) porStatus[p.status] = (porStatus[p.status] ?? 0) + 1;
  const prontas = pecas.filter((p) => pronto(p.status)).length;
  const etapa = etapaDaObra(o);
  const ultimaMov = pecas.reduce((acc, p) => (p.updated > acc ? p.updated : acc), '') || o.updated || null;
  const diasSemMov = ultimaMov ? Math.max(diasEntre(hojeISO(new Date(ultimaMov)), hoje), 0) : null;
  const diasParaEntrega = o.entrega ? diasEntre(hoje, o.entrega) : null;
  const pctPecas = pecas.length > 0 ? prontas / pecas.length : pronto(etapa) ? 1 : 0;
  return {
    key: o.key,
    cliente: o.cliente || o.summary,
    summary: o.summary,
    documento: o.documento,
    etapa,
    entrega: o.entrega,
    diasParaEntrega,
    valor: o.valor,
    valorPendente: o.valor !== null ? Math.round(o.valor * (1 - pctPecas)) : null,
    caixilhos: {
      total: o.caixilhos.length,
      prontos: o.caixilhos.filter((c) => pronto(c.status)).length,
    },
    pecas: { total: pecas.length, prontas, porStatus },
    pct: Math.round(pctPecas * 100),
    locais: [...new Set(pecas.filter((p) => p.status !== 'Expedido').map((p) => p.loc).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    ultimaMov,
    diasSemMov,
    parada: etapa === 'Em Andamento' && diasSemMov !== null && diasSemMov > PARADO_DIAS,
    atrasada: diasParaEntrega !== null && diasParaEntrega < 0 && etapa !== 'Expedido',
  };
}

/** Prazo mais próximo primeiro; sem data no fim, pela chave */
export function porEntrega(a: ObraResumo, b: ObraResumo): number {
  if (a.entrega && b.entrega) return a.entrega.localeCompare(b.entrega) || chaveNum(a.key) - chaveNum(b.key);
  if (a.entrega) return -1;
  if (b.entrega) return 1;
  return chaveNum(a.key) - chaveNum(b.key);
}

function chaveNum(k: string): number {
  return Number(k.split('-')[1] ?? 0);
}

export interface Carga {
  /** "atrasadas", "2026-11", …, "sem-data" */
  grupo: string;
  obras: number;
  caixilhos: number;
  caixilhosProntos: number;
  valor: number;
  valorPendente: number;
  obrasSemValor: number;
}

/**
 * Carteira por mês de entrega: o que tem que sair de cada mês. Obras atrasadas
 * num grupo próprio (são o primeiro problema), as sem data no fim.
 */
export function cargaPorMes(obras: ObraResumo[], mes: string, mesesAFrente = 3): Carga[] {
  const grupos = ['atrasadas', ...Array.from({ length: mesesAFrente + 1 }, (_, i) => somarMeses(mes, i)), 'depois', 'sem-data'];
  const mapa = new Map<string, Carga>(grupos.map((g) => [g, {
    grupo: g, obras: 0, caixilhos: 0, caixilhosProntos: 0, valor: 0, valorPendente: 0, obrasSemValor: 0,
  }]));
  const ultimo = somarMeses(mes, mesesAFrente);
  for (const o of obras) {
    if (o.etapa === 'Expedido') continue;
    const g = o.atrasada ? 'atrasadas'
      : !o.entrega ? 'sem-data'
      : mesDe(o.entrega) < mes ? 'atrasadas'
      : mesDe(o.entrega) > ultimo ? 'depois'
      : mesDe(o.entrega);
    const c = mapa.get(g)!;
    c.obras++;
    c.caixilhos += o.caixilhos.total;
    c.caixilhosProntos += o.caixilhos.prontos;
    if (o.valor === null) c.obrasSemValor++;
    else { c.valor += o.valor; c.valorPendente += o.valorPendente ?? 0; }
  }
  return grupos.map((g) => mapa.get(g)!).filter((c) => c.obras > 0 || /^\d{4}-\d{2}$/.test(c.grupo));
}
