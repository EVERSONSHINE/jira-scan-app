import { jiraFetch, emLotes } from './jira';
import { canonicalStatus } from './status';
import { pronto } from './hierarquia';

// ─── Meta ────────────────────────────────────────────────────────────────────

/** Meta mensal de produção em R$. Configurável por META_PRODUCAO_MENSAL. */
export function metaMensal(): number {
  const v = Number(process.env.META_PRODUCAO_MENSAL);
  return Number.isFinite(v) && v > 0 ? v : 850_000;
}

// ─── Datas no horário da fábrica ─────────────────────────────────────────────

const TZ = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "AAAA-MM-DD" de um instante, no horário de Brasília */
export function diaBR(d: Date | string): string {
  return fmtDia.format(typeof d === 'string' ? new Date(d) : d);
}

/** "AAAA-MM" de um instante ou de uma data "AAAA-MM-DD" */
export function mesDe(d: Date | string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
  return diaBR(d).slice(0, 7);
}

export function mesAtual(agora = new Date()): string {
  return mesDe(agora);
}

/** Mês anterior/seguinte de "AAAA-MM" */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Diferença em dias entre duas datas "AAAA-MM-DD" (b − a) */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/**
 * Dias úteis (seg–sex) do mês e quantos já passaram até hoje, inclusive.
 * Feriados não entram: o ritmo esperado é uma referência, não um calendário.
 */
export function diasUteis(mes: string, hoje = diaBR(new Date())): { total: number; decorridos: number } {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  let total = 0;
  let decorridos = 0;
  for (let d = 1; d <= ultimo; d++) {
    const dt = new Date(Date.UTC(a, m - 1, d));
    const dow = dt.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    total++;
    if (dt.toISOString().slice(0, 10) <= hoje) decorridos++;
  }
  return { total, decorridos };
}

// ─── Quando a obra concluiu e expediu ────────────────────────────────────────

export interface Marcos {
  /** Quando a obra chegou a Concluído (ou direto a Expedido) pela última vez */
  concluidoAt: string | null;
  /** Quando a obra chegou a Expedido pela última vez */
  expedidoAt: string | null;
}

const cacheMarcos = new Map<string, { updated: string; marcos: Marcos }>();

/**
 * Lê o histórico de status do Épico. Vale a última entrada em "pronto"
 * (Concluído/Expedido) vinda de um status não pronto: uma obra que voltou para
 * produção e concluiu de novo conta na data da segunda conclusão.
 * Só tem sentido para obras que estão prontas agora.
 */
export async function marcosDaObra(key: string, statusAtual: string, updated: string): Promise<Marcos> {
  if (!pronto(statusAtual)) return { concluidoAt: null, expedidoAt: null };
  const c = cacheMarcos.get(key);
  if (c && c.updated === updated) return c.marcos;

  const mudancas: Array<{ at: string; de: string; para: string }> = [];
  let startAt = 0;
  for (let page = 0; page < 20; page++) {
    const data = await jiraFetch(`/rest/api/3/issue/${key}/changelog?startAt=${startAt}&maxResults=100`);
    const hist = (data?.values ?? []) as Array<{ created: string; items: Array<{ field: string; fromString?: string; toString?: string }> }>;
    for (const h of hist) {
      for (const it of h.items) {
        if (it.field !== 'status') continue;
        mudancas.push({ at: h.created, de: canonicalStatus(it.fromString ?? ''), para: canonicalStatus(it.toString ?? '') });
      }
    }
    if (data?.isLast !== false || hist.length === 0) break;
    startAt += hist.length;
  }
  mudancas.sort((a, b) => a.at.localeCompare(b.at));

  let concluidoAt: string | null = null;
  let expedidoAt: string | null = null;
  for (const m of mudancas) {
    if (pronto(m.para) && !pronto(m.de)) concluidoAt = m.at;
    if (m.para === 'Expedido' && m.de !== 'Expedido') expedidoAt = m.at;
  }
  if (canonicalStatus(statusAtual) !== 'Expedido') expedidoAt = null;

  const marcos = { concluidoAt, expedidoAt };
  cacheMarcos.set(key, { updated, marcos });
  return marcos;
}

export async function marcosDe<T extends { key: string; status: string; updated: string }>(
  obras: T[],
): Promise<Map<string, Marcos>> {
  const prontas = obras.filter((o) => pronto(o.status));
  const res = await emLotes(prontas, 6, async (o) => [o.key, await marcosDaObra(o.key, o.status, o.updated)] as const);
  return new Map(res);
}

// ─── Registro das obras arquivadas ───────────────────────────────────────────
//
// O arquivamento da madrugada tira as obras expedidas da busca do Jira. Sem
// registro, a meta do mês e o histórico da diretoria perderiam essas obras.
// Antes de arquivar, os números da obra entram neste agregado mensal, guardado
// numa propriedade do projeto no Jira (pequeno: alguns números por mês).

const PROPRIEDADE = 'jira-scan-app.obras-por-mes';
/** Meses guardados no registro */
const RETER_MESES = 24;

export interface MesProducao {
  /** Valor (R$) das obras concluídas no mês */
  valor: number;
  obras: number;
  /** Obras concluídas no mês sem Valor preenchido */
  semValor: number;
  quadros: number;
  caixilhos: number;
}
export interface MesEntrega {
  /** Obras expedidas no mês com Data de entrega */
  comPrazo: number;
  noPrazo: number;
  /** Soma dos dias de atraso das que atrasaram */
  atrasoDias: number;
  /** Soma e quantidade de lead times (início → expedição), em dias */
  leadDias: number;
  leadN: number;
}
export interface Registro {
  producao: Record<string, MesProducao>;
  entregas: Record<string, MesEntrega>;
}

export const mesProducaoVazio = (): MesProducao => ({ valor: 0, obras: 0, semValor: 0, quadros: 0, caixilhos: 0 });
export const mesEntregaVazio = (): MesEntrega => ({ comPrazo: 0, noPrazo: 0, atrasoDias: 0, leadDias: 0, leadN: 0 });

export async function lerRegistro(project: string): Promise<Registro> {
  try {
    const r = await jiraFetch(`/rest/api/3/project/${project}/properties/${PROPRIEDADE}`);
    return { producao: r?.value?.producao ?? {}, entregas: r?.value?.entregas ?? {} };
  } catch {
    return { producao: {}, entregas: {} }; // 404 até o primeiro arquivamento
  }
}

/** Fatos de uma obra pronta, usados tanto ao vivo quanto no registro */
export interface FatosObra {
  valor: number | null;
  duedate: string | null;
  inicio: string | null;
  created: string;
  quadros: number;
  caixilhos: number;
  marcos: Marcos;
}

/** Soma uma obra nos agregados mensais (in-place) */
export function somarObra(reg: Registro, o: FatosObra) {
  if (o.marcos.concluidoAt) {
    const mes = mesDe(o.marcos.concluidoAt);
    const p = (reg.producao[mes] ??= mesProducaoVazio());
    p.obras++;
    p.quadros += o.quadros;
    p.caixilhos += o.caixilhos;
    if (o.valor !== null) p.valor += o.valor; else p.semValor++;
  }
  if (o.marcos.expedidoAt) {
    const dia = diaBR(o.marcos.expedidoAt);
    const e = (reg.entregas[mesDe(dia)] ??= mesEntregaVazio());
    if (o.duedate) {
      e.comPrazo++;
      const atraso = diasEntre(o.duedate, dia);
      if (atraso <= 0) e.noPrazo++; else e.atrasoDias += atraso;
    }
    const inicio = o.inicio ?? (o.created ? diaBR(o.created) : null);
    if (inicio) {
      e.leadDias += Math.max(diasEntre(inicio, dia), 0);
      e.leadN++;
    }
  }
}

/** Grava no registro as obras que estão para ser arquivadas */
export async function registrarArquivadas(project: string, obras: FatosObra[]) {
  if (obras.length === 0) return;
  const reg = await lerRegistro(project);
  for (const o of obras) somarObra(reg, o);
  const corte = somarMeses(mesAtual(), -RETER_MESES);
  for (const k of Object.keys(reg.producao)) if (k < corte) delete reg.producao[k];
  for (const k of Object.keys(reg.entregas)) if (k < corte) delete reg.entregas[k];
  await jiraFetch(`/rest/api/3/project/${project}/properties/${PROPRIEDADE}`, {
    method: 'PUT',
    body: JSON.stringify(reg),
  });
}

/** Junta dois registros (ao vivo + arquivado) numa cópia */
export function juntarRegistros(a: Registro, b: Registro): Registro {
  const out: Registro = { producao: {}, entregas: {} };
  for (const r of [a, b]) {
    for (const [m, v] of Object.entries(r.producao)) {
      const t = (out.producao[m] ??= mesProducaoVazio());
      t.valor += v.valor; t.obras += v.obras; t.semValor += v.semValor; t.quadros += v.quadros; t.caixilhos += v.caixilhos;
    }
    for (const [m, v] of Object.entries(r.entregas)) {
      const t = (out.entregas[m] ??= mesEntregaVazio());
      t.comPrazo += v.comPrazo; t.noPrazo += v.noPrazo; t.atrasoDias += v.atrasoDias; t.leadDias += v.leadDias; t.leadN += v.leadN;
    }
  }
  return out;
}
