import {
  carregarBase, producaoDoMes, metaDoMes, resumirObra, porEntrega,
  type Base, type ObraResumo,
} from './producao';
import { mesDe } from './calendario';

/**
 * Números do mês que o Painel e os Indicadores mostram iguais — os dois têm
 * que concordar, senão a TV e a diretoria discutem números diferentes.
 */
export function numerosDoMes(base: Base) {
  const { obras, mes, hoje, concluidos } = base;
  const resumos = obras.map((o) => resumirObra(o, hoje)).sort(porEntrega);
  const producao = producaoDoMes(obras, concluidos);
  const meta = metaDoMes(mes, hoje, producao.valor);

  // Programado: obras com entrega neste mês, em qualquer etapa (as já
  // expedidas continuam no Jira até o fechamento do mês)
  const doMes = resumos.filter((o) => o.entrega && mesDe(o.entrega) === mes);
  const programado = {
    obras: doMes.length,
    caixilhos: doMes.reduce((s, o) => s + o.caixilhos.total, 0),
    caixilhosProntos: doMes.reduce((s, o) => s + o.caixilhos.prontos, 0),
    valor: doMes.reduce((s, o) => s + (o.valor ?? 0), 0),
    obrasSemValor: doMes.filter((o) => o.valor === null).length,
  };

  // Atrasadas de meses anteriores ainda com produção pendente: somam no que falta
  const atrasadasAnteriores = resumos.filter(
    (o) => o.atrasada && o.entrega && mesDe(o.entrega) < mes && o.etapa !== 'Concluido',
  );
  const atrasadas = resumos.filter((o) => o.atrasada);

  return {
    mes, hoje, resumos, producao, meta, programado,
    atrasadas: {
      obras: atrasadas.length,
      emProducao: atrasadas.filter((o) => o.etapa !== 'Concluido').length,
      caixilhosPendentesAnteriores: atrasadasAnteriores.reduce(
        (s, o) => s + o.caixilhos.total - o.caixilhos.prontos, 0,
      ),
    },
    semana: resumos.filter(
      (o) => o.etapa !== 'Expedido' && o.diasParaEntrega !== null && o.diasParaEntrega >= 0 && o.diasParaEntrega <= 7,
    ).length,
  };
}

export type { ObraResumo };
export { carregarBase };
