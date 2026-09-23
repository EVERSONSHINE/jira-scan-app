import { NextRequest, NextResponse } from 'next/server';
import { jiraFetch, normalize, listTaskSubtasks } from '@/lib/jira';

/**
 * Subtasks da mesma Task que a issue lida (incluindo ela). Alimenta a opção
 * "aplicar a todas" da tela de leitura: só existe para subtask cujo pai é
 * uma Task — pai Épico, ou a própria issue sendo Task, devolve lista vazia.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  try {
    const issue = await jiraFetch(`/rest/api/3/issue/${key}?fields=parent,issuetype`);
    const isSubtask = Boolean(issue?.fields?.issuetype?.subtask);
    const parent = issue?.fields?.parent;
    const parentType = normalize(String(parent?.fields?.issuetype?.name ?? ''));
    const parentIsEpic = parentType === 'epic' || parentType === 'epico';

    if (!isSubtask || !parent || parentIsEpic) {
      return NextResponse.json({ task: null, subtasks: [] });
    }
    const subtasks = await listTaskSubtasks(parent.key);
    return NextResponse.json({ task: parent.key as string, subtasks });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
