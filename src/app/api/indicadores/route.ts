import { NextResponse } from 'next/server';
import {
  carregarObras, calcularMeta, contarConcluidos, ehUtil, fracaoPronta, inicioMes, inicioTrimestre,
  lerFechamentos, memo, montarTrimestre, prazoPorMes, semanas, somarDias, somarMeses,
} from '@/lib/producao';
import { hojeISO } from '@/lib/formato';
import type { IndicadoresData } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Até esta data o arquivamento noturno tirava as obras expedidas da busca no
 * dia seguinte; dali em diante elas ficam 100 dias. Antes disso, prazo e ritmo
 * contam a menos.
 */
const HISTORICO_DESDE = '2026-11-17';

/** Indicadores da diretoria. Pesado (várias contagens no Jira): guardado 5 min */
export async function GET() {
  try {
    const data = await memo('indicadores', 5 * 60_000, async (): Promise<IndicadoresData> => {
      const hoje = hojeISO();
      const mesAtual = inicioMes(hoje);
      const meses = [-2, -1, 0].map((n) => somarMeses(mesAtual, n).slice(0, 7));

      // 3 meses de prazo cobrem também o início do trimestre
      const desde = [somarMeses(mesAtual, -2), inicioTrimestre(hoje)].sort()[0];
      const { obras } = await carregarObras({ desde, comLocais: false });
      const meta = calcularMeta(obras, hoje);

      const [semanasProd, prazo, concluidosMes, fechamentos] = await Promise.all([
        semanas(hoje, 12),
        prazoPorMes(obras, hoje, meses),
        contarConcluidos(mesAtual, somarDias(hoje, 1)),
        lerFechamentos(),
      ]);

      // Ritmo: caixilhos concluídos no mês ÷ dias úteis já trabalhados (hoje conta)
      const decorridos = meta.diasUteis.passados + (ehUtil(hoje) ? 1 : 0);
      const futuros = Math.max(meta.diasUteis.total - decorridos, 0);
      const ritmoDia = concluidosMes !== null && decorridos > 0 ? concluidosMes / decorridos : null;
      const faltamMes = Math.max(meta.caixilhosTotal - meta.caixilhosProntos, 0);
      const aindaFazer = ritmoDia !== null ? Math.min(faltamMes, Math.round(ritmoDia * futuros)) : null;
      const caixilhosProjetados = aindaFazer !== null ? meta.caixilhosProntos + aindaFazer : null;
      const valorProjetado = aindaFazer !== null
        ? Math.round(meta.valorProduzido +
            (meta.valorPrevisto - meta.valorProduzido) * (faltamMes > 0 ? aindaFazer / faltamMes : 1))
        : null;

      const abertas = obras
        .filter((o) => o.status !== 'Expedido')
        .sort((a, b) => (a.duedate ?? '9999').localeCompare(b.duedate ?? '9999'));
      const caixilhosFaltando = abertas.reduce((s, o) => s + (o.caixilhos.total - o.caixilhos.prontos), 0);

      // Média das 4 últimas semanas fechadas (a atual ainda está em curso)
      const fechadas = semanasProd.slice(-5, -1).map((s) => s.caixilhos).filter((n): n is number => n !== null);
      const mediaSemanal = fechadas.length ? fechadas.reduce((a, b) => a + b, 0) / fechadas.length : null;

      return {
        hoje,
        meta,
        trimestre: montarTrimestre(obras, hoje, fechamentos),
        projecao: { concluidosMes, ritmoDia, caixilhosProjetados, valorProjetado },
        semanas: semanasProd,
        metaSemanal: meta.diasUteis.total > 0
          ? Math.ceil(meta.caixilhosTotal / (meta.diasUteis.total / 5))
          : null,
        prazo,
        carteira: {
          obras: abertas.length,
          caixilhosFaltando,
          valorAberto: Math.round(abertas.reduce((s, o) => s + (o.valor ?? 0) * (1 - fracaoPronta(o)), 0)),
          obrasSemValor: abertas.filter((o) => o.valor === null).length,
          semanasDeProducao: mediaSemanal && mediaSemanal > 0 ? caixilhosFaltando / mediaSemanal : null,
        },
        atrasadas: abertas.filter((o) => o.dias !== null && o.dias < 0),
        abertas,
        historicoDesde: HISTORICO_DESDE,
        fetchedAt: new Date().toISOString(),
      };
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
