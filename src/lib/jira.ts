const BASE  = (process.env.JIRA_BASE_URL ?? '').replace(/\/$/, '');
const EMAIL = process.env.JIRA_EMAIL ?? '';
const TOKEN = process.env.JIRA_API_TOKEN ?? '';

export const AUTH_HEADER = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`;

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
 * Quando uma subtask é concluída, move o Epic acima dela para "Em Andamento".
 * Só age se o Epic ainda estiver em "Tarefas Pendentes", para não regredir
 * um Epic já concluído/expedido. Retorna a key do Epic movido, ou null.
 */
export async function startEpicIfPending(subtaskKey: string): Promise<string | null> {
  const epic = await findEpicAbove(subtaskKey);
  if (!epic) return null;
  if (normalize(epic.status) !== 'tarefas pendentes') return null;

  const data = await jiraFetch(`/rest/api/3/issue/${epic.key}/transitions`);
  const transitions = (data?.transitions ?? []) as Array<{
    id: string;
    to?: { name?: string };
  }>;
  const tr = transitions.find((t) => normalize(t.to?.name ?? '') === 'em andamento');
  if (!tr) return null;

  await jiraFetch(`/rest/api/3/issue/${epic.key}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: tr.id } }),
  });
  return epic.key;
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
