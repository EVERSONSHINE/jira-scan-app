import { NextRequest, NextResponse } from 'next/server';
import { carregarObras, gravarFechamento, inicioMes, META_MENSAL, resumoDoMes, somarDias } from '@/lib/producao';
import { hojeISO } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Grava o fechamento do mês de ONTEM (vercel.json, "50 5 * * *" em UTC =
 * 2h50 de Brasília, antes do arquivamento das 3h). Rodando todo dia, a
 * gravação feita no dia 1º é a foto do mês que acabou de terminar — é ela que
 * conta na bonificação trimestral, e não muda mais depois.
 *
 * Exige o CRON_SECRET, como o arquivamento.
 *   ?mes=2026-11   regrava um mês específico com os dados de hoje (correção manual)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const pedido = req.nextUrl.searchParams.get('mes');
  if (pedido && !/^\d{4}-\d{2}$/.test(pedido)) {
    return NextResponse.json({ error: 'mes deve ser AAAA-MM' }, { status: 400 });
  }
  const mes = pedido ?? somarDias(hojeISO(), -1).slice(0, 7);

  try {
    const { obras } = await carregarObras({ desde: inicioMes(`${mes}-01`), comLocais: false });
    const r = resumoDoMes(obras, mes);
    const fechamento = {
      valorProduzido: r.valorProduzido,
      valorPrevisto: r.valorPrevisto,
      metaValor: META_MENSAL,
      caixilhosTotal: r.caixilhosTotal,
      caixilhosProntos: r.caixilhosProntos,
      obrasSemValor: r.obrasSemValor,
      gravadoEm: new Date().toISOString(),
    };
    await gravarFechamento(mes, fechamento);
    // Vai para os logs da Vercel: histórico do que foi gravado a cada noite
    console.log('fechamento-mes', mes, JSON.stringify(fechamento));
    return NextResponse.json({ mes, ...fechamento });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
