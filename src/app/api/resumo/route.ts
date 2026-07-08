import { NextResponse } from 'next/server';
import { searchAllIssues, normalize } from '@/lib/jira';
import { canonicalStatus, STATUS_ORDER } from '@/lib/status';

export const dynamic = 'force-dynamic';

interface SubtaskNode { key: string; summary: string; status: string }
interface TaskNode extends SubtaskNode { subtasks: SubtaskNode[] }
interface EpicNode extends SubtaskNode {
  counts: { total: number; porStatus: Record<string, number> };
  tasks: TaskNode[];
}

// Ordem de exibição dos épicos: ativos primeiro, expedidos por último
const EPIC_SORT: Record<string, number> = {
  'Em Andamento': 0,
  'Tarefas Pendentes': 1,
  'Concluido': 2,
  'Expedido': 3,
};

export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    const issues = await searchAllIssues(
      `project = "${project}" ORDER BY created ASC`,
      ['summary', 'status', 'issuetype', 'parent'],
    );

    interface Row {
      key: string;
      summary: string;
      status: string;
      kind: 'epic' | 'task' | 'subtask';
      parentKey: string;
    }

    const rows: Row[] = issues.map((i) => {
      const f = i.fields;
      const issuetype = f.issuetype as { name?: string; subtask?: boolean } | undefined;
      const typeName = normalize(issuetype?.name ?? '');
      const kind: Row['kind'] = issuetype?.subtask
        ? 'subtask'
        : typeName === 'epic' || typeName === 'epico'
          ? 'epic'
          : 'task';
      return {
        key: i.key,
        summary: String((f.summary as string) ?? ''),
        status: canonicalStatus(String((f.status as { name?: string })?.name ?? '')),
        kind,
        parentKey: String((f.parent as { key?: string })?.key ?? ''),
      };
    });

    const epicsRows = rows.filter((r) => r.kind === 'epic');
    const taskRows  = rows.filter((r) => r.kind === 'task');
    const subRows   = rows.filter((r) => r.kind === 'subtask');

    // Índice task → subtasks
    const subsByTask = new Map<string, SubtaskNode[]>();
    for (const s of subRows) {
      const list = subsByTask.get(s.parentKey) ?? [];
      list.push({ key: s.key, summary: s.summary, status: s.status });
      subsByTask.set(s.parentKey, list);
    }

    // Índice epic → tasks
    const tasksByEpic = new Map<string, TaskNode[]>();
    const orphanTasks: TaskNode[] = [];
    const epicKeys = new Set(epicsRows.map((e) => e.key));
    for (const t of taskRows) {
      const node: TaskNode = {
        key: t.key,
        summary: t.summary,
        status: t.status,
        subtasks: subsByTask.get(t.key) ?? [],
      };
      if (epicKeys.has(t.parentKey)) {
        const list = tasksByEpic.get(t.parentKey) ?? [];
        list.push(node);
        tasksByEpic.set(t.parentKey, list);
      } else {
        orphanTasks.push(node);
      }
    }

    // Subtasks cujo pai não apareceu na busca → agrupadas em pseudo-task órfã
    const taskKeys = new Set(taskRows.map((t) => t.key));
    const orphanSubs = subRows.filter((s) => s.parentKey && !taskKeys.has(s.parentKey));
    if (orphanSubs.length > 0) {
      orphanTasks.push({
        key: '—',
        summary: 'Quadros sem tarefa',
        status: '',
        subtasks: orphanSubs.map((s) => ({ key: s.key, summary: s.summary, status: s.status })),
      });
    }

    const countStatuses = (subs: SubtaskNode[]) => {
      const porStatus: Record<string, number> = {};
      for (const s of subs) porStatus[s.status] = (porStatus[s.status] ?? 0) + 1;
      return porStatus;
    };

    const epics: EpicNode[] = epicsRows
      .map((e) => {
        const tasks = tasksByEpic.get(e.key) ?? [];
        const subs = tasks.flatMap((t) => t.subtasks);
        return {
          key: e.key,
          summary: e.summary,
          status: e.status,
          counts: { total: subs.length, porStatus: countStatuses(subs) },
          tasks,
        };
      })
      .sort((a, b) => (EPIC_SORT[a.status] ?? 9) - (EPIC_SORT[b.status] ?? 9));

    // Totais do projeto (subtasks por status, sempre com os 4 canônicos presentes)
    const porStatus: Record<string, number> = {};
    for (const s of STATUS_ORDER) porStatus[s] = 0;
    for (const s of subRows) porStatus[s.status] = (porStatus[s.status] ?? 0) + 1;

    return NextResponse.json({
      totals: {
        epics: epicsRows.length,
        tasks: taskRows.length,
        subtasks: subRows.length,
        porStatus,
      },
      epics,
      semEpico: { tasks: orphanTasks },
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
