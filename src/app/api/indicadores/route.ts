import { NextResponse } from 'next/server';
import { carregarHierarquia } from '@/lib/hierarquia';
import {
  metaMensal, mesAtual, somarMeses, diaBR, diasUteis, marcosDe, lerRegistro, somarObra,
  juntarRegistros, mesProducaoVazio, mesEntregaVazio, type Registro,
} from '@/lib/obras';
import { resumirObra, soma } from '@/lib/visao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Meses na série histórica, contando o atual */
const MESES = 6;
/** Janela (meses fechados + atual) dos indicadores de entrega e lead time */
const JANELA_ENTREGA = 3;

/**
 * Indicadores da diretoria: meta x realizado por mês, entregas no prazo,
 * carteira e ritmo, riscos. O histórico junta as obras ainda no Jira com o
 * registro que o arquivamento grava das obras arquivadas (lib/obras.ts).
 */
export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    const hoje = diaBR(new Date());
    const mes = mesAtual();
    const [{ obras }, arquivado] = await Promise.all([carregarHierarquia(project), lerRegistro(project)]);
    const marcos = await marcosDe(obras.map((o) => o.row));
    const resumos = obras.map((o) => resumirObra(o, hoje));

    const aoVivo: Registro = { producao: {}, entregas: {} };
    for (const o of obras) {
      const m = marcos.get(o.row.key);
      if (!m) continue;
      somarObra(aoVivo, {
        valor: o.row.valor, duedate: o.row.duedate, inicio: o.row.inicio, created: o.row.created,
        quadros: o.quadros.length, caixilhos: o.caixilhos.length, marcos: m,
      });
    }
    const reg = juntarRegistros(aoVivo, arquivado);
    const meta = metaMensal();

    const meses = Array.from({ length: MESES }, (_, i) => somarMeses(mes, i - (MESES - 1)));
    const producao = meses.map((m) => ({ mes: m, meta, ...(reg.producao[m] ?? mesProducaoVazio()) }));

    const du = diasUteis(mes, hoje);
    const atual = reg.producao[mes] ?? mesProducaoVazio();
    const projecao = du.decorridos > 0 ? Math.round((atual.valor / du.decorridos) * du.total) : 0;

    const entregas = meses.map((m) => {
      const e = reg.entregas[m] ?? mesEntregaVazio();
      return {
        mes: m,
        comPrazo: e.comPrazo,
        noPrazo: e.noPrazo,
        pct: e.comPrazo ? Math.round((e.noPrazo / e.comPrazo) * 100) : null,
        atrasoMedio: e.comPrazo - e.noPrazo > 0 ? Math.round(e.atrasoDias / (e.comPrazo - e.noPrazo)) : null,
      };
    });
    const janela = meses.slice(-JANELA_ENTREGA).map((m) => reg.entregas[m] ?? mesEntregaVazio());
    const jComPrazo = soma(janela.map((e) => e.comPrazo));
    const jNoPrazo = soma(janela.map((e) => e.noPrazo));
    const jLeadN = soma(janela.map((e) => e.leadN));

    const abertas = resumos.filter((r) => r.situacao !== 'expedida');
    const naoConcluidas = abertas.filter((r) => r.situacao !== 'concluida');
    const ordemValor = (a: { valor: number | null }, b: { valor: number | null }) => (b.valor ?? -1) - (a.valor ?? -1);

    return NextResponse.json({
      mes,
      hoje,
      meta,
      mesAtual: { ...atual, projecao, diasUteis: du.total, diasDecorridos: du.decorridos },
      producao,
      entregas,
      prazoJanela: {
        meses: JANELA_ENTREGA,
        comPrazo: jComPrazo,
        noPrazo: jNoPrazo,
        pct: jComPrazo ? Math.round((jNoPrazo / jComPrazo) * 100) : null,
        leadTimeMedio: jLeadN ? Math.round(soma(janela.map((e) => e.leadDias)) / jLeadN) : null,
      },
      carteira: {
        obras: naoConcluidas.length,
        valor: soma(naoConcluidas.map((r) => r.valor)),
        semValor: naoConcluidas.filter((r) => r.valor === null).length,
        caixilhos: soma(naoConcluidas.map((r) => r.caixilhos)),
        quadros: soma(naoConcluidas.map((r) => r.quadros)),
        quadrosProntos: soma(naoConcluidas.map((r) => r.quadrosProntos)),
        porSituacao: {
          pendente: naoConcluidas.filter((r) => r.situacao === 'pendente').length,
          producao: naoConcluidas.filter((r) => r.situacao === 'producao').length,
          parada: naoConcluidas.filter((r) => r.situacao === 'parada').length,
          atrasada: naoConcluidas.filter((r) => r.situacao === 'atrasada').length,
        },
        aguardandoExpedicao: {
          obras: abertas.filter((r) => r.situacao === 'concluida').length,
          valor: soma(abertas.filter((r) => r.situacao === 'concluida').map((r) => r.valor)),
        },
      },
      riscos: {
        atrasadas: naoConcluidas.filter((r) => r.situacao === 'atrasada').sort(ordemValor),
        paradas: naoConcluidas.filter((r) => r.situacao === 'parada').sort(ordemValor),
        semData: naoConcluidas.filter((r) => !r.duedate).map((r) => ({ key: r.key, cliente: r.cliente })),
        semValor: naoConcluidas.filter((r) => r.valor === null).map((r) => ({ key: r.key, cliente: r.cliente })),
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
