import { NextRequest, NextResponse } from 'next/server';
import { listEpicSubtasks, getCustomFieldMapCached, cfValue } from '@/lib/jira';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Lista as subtasks (quadros) de um Epic com Tipo, Modelo, Localização e Status */
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

    const subs = await listEpicSubtasks(key, fields);

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
