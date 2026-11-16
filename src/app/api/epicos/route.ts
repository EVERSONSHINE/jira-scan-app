import { NextResponse } from 'next/server';
import { searchAllIssues, cfValue, CF } from '@/lib/jira';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Obras (Épicos) ainda não expedidas, para escolher no relatório de
 * localização. Ordem: data de entrega mais próxima primeiro; sem data no fim.
 */
export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    const fields = ['summary', 'status', 'duedate', CF.cliente, CF.documento];

    // O tipo pode se chamar "Epic" ou "Épico" conforme o idioma da instância
    let epics;
    try {
      epics = await searchAllIssues(
        `project = "${project}" AND issuetype = Epic AND status != "Expedido" ORDER BY duedate ASC, key ASC`,
        fields,
      );
    } catch {
      epics = await searchAllIssues(
        `project = "${project}" AND issuetype = Épico AND status != "Expedido" ORDER BY duedate ASC, key ASC`,
        fields,
      );
    }

    const obras = epics.map((e) => ({
      key: e.key,
      summary: String((e.fields.summary as string) ?? ''),
      status: String((e.fields.status as { name?: string })?.name ?? ''),
      duedate: (e.fields.duedate as string | null) ?? null,
      cliente: cfValue(e.fields, CF.cliente),
      documento: cfValue(e.fields, CF.documento),
    }));
    // ORDER BY duedate do Jira já põe as vazias no fim; reforça aqui
    obras.sort((a, b) =>
      (a.duedate ?? '9999').localeCompare(b.duedate ?? '9999') ||
      a.key.localeCompare(b.key, 'pt-BR', { numeric: true }),
    );
    return NextResponse.json(obras);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
