import { NextRequest, NextResponse } from 'next/server';
import { jiraFetch, normalize, cascadeStatus, statusRank } from '@/lib/jira';

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
    // Descobre os status de origem e destino antes de executar a transição
    const [data, atual] = await Promise.all([
      jiraFetch(`/rest/api/3/issue/${key}/transitions`),
      jiraFetch(`/rest/api/3/issue/${key}?fields=status`),
    ]);
    const target = ((data?.transitions ?? []) as Array<{ id: string; to?: { name?: string } }>)
      .find((t) => t.id === transitionId);
    const toStatus = target?.to?.name ?? '';
    const fromStatus = String(atual?.fields?.status?.name ?? '');

    await jiraFetch(`/rest/api/3/issue/${key}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    });

    // Subtask Concluido/Expedido → cascata Task → Epic
    // (todas concluídas → Concluido; todas expedidas → Expedido; alguma andou → Em Andamento).
    // Uma volta (correção de engano) também cascateia, e aí Task e Épico voltam junto.
    let updated: Array<{ key: string; status: string; nivel: 'task' | 'epic' }> = [];
    const toNorm = normalize(toStatus);
    // Destino fora do fluxo (rank -1) não conta como volta
    const regrediu = statusRank(toStatus) >= 0 && statusRank(toStatus) < statusRank(fromStatus);
    if (toNorm === 'concluido' || toNorm === 'expedido' || regrediu) {
      try {
        updated = await cascadeStatus(key, {
          permitirRegressao: regrediu,
          conhecidos: { [key]: toStatus },
        });
      } catch {
        // Falha na propagação não desfaz a transição da subtask
      }
    }

    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
