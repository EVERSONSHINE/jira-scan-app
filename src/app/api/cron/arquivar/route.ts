import { NextRequest, NextResponse } from 'next/server';
import { arquivarExpedidos } from '@/lib/arquivo';
import { garantirFechamento } from '@/lib/fechamento';

export const dynamic = 'force-dynamic';
// Um primeiro arquivamento pode pegar muitos projetos antigos de uma vez;
// arquivarExpedidos para sozinho antes disso e deixa o resto para a noite seguinte
export const maxDuration = 300;

/**
 * Fecha o mês anterior e arquiva os projetos cuja expedição terminou antes do
 * mês corrente (Épico, Tasks e Subtasks em Expedido). Chamada pelo cron da
 * Vercel de madrugada — vercel.json, "0 6 * * *" em UTC = 3h de Brasília.
 *
 * O fechamento vem primeiro e é condição: ele grava o resultado do mês
 * (valor produzido, caixilhos, entregas) lendo o Jira com as obras ainda
 * vivas. Sem ele gravado, arquivar apagaria o histórico dos Indicadores.
 *
 * Exige o CRON_SECRET, que a Vercel manda no Authorization de toda chamada de
 * cron: sem ele, qualquer um na internet dispararia o arquivamento.
 *
 *   ?simular=1                  só lista o que seria arquivado, sem escrever
 *   ?somente=PROJ-123           um épico só (teste dirigido)
 *   ?somente=…&incluirMes=1     não pula o que terminou neste mês (só com somente)
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

  const project = process.env.JIRA_PROJECT_KEY ?? '';
  const simular = p.get('simular') === '1';

  let fechamento;
  try {
    fechamento = await garantirFechamento(project, { simular });
  } catch (e) {
    console.log('fechamento-falhou', String(e));
    return NextResponse.json(
      { error: `fechamento do mês falhou, nada foi arquivado: ${String(e)}` },
      { status: 500 },
    );
  }

  try {
    const resultado = await arquivarExpedidos(project, {
      simular,
      somente,
      ignorarMes: !!somente && p.get('incluirMes') === '1',
    });
    // Vai para os logs da Vercel: é o registro do que foi arquivado em cada noite
    console.log('arquivar-expedidos', JSON.stringify({ fechamento, ...resultado }));
    return NextResponse.json({ fechamento, ...resultado });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
