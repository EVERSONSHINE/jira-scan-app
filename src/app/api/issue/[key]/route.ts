import { NextRequest, NextResponse } from 'next/server';
import { jiraFetch, getCustomFieldMap, cfValue, CF } from '@/lib/jira';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  try {
    const [issue, fieldMap] = await Promise.all([
      jiraFetch(`/rest/api/3/issue/${key}?fields=*all&expand=editmeta`),
      getCustomFieldMap(),
    ]);

    const f = issue.fields as Record<string, unknown>;

    // Resolve IDs dos campos personalizados relevantes
    const fields: Record<string, string> = {};
    const targets = ['cliente', 'documento', 'tipo', 'largura', 'altura', 'modelo', 'localizacao'];
    for (const [name, id] of Object.entries(fieldMap)) {
      for (const t of targets) {
        if (name.includes(t)) fields[t] = id;
      }
    }

    // Opções de Localização vindas do editmeta
    let localizacaoOptions: Array<{ id: string; value: string }> = [];
    const locId = fields['localizacao'];
    if (locId) {
      const allowed = (issue.editmeta?.fields?.[locId]?.allowedValues ?? []) as Array<{
        id: string;
        value: string;
      }>;
      localizacaoOptions = allowed;
    }

    return NextResponse.json({
      key: issue.key,
      summary: f.summary,
      status: (f.status as Record<string, unknown>)?.name ?? '',
      parent: ((f.parent as Record<string, unknown>)?.key ?? '') as string,
      cliente:    cfValue(f, fields['cliente']    ?? ''),
      documento:  cfValue(f, fields['documento']  ?? ''),
      tipo:       cfValue(f, fields['tipo']        ?? ''),
      largura:    cfValue(f, fields['largura']     ?? ''),
      altura:     cfValue(f, fields['altura']      ?? ''),
      modelo:     cfValue(f, fields['modelo']      ?? ''),
      cor:        cfValue(f, CF.cor),
      codigo:     cfValue(f, CF.codigo),
      localizacao: cfValue(f, locId ?? ''),
      localizacaoFieldId: locId ?? null,
      localizacaoOptions,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
