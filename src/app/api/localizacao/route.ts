import { NextRequest, NextResponse } from 'next/server';
import { searchAllIssues, cfValue, CF, type JiraIssueLite } from '@/lib/jira';
import { canonicalStatus } from '@/lib/status';
import type { PecaLoc, CaixilhoLoc, ObraLoc } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Mais que isso vira relatório de dezenas de páginas; ninguém imprime */
const MAX_OBRAS = 40;
const CHAVE = /^[A-Z][A-Z0-9]*-\d+$/;

/** `parent in (...)` em blocos — lista longa estoura o tamanho da URL */
async function filhosDe(keys: string[], fields: string[]): Promise<JiraIssueLite[]> {
  const out: JiraIssueLite[] = [];
  for (let i = 0; i < keys.length; i += 50) {
    out.push(...await searchAllIssues(
      `parent in (${keys.slice(i, i + 50).join(',')}) ORDER BY key ASC`,
      fields,
    ));
  }
  return out;
}

const statusDe = (i: JiraIssueLite) =>
  canonicalStatus(String((i.fields.status as { name?: string })?.name ?? ''));
const paiDe = (i: JiraIssueLite) => String((i.fields.parent as { key?: string })?.key ?? '');

/**
 * Relatório de localização: obra → caixilho → peças (marco/folha) com medidas,
 * cor, local e situação. GET /api/localizacao?obras=PROJ-1,PROJ-2
 */
export async function GET(req: NextRequest) {
  const obrasParam = (req.nextUrl.searchParams.get('obras') ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const keys = [...new Set(obrasParam)].filter((k) => CHAVE.test(k)).slice(0, MAX_OBRAS);
  if (keys.length === 0) return NextResponse.json({ obras: [], geradoEm: new Date().toISOString() });

  try {
    const epics = await searchAllIssues(
      `key in (${keys.join(',')})`,
      ['summary', 'status', 'duedate', CF.cliente, CF.documento],
    );
    const caixilhos = await filhosDe(
      epics.map((e) => e.key),
      ['status', 'parent', CF.tipo, CF.cor, CF.modelo],
    );
    const pecas = caixilhos.length
      ? await filhosDe(
          caixilhos.map((c) => c.key),
          ['status', 'parent', CF.modelo, CF.cor, CF.largura, CF.altura, CF.localizacao, CF.codigo],
        )
      : [];

    const pecasPorCaixilho = new Map<string, PecaLoc[]>();
    for (const p of pecas) {
      const lista = pecasPorCaixilho.get(paiDe(p)) ?? [];
      lista.push({
        key: p.key,
        modelo: cfValue(p.fields, CF.modelo),
        largura: cfValue(p.fields, CF.largura),
        altura: cfValue(p.fields, CF.altura),
        cor: cfValue(p.fields, CF.cor),
        loc: cfValue(p.fields, CF.localizacao),
        status: statusDe(p),
        codigo: cfValue(p.fields, CF.codigo),
      });
      pecasPorCaixilho.set(paiDe(p), lista);
    }

    const caixilhosPorObra = new Map<string, CaixilhoLoc[]>();
    for (const c of caixilhos) {
      const lista = caixilhosPorObra.get(paiDe(c)) ?? [];
      // Marco antes de folha: é a ordem em que o caixilho é montado
      const ps = (pecasPorCaixilho.get(c.key) ?? []).sort((a, b) =>
        (a.modelo === 'Marco' ? 0 : 1) - (b.modelo === 'Marco' ? 0 : 1) ||
        a.key.localeCompare(b.key, 'pt-BR', { numeric: true }),
      );
      lista.push({
        key: c.key,
        tipo: cfValue(c.fields, CF.tipo),
        status: statusDe(c),
        cor: cfValue(c.fields, CF.cor),
        pecas: ps,
      });
      caixilhosPorObra.set(paiDe(c), lista);
    }

    const obras: ObraLoc[] = epics
      .map((e) => ({
        key: e.key,
        cliente: cfValue(e.fields, CF.cliente),
        documento: cfValue(e.fields, CF.documento),
        summary: String(e.fields.summary ?? ''),
        duedate: (e.fields.duedate as string | null) ?? null,
        status: statusDe(e),
        caixilhos: caixilhosPorObra.get(e.key) ?? [],
      }))
      .sort((a, b) =>
        (a.duedate ?? '9999').localeCompare(b.duedate ?? '9999') ||
        a.key.localeCompare(b.key, 'pt-BR', { numeric: true }),
      );

    return NextResponse.json({ obras, geradoEm: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
