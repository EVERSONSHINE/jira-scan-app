import { NextRequest, NextResponse } from 'next/server';
import { searchAllIssues, getCustomFieldMapCached, cfValue, JiraIssueLite } from '@/lib/jira';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Lista as subtasks (quadros) de um Epic com Tipo, Modelo, Localização e Status.
 * Usa parentEpic; se a instância não resolver (retorna 0), cai no fallback
 * em dois passos: parent = epic → tasks, depois parent in (tasks).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  try {
    const fieldMap = await getCustomFieldMapCached();
    let tipoId = '';
    let modeloId = '';
    let locId = '';
    for (const [name, id] of Object.entries(fieldMap)) {
      if (name.includes('tipo') && !tipoId) tipoId = id;
      if (name.includes('modelo') && !modeloId) modeloId = id;
      if (name.includes('localizacao') && !locId) locId = id;
    }
    const fields = ['summary', 'status', tipoId, modeloId, locId].filter(Boolean);

    let subs: JiraIssueLite[] = await searchAllIssues(
      `parentEpic = "${key}" AND issuetype in subTaskIssueTypes()`,
      fields,
    );
    if (subs.length === 0) {
      const tasks = await searchAllIssues(`parent = "${key}"`, ['status']);
      const taskKeys = tasks.map((t) => t.key);
      subs = [];
      for (let i = 0; i < taskKeys.length; i += 50) {
        const chunk = taskKeys.slice(i, i + 50);
        const batch = await searchAllIssues(
          `parent in (${chunk.join(',')}) AND issuetype in subTaskIssueTypes()`,
          fields,
        );
        subs.push(...batch);
      }
    }

    return NextResponse.json(
      subs.map((s) => ({
        key: s.key,
        summary: String((s.fields.summary as string) ?? ''),
        status: String((s.fields.status as { name?: string })?.name ?? ''),
        tipo: tipoId ? cfValue(s.fields, tipoId) : '',
        modelo: modeloId ? cfValue(s.fields, modeloId) : '',
        localizacao: locId ? cfValue(s.fields, locId) : '',
      })),
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
