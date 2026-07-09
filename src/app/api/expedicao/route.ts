import { NextResponse } from 'next/server';
import {
  jiraFetch,
  normalize,
  findEpicAbove,
  countEpicSubtasksByStatus,
  getCustomFieldMapCached,
  cfValue,
} from '@/lib/jira';

export const dynamic = 'force-dynamic';
// Changelog + contagem do épico fazem várias chamadas ao Jira; 10s padrão é pouco
export const maxDuration = 60;

/** Timestamp exato da última transição status → Expedido, via changelog */
async function getExpeditedAt(key: string): Promise<string | null> {
  let startAt = 0;
  let latest: string | null = null;
  for (let page = 0; page < 20; page++) {
    const data = await jiraFetch(`/rest/api/3/issue/${key}/changelog?startAt=${startAt}&maxResults=100`);
    const histories = (data?.values ?? []) as Array<{
      created: string;
      items: Array<{ field: string; toString?: string }>;
    }>;
    for (const h of histories) {
      const hit = h.items.some(
        (it) => it.field === 'status' && normalize(it.toString ?? '') === 'expedido',
      );
      if (hit && (!latest || h.created > latest)) latest = h.created;
    }
    if (data?.isLast !== false) break;
    startAt += histories.length;
  }
  return latest;
}

/** Conta subtasks do épico por status, no formato que a página consome */
async function countEpicSubtasks(epicKey: string) {
  const { total, porStatus } = await countEpicSubtasksByStatus(epicKey);
  return {
    total,
    expedido: porStatus['Expedido'] ?? 0,
    porStatus,
  };
}

export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    // Última subtask marcada como Expedido no projeto
    const jql = `project = "${project}" AND issuetype in subTaskIssueTypes() AND status = "Expedido" ORDER BY updated DESC`;
    const data = await jiraFetch(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=1&fields=summary,status,parent,updated`,
    );
    const latest = ((data?.issues ?? []) as Array<{ key: string; fields: Record<string, unknown> }>)[0] ?? null;

    if (!latest) {
      return NextResponse.json({ idle: true, fetchedAt: new Date().toISOString() });
    }

    const subtask = {
      key: latest.key,
      summary: String((latest.fields.summary as string) ?? ''),
    };

    const epicRef = await findEpicAbove(latest.key);

    const [expeditedAt, epicDetails, counts] = await Promise.all([
      getExpeditedAt(latest.key).catch(() => String(latest.fields.updated ?? '') || null),
      epicRef ? getEpicDetails(epicRef.key) : Promise.resolve(null),
      epicRef ? countEpicSubtasks(epicRef.key) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      idle: false,
      subtask,
      expeditedAt: expeditedAt ?? (String(latest.fields.updated ?? '') || null),
      epic: epicDetails,
      counts,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** Summary + campos cliente/documento do épico */
async function getEpicDetails(epicKey: string) {
  const fieldMap = await getCustomFieldMapCached();
  let clienteId = '';
  let documentoId = '';
  for (const [name, id] of Object.entries(fieldMap)) {
    if (name.includes('cliente')) clienteId = id;
    if (name.includes('documento')) documentoId = id;
  }
  const extra = [clienteId, documentoId].filter(Boolean).join(',');
  const issue = await jiraFetch(
    `/rest/api/3/issue/${epicKey}?fields=summary${extra ? `,${extra}` : ''}`,
  );
  const f = issue.fields as Record<string, unknown>;
  return {
    key: epicKey,
    summary: String((f.summary as string) ?? ''),
    cliente: clienteId ? cfValue(f, clienteId) : '',
    documento: documentoId ? cfValue(f, documentoId) : '',
  };
}
