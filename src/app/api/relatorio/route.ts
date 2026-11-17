import { NextResponse } from 'next/server';
import { carregarBase, etapaDaObra } from '@/lib/producao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Relatório do PCP: todas as obras vivas, com caixilhos e peças */
export async function GET() {
  try {
    const base = await carregarBase(process.env.JIRA_PROJECT_KEY ?? '');
    return NextResponse.json({
      obras: base.obras.map((o) => ({
        key: o.key,
        cliente: o.cliente || o.summary,
        documento: o.documento,
        entrega: o.entrega,
        etapa: etapaDaObra(o),
        caixilhos: o.caixilhos.map((c) => ({
          key: c.key, tipo: c.tipo, cor: c.cor, status: c.status,
          pecas: c.pecas.map((p) => ({
            key: p.key, status: p.status, modelo: p.modelo, codigo: p.codigo,
            largura: p.largura, altura: p.altura, loc: p.loc,
          })),
        })),
      })),
      hoje: base.hoje,
      fetchedAt: base.carregadoEm,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
