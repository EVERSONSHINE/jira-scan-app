// Contas da produção: meta do mês, obras abertas, prazo e ritmo.
// Servidor apenas (usa jira.ts). Os tipos de saída ficam em tipos.ts.

import { searchAllIssues, cfValue, CF, normalize, contarAprox, emLotes, jiraFetch, type JiraIssueLite } from './jira';
import { canonicalStatus } from './status';
import { diaNum, diasEntre, hojeISO, nomeMes } from './formato';
import type {
  ContagemCaixilhos, FechamentoMes, MesTrimestre, MetaMes, ObraProd, PrazoMes, SemanaProd, Trimestre,
} from './tipos';

/** Meta de faturamento do mês. Fixa por enquanto; a variável permite trocar sem mexer no código */
export const META_MENSAL = Number(process.env.META_MENSAL_VALOR) || 850_000;

const projeto = () => process.env.JIRA_PROJECT_KEY ?? '';

// ─── Calendário ──────────────────────────────────────────────────────────────

export const inicioMes = (iso: string) => `${iso.slice(0, 7)}-01`;

export function fimMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Primeiro dia do mês `n` meses antes/depois */
export function somarMeses(iso: string, n: number): string {
  const [a, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
}

export function somarDias(iso: string, n: number): string {
  return new Date((diaNum(iso) + n) * 86_400_000).toISOString().slice(0, 10);
}

const diaDaSemana = (iso: string) => new Date(diaNum(iso) * 86_400_000).getUTCDay();
export const ehUtil = (iso: string) => { const d = diaDaSemana(iso); return d >= 1 && d <= 5; };

/**
 * Dias úteis (segunda a sexta) do mês de `hoje`. Feriados não entram: a conta
 * erra para o lado de pedir um pouco menos por dia, nunca mais.
 * `passados` não inclui hoje — o dia ainda está acontecendo.
 */
export function diasUteisDoMes(hoje: string) {
  let total = 0, passados = 0;
  for (let d = inicioMes(hoje); d <= fimMes(hoje); d = somarDias(d, 1)) {
    if (!ehUtil(d)) continue;
    total++;
    if (d < hoje) passados++;
  }
  return { total, passados, restantes: total - passados };
}

/** Segunda-feira da semana de `iso` */
export function segunda(iso: string): string {
  const d = diaDaSemana(iso);
  return somarDias(iso, d === 0 ? -6 : 1 - d);
}

// ─── Leitura do Jira ─────────────────────────────────────────────────────────

const statusDe = (i: JiraIssueLite) =>
  canonicalStatus(String((i.fields.status as { name?: string })?.name ?? ''));
const paiDe = (i: JiraIssueLite) => String((i.fields.parent as { key?: string })?.key ?? '');

/** Filhos diretos, em blocos de 50 chaves (URL tem limite) */
async function filhosDe(keys: string[], fields: string[], filtro = ''): Promise<JiraIssueLite[]> {
  const out: JiraIssueLite[] = [];
  for (let i = 0; i < keys.length; i += 50) {
    out.push(...await searchAllIssues(
      `parent in (${keys.slice(i, i + 50).join(',')})${filtro ? ` AND ${filtro}` : ''}`,
      fields,
    ));
  }
  return out;
}

/** Caixilho é quem tem Modelo = Caixilho; sem Modelo, qualquer filho que não seja subtarefa */
function ehCaixilho(i: JiraIssueLite): boolean {
  const m = normalize(cfValue(i.fields, CF.modelo));
  if (m) return m === 'caixilho';
  return !(i.fields.issuetype as { subtask?: boolean } | undefined)?.subtask;
}

async function buscarEpicos(jql: string, fields: string[]) {
  // O tipo pode se chamar "Epic" ou "Épico" conforme o idioma da instância
  try {
    return await searchAllIssues(jql.replace('{EPICO}', 'Epic'), fields);
  } catch {
    return await searchAllIssues(jql.replace('{EPICO}', 'Épico'), fields);
  }
}

function valorDe(i: JiraIssueLite): number | null {
  const v = Number(cfValue(i.fields, CF.valor));
  return Number.isFinite(v) && v > 0 ? v : null;
}

const vazio = (): ContagemCaixilhos => ({ total: 0, prontos: 0, emProducao: 0, pendentes: 0 });

/**
 * Obras que importam para a produção: todas as não expedidas e todas com
 * entrega a partir de `desde` (inclusive as já expedidas, que contam na meta).
 * Caixilhos só das abertas e das do mês corrente; locais só se pedidos.
 */
export async function carregarObras(
  { desde, comLocais }: { desde: string; comLocais: boolean },
): Promise<{ hoje: string; obras: ObraProd[] }> {
  const hoje = hojeISO();
  const mes = inicioMes(hoje);
  const epicos = await buscarEpicos(
    `project = "${projeto()}" AND issuetype = {EPICO} AND (status != "Expedido" OR duedate >= "${desde}") ORDER BY duedate ASC`,
    ['summary', 'status', 'duedate', CF.cliente, CF.documento, CF.valor],
  );

  const precisaCaixilhos = epicos.filter((e) => {
    const due = (e.fields.duedate as string | null) ?? '';
    return statusDe(e) !== 'Expedido' || (due >= mes && due <= fimMes(hoje));
  });
  const filhos = precisaCaixilhos.length
    ? await filhosDe(precisaCaixilhos.map((e) => e.key), ['status', 'parent', 'issuetype', CF.modelo])
    : [];
  const caixilhos = filhos.filter(ehCaixilho);

  // Onde estão as peças que ainda não saíram: só das obras abertas
  const locaisPorCaixilho = new Map<string, Set<string>>();
  if (comLocais) {
    const abertos = caixilhos.filter((c) => statusDe(c) !== 'Expedido').map((c) => c.key);
    const pecas = abertos.length
      ? await filhosDe(abertos, ['parent', CF.localizacao], 'status != "Expedido"')
      : [];
    for (const p of pecas) {
      const loc = cfValue(p.fields, CF.localizacao);
      if (!loc) continue;
      const s = locaisPorCaixilho.get(paiDe(p)) ?? new Set<string>();
      s.add(loc);
      locaisPorCaixilho.set(paiDe(p), s);
    }
  }

  const porObra = new Map<string, { cont: ContagemCaixilhos; locais: Set<string> }>();
  for (const c of caixilhos) {
    const o = porObra.get(paiDe(c)) ?? { cont: vazio(), locais: new Set<string>() };
    const st = statusDe(c);
    o.cont.total++;
    if (st === 'Concluido' || st === 'Expedido') o.cont.prontos++;
    else if (st === 'Em Andamento') o.cont.emProducao++;
    else o.cont.pendentes++;
    for (const l of locaisPorCaixilho.get(c.key) ?? []) o.locais.add(l);
    porObra.set(paiDe(c), o);
  }

  const obras: ObraProd[] = epicos.map((e) => {
    const duedate = (e.fields.duedate as string | null) ?? null;
    const o = porObra.get(e.key);
    return {
      key: e.key,
      nome: cfValue(e.fields, CF.cliente) || String(e.fields.summary ?? e.key),
      documento: cfValue(e.fields, CF.documento),
      duedate,
      status: statusDe(e),
      valor: valorDe(e),
      caixilhos: o?.cont ?? vazio(),
      locais: [...(o?.locais ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
      dias: duedate ? diasEntre(hoje, duedate) : null,
    };
  });
  return { hoje, obras };
}

/** Fração pronta de uma obra; sem caixilhos, vale o status do Épico */
export function fracaoPronta(o: ObraProd): number {
  if (o.caixilhos.total > 0) return o.caixilhos.prontos / o.caixilhos.total;
  return o.status === 'Concluido' || o.status === 'Expedido' ? 1 : 0;
}

/** Números de um mês: obras com entrega prevista nele (mes = "2026-11") */
export function resumoDoMes(obras: ObraProd[], mes: string) {
  const doMes = obras.filter((o) => o.duedate?.startsWith(mes));
  return {
    obras: doMes.length,
    obrasSemValor: doMes.filter((o) => o.valor === null).length,
    caixilhosTotal: doMes.reduce((s, o) => s + o.caixilhos.total, 0),
    caixilhosProntos: doMes.reduce((s, o) => s + o.caixilhos.prontos, 0),
    valorPrevisto: doMes.reduce((s, o) => s + (o.valor ?? 0), 0),
    valorProduzido: Math.round(doMes.reduce((s, o) => s + (o.valor ?? 0) * fracaoPronta(o), 0)),
  };
}

/** Meta do mês: obras com entrega prevista no mês de `hoje` */
export function calcularMeta(obras: ObraProd[], hoje: string): MetaMes {
  const ini = inicioMes(hoje);
  const r = resumoDoMes(obras, hoje.slice(0, 7));
  const du = diasUteisDoMes(hoje);
  const faltam = Math.max(r.caixilhosTotal - r.caixilhosProntos, 0);

  const anteriores = obras.filter((o) => o.duedate && o.duedate < ini && o.status !== 'Expedido' && fracaoPronta(o) < 1);

  return {
    mes: hoje.slice(0, 7),
    nomeMes: nomeMes(hoje),
    metaValor: META_MENSAL,
    ...r,
    diasUteis: du,
    esperadoHoje: du.total > 0 ? Math.round((r.caixilhosTotal * du.passados) / du.total) : 0,
    porDia: du.restantes > 0 ? Math.ceil(faltam / du.restantes) : faltam,
    atrasadasAnteriores: {
      obras: anteriores.length,
      caixilhosFaltando: anteriores.reduce((s, o) => s + (o.caixilhos.total - o.caixilhos.prontos), 0),
    },
  };
}

// ─── Trimestre da bonificação ────────────────────────────────────────────────

/**
 * A bonificação é paga a cada três meses, contando os meses em que a meta foi
 * batida. Trimestres de calendário (jan–mar, abr–jun, jul–set, out–dez); se a
 * empresa contar de outro jeito, TRIMESTRE_PRIMEIRO_MES=2 faz fev–abr, mai–jul…
 */
const PRIMEIRO_MES = Math.min(3, Math.max(1, Number(process.env.TRIMESTRE_PRIMEIRO_MES) || 1));

/** Primeiro dia do trimestre de `hoje` */
export function inicioTrimestre(hoje: string): string {
  const m = Number(hoje.slice(5, 7));
  const recuo = (((m - PRIMEIRO_MES) % 3) + 3) % 3;
  return somarMeses(inicioMes(hoje), -recuo);
}

const ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const abrev = (mes: string) => ABREV[Number(mes.slice(5, 7)) - 1];

/**
 * Fechamento mensal: o número de cada mês fica gravado numa propriedade do
 * projeto no Jira. O cron grava todo dia o mês de ontem; a gravação do dia 1º
 * é a foto do fim do mês, e é ela que vale para a bonificação — depois disso
 * nada (atraso de expedição, arquivamento, valor corrigido) muda o resultado.
 */
const PROPRIEDADE_FECHAMENTOS = 'jira-scan-app.fechamentos';

export async function lerFechamentos(): Promise<Record<string, FechamentoMes>> {
  try {
    const r = await jiraFetch(`/rest/api/3/project/${projeto()}/properties/${PROPRIEDADE_FECHAMENTOS}`);
    return (r?.value?.meses ?? {}) as Record<string, FechamentoMes>;
  } catch {
    return {}; // 404 até a primeira gravação
  }
}

export async function gravarFechamento(mes: string, f: FechamentoMes): Promise<void> {
  const meses = await lerFechamentos();
  meses[mes] = f;
  // Dois anos bastam; a propriedade tem limite de tamanho
  for (const k of Object.keys(meses).sort().slice(0, -24)) delete meses[k];
  await jiraFetch(`/rest/api/3/project/${projeto()}/properties/${PROPRIEDADE_FECHAMENTOS}`, {
    method: 'PUT',
    body: JSON.stringify({ meses }),
  });
}

/** Os três meses do trimestre de `hoje`. Precisa das obras desde o início do trimestre */
export function montarTrimestre(
  obras: ObraProd[], hoje: string, fechamentos: Record<string, FechamentoMes>,
): Trimestre {
  const ini = inicioTrimestre(hoje);
  const atual = hoje.slice(0, 7);
  const meses: MesTrimestre[] = [0, 1, 2].map((n) => {
    const mes = somarMeses(ini, n).slice(0, 7);
    const base = { mes, nomeMes: nomeMes(`${mes}-01`), metaValor: META_MENSAL };
    if (mes > atual) {
      return { ...base, valorProduzido: null, batida: null, situacao: 'futuro', obrasSemValor: 0 };
    }
    const f = fechamentos[mes];
    if (mes < atual && f) {
      return {
        ...base, metaValor: f.metaValor, valorProduzido: f.valorProduzido,
        batida: f.valorProduzido >= f.metaValor, situacao: 'fechado', obrasSemValor: f.obrasSemValor,
      };
    }
    const r = resumoDoMes(obras, mes);
    const batida = r.valorProduzido >= META_MENSAL;
    return {
      ...base,
      valorProduzido: r.valorProduzido,
      // No mês atual só dá para cravar o "sim": o "não" só no fim
      batida: mes === atual ? (batida ? true : null) : batida,
      situacao: mes === atual ? 'em-andamento' : 'estimado',
      obrasSemValor: r.obrasSemValor,
    };
  });
  return {
    nome: `${abrev(meses[0].mes)}–${abrev(meses[2].mes)}`,
    meses,
    batidos: meses.filter((m) => m.batida === true).length,
  };
}

// ─── Ritmo e prazo (Indicadores) ─────────────────────────────────────────────

const JQL_CAIXILHO_CONCLUIDO = () =>
  `project = "${projeto()}" AND Modelo = "Caixilho" AND status CHANGED TO "Concluido"`;

/** Caixilhos que entraram em Concluído entre duas datas (fim exclusivo) */
export function contarConcluidos(de: string, ate: string): Promise<number | null> {
  return contarAprox(`${JQL_CAIXILHO_CONCLUIDO()} DURING ("${de}", "${ate}")`);
}

/** Últimas `n` semanas fechadas + a atual, mais antiga primeiro */
export async function semanas(hoje: string, n: number): Promise<SemanaProd[]> {
  const atual = segunda(hoje);
  const inicios = Array.from({ length: n }, (_, i) => somarDias(atual, -7 * (n - 1 - i)));
  const contagens = await emLotes(inicios, 4, (ini) => contarConcluidos(ini, somarDias(ini, 7)));
  return inicios.map((inicio, i) => ({ inicio, caixilhos: contagens[i] }));
}

/**
 * Entregas no prazo por mês de entrega prevista. "No prazo" = Épico foi para
 * Expedido até o fim do dia da entrega. Uma busca por data de entrega
 * distinta — são poucas por mês.
 */
export async function prazoPorMes(obras: ObraProd[], hoje: string, meses: string[]): Promise<PrazoMes[]> {
  const expedidas = obras.filter((o) => o.status === 'Expedido' && o.duedate && meses.includes(o.duedate.slice(0, 7)));
  const porData = new Map<string, string[]>();
  for (const o of expedidas) porData.set(o.duedate!, [...(porData.get(o.duedate!) ?? []), o.key]);

  const noPrazo = new Set<string>();
  await emLotes([...porData.entries()], 4, async ([data, keys]) => {
    const r = await searchAllIssues(
      `key in (${keys.join(',')}) AND status CHANGED TO "Expedido" BEFORE "${somarDias(data, 1)}"`,
      ['status'],
    ).catch(() => []);
    for (const i of r) noPrazo.add(i.key);
  });

  return meses.map((mes) => {
    const doMes = obras.filter((o) => o.duedate?.startsWith(mes));
    const linha: PrazoMes = {
      mes, nomeMes: nomeMes(`${mes}-01`),
      noPrazo: 0, comAtraso: 0, vencidas: 0, aVencer: 0, total: doMes.length,
    };
    for (const o of doMes) {
      if (o.status === 'Expedido') {
        if (noPrazo.has(o.key)) linha.noPrazo++; else linha.comAtraso++;
      } else if (o.duedate! < hoje) linha.vencidas++;
      else linha.aVencer++;
    }
    return linha;
  });
}

// ─── Cache curto ─────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; valor: Promise<unknown> }>();

/**
 * Memoriza o resultado por alguns segundos dentro da mesma instância: a TV
 * consulta a cada 30s e várias abas podem estar abertas. Erro não fica guardado.
 */
export function memo<T>(chave: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(chave);
  if (c && Date.now() - c.at < ttlMs) return c.valor as Promise<T>;
  const valor = fn();
  cache.set(chave, { at: Date.now(), valor });
  valor.catch(() => cache.delete(chave));
  return valor;
}
