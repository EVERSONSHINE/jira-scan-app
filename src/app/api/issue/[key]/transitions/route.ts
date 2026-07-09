import { NextRequest, NextResponse } from 'next/server';
import { jiraFetch, normalize, syncEpicStatus } from '@/lib/jira';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  try {
    const data = await jiraFetch(`/rest/api/3/issue/${key}/transitions?expand=transitions.fields`);
    // Retorna id, nome da transição e nome do status de destino
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transitions = (data.transitions as any[]).map((t: any) => ({
      id: t.id,
      name: t.name,
      toStatus: t.to?.name ?? t.name,
    }));
    return NextResponse.json(transitions);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const { transitionId } = await req.json() as { transitionId: string };
  try {
    // Descobre o status de destino antes de executar a transição
    const data = await jiraFetch(`/rest/api/3/issue/${key}/transitions`);
    const target = ((data?.transitions ?? []) as Array<{ id: string; to?: { name?: string } }>)
      .find((t) => t.id === transitionId);
    const toStatus = target?.to?.name ?? '';

    await jiraFetch(`/rest/api/3/issue/${key}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    });

    // Subtask Concluido/Expedido → sincroniza o status do Epic acima
    // (todas concluídas → Concluido; todas expedidas → Expedido; senão inicia)
    let epicUpdated: { key: string; status: string } | null = null;
    const toNorm = normalize(toStatus);
    if (toNorm === 'concluido' || toNorm === 'expedido') {
      try {
        epicUpdated = await syncEpicStatus(key);
      } catch {
        // Falha na propagação não desfaz a transição da subtask
      }
    }

    return NextResponse.json({ ok: true, epicUpdated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
