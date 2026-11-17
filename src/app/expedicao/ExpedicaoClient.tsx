'use client';
import { AlertTriangle, CheckCircle2, Loader2, MapPin, Truck } from 'lucide-react';
import { expedicaoView } from '@/lib/expedicao';
import AppShell, { Panel } from '@/components/AppShell';
import Logo from '@/components/Logo';
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
 * Onde estão os quadros que ainda faltam expedir — o dado que manda alguém
 * andar até um lugar, então é o elemento mais saturado da tela depois do
 * contador. Ciano preenchido: fora do vocabulário de status (cinza/âmbar/
 * verde/azul = etapa, vermelho = alarme) e o único hue que passou a separação
 * CVD contra todos os cinco. Mais itens primeiro, ordem que vem da API.
 */
function LocaisPendentes({ porLocal, tv }: { porLocal: Array<{ loc: string; total: number }>; tv: boolean }) {
  if (porLocal.length === 0) return null;
  const mostrados = porLocal.slice(0, MAX_LOCAIS);
  const resto = porLocal.length - mostrados.length;
  const big = tv ? 'text-2xl md:text-4xl' : 'text-xl md:text-2xl';
  return (
    <div className="w-full max-w-5xl space-y-3">
      <p className={`flex items-center justify-center gap-2 font-semibold text-cyan-800 ${tv ? 'text-xl md:text-2xl' : 'text-base'}`}>
        <MapPin className={tv ? 'h-6 w-6' : 'h-4 w-4'} strokeWidth={2} /> Falta buscar em
      </p>
      <div className="flex flex-wrap justify-center gap-2.5">
        {mostrados.map(({ loc, total }) => (
          <span
            key={loc || '(sem local)'}
            className={`flex items-baseline gap-3 rounded-xl px-4 py-2 ${
              loc ? 'bg-cyan-700 shadow-card' : 'border-2 border-dashed border-cyan-700'
            }`}
          >
            <span className={`font-semibold tracking-wide ${big} ${loc ? 'font-mono text-white' : 'text-cyan-800'}`}>
              {loc || 'sem local'}
            </span>
            <span className={`rounded-lg px-2 font-semibold tabular-nums ${big} ${
              loc ? 'bg-cyan-950/40 text-white' : 'text-cyan-800'
            }`}>
              {total}
            </span>
          </span>
        ))}
        {resto > 0 && (
          <span className={`flex items-center px-2 font-semibold text-cyan-800 ${tv ? 'text-2xl md:text-3xl' : 'text-lg'}`}>
            +{resto} {resto === 1 ? 'local' : 'locais'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ExpedicaoClient({ data, errorAt, updatedAt, tv = false }: ExpedicaoState & { tv?: boolean }) {
  const v = expedicaoView(data);
  const counts = data?.counts ?? null;
  const pendentes = data?.pendentes ?? null;

  // Na TV tudo é lido a metros; na tela de uso os mesmos blocos, um passo menores
  const T = tv
    ? { key: 'text-5xl md:text-7xl', title: 'text-3xl md:text-5xl', sub: 'text-xl md:text-2xl', count: 'text-6xl md:text-8xl', note: 'text-2xl md:text-3xl', meter: 'h-10', idle: 'text-4xl md:text-6xl', foot: 'text-lg md:text-xl' }
    : { key: 'text-3xl md:text-5xl', title: 'text-xl md:text-3xl',  sub: 'text-base md:text-lg',  count: 'text-5xl md:text-6xl', note: 'text-base md:text-lg', meter: 'h-4',  idle: 'text-2xl md:text-3xl', foot: 'text-sm' };

  const status = (
    <p className={`flex items-center gap-2 ${tv ? 'text-base md:text-lg' : 'text-sm'} ${errorAt ? 'font-medium text-amber-800' : 'text-slate-500'}`}>
      {errorAt && <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />}
      {errorAt ? `Sem conexão com o Jira · ${errorAt}` : updatedAt ? `Atualizado às ${updatedAt}` : ''}
    </p>
  );

  const body = (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">

        {!data && !errorAt && (
          <p className={`flex items-center gap-3 text-slate-500 ${T.sub}`}>
            <Loader2 className="h-6 w-6 animate-spin" /> Carregando…
          </p>
        )}

        {data && v.showIdle && (
          <div className="space-y-5">
            <Truck className={`mx-auto text-slate-400 ${tv ? 'h-16 w-16' : 'h-10 w-10'}`} strokeWidth={1.5} />
            <p className={`font-semibold tracking-tight text-slate-600 ${T.idle}`}>Aguardando expedição</p>
            {v.stale && data.epic && (
              <p className={`text-slate-600 ${T.sub}`}>
                Última expedição: <span className="font-mono">{data.epic.key}</span> — {data.epic.summary}
                {data.expeditedAt && ` · ${fmtDataHora(data.expeditedAt)}`}
              </p>
            )}
          </div>
        )}

        {data && !v.showIdle && !data.idle && (
          <>
            {data.epic ? (
              <div className="max-w-5xl space-y-3">
                {v.completo && (
                  <p className={`inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 font-semibold text-emerald-800 ${T.sub}`}>
                    <CheckCircle2 className={tv ? 'h-7 w-7' : 'h-5 w-5'} strokeWidth={2} /> Expedição concluída
                  </p>
                )}
                <p className={`font-mono font-semibold tracking-tight ${T.key} ${v.completo ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {data.epic.key}
                </p>
                <p className={`font-semibold tracking-tight text-slate-800 ${T.title}`}>{data.epic.summary}</p>
                {(data.epic.cliente || data.epic.documento) && (
                  <p className={`text-slate-600 ${T.sub}`}>
                    {data.epic.cliente}
                    {data.epic.cliente && data.epic.documento && ' · '}
                    {data.epic.documento && `doc ${data.epic.documento}`}
                  </p>
                )}
              </div>
            ) : (
              <div className="max-w-5xl space-y-3">
                <p className={`font-mono font-semibold tracking-tight text-slate-900 ${T.key}`}>{data.subtask?.key}</p>
                <p className={`font-semibold tracking-tight text-slate-800 ${T.title}`}>{data.subtask?.summary}</p>
                <p className={`text-slate-600 ${T.sub}`}>Quadro sem projeto associado</p>
              </div>
            )}

            {data.epic && counts && (
              v.total > 0 ? (
                <div className="w-full max-w-4xl space-y-4">
                  <div
                    className={`${T.meter} overflow-hidden rounded-full ${v.completo ? 'bg-emerald-100' : 'bg-blue-100'}`}
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={v.total}
                    aria-valuenow={v.expedido}
                    aria-label="Quadros expedidos"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ease-out ${v.completo ? 'bg-emerald-600' : 'bg-blue-600'}`}
                      style={{ width: `${v.pct}%` }}
                    />
                  </div>
                  <p className={`font-semibold tracking-tight ${T.count}`}>
                    {v.expedido}<span className="text-slate-400"> / {v.total}</span>
                  </p>
                  <p className={`text-slate-600 ${T.note}`}>
                    {v.completo
                      ? 'todos os quadros expedidos'
                      : <>quadros expedidos · <span className="font-semibold text-slate-900">faltam {v.faltam}</span></>}
                  </p>
                </div>
              ) : (
                <p className={`text-slate-500 ${T.sub}`}>Projeto sem quadros</p>
              )
            )}

            {!v.completo && pendentes && <LocaisPendentes porLocal={pendentes.porLocal} tv={tv} />}
          </>
        )}
      </div>

      {data && !v.showIdle && !data.idle && data.subtask && (
        <footer className={`mt-8 text-center text-slate-500 ${T.foot}`}>
          Último quadro: <span className="font-mono text-slate-700">{data.subtask.key}</span>
          {' — '}{data.subtask.summary}
          {data.expeditedAt && ` · ${fmtHora(data.expeditedAt)}`}
        </footer>
      )}
    </>
  );

  if (!tv) {
    return (
      <AppShell title="Expedição" actions={status}>
        <Panel className="flex min-h-[calc(100vh-11rem)] flex-col px-4 py-10 lg:min-h-[calc(100vh-8rem)]">{body}</Panel>
      </AppShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 p-8 text-slate-900 md:p-12">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Logo className="w-28 text-brand" />
          <span className="h-8 w-px bg-slate-300" aria-hidden />
          <h1 className="text-xl font-semibold text-slate-700 md:text-2xl">Expedição</h1>
        </div>
        {status}
      </header>
      <main className="flex flex-1 flex-col">{body}</main>
    </div>
  );
}
