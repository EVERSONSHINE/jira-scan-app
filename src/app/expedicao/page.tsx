'use client';
import { useEffect, useRef, useState } from 'react';

const POLL_MS = 15_000;
const IDLE_AFTER_HOURS = 12;

interface ExpedicaoData {
  idle: boolean;
  subtask?: { key: string; summary: string };
  expeditedAt?: string | null;
  epic?: { key: string; summary: string; cliente: string; documento: string } | null;
  counts?: { total: number; expedido: number; porStatus: Record<string, number> } | null;
  fetchedAt: string;
}

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

export default function ExpedicaoPage() {
  const [data, setData] = useState<ExpedicaoData | null>(null);
  const [errorAt, setErrorAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    const tick = async () => {
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const res = await fetch('/api/expedicao', { signal: controller.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setData(json);
        setErrorAt(null);
        setUpdatedAt(new Date().toLocaleTimeString('pt-BR'));
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          const msg = e instanceof Error ? e.message : String(e);
          setErrorAt(`${msg.slice(0, 60)} · ${new Date().toLocaleTimeString('pt-BR')}`);
        }
      } finally {
        inFlight.current = false;
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { clearInterval(id); controller.abort(); };
  }, []);

  const counts = data?.counts ?? null;
  const total = counts?.total ?? 0;
  const expedido = counts?.expedido ?? 0;
  const faltam = Math.max(total - expedido, 0);
  const completo = total > 0 && expedido >= total;
  const pct = total > 0 ? Math.round((expedido / total) * 100) : 0;

  const expeditedMs = data?.expeditedAt ? new Date(data.expeditedAt).getTime() : NaN;
  const stale = !isNaN(expeditedMs) && Date.now() - expeditedMs > IDLE_AFTER_HOURS * 3_600_000;
  const showIdle = !data || data.idle || stale;

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

        {data && showIdle && (
          <div className="space-y-6">
            <span className="inline-block w-5 h-5 rounded-full bg-slate-700 animate-pulse" aria-hidden />
            <p className="text-4xl md:text-6xl font-semibold text-slate-600">Aguardando expedição…</p>
            {stale && data.epic && (
              <p className="text-xl md:text-2xl text-slate-700">
                Última expedição: <span className="font-mono">{data.epic.key}</span> — {data.epic.summary}
                {data.expeditedAt && ` · ${fmtDataHora(data.expeditedAt)}`}
              </p>
            )}
          </div>
        )}

        {data && !showIdle && !data.idle && (
          <>
            {/* Épico em destaque */}
            {data.epic ? (
              <div className="space-y-3 max-w-5xl">
                {completo && (
                  <p className="text-3xl md:text-5xl font-bold text-emerald-400 tracking-wide">
                    ✓ EXPEDIÇÃO CONCLUÍDA
                  </p>
                )}
                <p className={`font-mono font-bold text-5xl md:text-7xl ${completo ? 'text-emerald-300' : 'text-white'}`}>
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
              total > 0 ? (
                <div className="w-full max-w-4xl space-y-5">
                  <div
                    className={`h-10 rounded-full overflow-hidden ${completo ? 'bg-emerald-950' : 'bg-blue-950'}`}
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={expedido}
                    aria-label="Quadros expedidos"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ${completo ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-6xl md:text-8xl font-semibold">
                    {expedido}<span className="text-slate-500"> / {total}</span>
                  </p>
                  <p className="text-2xl md:text-3xl text-slate-400">
                    {completo
                      ? 'todos os quadros expedidos'
                      : <>quadros expedidos · <span className="text-slate-200 font-semibold">faltam {faltam}</span></>}
                  </p>
                </div>
              ) : (
                <p className="text-2xl text-slate-500">Épico sem quadros</p>
              )
            )}
          </>
        )}
      </main>

      {/* Rodapé: último quadro */}
      {data && !showIdle && !data.idle && data.subtask && (
        <footer className="text-center text-lg md:text-xl text-slate-500">
          Último quadro: <span className="font-mono text-slate-400">{data.subtask.key}</span>
          {' — '}{data.subtask.summary}
          {data.expeditedAt && ` · ${fmtHora(data.expeditedAt)}`}
        </footer>
      )}
    </div>
  );
}
