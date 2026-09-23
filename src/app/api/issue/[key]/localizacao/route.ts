import { NextRequest, NextResponse } from 'next/server';
import { setLocalizacao } from '@/lib/jira';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const { fieldId, value } = await req.json() as { fieldId: string; value: string };
  try {
    await setLocalizacao(key, fieldId, value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
