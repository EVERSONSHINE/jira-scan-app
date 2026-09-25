import { NextRequest, NextResponse } from 'next/server';
import { arquivarExpedidos } from '@/lib/arquivo';

export const dynamic = 'force-dynamic';
// Um primeiro arquivamento pode pegar muitos projetos antigos de uma vez;
// arquivarExpedidos para sozinho antes disso e deixa o resto para a noite seguinte
export const maxDuration = 300;

/**
 * Arquiva os projetos cuja expedição terminou (Épico, Tasks e Subtasks em
 * Expedido). Chamada pelo cron da Vercel de madrugada — vercel.json,
 * "0 6 * * *" em UTC = 3h de Brasília.
 *
 * Exige o CRON_SECRET, que a Vercel manda no Authorization de toda chamada de
 * cron: sem ele, qualquer um na internet dispararia o arquivamento.
 *
 *   ?simular=1                  só lista o que seria arquivado, sem escrever
 *   ?somente=PROJ-123           um épico só (teste dirigido)
 *   ?somente=…&incluirHoje=1    não pula o que terminou hoje (só com somente)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const somente = p.get('somente') ?? undefined;
  if (somente && !/^[A-Z][A-Z0-9]*-\d+$/.test(somente)) {
    return NextResponse.json({ error: 'somente deve ser uma chave de épico' }, { status: 400 });
  }

  try {
    const resultado = await arquivarExpedidos(process.env.JIRA_PROJECT_KEY ?? '', {
      simular: p.get('simular') === '1',
      somente,
      incluirHoje: !!somente && p.get('incluirHoje') === '1',
    });
    // Vai para os logs da Vercel: é o registro do que foi arquivado em cada noite
    console.log('arquivar-expedidos', JSON.stringify(resultado));
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
