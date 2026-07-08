import { NextResponse } from 'next/server';
import {
  jiraFetch,
  normalize,
  findEpicAbove,
  searchAllIssues,
  getCustomFieldMapCached,
  cfValue,
} from '@/lib/jira';
import { canonicalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

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

/** Conta subtasks do épico por status ("parentEpic" pega 2 níveis abaixo) */
async function countEpicSubtasks(epicKey: string) {
  let subs = await searchAllIssues(
    `parentEpic = "${epicKey}" AND issuetype in subTaskIssueTypes()`,
    ['status'],
  );

  // Fallback (instâncias onde parentEpic não resolve): epic → tasks → subtasks
  if (subs.length === 0) {
    const tasks = await searchAllIssues(`parent = "${epicKey}"`, ['status']);
    const taskKeys = tasks.map((t) => t.key);
    subs = [];
    for (let i = 0; i < taskKeys.length; i += 50) {
      const chunk = taskKeys.slice(i, i + 50);
      const batch = await searchAllIssues(
        `parent in (${chunk.join(',')}) AND issuetype in subTaskIssueTypes()`,
        ['status'],
      );
      subs.push(...batch);
    }
  }

  const porStatus: Record<string, number> = {};
  for (const s of subs) {
    const st = canonicalStatus(String((s.fields.status as { name?: string })?.name ?? ''));
    porStatus[st] = (porStatus[st] ?? 0) + 1;
  }
  return {
    total: subs.length,
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
