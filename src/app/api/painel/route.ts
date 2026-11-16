import { NextResponse } from 'next/server';
import { carregarObras, calcularMeta, inicioTrimestre, lerFechamentos, memo, montarTrimestre } from '@/lib/producao';
import { hojeISO } from '@/lib/formato';
import type { PainelData } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Painel da TV: meta do mês (obras com entrega prevista no mês), o trimestre
 * da bonificação e as obras não expedidas pela data de entrega. Guardado 25s: a TV consulta a cada 30s.
 */
export async function GET() {
  try {
    const data = await memo('painel', 25_000, async (): Promise<PainelData> => {
      // Desde o início do trimestre: os meses já passados entram na bonificação
      const [{ hoje, obras }, fechamentos] = await Promise.all([
        carregarObras({ desde: inicioTrimestre(hojeISO()), comLocais: true }),
        lerFechamentos(),
      ]);
      const abertas = obras.filter((o) => o.status !== 'Expedido');
      return {
        hoje,
        meta: calcularMeta(obras, hoje),
        trimestre: montarTrimestre(obras, hoje, fechamentos),
        entregas: abertas
          .filter((o) => o.duedate)
          .sort((a, b) => a.duedate!.localeCompare(b.duedate!) || a.key.localeCompare(b.key, 'pt-BR', { numeric: true })),
        semData: abertas.filter((o) => !o.duedate).length,
        fetchedAt: new Date().toISOString(),
      };
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
