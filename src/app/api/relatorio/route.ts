import { NextResponse } from 'next/server';
import { carregarHierarquia } from '@/lib/hierarquia';
import { diaBR } from '@/lib/obras';
import { resumirObra, porEntrega } from '@/lib/visao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Relatório do PCP: todas as obras ainda não expedidas com os quadros de cada
 * uma (código, caixilho, modelo, tipo, medidas, cor, localização e etapa).
 * O agrupamento por obra ou por local é feito na tela.
 */
export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    const hoje = diaBR(new Date());
    const { obras } = await carregarHierarquia(project);

    const saida = obras
      .filter((o) => o.row.status !== 'Expedido')
      .map((o) => {
        const caixilhoPorKey = new Map(o.caixilhos.map((c) => [c.key, c]));
        return {
          obra: resumirObra(o, hoje),
          quadros: o.quadros.map((q) => ({
            key: q.key,
            summary: q.summary,
            caixilho: q.parentKey,
            caixilhoNome: caixilhoPorKey.get(q.parentKey)?.summary ?? '',
            modelo: q.modelo,
            tipo: q.tipo,
            largura: q.largura,
            altura: q.altura,
            cor: q.cor,
            loc: q.loc,
            status: q.status,
          })),
        };
      })
      .sort((a, b) => porEntrega(a.obra, b.obra));

    return NextResponse.json({ obras: saida, hoje, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
