'use client';
import { expedicaoView } from '@/lib/expedicao';
import type { ExpedicaoState } from './useExpedicao';

/** Localizações mostradas antes de resumir o resto em "+N" */
const MAX_LOCAIS = 8;

function fmtHora(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDataHora(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Onde estão os quadros que ainda faltam expedir — o que a equipe precisa
 * saber ao começar. Mais itens primeiro (ordem que vem da API).
 */
function LocaisPendentes({ porLocal }: { porLocal: Array<{ loc: string; total: number }> }) {
  if (porLocal.length === 0) return null;
  const mostrados = porLocal.slice(0, MAX_LOCAIS);
  const resto = porLocal.length - mostrados.length;
  return (
    <div className="w-full max-w-5xl space-y-3">
      <p className="text-xl md:text-2xl uppercase tracking-wider text-slate-500">
        Falta buscar em
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {mostrados.map(({ loc, total }) => (
          <span
            key={loc || '(sem local)'}
            className="flex items-baseline gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2"
          >
            <span className={`text-2xl md:text-3xl font-semibold ${loc ? 'text-slate-100' : 'text-slate-500 italic'}`}>
              {loc || 'sem local'}
            </span>
            <span className="text-2xl md:text-3xl font-bold tabular-nums text-amber-400">{total}</span>
          </span>
        ))}
        {resto > 0 && (
          <span className="flex items-center rounded-xl px-4 py-2 text-2xl md:text-3xl text-slate-500">
            +{resto} {resto === 1 ? 'local' : 'locais'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ExpedicaoClient({ data, errorAt, updatedAt }: ExpedicaoState) {
  const v = expedicaoView(data);
  const counts = data?.counts ?? null;
  const pendentes = data?.pendentes ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-8 md:p-12">

      {/* Header */}
      <header className="flex items-start justify-between">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-400">
          Expedição — Shine Windows
        </h1>
        <p className={`text-base md:text-lg ${errorAt ? 'text-amber-500' : 'text-slate-500'}`}>
          {errorAt ? `⚠ Sem conexão com o Jira (${errorAt})` : updatedAt ? `Atualizado ${updatedAt}` : ''}
        </p>
      </header>

      {/* Corpo */}
      <main className="flex-1 flex flex-col items-center justify-center gap-8 text-center">

        {!data && !errorAt && (
          <p className="text-3xl text-slate-600 animate-pulse">Carregando…</p>
        )}

        {data && v.showIdle && (
          <div className="space-y-6">
            <span className="inline-block w-5 h-5 rounded-full bg-slate-700 animate-pulse" aria-hidden />
            <p className="text-4xl md:text-6xl font-semibold text-slate-600">Aguardando expedição…</p>
            {v.stale && data.epic && (
              <p className="text-xl md:text-2xl text-slate-700">
                Última expedição: <span className="font-mono">{data.epic.key}</span> — {data.epic.summary}
                {data.expeditedAt && ` · ${fmtDataHora(data.expeditedAt)}`}
              </p>
            )}
          </div>
        )}

        {data && !v.showIdle && !data.idle && (
          <>
            {/* Épico em destaque */}
            {data.epic ? (
              <div className="space-y-3 max-w-5xl">
                {v.completo && (
                  <p className="text-3xl md:text-5xl font-bold text-emerald-400 tracking-wide">
                    ✓ EXPEDIÇÃO CONCLUÍDA
                  </p>
                )}
                <p className={`font-mono font-bold text-5xl md:text-7xl ${v.completo ? 'text-emerald-300' : 'text-white'}`}>
                  {data.epic.key}
                </p>
                <p className="text-3xl md:text-5xl font-semibold text-slate-200">{data.epic.summary}</p>
                {(data.epic.cliente || data.epic.documento) && (
                  <p className="text-xl md:text-2xl text-slate-400">
                    {data.epic.cliente}
                    {data.epic.cliente && data.epic.documento && ' · '}
                    {data.epic.documento && `Doc: ${data.epic.documento}`}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 max-w-5xl">
                <p className="font-mono font-bold text-5xl md:text-7xl text-white">{data.subtask?.key}</p>
                <p className="text-3xl md:text-5xl font-semibold text-slate-200">{data.subtask?.summary}</p>
                <p className="text-xl text-slate-500">Quadro sem épico associado</p>
              </div>
            )}

            {/* Meter + contagens */}
            {data.epic && counts && (
              v.total > 0 ? (
                <div className="w-full max-w-4xl space-y-5">
                  <div
                    className={`h-10 rounded-full overflow-hidden ${v.completo ? 'bg-emerald-950' : 'bg-blue-950'}`}
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={v.total}
                    aria-valuenow={v.expedido}
                    aria-label="Quadros expedidos"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ${v.completo ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${v.pct}%` }}
                    />
                  </div>
                  <p className="text-6xl md:text-8xl font-semibold">
                    {v.expedido}<span className="text-slate-500"> / {v.total}</span>
                  </p>
                  <p className="text-2xl md:text-3xl text-slate-400">
                    {v.completo
                      ? 'todos os quadros expedidos'
                      : <>quadros expedidos · <span className="text-slate-200 font-semibold">faltam {v.faltam}</span></>}
                  </p>
                </div>
              ) : (
                <p className="text-2xl text-slate-500">Épico sem quadros</p>
              )
            )}

            {/* Onde estão os quadros que faltam */}
            {!v.completo && pendentes && <LocaisPendentes porLocal={pendentes.porLocal} />}
          </>
        )}
      </main>

      {/* Rodapé: último quadro */}
      {data && !v.showIdle && !data.idle && data.subtask && (
        <footer className="text-center text-lg md:text-xl text-slate-500">
          Último quadro: <span className="font-mono text-slate-400">{data.subtask.key}</span>
          {' — '}{data.subtask.summary}
          {data.expeditedAt && ` · ${fmtHora(data.expeditedAt)}`}
        </footer>
      )}
    </div>
  );
}
