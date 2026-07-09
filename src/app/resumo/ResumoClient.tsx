'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_ORDER, OUTROS, STATUS_CHART_LIGHT, STATUS_CHART_DARK } from '@/lib/status';

const POLL_MS = 15_000;

// ─── Tipos (espelham /api/resumo) ────────────────────────────────────────────

interface QuadroNode {
  key: string; status: string; modelo: string; tipo: string;
  loc: string; largura: string; altura: string;
}
interface TipoModeloRow { tipo: string; modelo: string; total: number; concluido: number; expedido: number }
interface LevelTotals { total: number; porStatus: Record<string, number> }
type Urgency = 'atrasado' | 'parado' | 'prod' | 'pend' | 'concl' | 'exped';
interface ProjetoNode {
  key: string; summary: string; cliente: string; documento: string; status: string;
  duedate: string | null; lastMove: string | null;
  urgency: Urgency; urgencyDias: number | null; pct: number;
  counts: { total: number; porStatus: Record<string, number> };
  porTipoModelo: TipoModeloRow[];
  cores: string[];
  quadros: QuadroNode[];
}
interface ResumoData {
  kpis: {
    conclusaoPct: number; quadrosProntos: number; quadrosTotal: number;
    risco: { total: number; parados: number; atrasados: number };
    expedidosHoje: number | null; expedidosSemana: number | null;
    emProducao: { projetos: number; caixilhos: number; quadrosFila: number };
  };
  niveis: { projetos: LevelTotals; caixilhos: LevelTotals; marcos: LevelTotals; folhas: LevelTotals };
  projetos: ProjetoNode[];
  semProjeto: Array<{ key: string; summary: string; status: string }>;
  fetchedAt: string;
}

// ─── Vocabulário visual ──────────────────────────────────────────────────────
// Regra do painel: cinza=pendente, âmbar=produção, verde=concluído, azul=expedido.
// Vermelho é reservado para alarme (atrasado/parado) — nunca é cor de etapa.

const URGENCY_STRIPE: Record<Urgency, string> = {
  atrasado: 'border-l-red-600',
  parado:   'border-l-red-600',
  prod:     'border-l-amber-600',
  pend:     'border-l-slate-400',
  concl:    'border-l-emerald-600',
  exped:    'border-l-blue-600',
};

function urgencyPill(p: ProjetoNode, tv: boolean): { label: string; cls: string } {
  const light: Record<Urgency, string> = {
    atrasado: 'bg-red-100 text-red-700',
    parado:   'bg-red-100 text-red-700',
    prod:     'bg-amber-100 text-amber-700',
    pend:     'bg-slate-200 text-slate-600',
    concl:    'bg-emerald-100 text-emerald-700',
    exped:    'bg-blue-100 text-blue-700',
  };
  const dark: Record<Urgency, string> = {
    atrasado: 'bg-red-950 text-red-400',
    parado:   'bg-red-950 text-red-400',
    prod:     'bg-amber-950 text-amber-400',
    pend:     'bg-slate-800 text-slate-300',
    concl:    'bg-emerald-950 text-emerald-400',
    exped:    'bg-blue-950 text-blue-400',
  };
  const labels: Record<Urgency, string> = {
    atrasado: `Atrasado ${p.urgencyDias ?? '?'}d`,
    parado:   `Parado ${p.urgencyDias ?? '?'}d`,
    prod:     'Em produção',
    pend:     'Pendente',
    concl:    'Concluído',
    exped:    'Expedido',
  };
  return { label: labels[p.urgency], cls: (tv ? dark : light)[p.urgency] };
}

const FILTERS: Array<{ id: string; label: string; match: (p: ProjetoNode) => boolean }> = [
  { id: 'todos', label: 'Todos',        match: () => true },
  { id: 'risco', label: '⚠ Em risco',   match: (p) => p.urgency === 'atrasado' || p.urgency === 'parado' },
  { id: 'prod',  label: 'Em produção',  match: (p) => p.urgency === 'prod' },
  { id: 'pend',  label: 'Pendentes',    match: (p) => p.urgency === 'pend' },
  { id: 'concl', label: 'Concluídos',   match: (p) => p.urgency === 'concl' },
  { id: 'exped', label: 'Expedidos',    match: (p) => p.urgency === 'exped' },
];

function nf(n: number) {
  return n.toLocaleString('pt-BR');
}
function fmtData(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ─── Peças visuais ───────────────────────────────────────────────────────────

function orderedStatuses(porStatus: Record<string, number>): string[] {
  const extras = Object.keys(porStatus).filter(
    (s) => !STATUS_ORDER.includes(s as (typeof STATUS_ORDER)[number]),
  );
  return [...STATUS_ORDER, ...extras].filter((s) => (porStatus[s] ?? 0) > 0);
}

function Dot({ status, tv }: { status: string; tv: boolean }) {
  const map = tv ? STATUS_CHART_DARK : STATUS_CHART_LIGHT;
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${map[status] ?? map[OUTROS]}`} aria-hidden />
  );
}

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

// ─── Componente principal ────────────────────────────────────────────────────

export default function ResumoClient({ tv }: { tv: boolean }) {
  const [data, setData] = useState<ResumoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/resumo');
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json);
      setError(null);
      setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
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

  // Tokens dos dois temas
  const surface = tv ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-800';
  const card    = tv ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const muted   = tv ? 'text-slate-400' : 'text-slate-500';
  const faint   = tv ? 'text-slate-500' : 'text-slate-400';
  const divider = tv ? 'border-slate-800' : 'border-slate-100';

  const projetosVisiveis = useMemo(() => {
    if (!data) return [];
    const f = FILTERS.find((x) => x.id === filtro) ?? FILTERS[0];
    const q = busca.trim().toLowerCase();
    return data.projetos.filter((p) =>
      f.match(p) &&
      (!q || `${p.cliente} ${p.key} ${p.documento} ${p.summary}`.toLowerCase().includes(q)),
    );
  }, [data, filtro, busca]);

  const k = data?.kpis;

  return (
    <div className={`min-h-screen ${surface}`}>
      <div className={`mx-auto p-4 md:p-6 space-y-4 ${tv ? 'max-w-[1600px]' : 'max-w-6xl'}`}>

        {/* Barra do topo */}
        <header className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className={`font-bold leading-tight tracking-tight ${tv ? 'text-3xl' : 'text-xl'}`}>
              Resumo da Produção
            </h1>
            <p className={`${muted} ${tv ? 'text-lg' : 'text-xs'}`}>
              Shine Windows{updatedAt && ` · atualizado às ${updatedAt}`}
            </p>
          </div>
          {!tv && (
            <>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="🔍 Buscar cliente ou código…"
                aria-label="Buscar cliente ou código"
                className={`rounded-lg border px-3 py-2 text-sm min-w-60 outline-none focus:ring-2 focus:ring-slate-400 ${card}`}
              />
              <button
                onClick={load}
                disabled={loading}
                className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 active:bg-slate-700"
              >
                {loading ? 'Atualizando…' : 'Atualizar'}
              </button>
            </>
          )}
        </header>

        {/* Erro */}
        {error && (
          <div className={`rounded-xl border px-4 py-3 ${tv ? 'text-lg bg-amber-950 border-amber-700 text-amber-400' : 'text-sm bg-amber-50 border-amber-300 text-amber-700'}`}>
            ⚠ Falha ao atualizar — {data ? 'mostrando últimos dados.' : 'tentando novamente.'}
            <span className="opacity-70"> ({error.slice(0, 120)})</span>
          </div>
        )}

        {!data && !error && (
          <p className={`text-center py-16 ${muted} ${tv ? 'text-2xl' : ''}`}>Carregando…</p>
        )}

        {data && k && (
          <>
            {/* KPIs executivos */}
            <section className="grid grid-cols-2 xl:grid-cols-4 gap-3" aria-label="Indicadores">
              <div className={`rounded-xl border p-4 ${card}`}>
                <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${faint}`}>
                  <Dot status="Concluido" tv={tv} /> Conclusão geral
                </p>
                <p className={`font-bold tabular-nums mt-1 ${tv ? 'text-6xl' : 'text-4xl'} ${tv ? 'text-emerald-500' : 'text-emerald-600'}`}>
                  {k.conclusaoPct}<span className={`font-semibold ${tv ? 'text-2xl' : 'text-base'}`}>%</span>
                </p>
                <p className={`${muted} mt-1 tabular-nums ${tv ? 'text-base' : 'text-xs'}`}>
                  {nf(k.quadrosProntos)} de {nf(k.quadrosTotal)} quadros produzidos
                </p>
                <div className={`h-1.5 rounded-full mt-2 overflow-hidden ${tv ? 'bg-slate-800' : 'bg-slate-200'}`}>
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${k.conclusaoPct}%` }} />
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${card} ${k.risco.total > 0 ? (tv ? '!border-red-500' : '!border-red-600') : ''}`}>
                <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${faint}`}>
                  <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${tv ? 'bg-red-400' : 'bg-red-600'}`} aria-hidden /> Projetos em risco
                </p>
                <p className={`font-bold tabular-nums mt-1 ${tv ? 'text-6xl' : 'text-4xl'} ${k.risco.total > 0 ? (tv ? 'text-red-400' : 'text-red-600') : ''}`}>
                  {k.risco.total}
                </p>
                <p className={`${muted} mt-1 tabular-nums ${tv ? 'text-base' : 'text-xs'}`}>
                  {k.risco.parados} parados &gt; 7 dias · {k.risco.atrasados} com prazo vencido
                </p>
              </div>

              <div className={`rounded-xl border p-4 ${card}`}>
                <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${faint}`}>
                  <Dot status="Expedido" tv={tv} /> Expedidos
                </p>
                <p className={`font-bold tabular-nums mt-1 ${tv ? 'text-6xl' : 'text-4xl'} ${tv ? 'text-blue-400' : 'text-blue-600'}`}>
                  {k.expedidosHoje ?? '—'}
                </p>
                <p className={`${muted} mt-1 tabular-nums ${tv ? 'text-base' : 'text-xs'}`}>
                  hoje · {k.expedidosSemana ?? '—'} nos últimos 7 dias
                </p>
              </div>

              <div className={`rounded-xl border p-4 ${card}`}>
                <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${faint}`}>
                  <Dot status="Em Andamento" tv={tv} /> Em produção agora
                </p>
                <p className={`font-bold tabular-nums mt-1 ${tv ? 'text-6xl' : 'text-4xl'}`}>
                  {k.emProducao.projetos} <span className={`font-semibold ${muted} ${tv ? 'text-2xl' : 'text-base'}`}>projetos</span>
                </p>
                <p className={`${muted} mt-1 tabular-nums ${tv ? 'text-base' : 'text-xs'}`}>
                  {nf(k.emProducao.caixilhos)} caixilhos · {nf(k.emProducao.quadrosFila)} quadros na fila
                </p>
              </div>
            </section>

            {/* Visão geral — hierarquia pelo campo Modelo do Jira */}
            <section className={`rounded-xl border p-4 space-y-2.5 ${card}`} aria-label="Visão geral por nível">
              <h2 className={`font-semibold ${tv ? 'text-xl' : 'text-sm'}`}>Visão geral</h2>
              {([
                ['Projetos',  'Epic',    data.niveis.projetos],
                ['Caixilhos', 'Task',    data.niveis.caixilhos],
                ['Marcos',    'Subtask', data.niveis.marcos],
                ['Folhas',    'Subtask', data.niveis.folhas],
              ] as Array<[string, string, LevelTotals]>).map(([label, jira, t]) => (
                <div key={label} className="grid grid-cols-[110px_1fr] md:grid-cols-[130px_1fr_max-content] gap-x-3 gap-y-1 items-center">
                  <span className={`font-semibold ${muted} ${tv ? 'text-lg' : 'text-xs'}`}>
                    <b className={`tabular-nums ${tv ? 'text-slate-100' : 'text-slate-800'}`}>{nf(t.total)}</b> {label}
                    {!tv && <span className={`ml-1 text-[9px] border rounded px-1 align-middle ${faint} ${divider}`}>{jira}</span>}
                  </span>
                  <StackedBar porStatus={t.porStatus} total={t.total} tv={tv} height={tv ? 'h-5' : 'h-3.5'} />
                  <span className={`hidden md:block whitespace-nowrap tabular-nums ${faint} ${tv ? 'text-base' : 'text-[11px]'}`}>
                    {orderedStatuses(t.porStatus).map((s) => `${t.porStatus[s]} ${s === 'Tarefas Pendentes' ? 'pend' : s === 'Em Andamento' ? 'prod' : s === 'Concluido' ? 'concl' : s === 'Expedido' ? 'exped' : s.toLowerCase()}`).join(' · ')}
                  </span>
                </div>
              ))}
              <div className={`flex flex-wrap gap-x-4 gap-y-1 pt-1 ${tv ? 'text-base text-slate-300' : 'text-[11px] text-slate-600'}`}>
                {STATUS_ORDER.map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <Dot status={s} tv={tv} />
                    {s === 'Tarefas Pendentes' ? 'Pendente' : s === 'Em Andamento' ? 'Em produção' : s === 'Concluido' ? 'Concluído' : s}
                  </span>
                ))}
              </div>
              {!tv && (
                <p className={`${faint} text-[11px]`}>
                  Classificação pelo campo <b className={muted}>Modelo</b> do Jira: Projeto · Caixilho · Marco · Folha.
                </p>
              )}
            </section>

            {/* Filtros */}
            {!tv && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar projetos">
                <span className={`text-xs font-semibold ${faint}`}>Projetos</span>
                {FILTERS.map((f) => {
                  const n = data.projetos.filter(f.match).length;
                  const on = filtro === f.id;
                  const isRisco = f.id === 'risco';
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFiltro(f.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        on
                          ? isRisco ? 'bg-red-600 border-red-600 text-white' : 'bg-slate-800 border-slate-800 text-white'
                          : isRisco ? 'border-red-600 text-red-600 bg-white' : `${card} ${muted}`
                      }`}
                    >
                      {f.label} <span className="opacity-60 tabular-nums">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Grade de projetos por urgência */}
            <section
              className={`grid gap-3 items-start ${tv ? 'grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}
              aria-label="Projetos por urgência"
            >
              {projetosVisiveis.map((p) => {
                const pill = urgencyPill(p, tv);
                const isOpen = !!expanded[p.key];
                const flagAlarme = p.urgency === 'atrasado'
                  ? `prazo ${fmtData(p.duedate)} vencido`
                  : p.urgency === 'parado'
                    ? `últ. movimentação ${fmtData(p.lastMove)}`
                    : null;
                return (
                  <article key={p.key} className={`rounded-xl border overflow-hidden border-l-4 ${card} ${URGENCY_STRIPE[p.urgency]}`}>
                    <div className="px-4 pt-3.5 pb-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold truncate ${tv ? 'text-xl' : 'text-sm'}`}>
                            {p.cliente || p.summary || p.key}
                          </p>
                          <p className={`font-mono ${faint} ${tv ? 'text-sm' : 'text-[11px]'}`}>
                            {p.key}{p.documento && ` · doc ${p.documento}`}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${tv ? 'text-xs' : ''} ${pill.cls}`}>
                          {pill.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 mt-3">
                        <span className={`font-bold tabular-nums min-w-[3.25rem] ${tv ? 'text-3xl' : 'text-xl'}`}>{p.pct}%</span>
                        <div className="flex-1">
                          <StackedBar porStatus={p.counts.porStatus} total={p.counts.total} tv={tv} height={tv ? 'h-3.5' : 'h-2.5'} />
                        </div>
                      </div>
                      <p className={`flex flex-wrap gap-x-3 mt-2 tabular-nums ${muted} ${tv ? 'text-base' : 'text-[11px]'}`}>
                        {p.counts.total > 0 ? (
                          <span>
                            {p.counts.total} quadros · {(p.counts.porStatus['Concluido'] ?? 0) + (p.counts.porStatus['Expedido'] ?? 0)} prontos
                            {(p.counts.porStatus['Expedido'] ?? 0) > 0 && ` · ${p.counts.porStatus['Expedido']} expedidos`}
                          </span>
                        ) : (
                          <span>Sem quadros</span>
                        )}
                        {flagAlarme && <span className={`font-semibold ${tv ? 'text-red-400' : 'text-red-600'}`}>{flagAlarme}</span>}
                        {!flagAlarme && p.duedate && <span className="font-semibold">prazo {fmtData(p.duedate)}</span>}
                      </p>
                    </div>

                    {!tv && (
                      <>
                        <button
                          onClick={() => setExpanded((e) => ({ ...e, [p.key]: !e[p.key] }))}
                          aria-expanded={isOpen}
                          className={`w-full border-t py-1.5 text-xs font-semibold ${divider} ${faint} hover:text-slate-700`}
                        >
                          {isOpen ? 'Detalhes ▴' : 'Detalhes ▾'}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 space-y-2">
                            {p.porTipoModelo.length > 0 && (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className={faint}>
                                    <th className="text-left font-semibold py-1">Tipo · Modelo</th>
                                    <th className="text-right font-semibold py-1 pl-3">Total</th>
                                    <th className="text-right font-semibold py-1 pl-3">Concl.</th>
                                    <th className="text-right font-semibold py-1 pl-3">Exped.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.porTipoModelo.map((r) => (
                                    <tr key={`${r.tipo}|${r.modelo}`} className={`border-t ${divider}`}>
                                      <td className="py-1">{[r.tipo, r.modelo].filter(Boolean).join(' · ') || '(sem tipo/modelo)'}</td>
                                      <td className="text-right py-1 pl-3 tabular-nums font-bold">{r.total}</td>
                                      <td className="text-right py-1 pl-3 tabular-nums">{r.concluido}</td>
                                      <td className="text-right py-1 pl-3 tabular-nums">{r.expedido}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {p.quadros.length > 0 && (
                              <div className="overflow-auto max-h-64 border rounded-lg border-slate-200">
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0 bg-white">
                                    <tr className={faint}>
                                      <th className="text-left font-semibold py-1 px-2">Quadro</th>
                                      <th className="text-left font-semibold py-1 px-2">Modelo</th>
                                      <th className="text-left font-semibold py-1 px-2">Tipo</th>
                                      <th className="text-left font-semibold py-1 px-2">Loc.</th>
                                      <th className="text-right font-semibold py-1 px-2">Medidas</th>
                                      <th className="text-left font-semibold py-1 px-2">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.quadros.map((q) => (
                                      <tr key={q.key} className={`border-t ${divider}`}>
                                        <td className="py-1 px-2 font-mono">{q.key}</td>
                                        <td className="py-1 px-2">{q.modelo}</td>
                                        <td className="py-1 px-2">{q.tipo}</td>
                                        <td className="py-1 px-2 font-mono">{q.loc}</td>
                                        <td className="py-1 px-2 text-right tabular-nums whitespace-nowrap">
                                          {q.largura && q.altura ? `${q.largura}×${q.altura}` : ''}
                                        </td>
                                        <td className="py-1 px-2 whitespace-nowrap">
                                          <span className="inline-flex items-center gap-1"><Dot status={q.status} tv={false} />
                                            {q.status === 'Tarefas Pendentes' ? 'Pendente' : q.status === 'Em Andamento' ? 'Produção' : q.status}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {p.cores.length > 0 && (
                              <p className={`${faint} text-[11px]`}>Cor: {p.cores.join(' · ')}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </section>
            {projetosVisiveis.length === 0 && (
              <p className={`text-center py-10 ${faint}`}>Nenhum projeto encontrado.</p>
            )}

            {/* Caixilhos fora de projeto */}
            {!tv && data.semProjeto.length > 0 && (
              <section className={`rounded-xl border p-4 ${card}`}>
                <h2 className="font-semibold text-sm mb-2">Sem projeto</h2>
                <div className="flex flex-wrap gap-1.5">
                  {data.semProjeto.map((c) => (
                    <span key={c.key} title={`${c.summary} (${c.status})`}
                      className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 font-mono text-xs text-slate-600">
                      <Dot status={c.status} tv={false} /> {c.key}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
