import { NextResponse } from 'next/server';
import { carregarHierarquia } from '@/lib/hierarquia';
import {
  metaMensal, mesAtual, mesDe, diaBR, diasUteis, marcosDe, lerRegistro, mesProducaoVazio,
} from '@/lib/obras';
import { resumirObra, porEntrega, soma } from '@/lib/visao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Quantas obras cada lista do painel manda (a TV mostra o que couber) */
const LIMITE_LISTA = 12;

/**
 * Painel da produção (TV): meta do mês, obras com entrega no mês, entregas
 * mais próximas e o que vem a seguir para produzir.
 *
 * Meta: o Valor da obra entra inteiro no mês em que ela chega a Concluído.
 * Obras já arquivadas vêm do registro que o arquivamento grava (lib/obras.ts).
 */
export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    const hoje = diaBR(new Date());
    const mes = mesAtual();
    const [{ obras }, registro] = await Promise.all([carregarHierarquia(project), lerRegistro(project)]);
    const marcos = await marcosDe(obras.map((o) => o.row));
    const resumos = obras.map((o) => resumirObra(o, hoje));

    // ── Realizado no mês: concluídas no mês (ao vivo) + arquivadas (registro)
    const arquivado = registro.producao[mes] ?? mesProducaoVazio();
    const concluidasNoMes = resumos.filter((r) => {
      const at = marcos.get(r.key)?.concluidoAt;
      return at && mesDe(at) === mes;
    });
    const realizado = {
      valor: soma(concluidasNoMes.map((r) => r.valor)) + arquivado.valor,
      obras: concluidasNoMes.length + arquivado.obras,
      semValor: concluidasNoMes.filter((r) => r.valor === null).length + arquivado.semValor,
      lista: concluidasNoMes
        .map((r) => ({ key: r.key, cliente: r.cliente, valor: r.valor, concluidoAt: marcos.get(r.key)!.concluidoAt }))
        .sort((a, b) => (b.concluidoAt ?? '').localeCompare(a.concluidoAt ?? '')),
    };

    const meta = metaMensal();
    const du = diasUteis(mes, hoje);

    // ── Obras com Data de entrega neste mês (todas, inclusive já expedidas)
    const doMes = resumos.filter((r) => r.duedate && mesDe(r.duedate) === mes);
    const mesEntrega = {
      obras: doMes.length,
      obrasProntas: doMes.filter((r) => r.situacao === 'concluida' || r.situacao === 'expedida').length,
      caixilhos: soma(doMes.map((r) => r.caixilhos)),
      caixilhosProntos: soma(doMes.map((r) => r.caixilhosProntos)),
      quadros: soma(doMes.map((r) => r.quadros)),
      quadrosProntos: soma(doMes.map((r) => r.quadrosProntos)),
      valor: soma(doMes.map((r) => r.valor)),
      semValor: doMes.filter((r) => r.valor === null).length,
    };

    // ── Ainda não entregues (fora Expedido), pela data de entrega
    const abertas = resumos.filter((r) => r.situacao !== 'expedida' && r.situacao !== 'concluida');
    const entregas = abertas.filter((r) => r.duedate).sort(porEntrega).slice(0, LIMITE_LISTA);
    // Ainda não começaram (inclusive as já atrasadas), pela data de entrega
    const aProduzir = abertas.filter((r) => r.status === 'Tarefas Pendentes').sort(porEntrega).slice(0, LIMITE_LISTA);

    return NextResponse.json({
      mes,
      hoje,
      meta,
      realizado,
      ritmo: {
        diasUteis: du.total,
        diasDecorridos: du.decorridos,
        esperadoAteHoje: du.total ? Math.round((meta * du.decorridos) / du.total) : 0,
      },
      mesEntrega,
      entregas,
      aProduzir,
      emProducao: abertas.filter((r) => r.situacao === 'producao' || r.situacao === 'parada' || (r.situacao === 'atrasada' && r.status === 'Em Andamento')).length,
      qualidade: {
        semData: abertas.filter((r) => !r.duedate).length,
        semValor: abertas.filter((r) => r.valor === null).length,
        abertas: abertas.length,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
