import {
  jiraFetch, searchAllIssues, listEpicSubtasks, getExpeditedAt, emLotes,
  type JiraIssueLite,
} from './jira';
import { canonicalStatus } from './status';

// ─── Anotação dos expedidos que saem da busca ────────────────────────────────
//
// Arquivado some da JQL, e o "expedidos nos últimos 7 dias" do Resumo é uma
// JQL. Antes de arquivar, a hora em que cada subtask foi expedida vai para uma
// propriedade do projeto no Jira; o Resumo soma isso à contagem da busca.

const PROPRIEDADE = 'jira-scan-app.expedidos-arquivados';
/** Um dia além da janela de 7 dias do Resumo */
const RETER_MS = 8 * 24 * 3600_000;

/**
 * Subtasks arquivadas por hora UTC em que foram expedidas ("2026-09-24T21").
 * Resolução de 1h: a janela do Resumo pode errar por até uma hora na borda.
 */
type Horas = Record<string, number>;

const hora = (d: Date) => d.toISOString().slice(0, 13);

export async function lerExpedidosArquivados(project: string): Promise<Horas> {
  try {
    const r = await jiraFetch(`/rest/api/3/project/${project}/properties/${PROPRIEDADE}`);
    return (r?.value?.horas ?? {}) as Horas;
  } catch {
    return {}; // 404 até o primeiro arquivamento
  }
}

/** Subtasks arquivadas que foram expedidas a partir de `desde` */
export function somarDesde(horas: Horas, desde: Date): number {
  const corte = hora(desde);
  return Object.entries(horas).reduce((s, [h, n]) => (h >= corte ? s + n : s), 0);
}

async function anotar(project: string, instantes: string[]) {
  if (instantes.length === 0) return;
  const horas = await lerExpedidosArquivados(project);
  for (const t of instantes) {
    const h = hora(new Date(t));
    horas[h] = (horas[h] ?? 0) + 1;
  }
  const corte = hora(new Date(Date.now() - RETER_MS));
  for (const h of Object.keys(horas)) if (h < corte) delete horas[h];
  await jiraFetch(`/rest/api/3/project/${project}/properties/${PROPRIEDADE}`, {
    method: 'PUT',
    body: JSON.stringify({ horas }),
  });
}

// ─── Arquivamento ────────────────────────────────────────────────────────────

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
  arquivados: Array<{ epico: string; resumo: string; tickets: number; expedidosAnotados: number }>;
  pulados: Array<{ epico: string; motivo: string }>;
  erros: Array<{ epico: string; erro: string }>;
  /** Parou pelo limite de tempo; o resto fica para a próxima noite */
  incompleto: boolean;
}

/**
 * Arquiva os projetos cuja expedição terminou: Épico, Tasks e Subtasks todos
 * em Expedido. Confere tudo na hora — alguém pode ter voltado um status desde
 * que o Épico foi para Expedido. Pula o que terminou hoje, para a TV e o
 * "expedidos hoje" do Resumo seguirem certos.
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
  opts: { simular?: boolean; somente?: string; incluirHoje?: boolean; prazoMs?: number } = {},
): Promise<ResultadoArquivo> {
  const inicio = Date.now();
  const prazo = opts.prazoMs ?? 240_000;
  const res: ResultadoArquivo = {
    simulacao: !!opts.simular, arquivados: [], pulados: [], erros: [], incompleto: false,
  };

  const epicos = await searchAllIssues(
    opts.somente
      ? `key = "${opts.somente}" AND issuetype = Epic`
      : `project = "${project}" AND issuetype = Epic AND status = "Expedido" ORDER BY key ASC`,
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
      if (!opts.incluirHoje && (await buscarEntre(keys, 'status CHANGED TO "Expedido" AFTER startOfDay()')).length > 0) {
        res.pulados.push({ epico: e.key, motivo: 'terminou de expedir hoje' });
        continue;
      }

      // Só as subtasks expedidas dentro da janela do Resumo precisam de
      // horário (changelog); um projeto antigo não custa chamada nenhuma
      const recentes = subs.length
        ? await buscarEntre(subs.map((i) => i.key), 'status CHANGED TO "Expedido" AFTER -8d')
        : [];
      const instantes = (await emLotes(recentes, 5, (s) => getExpeditedAt(s.key)))
        .filter((t): t is string => !!t && Date.parse(t) > Date.now() - RETER_MS);

      let anotados = instantes.length;
      if (!opts.simular) {
        await arquivarIssues([e.key, ...tasks.map((i) => i.key)]);
        // Depois de arquivar: se falhar aqui, o Resumo conta a menos, e não
        // em dobro para sempre (o que aconteceria anotando antes e o
        // arquivamento falhando)
        try {
          await anotar(project, instantes);
        } catch (err) {
          anotados = 0;
          res.erros.push({ epico: e.key, erro: `arquivado, mas a anotação dos expedidos falhou: ${String(err).slice(0, 200)}` });
        }
      }
      res.arquivados.push({ epico: e.key, resumo, tickets: keys.length, expedidosAnotados: anotados });
    } catch (err) {
      res.erros.push({ epico: e.key, erro: String(err).slice(0, 300) });
    }
  }
  return res;
}
