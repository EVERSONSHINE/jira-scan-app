import { NextResponse } from 'next/server';
import { carregarBase, numerosDoMes } from '@/lib/painelDados';

export const dynamic = 'force-dynamic';
// Paginação do projeto inteiro pode passar dos 10s padrão da Vercel
export const maxDuration = 60;

/** TV da produção: meta do mês, caixilhos a fazer e obras por prazo de entrega */
export async function GET() {
  try {
    const base = await carregarBase(process.env.JIRA_PROJECT_KEY ?? '');
    const n = numerosDoMes(base);
    return NextResponse.json({
      mes: n.mes,
      hoje: n.hoje,
      meta: n.meta,
      producao: { pecas: n.producao.pecas, caixilhos: n.producao.caixilhos, obrasSemValor: n.producao.obrasSemValor },
      programado: n.programado,
      atrasadas: n.atrasadas,
      semana: n.semana,
      // Fila da produção: o que ainda tem peça por fazer, prazo mais curto primeiro
      fila: n.resumos.filter((o) => o.etapa === 'Tarefas Pendentes' || o.etapa === 'Em Andamento' || o.etapa === 'Outros'),
      // Prontas, esperando a expedição
      prontas: n.resumos
        .filter((o) => o.etapa === 'Concluido')
        .map((o) => ({ key: o.key, cliente: o.cliente, entrega: o.entrega, diasParaEntrega: o.diasParaEntrega })),
      fetchedAt: base.carregadoEm,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
