import { jiraFetch, searchAllIssues, listEpicSubtasks, type JiraIssueLite } from './jira';
import { canonicalStatus } from './status';

/**
 * Quanto tempo uma obra expedida fica visível antes de ser arquivada.
 *
 * Arquivado some da JQL. A meta do mês (obras com entrega no mês, inclusive as
 * já expedidas) e os Indicadores (entregas no prazo dos últimos 3 meses, ritmo
 * das últimas 12 semanas) leem tudo direto do Jira — então a obra precisa
 * continuar na busca por esse período. 100 dias cobrem as 12 semanas do
 * gráfico de ritmo e os 3 meses de prazo com folga.
 */
export const ARQUIVAR_APOS_DIAS = Number(process.env.ARQUIVAR_APOS_DIAS) || 100;

const statusDe = (i: JiraIssueLite) =>
  canonicalStatus(String((i.fields.status as { name?: string })?.name ?? ''));

/** JQL sobre uma lista de chaves, em blocos — `key in (...)` longo estoura a URL */
async function buscarEntre(keys: string[], filtro: string): Promise<JiraIssueLite[]> {
  const out: JiraIssueLite[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    out.push(...await searchAllIssues(`key in (${keys.slice(i, i + 100).join(',')}) AND ${filtro}`, ['status']));
  }
  return out;
}

/** Arquiva de uma vez; o Jira aceita até 1000 por pedido */
async function arquivarIssues(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const r = await jiraFetch('/rest/api/3/issue/archive', {
      method: 'PUT',
      body: JSON.stringify({ issueIdsOrKeys: keys.slice(i, i + 1000) }),
    });
    const erros = r?.errors && Object.keys(r.errors).length ? JSON.stringify(r.errors) : '';
    if (erros) throw new Error(`Jira recusou parte do arquivamento: ${erros.slice(0, 300)}`);
  }
}

export interface ResultadoArquivo {
  simulacao: boolean;
  arquivados: Array<{ epico: string; resumo: string; tickets: number }>;
  pulados: Array<{ epico: string; motivo: string }>;
  erros: Array<{ epico: string; erro: string }>;
  /** Parou pelo limite de tempo; o resto fica para a próxima noite */
  incompleto: boolean;
}

/**
 * Arquiva os projetos cuja expedição terminou há mais de ARQUIVAR_APOS_DIAS:
 * Épico, Tasks e Subtasks todos em Expedido, e nenhum deles movido para
 * Expedido dentro do prazo. Confere tudo na hora — alguém pode ter voltado um
 * status desde que o Épico foi para Expedido.
 *
 * Vão para o Jira o Épico e as Tasks, explicitamente. Subtask não: o Jira
 * recusa arquivá-la direto ("Issue is a subtask") e a arquiva junto com a Task
 * mãe — as duas coisas verificadas.
 *
 * Idempotente: o que foi arquivado some da busca e não é visto de novo; o que
 * sobrar por limite de tempo é pego na noite seguinte.
 */
export async function arquivarExpedidos(
  project: string,
  opts: { simular?: boolean; somente?: string; semEspera?: boolean; prazoMs?: number } = {},
): Promise<ResultadoArquivo> {
  const inicio = Date.now();
  const prazo = opts.prazoMs ?? 240_000;
  const espera = `status CHANGED TO "Expedido" AFTER -${ARQUIVAR_APOS_DIAS}d`;
  const res: ResultadoArquivo = {
    simulacao: !!opts.simular, arquivados: [], pulados: [], erros: [], incompleto: false,
  };

  // A própria busca já descarta os Épicos expedidos há pouco: a noite não
  // gasta chamadas com obra que ainda vai ficar visível
  const epicos = await searchAllIssues(
    opts.somente
      ? `key = "${opts.somente}" AND issuetype = Epic`
      : `project = "${project}" AND issuetype = Epic AND status = "Expedido" AND NOT ${espera} ORDER BY key ASC`,
    ['summary', 'status'],
  );

  for (const e of epicos) {
    if (Date.now() - inicio > prazo) { res.incompleto = true; break; }
    const resumo = String(e.fields.summary ?? '');
    try {
      if (statusDe(e) !== 'Expedido') {
        res.pulados.push({ epico: e.key, motivo: 'épico não está em Expedido' });
        continue;
      }
      const [tasks, subs] = await Promise.all([
        searchAllIssues(`parent = "${e.key}"`, ['status']),
        listEpicSubtasks(e.key, ['status']),
      ]);
      const fora = [...tasks, ...subs].filter((i) => statusDe(i) !== 'Expedido');
      if (fora.length > 0) {
        res.pulados.push({
          epico: e.key,
          motivo: `${fora.length} fora de Expedido: ${fora.slice(0, 5).map((i) => i.key).join(', ')}${fora.length > 5 ? '…' : ''}`,
        });
        continue;
      }

      const keys = [e.key, ...tasks.map((i) => i.key), ...subs.map((i) => i.key)];
      // Uma peça pode ter voltado e sido expedida de novo depois do Épico
      if (!opts.semEspera && (await buscarEntre(keys, espera)).length > 0) {
        res.pulados.push({ epico: e.key, motivo: `expedido há menos de ${ARQUIVAR_APOS_DIAS} dias` });
        continue;
      }

      if (!opts.simular) await arquivarIssues([e.key, ...tasks.map((i) => i.key)]);
      res.arquivados.push({ epico: e.key, resumo, tickets: keys.length });
    } catch (err) {
      res.erros.push({ epico: e.key, erro: String(err).slice(0, 300) });
    }
  }
  return res;
}
