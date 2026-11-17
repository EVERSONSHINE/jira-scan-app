import { jiraFetch } from './jira';
import { mesAtual, somarMeses } from './calendario';
import { carregarMesFechado, producaoDoMes, META_MENSAL } from './producao';

/**
 * Fechamento mensal: o resultado de cada mês fica gravado numa propriedade do
 * projeto no Jira, porque o arquivamento tira as obras da busca.
 *
 * A ordem é o que garante o histórico: o cron da madrugada primeiro fecha o
 * mês anterior (com tudo ainda vivo no Jira) e só depois arquiva — e só
 * arquiva obras cuja expedição terminou antes do mês corrente
 * (lib/arquivo.ts). Se o fechamento falhar, o arquivamento não roda.
 */

const PROPRIEDADE = 'jira-scan-app.fechamentos';

/**
 * Primeiro mês com fechamento. Meses anteriores já tinham obras arquivadas
 * pela regra antiga (arquivava no dia seguinte à expedição): fechá-los agora
 * gravaria um resultado incompleto como se fosse real.
 */
export const PRIMEIRO_FECHAMENTO = '2026-11';

/** Quantos meses o histórico guarda (a propriedade do Jira tem teto de 32 KB) */
const RETER_MESES = 24;

export interface Fechamento {
  mes: string;
  meta: number;
  valorProduzido: number;
  pecas: number;
  caixilhos: number;
  obrasSemValor: number;
  obrasEntregues: number;
  valorEntregue: number;
  fechadoEm: string;
}

export async function lerFechamentos(project: string): Promise<Record<string, Fechamento>> {
  try {
    const r = await jiraFetch(`/rest/api/3/project/${project}/properties/${PROPRIEDADE}`);
    return (r?.value?.meses ?? {}) as Record<string, Fechamento>;
  } catch {
    return {}; // 404 até o primeiro fechamento
  }
}

async function gravar(project: string, meses: Record<string, Fechamento>) {
  const corte = somarMeses(mesAtual(), -RETER_MESES);
  for (const m of Object.keys(meses)) if (m < corte) delete meses[m];
  await jiraFetch(`/rest/api/3/project/${project}/properties/${PROPRIEDADE}`, {
    method: 'PUT',
    body: JSON.stringify({ meses }),
  });
}

export async function calcularFechamento(project: string, mes: string): Promise<Fechamento> {
  const { obras, concluidos, entregues } = await carregarMesFechado(project, mes);
  const prod = producaoDoMes(obras, concluidos);
  const obrasEntregues = obras.filter((o) => entregues.has(o.key));
  return {
    mes,
    meta: META_MENSAL,
    valorProduzido: prod.valor,
    pecas: prod.pecas,
    caixilhos: prod.caixilhos,
    obrasSemValor: prod.obrasSemValor,
    obrasEntregues: obrasEntregues.length,
    valorEntregue: obrasEntregues.reduce((s, o) => s + (o.valor ?? 0), 0),
    fechadoEm: new Date().toISOString(),
  };
}

export interface ResultadoFechamento {
  mes: string;
  /** já existia, foi gravado agora, ou é anterior ao primeiro fechamento */
  situacao: 'existente' | 'gravado' | 'simulado' | 'antes-do-inicio';
  fechamento?: Fechamento;
}

/** Garante o fechamento do mês anterior. Lança erro se não conseguir gravar. */
export async function garantirFechamento(
  project: string,
  opts: { simular?: boolean } = {},
): Promise<ResultadoFechamento> {
  const mes = somarMeses(mesAtual(), -1);
  if (mes < PRIMEIRO_FECHAMENTO) return { mes, situacao: 'antes-do-inicio' };
  const meses = await lerFechamentos(project);
  if (meses[mes]) return { mes, situacao: 'existente', fechamento: meses[mes] };
  const fechamento = await calcularFechamento(project, mes);
  if (opts.simular) return { mes, situacao: 'simulado', fechamento };
  await gravar(project, { ...meses, [mes]: fechamento });
  return { mes, situacao: 'gravado', fechamento };
}
