import { NextResponse } from 'next/server';
import { carregarBase, numerosDoMes } from '@/lib/painelDados';
import { cargaPorMes, pronto } from '@/lib/producao';
import { lerFechamentos } from '@/lib/fechamento';
import { somarMeses } from '@/lib/calendario';
import { STATUS_ORDER } from '@/lib/status';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Meses no gráfico de produção mensal, contando o atual */
const HISTORICO_MESES = 6;

/** Indicadores da diretoria: meta, carteira, entregas, riscos */
export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    const [base, fechamentos] = await Promise.all([carregarBase(project), lerFechamentos(project)]);
    const n = numerosDoMes(base);
    const abertas = n.resumos.filter((o) => o.etapa !== 'Expedido');

    const historico = Array.from({ length: HISTORICO_MESES }, (_, i) => somarMeses(n.mes, i - HISTORICO_MESES + 1))
      .map((mes) => {
        if (mes === n.mes) {
          return { mes, valor: n.producao.valor, caixilhos: n.producao.caixilhos, meta: n.meta.meta, parcial: true };
        }
        const f = fechamentos[mes];
        return f
          ? { mes, valor: f.valorProduzido, caixilhos: f.caixilhos, meta: f.meta, parcial: false }
          : { mes, valor: null, caixilhos: null, meta: n.meta.meta, parcial: false };
      });

    const entregues = base.obras.filter((o) => base.entregues.has(o.key));

    const wip: Record<string, number> = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
    for (const o of abertas) for (const [s, q] of Object.entries(o.pecas.porStatus)) wip[s] = (wip[s] ?? 0) + q;

    return NextResponse.json({
      mes: n.mes,
      hoje: n.hoje,
      meta: n.meta,
      producao: n.producao,
      programado: n.programado,
      atrasadas: n.atrasadas,
      historico,
      entregues: {
        obras: entregues.length,
        valor: entregues.reduce((s, o) => s + (o.valor ?? 0), 0),
        semValor: entregues.filter((o) => o.valor === null).length,
      },
      pecasExpedidasMes: base.pecasExpedidasMes,
      carteira: {
        obras: abertas.length,
        valor: abertas.reduce((s, o) => s + (o.valor ?? 0), 0),
        valorPendente: abertas.reduce((s, o) => s + (o.valorPendente ?? 0), 0),
        caixilhos: abertas.reduce((s, o) => s + o.caixilhos.total, 0),
        caixilhosProntos: abertas.reduce((s, o) => s + o.caixilhos.prontos, 0),
        prontasAguardando: abertas.filter((o) => pronto(o.etapa)).length,
      },
      carga: cargaPorMes(abertas, n.mes),
      wip,
      obras: abertas,
      qualidade: {
        semValor: abertas.filter((o) => o.valor === null).map((o) => ({ key: o.key, cliente: o.cliente })),
        semEntrega: abertas.filter((o) => !o.entrega).map((o) => ({ key: o.key, cliente: o.cliente })),
      },
      fetchedAt: base.carregadoEm,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
