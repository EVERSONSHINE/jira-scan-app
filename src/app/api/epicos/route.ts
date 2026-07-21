import { NextResponse } from 'next/server';
import { searchAllIssues, getCustomFieldMapCached, cfValue } from '@/lib/jira';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Lista os Epics (projetos) ainda não expedidos, para seleção na tela de quadros */
export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    const fieldMap = await getCustomFieldMapCached();
    let clienteId = '';
    let documentoId = '';
    for (const [name, id] of Object.entries(fieldMap)) {
      if (name.includes('cliente') && !clienteId) clienteId = id;
      if (name.includes('documento') && !documentoId) documentoId = id;
    }
    const fields = ['summary', 'status', clienteId, documentoId].filter(Boolean);

    // O tipo pode se chamar "Epic" ou "Épico" conforme o idioma da instância
    let epics;
    try {
      epics = await searchAllIssues(
        `project = "${project}" AND issuetype = Epic AND status != "Expedido" ORDER BY created DESC`,
        fields,
      );
    } catch {
      epics = await searchAllIssues(
        `project = "${project}" AND issuetype = Épico AND status != "Expedido" ORDER BY created DESC`,
        fields,
      );
    }

    return NextResponse.json(
      epics.map((e) => ({
        key: e.key,
        summary: String((e.fields.summary as string) ?? ''),
        status: String((e.fields.status as { name?: string })?.name ?? ''),
        cliente: clienteId ? cfValue(e.fields, clienteId) : '',
        documento: documentoId ? cfValue(e.fields, documentoId) : '',
      })),
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
