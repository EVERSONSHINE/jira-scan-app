'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_ORDER, OUTROS, STATUS_CHART_LIGHT, STATUS_CHART_DARK } from '@/lib/status';

const POLL_MS = 15_000;

// ─── Tipos (espelham /api/resumo) ────────────────────────────────────────────

interface SubtaskNode { key: string; summary: string; status: string }
interface TaskNode extends SubtaskNode { subtasks: SubtaskNode[] }
interface EpicNode extends SubtaskNode {
  counts: { total: number; porStatus: Record<string, number> };
  tasks: TaskNode[];
}
interface ResumoData {
  totals: { epics: number; tasks: number; subtasks: number; porStatus: Record<string, number> };
  epics: EpicNode[];
  semEpico: { tasks: TaskNode[] };
  fetchedAt: string;
}

// ─── Helpers visuais ─────────────────────────────────────────────────────────

/** Ordena os statuses presentes: canônicos primeiro (na ordem do processo), depois extras */
function orderedStatuses(porStatus: Record<string, number>): string[] {
  const extras = Object.keys(porStatus).filter(
    (s) => !STATUS_ORDER.includes(s as (typeof STATUS_ORDER)[number]),
  );
  return [...STATUS_ORDER, ...extras].filter((s) => (porStatus[s] ?? 0) > 0);
}

const BADGE_LIGHT: Record<string, string> = {
  'Tarefas Pendentes': 'bg-slate-100 text-slate-700 border-slate-300',
  'Em Andamento':      'bg-amber-100 text-amber-700 border-amber-400',
  'Concluido':         'bg-emerald-100 text-emerald-700 border-emerald-400',
  'Expedido':          'bg-blue-100 text-blue-700 border-blue-400',
};
const BADGE_DARK: Record<string, string> = {
  'Tarefas Pendentes': 'bg-slate-800 text-slate-300 border-slate-600',
  'Em Andamento':      'bg-amber-950 text-amber-400 border-amber-700',
  'Concluido':         'bg-emerald-950 text-emerald-400 border-emerald-700',
  'Expedido':          'bg-blue-950 text-blue-400 border-blue-700',
};

function StatusBadge({ status, tv }: { status: string; tv: boolean }) {
  const map = tv ? BADGE_DARK : BADGE_LIGHT;
  const cls = map[status] ?? (tv ? 'bg-gray-800 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-300');
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${tv ? 'text-sm' : 'text-xs'} ${cls}`}>
      {status}
    </span>
  );
}

function Dot({ status, tv }: { status: string; tv: boolean }) {
  const map = tv ? STATUS_CHART_DARK : STATUS_CHART_LIGHT;
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${map[status] ?? map[OUTROS]}`}
      aria-hidden
    />
  );
}

/** Barra horizontal 100% empilhada; gaps de 2px na cor da superfície via gap do flex */
function StackedBar({
  porStatus, total, tv, height,
}: {
  porStatus: Record<string, number>; total: number; tv: boolean; height: string;
}) {
  if (total === 0) return null;
  const map = tv ? STATUS_CHART_DARK : STATUS_CHART_LIGHT;
  const statuses = orderedStatuses(porStatus);
  return (
    <div className={`flex ${height} rounded-full overflow-hidden gap-[2px]`} role="img"
      aria-label={statuses.map((s) => `${s}: ${porStatus[s]}`).join(', ')}>
      {statuses.map((s) => (
        <div
          key={s}
          title={`${s} — ${porStatus[s]}`}
          className={`${map[s] ?? map[OUTROS]} first:rounded-l-full last:rounded-r-full`}
          style={{ width: `${((porStatus[s] ?? 0) / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function Legend({ porStatus, total, tv }: { porStatus: Record<string, number>; total: number; tv: boolean }) {
  const statuses = orderedStatuses(porStatus);
  return (
    <div className={`flex flex-wrap gap-x-5 gap-y-1 ${tv ? 'text-base text-slate-300' : 'text-xs text-slate-600'}`}>
      {statuses.map((s) => {
        const n = porStatus[s] ?? 0;
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        return (
          <span key={s} className="flex items-center gap-1.5">
            <Dot status={s} tv={tv} />
            {s} — <span className="font-semibold">{n}</span> ({pct}%)
          </span>
        );
      })}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function ResumoClient({ tv }: { tv: boolean }) {
  const [data, setData] = useState<ResumoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/resumo');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
      setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      setError(String(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (!tv) return;
    const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load, tv]);

  const surface = tv ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-800';
  const card    = tv ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const muted   = tv ? 'text-slate-400' : 'text-slate-500';

  const totalSubs = data?.totals.subtasks ?? 0;

  return (
    <div className={`min-h-screen ${surface}`}>
      <div className={`mx-auto p-4 md:p-6 space-y-5 ${tv ? 'max-w-7xl' : 'max-w-5xl'}`}>

        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className={`font-bold leading-tight ${tv ? 'text-3xl' : 'text-xl'}`}>
              Resumo da Produção
            </h1>
            <p className={`${muted} ${tv ? 'text-lg' : 'text-xs'}`}>
              Shine Windows{updatedAt && ` · Atualizado às ${updatedAt}`}
            </p>
          </div>
          {!tv && (
            <button
              onClick={load}
              disabled={loading}
              className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 active:bg-slate-700"
            >
              {loading ? 'Atualizando…' : 'Atualizar'}
            </button>
          )}
        </header>

        {/* Erro */}
        {error && (
          <div className={`rounded-xl border px-4 py-3 ${tv ? 'text-lg' : 'text-sm'} ${
            tv ? 'bg-amber-950 border-amber-700 text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-700'
          }`}>
            ⚠ Falha ao atualizar — {data ? 'mostrando últimos dados.' : 'tentando novamente.'}
          </div>
        )}

        {!data && !error && (
          <p className={`text-center py-16 ${muted} ${tv ? 'text-2xl' : ''}`}>Carregando…</p>
        )}

        {data && (
          <>
            {/* KPI: um tile por status */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {STATUS_ORDER.map((s) => (
                <div key={s} className={`rounded-2xl border p-4 ${card}`}>
                  <p className={`flex items-center gap-1.5 font-medium ${muted} ${tv ? 'text-lg' : 'text-xs'}`}>
                    <Dot status={s} tv={tv} /> {s}
                  </p>
                  <p className={`font-semibold mt-1 ${tv ? 'text-6xl' : 'text-3xl'}`}>
                    {data.totals.porStatus[s] ?? 0}
                  </p>
                </div>
              ))}
            </section>
            <p className={`${muted} ${tv ? 'text-lg' : 'text-xs'}`}>
              {data.totals.epics} épicos · {data.totals.tasks} tarefas · {data.totals.subtasks} quadros
            </p>

            {/* Distribuição geral */}
            {totalSubs > 0 && (
              <section className={`rounded-2xl border p-4 space-y-3 ${card}`}>
                <h2 className={`font-semibold ${tv ? 'text-xl' : 'text-sm'}`}>Quadros por status</h2>
                <StackedBar porStatus={data.totals.porStatus} total={totalSubs} tv={tv} height={tv ? 'h-8' : 'h-6'} />
                <Legend porStatus={data.totals.porStatus} total={totalSubs} tv={tv} />
              </section>
            )}

            {/* Épicos */}
            <section className="space-y-3">
              {data.epics.map((epic) => {
                const exp = epic.counts.porStatus['Expedido'] ?? 0;
                const isOpen = !!expanded[epic.key];
                return (
                  <div key={epic.key} className={`rounded-2xl border p-4 space-y-3 ${card}`}>
                    <button
                      className={`w-full flex items-center gap-2 text-left ${tv ? 'cursor-default' : ''}`}
                      onClick={() => { if (!tv) setExpanded((e) => ({ ...e, [epic.key]: !e[epic.key] })); }}
                      aria-expanded={tv ? undefined : isOpen}
                    >
                      <span className={`font-mono font-bold shrink-0 ${tv ? 'text-2xl' : 'text-sm'}`}>{epic.key}</span>
                      <span className={`flex-1 truncate ${tv ? 'text-2xl' : 'text-sm'}`}>{epic.summary}</span>
                      <StatusBadge status={epic.status} tv={tv} />
                      <span className={`shrink-0 ${muted} ${tv ? 'text-xl' : 'text-xs'}`}>
                        {exp}/{epic.counts.total} expedidos
                      </span>
                      {!tv && (
                        <span className={`${muted} text-xs`} aria-hidden>{isOpen ? '▲' : '▼'}</span>
                      )}
                    </button>

                    {epic.counts.total > 0 ? (
                      <StackedBar porStatus={epic.counts.porStatus} total={epic.counts.total} tv={tv} height="h-3" />
                    ) : (
                      <p className={`${muted} ${tv ? 'text-lg' : 'text-xs'}`}>Sem quadros</p>
                    )}

                    {!tv && isOpen && (
                      <div className="space-y-3 pt-1">
                        {epic.tasks.map((task) => (
                          <div key={task.key} className="border-t border-slate-100 pt-2 space-y-1.5">
                            <p className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-semibold">{task.key}</span>
                              <span className="flex-1 truncate text-slate-600">{task.summary}</span>
                              <StatusBadge status={task.status} tv={false} />
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {task.subtasks.map((st) => (
                                <span
                                  key={st.key}
                                  title={`${st.key} — ${st.summary} (${st.status})`}
                                  className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 font-mono text-xs text-slate-600"
                                >
                                  <Dot status={st.status} tv={false} /> {st.key}
                                </span>
                              ))}
                              {task.subtasks.length === 0 && (
                                <span className="text-xs text-slate-400">Sem quadros</span>
                              )}
                            </div>
                          </div>
                        ))}
                        {epic.tasks.length === 0 && (
                          <p className="text-xs text-slate-400">Sem tarefas</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            {/* Sem épico */}
            {data.semEpico.tasks.length > 0 && (
              <section className={`rounded-2xl border p-4 space-y-2 ${card}`}>
                <h2 className={`font-semibold ${tv ? 'text-xl' : 'text-sm'}`}>Sem épico</h2>
                {data.semEpico.tasks.map((task) => (
                  <div key={task.key} className="space-y-1.5">
                    <p className={`flex items-center gap-2 ${tv ? 'text-lg' : 'text-xs'}`}>
                      <span className="font-mono font-semibold">{task.key}</span>
                      <span className={`flex-1 truncate ${muted}`}>{task.summary}</span>
                      {task.status && <StatusBadge status={task.status} tv={tv} />}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {task.subtasks.map((st) => (
                        <span
                          key={st.key}
                          title={`${st.key} — ${st.summary} (${st.status})`}
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono ${
                            tv ? 'bg-slate-800 border border-slate-700 text-slate-300 text-sm'
                               : 'bg-slate-50 border border-slate-200 text-slate-600 text-xs'
                          }`}
                        >
                          <Dot status={st.status} tv={tv} /> {st.key}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
