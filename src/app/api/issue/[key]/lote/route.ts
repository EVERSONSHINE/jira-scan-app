import { NextRequest, NextResponse } from 'next/server';
import {
  jiraFetch, normalize, listTaskSubtasks, transitionForward, setLocalizacao,
  cascadeStatus, emLotes, statusRank, type SubtaskLite,
} from '@/lib/jira';
import { canonicalStatus } from '@/lib/status';

/** Chamadas simultâneas ao Jira por lote */
const CONCORRENCIA = 5;

type Body =
  // transitionId ausente = a lida já está no status e só as irmãs mudam
  | { acao: 'status'; transitionId?: string; status: string }
  | { acao: 'localizacao'; fieldId: string; value: string };

/** ok=false é "não mudou e deveria" (pulada ou erro); "já estava" é ok */
interface Resultado { key: string; ok: boolean; de: string; para: string; motivo?: string }

/** Subtasks da mesma Task, recalculadas aqui — nunca confia na lista do cliente */
async function subtasksDaTask(key: string): Promise<SubtaskLite[] | null> {
  const issue = await jiraFetch(`/rest/api/3/issue/${key}?fields=parent,issuetype`);
  const parent = issue?.fields?.parent;
  const parentType = normalize(String(parent?.fields?.issuetype?.name ?? ''));
  if (!issue?.fields?.issuetype?.subtask || !parent || parentType === 'epic' || parentType === 'epico') {
    return null;
  }
  return listTaskSubtasks(parent.key);
}

/**
 * Aplica status ou localização a todas as subtasks da Task da issue lida.
 *
 * Status: a issue lida faz exatamente a transição clicada (pode voltar, como
 * na tela normal — é assim que se corrige um erro); as irmãs só avançam, nunca
 * regridem, e sem transição no workflow são puladas. Se a lida falhar, as
 * irmãs não são tocadas. A cascata Task → Épico roda uma vez, no fim, quando
 * todas já mudaram — por subtask, a Task seria calculada com irmãs defasadas.
 *
 * Localização: sobrescreve em todas, incluindo a lida.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const body = await req.json() as Body;

  try {
    const subtasks = await subtasksDaTask(key);
    if (!subtasks) {
      return NextResponse.json({ error: `${key} não é subtask de uma Task` }, { status: 400 });
    }

    if (body.acao === 'localizacao') {
      const resultados = await emLotes(subtasks, CONCORRENCIA, async (s): Promise<Resultado> => {
        try {
          await setLocalizacao(s.key, body.fieldId, body.value);
          return { key: s.key, ok: true, de: s.localizacao, para: body.value };
        } catch (e) {
          return { key: s.key, ok: false, de: s.localizacao, para: s.localizacao, motivo: String(e).slice(0, 120) };
        }
      });
      return NextResponse.json({ resultados, updated: [] });
    }

    if (body.acao !== 'status' || !body.status) {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    // 1. A lida, pela transição clicada — falhou aqui, para tudo. Sem
    // transitionId ela já precisa estar no status (o workflow pode não
    // oferecer transição para o próprio status, e o lote vale para as irmãs).
    const alvo = canonicalStatus(body.status);
    const lida = subtasks.find((s) => s.key === key);
    const resultados: Resultado[] = [];
    if (body.transitionId) {
      await jiraFetch(`/rest/api/3/issue/${key}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: body.transitionId } }),
      });
      resultados.push({ key, ok: true, de: lida?.status ?? '', para: alvo });
    } else if (lida?.status === alvo) {
      resultados.push({ key, ok: true, de: alvo, para: alvo, motivo: 'já estava' });
    } else {
      return NextResponse.json({ error: `Transição para "${body.status}" não disponível em ${key}` }, { status: 400 });
    }

    // 2. As irmãs, só para frente
    const irmas = subtasks.filter((s) => s.key !== key);
    resultados.push(...await emLotes(irmas, CONCORRENCIA, async (s): Promise<Resultado> => {
      if (s.status === alvo) return { key: s.key, ok: true, de: alvo, para: alvo, motivo: 'já estava' };
      try {
        const movido = await transitionForward(s.key, s.status, body.status);
        if (movido) return { key: s.key, ok: true, de: s.status, para: alvo };
        const motivo = statusRank(s.status) > statusRank(alvo)
          ? 'mais adiantada, não regride'
          : 'sem transição no workflow';
        return { key: s.key, ok: false, de: s.status, para: s.status, motivo };
      } catch (e) {
        return { key: s.key, ok: false, de: s.status, para: s.status, motivo: String(e).slice(0, 120) };
      }
    }));

    // 3. Cascata uma vez só, com a mesma condição da rota de transição simples
    let updated: Awaited<ReturnType<typeof cascadeStatus>> = [];
    const toNorm = normalize(body.status);
    if (toNorm === 'concluido' || toNorm === 'expedido') {
      try {
        updated = await cascadeStatus(key);
      } catch {
        // Falha na propagação não desfaz as transições das subtasks
      }
    }

    return NextResponse.json({ resultados, updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
