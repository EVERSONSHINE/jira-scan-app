import { canonicalStatus, STATUS_ORDER } from './status';

const BASE  = (process.env.JIRA_BASE_URL ?? '').replace(/\/$/, '');
const EMAIL = process.env.JIRA_EMAIL ?? '';
const TOKEN = process.env.JIRA_API_TOKEN ?? '';

export const AUTH_HEADER = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`;

/**
 * Campos customizados confirmados na instância. Fonte de verdade da hierarquia
 * de domínio é o campo Modelo (Projeto/Caixilho/Marco/Folha), não o issue type.
 * Rotas que já descobrem o id por nome via getCustomFieldMapCached continuam
 * funcionando — este mapa é para quem precisa do id direto.
 */
export const CF = {
  cliente:     'customfield_10058',
  documento:   'customfield_10059',
  cor:         'customfield_10060',
  tipo:        'customfield_10061',
  largura:     'customfield_10062',
  altura:      'customfield_10063',
  modelo:      'customfield_10065',
  localizacao: 'customfield_10093',
} as const;

export const JIRA_HEADERS = {
  Authorization: AUTH_HEADER,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

export async function jiraFetch(path: string, init?: RequestInit) {
  if (!BASE || !EMAIL || !TOKEN) {
    throw new Error('Variáveis de ambiente JIRA_BASE_URL, JIRA_EMAIL e JIRA_API_TOKEN não configuradas na Vercel.');
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...JIRA_HEADERS, ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira ${res.status}: ${text.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Remove acentos e converte para minúsculas para comparação de nomes de campos */
export function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Sobe a hierarquia de pais (subtask → task → epic) até encontrar um Epic */
export async function findEpicAbove(
  key: string,
): Promise<{ key: string; status: string } | null> {
  let current = key;
  for (let depth = 0; depth < 5; depth++) {
    const issue = await jiraFetch(`/rest/api/3/issue/${current}?fields=parent`);
    const parent = issue?.fields?.parent;
    if (!parent) return null;
    const typeName = normalize(String(parent.fields?.issuetype?.name ?? ''));
    if (typeName === 'epic' || typeName === 'epico') {
      return { key: parent.key, status: String(parent.fields?.status?.name ?? '') };
    }
    current = parent.key;
  }
  return null;
}

/**
 * Lista as subtasks de um Epic (2 níveis abaixo), com os campos pedidos.
 * Usa parentEpic; se a instância não resolver (retorna 0), cai no fallback
 * em dois passos: parent = epic → tasks, depois parent in (tasks).
 */
export async function listEpicSubtasks(
  epicKey: string,
  fields: string[] = ['status'],
): Promise<JiraIssueLite[]> {
  const subs = await searchAllIssues(
    `parentEpic = "${epicKey}" AND issuetype in subTaskIssueTypes()`,
    fields,
  );
  if (subs.length > 0) return subs;

  const tasks = await searchAllIssues(`parent = "${epicKey}"`, ['status']);
  const taskKeys = tasks.map((t) => t.key);
  const out: JiraIssueLite[] = [];
  for (let i = 0; i < taskKeys.length; i += 50) {
    const chunk = taskKeys.slice(i, i + 50);
    const batch = await searchAllIssues(
      `parent in (${chunk.join(',')}) AND issuetype in subTaskIssueTypes()`,
      fields,
    );
    out.push(...batch);
  }
  return out;
}

/** Conta as subtasks de um Epic por status canônico */
export async function countEpicSubtasksByStatus(
  epicKey: string,
): Promise<{ total: number; porStatus: Record<string, number> }> {
  const subs = await listEpicSubtasks(epicKey);
  const porStatus: Record<string, number> = {};
  for (const s of subs) {
    const st = canonicalStatus(String((s.fields.status as { name?: string })?.name ?? ''));
    porStatus[st] = (porStatus[st] ?? 0) + 1;
  }
  return { total: subs.length, porStatus };
}

/** Posição do status na ordem do processo (-1 para "Outros") */
export function statusRank(raw: string): number {
  return (STATUS_ORDER as readonly string[]).indexOf(canonicalStatus(raw));
}

/** Status canônico dos filhos diretos de uma issue (JQL: parent = key) */
async function getChildStatuses(
  key: string,
  onlySubtasks: boolean,
): Promise<Array<{ key: string; status: string }>> {
  const jql = onlySubtasks
    ? `parent = "${key}" AND issuetype in subTaskIssueTypes()`
    : `parent = "${key}"`;
  const rows = await searchAllIssues(jql, ['status']);
  return rows.map((r) => ({
    key: r.key,
    status: canonicalStatus(String((r.fields.status as { name?: string })?.name ?? '')),
  }));
}

/**
 * Decide o status-alvo de um pai a partir dos filhos:
 *  - todos Expedido → "Expedido"
 *  - todos Concluido ou além → "Concluido"
 *  - algum filho já andou (Em Andamento/Concluido/Expedido) → "Em Andamento"
 *  - todos Tarefas Pendentes → "Tarefas Pendentes", só quando a cascata pode
 *    regredir (é o único jeito de um pai chegar lá de volta)
 */
function rollupTarget(statuses: string[], permitirRegressao = false): string | null {
  const total = statuses.length;
  if (total === 0) return null;
  const expedido = statuses.filter((s) => s === 'Expedido').length;
  const done = statuses.filter((s) => s === 'Concluido' || s === 'Expedido').length;
  if (expedido === total) return 'Expedido';
  if (done === total) return 'Concluido';
  if (done > 0 || statuses.includes('Em Andamento')) return 'Em Andamento';
  if (permitirRegressao && statuses.every((s) => s === 'Tarefas Pendentes')) return 'Tarefas Pendentes';
  return null;
}

/**
 * Transiciona a issue para o status-alvo, em qualquer direção. Casa pelo
 * status canônico: Tasks e Épicos chamam de "Aberto" o que as Subtasks chamam
 * de "Tarefas pendentes". Retorna o nome do status no Jira, ou null se a issue
 * já está nele ou o workflow não tem a transição.
 */
export async function transitionTo(
  key: string,
  currentStatus: string,
  target: string,
): Promise<string | null> {
  const alvo = canonicalStatus(target);
  if (canonicalStatus(currentStatus) === alvo) return null;
  const data = await jiraFetch(`/rest/api/3/issue/${key}/transitions`);
  const transitions = (data?.transitions ?? []) as Array<{
    id: string;
    to?: { name?: string };
  }>;
  const tr = transitions.find((t) => canonicalStatus(t.to?.name ?? '') === alvo);
  if (!tr) return null;
  await jiraFetch(`/rest/api/3/issue/${key}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: tr.id } }),
  });
  return tr.to?.name ?? target;
}

/** transitionTo apenas para frente: nunca regride */
export async function transitionForward(
  key: string,
  currentStatus: string,
  target: string,
): Promise<string | null> {
  if (statusRank(target) <= statusRank(currentStatus)) return null;
  return transitionTo(key, currentStatus, target);
}

export interface CascadeOpts {
  /**
   * Deixa Task e Épico voltarem de status. Só quando a própria ação foi uma
   * volta (correção de engano): numa ida, um pai adiantado à mão no Jira não
   * deve ser puxado para trás pela cascata.
   */
  permitirRegressao?: boolean;
  /**
   * Status já conhecidos das subtasks, que valem sobre a busca: o índice do
   * Jira pode ainda devolver o status antigo logo após a transição — com
   * regressão ligada, isso puxaria o pai para o lugar errado.
   */
  conhecidos?: Record<string, string>;
}

/**
 * Cascata de status após a transição de uma Subtask, nível a nível:
 *  1. Task ← rollup das suas Subtasks diretas
 *  2. Epic ← rollup das suas Tasks diretas (usando o status pós-transição
 *     da Task, já que a busca do Jira pode ainda refletir o antigo)
 * Regras: todas Expedido → Expedido; todas Concluido/Expedido → Concluido;
 * alguma andou → Em Andamento. Só regride com opts.permitirRegressao, e aí
 * todas pendentes → volta o pai para Aberto.
 */
export async function cascadeStatus(
  subtaskKey: string,
  opts: CascadeOpts = {},
): Promise<Array<{ key: string; status: string; nivel: 'task' | 'epic' }>> {
  const updated: Array<{ key: string; status: string; nivel: 'task' | 'epic' }> = [];
  const regride = opts.permitirRegressao ?? false;
  const mover = regride ? transitionTo : transitionForward;

  const issue = await jiraFetch(`/rest/api/3/issue/${subtaskKey}?fields=parent`);
  const parent = issue?.fields?.parent;
  if (!parent) return updated;

  const parentType = normalize(String(parent.fields?.issuetype?.name ?? ''));
  const parentIsEpic = parentType === 'epic' || parentType === 'epico';

  let epicKey: string | null = null;
  let epicStatus = '';
  let taskKey: string | null = null;
  let taskStatus = '';

  if (parentIsEpic) {
    epicKey = parent.key;
    epicStatus = String(parent.fields?.status?.name ?? '');
  } else {
    taskKey = parent.key;
    taskStatus = String(parent.fields?.status?.name ?? '');
  }

  if (taskKey) {
    const subs = await getChildStatuses(taskKey, true);
    const statuses = subs.map((s) =>
      opts.conhecidos?.[s.key] ? canonicalStatus(opts.conhecidos[s.key]) : s.status,
    );
    const target = rollupTarget(statuses, regride);
    if (target) {
      const moved = await mover(taskKey, taskStatus, target);
      if (moved) {
        updated.push({ key: taskKey, status: moved, nivel: 'task' });
        taskStatus = moved;
      }
    }
    const epic = await findEpicAbove(taskKey);
    if (epic) {
      epicKey = epic.key;
      epicStatus = epic.status;
    }
  }

  if (epicKey) {
    const children = await getChildStatuses(epicKey, false);
    const statuses = children.map((c) =>
      taskKey && c.key === taskKey ? canonicalStatus(taskStatus)
        : opts.conhecidos?.[c.key] ? canonicalStatus(opts.conhecidos[c.key])
        : c.status,
    );
    const target = rollupTarget(statuses, regride);
    if (target) {
      const moved = await mover(epicKey, epicStatus, target);
      if (moved) updated.push({ key: epicKey, status: moved, nivel: 'epic' });
    }
  }

  return updated;
}

export interface SubtaskLite {
  key: string;
  summary: string;
  status: string;
  modelo: string;
  localizacao: string;
}

/** Subtasks diretas de uma Task (marcos e folhas do mesmo caixilho) */
export async function listTaskSubtasks(taskKey: string): Promise<SubtaskLite[]> {
  const rows = await searchAllIssues(
    `parent = "${taskKey}" AND issuetype in subTaskIssueTypes() ORDER BY key ASC`,
    ['summary', 'status', CF.modelo, CF.localizacao],
  );
  return rows.map((r) => ({
    key: r.key,
    summary: String(r.fields.summary ?? ''),
    status: canonicalStatus(String((r.fields.status as { name?: string })?.name ?? '')),
    modelo: cfValue(r.fields, CF.modelo),
    localizacao: cfValue(r.fields, CF.localizacao),
  }));
}

/** Grava a Localização: tenta o formato de select ({ value }), senão string direta */
export async function setLocalizacao(key: string, fieldId: string, value: string) {
  try {
    await jiraFetch(`/rest/api/3/issue/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ fields: { [fieldId]: { value } } }),
    });
  } catch {
    await jiraFetch(`/rest/api/3/issue/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ fields: { [fieldId]: value } }),
    });
  }
}

/**
 * map com no máximo `limite` chamadas ao mesmo tempo — uma task grande não
 * pode virar dezenas de requisições simultâneas ao Jira. Preserva a ordem.
 */
export async function emLotes<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += limite) {
    out.push(...await Promise.all(itens.slice(i, i + limite).map(fn)));
  }
  return out;
}

export interface JiraIssueLite {
  key: string;
  fields: Record<string, unknown>;
}

/** Busca todas as issues de um JQL, paginando via nextPageToken (endpoint /search/jql) */
export async function searchAllIssues(jql: string, fields: string[]): Promise<JiraIssueLite[]> {
  const issues: JiraIssueLite[] = [];
  let nextPageToken: string | null = null;
  // Teto de 30 páginas (~3000 issues) como válvula de segurança
  for (let page = 0; page < 30; page++) {
    const params = new URLSearchParams({
      jql,
      maxResults: '100',
      fields: fields.join(','),
    });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);
    const data = await jiraFetch(`/rest/api/3/search/jql?${params.toString()}`);
    const batch = (data?.issues ?? []) as JiraIssueLite[];
    issues.push(...batch);
    nextPageToken = data?.nextPageToken ?? null;
    if (!nextPageToken || batch.length === 0) break;
  }
  return issues;
}

/** Retorna mapa nome_normalizado → field_id para campos customizados */
export async function getCustomFieldMap(): Promise<Record<string, string>> {
  const fields: Array<{ id: string; name: string; custom: boolean }> =
    await jiraFetch('/rest/api/3/field');
  const map: Record<string, string> = {};
  for (const f of fields) {
    if (f.custom) map[normalize(f.name)] = f.id;
  }
  return map;
}

let fieldMapCache: { map: Record<string, string>; at: number } | null = null;

/**
 * Versão memoizada de getCustomFieldMap para rotas de polling.
 * Cache em módulo (lambda quente); a correção não depende dele.
 */
export async function getCustomFieldMapCached(ttlMs = 10 * 60_000): Promise<Record<string, string>> {
  if (fieldMapCache && Date.now() - fieldMapCache.at < ttlMs) return fieldMapCache.map;
  const map = await getCustomFieldMap();
  fieldMapCache = { map, at: Date.now() };
  return map;
}

/** Tenta encontrar o ID do campo cujo nome contenha o fragmento dado */
export async function findFieldId(fragment: string): Promise<string | null> {
  const map = await getCustomFieldMap();
  const frag = normalize(fragment);
  for (const [name, id] of Object.entries(map)) {
    if (name.includes(frag)) return id;
  }
  return null;
}

/** Extrai valor legível de um campo customizado (string, select, etc.) */
export function cfValue(fields: Record<string, unknown>, fieldId: string): string {
  const val = fields[fieldId];
  if (!val) return '';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    const v = val as Record<string, unknown>;
    return String(v.value ?? v.name ?? v.id ?? '');
  }
  return '';
}
