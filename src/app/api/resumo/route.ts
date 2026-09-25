import { NextResponse } from 'next/server';
import { searchAllIssues, jiraFetch, normalize, cfValue, CF } from '@/lib/jira';
import { lerExpedidosArquivados, somarDesde } from '@/lib/arquivo';
import { canonicalStatus, STATUS_ORDER } from '@/lib/status';

export const dynamic = 'force-dynamic';
// Paginação de todo o projeto no Jira pode passar dos 10s padrão da Vercel
export const maxDuration = 60;

const PARADO_DIAS = 7;
/** Quantos projetos recém-concluídos ocupam o topo da grade (3 linhas de 5 na TV) */
const DESTAQUE_MAX = 15;
/** Janela da JQL que descobre quais quadros passaram por "Concluido" */
const CONCLUIDO_JANELA = '-30d';

interface QuadroNode {
  key: string; status: string; modelo: string; tipo: string;
  loc: string; largura: string; altura: string;
}
interface TipoModeloRow { tipo: string; modelo: string; total: number; concluido: number; expedido: number }

type Urgency = 'atrasado' | 'parado' | 'prod' | 'pend' | 'concl' | 'exped';
const URGENCY_SORT: Record<Urgency, number> = {
  atrasado: 0, parado: 1, prod: 2, pend: 3, concl: 4, exped: 5,
};

function statusCount(rows: Array<{ status: string }>): Record<string, number> {
  const porStatus: Record<string, number> = {};
  for (const s of STATUS_ORDER) porStatus[s] = 0;
  for (const r of rows) porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
  return porStatus;
}

function groupTipoModelo(subs: Array<{ status: string; tipo: string; modelo: string }>): TipoModeloRow[] {
  const map = new Map<string, TipoModeloRow>();
  for (const s of subs) {
    const k = `${s.tipo}|${s.modelo}`;
    const row = map.get(k) ?? { tipo: s.tipo, modelo: s.modelo, total: 0, concluido: 0, expedido: 0 };
    row.total++;
    if (s.status === 'Concluido') row.concluido++;
    if (s.status === 'Expedido') row.expedido++;
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Contagem aproximada de um JQL (para "expedidos hoje/semana"); null se falhar */
async function approxCount(jql: string): Promise<number | null> {
  try {
    const r = await jiraFetch('/rest/api/3/search/approximate-count', {
      method: 'POST',
      body: JSON.stringify({ jql }),
    });
    return typeof r?.count === 'number' ? r.count : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const project = process.env.JIRA_PROJECT_KEY ?? '';
  try {
    const fields = [
      'summary', 'status', 'issuetype', 'parent', 'updated', 'duedate',
      ...Object.values(CF),
    ];

    const [issues, expedidosHoje, expedidosSemanaBusca, arquivados, movidosParaConcluido] = await Promise.all([
      searchAllIssues(`project = "${project}" ORDER BY created ASC`, fields),
      approxCount(`project = "${project}" AND issuetype in subTaskIssueTypes() AND status CHANGED TO "Expedido" AFTER startOfDay()`),
      approxCount(`project = "${project}" AND issuetype in subTaskIssueTypes() AND status CHANGED TO "Expedido" AFTER -7d`),
      // O arquivamento da madrugada tira os expedidos da busca; ele anota quantos
      // eram, e a semana soma os dois. O "hoje" não precisa: nada expedido hoje
      // é arquivado (lib/arquivo.ts)
      lerExpedidosArquivados(project),
      // Conjunto de issues que passaram por "Concluido" na janela. Sem filtro de
      // issuetype de propósito: quem é "quadro" aqui é o campo Modelo, não o issue
      // type — o recorte certo vem da interseção com quadroRows, abaixo.
      // Falhar aqui só apaga o bloco de destaque; o painel continua de pé.
      searchAllIssues(
        `project = "${project}" AND status CHANGED TO "Concluido" AFTER ${CONCLUIDO_JANELA}`,
        ['updated'],
      ).catch(() => []),
    ]);

    const concluidoKeys = new Set(movidosParaConcluido.map((i) => i.key));
    const expedidosSemana = expedidosSemanaBusca === null
      ? null
      : expedidosSemanaBusca + somarDesde(arquivados, new Date(Date.now() - 7 * 24 * 3600_000));

    interface Row {
      key: string; summary: string; status: string; parentKey: string;
      modeloRaw: string; nivel: 'projeto' | 'caixilho' | 'quadro';
      tipo: string; modelo: string; loc: string; largura: string; altura: string;
      cor: string; cliente: string; documento: string;
      updated: string; duedate: string | null;
    }

    const rows: Row[] = issues.map((i) => {
      const f = i.fields;
      const issuetype = f.issuetype as { name?: string; subtask?: boolean } | undefined;
      const modeloRaw = cfValue(f, CF.modelo);
      const m = normalize(modeloRaw);
      // Fonte de verdade: campo Modelo; issue type só como fallback quando vazio
      let nivel: Row['nivel'];
      if (m === 'projeto') nivel = 'projeto';
      else if (m === 'caixilho') nivel = 'caixilho';
      else if (m === 'marco' || m === 'folha') nivel = 'quadro';
      else if (issuetype?.subtask) nivel = 'quadro';
      else if (normalize(issuetype?.name ?? '') === 'epic' || normalize(issuetype?.name ?? '') === 'epico') nivel = 'projeto';
      else nivel = 'caixilho';
      return {
        key: i.key,
        summary: String((f.summary as string) ?? ''),
        status: canonicalStatus(String((f.status as { name?: string })?.name ?? '')),
        parentKey: String((f.parent as { key?: string })?.key ?? ''),
        modeloRaw,
        nivel,
        tipo: cfValue(f, CF.tipo),
        modelo: modeloRaw,
        loc: cfValue(f, CF.localizacao),
        largura: cfValue(f, CF.largura),
        altura: cfValue(f, CF.altura),
        cor: cfValue(f, CF.cor),
        cliente: cfValue(f, CF.cliente),
        documento: cfValue(f, CF.documento),
        updated: String((f.updated as string) ?? ''),
        duedate: (f.duedate as string | null) ?? null,
      };
    });

    const projetoRows  = rows.filter((r) => r.nivel === 'projeto');
    const caixilhoRows = rows.filter((r) => r.nivel === 'caixilho');
    const quadroRows   = rows.filter((r) => r.nivel === 'quadro');
    const marcoRows = quadroRows.filter((r) => normalize(r.modeloRaw) === 'marco');
    const folhaRows = quadroRows.filter((r) => normalize(r.modeloRaw) !== 'marco');

    // Índices da hierarquia: quadro → caixilho → projeto
    const quadrosByCaixilho = new Map<string, Row[]>();
    for (const q of quadroRows) {
      const list = quadrosByCaixilho.get(q.parentKey) ?? [];
      list.push(q);
      quadrosByCaixilho.set(q.parentKey, list);
    }
    const caixilhosByProjeto = new Map<string, Row[]>();
    const projetoKeys = new Set(projetoRows.map((p) => p.key));
    const orphanCaixilhos: Row[] = [];
    for (const c of caixilhoRows) {
      if (projetoKeys.has(c.parentKey)) {
        const list = caixilhosByProjeto.get(c.parentKey) ?? [];
        list.push(c);
        caixilhosByProjeto.set(c.parentKey, list);
      } else {
        orphanCaixilhos.push(c);
      }
    }

    const now = Date.now();
    const DAY = 86_400_000;

    const porUrgencia = projetoRows
      .map((p) => {
        const caixilhos = caixilhosByProjeto.get(p.key) ?? [];
        const quadros = caixilhos.flatMap((c) => quadrosByCaixilho.get(c.key) ?? []);
        const porStatus = statusCount(quadros);
        const prontos = (porStatus['Concluido'] ?? 0) + (porStatus['Expedido'] ?? 0);
        const pct = quadros.length > 0 ? Math.round((prontos / quadros.length) * 100) : 0;

        // Última movimentação: updated mais recente entre os quadros (fallback: o próprio épico)
        const lastMove = quadros.reduce<string>((acc, q) => (q.updated > acc ? q.updated : acc), '') || p.updated;
        const lastMoveDias = lastMove ? Math.floor((now - new Date(lastMove).getTime()) / DAY) : null;
        const atrasoDias = p.duedate
          ? Math.floor((now - new Date(`${p.duedate}T23:59:59`).getTime()) / DAY)
          : null;

        let urgency: Urgency;
        let urgencyDias: number | null = null;
        if (p.status === 'Expedido') urgency = 'exped';
        else if (p.status === 'Concluido') urgency = 'concl';
        else if (atrasoDias !== null && atrasoDias > 0) { urgency = 'atrasado'; urgencyDias = atrasoDias; }
        else if (p.status === 'Em Andamento' && lastMoveDias !== null && lastMoveDias > PARADO_DIAS) {
          urgency = 'parado'; urgencyDias = lastMoveDias;
        }
        else if (p.status === 'Em Andamento') urgency = 'prod';
        else urgency = 'pend';

        const cores  = [...new Set(quadros.map((q) => q.cor).filter(Boolean))];
        const locais = [...new Set(quadros.map((q) => q.loc).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        // Quando um quadro DESTE projeto entrou em "Concluido" pela última vez.
        // O status do épico não entra na conta: vale qualquer subtask que tenha
        // se movido. Aproximado pelo `updated` dos quadros que a JQL apontou.
        const concluidoAt = quadros.reduce<string | null>(
          (acc, q) =>
            concluidoKeys.has(q.key) && (!acc || q.updated > acc) ? q.updated : acc,
          null,
        );

        return {
          key: p.key,
          summary: p.summary,
          cliente: p.cliente,
          documento: p.documento,
          status: p.status,
          duedate: p.duedate,
          lastMove: lastMove || null,
          concluidoAt,
          urgency,
          urgencyDias,
          pct,
          counts: { total: quadros.length, porStatus },
          porTipoModelo: groupTipoModelo(quadros),
          cores,
          locais,
          quadros: quadros.map((q): QuadroNode => ({
            key: q.key, status: q.status, modelo: q.modelo, tipo: q.tipo,
            loc: q.loc, largura: q.largura, altura: q.altura,
          })),
        };
      })
      .sort((a, b) => {
        const ua = URGENCY_SORT[a.urgency];
        const ub = URGENCY_SORT[b.urgency];
        if (ua !== ub) return ua - ub;
        if (a.urgency === 'atrasado' || a.urgency === 'parado') {
          return (b.urgencyDias ?? 0) - (a.urgencyDias ?? 0);   // mais crítico primeiro
        }
        if (a.urgency === 'prod') return a.pct - b.pct;          // menor avanço primeiro
        return 0;
      });

    // Topo da grade: quem a produção acabou de mexer. Os DESTAQUE_MAX projetos
    // com movimentação mais recente de algum quadro para "Concluido"; o resto
    // segue na ordem de urgência (em risco, produção, pendente, concluído…).
    const destaque = porUrgencia
      .filter((p) => p.concluidoAt)
      .sort((a, b) => (b.concluidoAt ?? '').localeCompare(a.concluidoAt ?? ''))
      .slice(0, DESTAQUE_MAX);
    const destaqueKeys = new Set(destaque.map((p) => p.key));
    const projetos = [...destaque, ...porUrgencia.filter((p) => !destaqueKeys.has(p.key))];

    // KPIs
    const totalQuadros = quadroRows.length;
    const quadrosPorStatus = statusCount(quadroRows);
    const prontos = (quadrosPorStatus['Concluido'] ?? 0) + (quadrosPorStatus['Expedido'] ?? 0);
    const parados = projetos.filter((p) => p.urgency === 'parado').length;
    const atrasados = projetos.filter((p) => p.urgency === 'atrasado').length;

    return NextResponse.json({
      kpis: {
        conclusaoPct: totalQuadros > 0 ? Math.round((prontos / totalQuadros) * 100) : 0,
        quadrosProntos: prontos,
        quadrosTotal: totalQuadros,
        risco: { total: parados + atrasados, parados, atrasados },
        expedidosHoje,
        expedidosSemana,
        emProducao: {
          projetos: projetos.filter((p) => p.urgency === 'prod' || p.urgency === 'parado').length,
          caixilhos: caixilhoRows.filter((c) => c.status === 'Em Andamento').length,
          quadrosFila: quadrosPorStatus['Tarefas Pendentes'] ?? 0,
        },
      },
      niveis: {
        projetos:  { total: projetoRows.length,  porStatus: statusCount(projetoRows) },
        caixilhos: { total: caixilhoRows.length, porStatus: statusCount(caixilhoRows) },
        marcos:    { total: marcoRows.length,    porStatus: statusCount(marcoRows) },
        folhas:    { total: folhaRows.length,    porStatus: statusCount(folhaRows) },
      },
      projetos,
      destaqueCount: destaque.length,
      semProjeto: orphanCaixilhos.map((c) => ({ key: c.key, summary: c.summary, status: c.status })),
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
