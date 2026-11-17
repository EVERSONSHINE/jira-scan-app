'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_ORDER, OUTROS, STATUS_CHART } from '@/lib/status';
import { marcarSucesso } from '@/lib/autoreload';
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, Search } from 'lucide-react';
import AppShell, { Button } from '@/components/AppShell';
import Logo from '@/components/Logo';

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
  duedate: string | null; lastMove: string | null; concluidoAt: string | null;
  urgency: Urgency; urgencyDias: number | null; pct: number;
  counts: { total: number; porStatus: Record<string, number> };
  porTipoModelo: TipoModeloRow[];
  cores: string[];
  locais: string[];
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
  /** Quantos dos primeiros `projetos` são o bloco de recém-concluídos */
  destaqueCount: number;
  semProjeto: Array<{ key: string; summary: string; status: string }>;
  fetchedAt: string;
}

// ─── Vocabulário visual ──────────────────────────────────────────────────────
// Regra do painel: cinza=pendente, âmbar=produção, verde=concluído, azul=expedido.
// Vermelho é reservado para alarme (atrasado/parado) — nunca é cor de etapa.

function urgencyPill(p: ProjetoNode): { label: string; cls: string } {
  const cores: Record<Urgency, string> = {
    atrasado: 'bg-red-50 text-red-800',
    parado:   'bg-red-50 text-red-800',
    prod:     'bg-amber-50 text-amber-800',
    pend:     'bg-slate-100 text-slate-700',
    concl:    'bg-emerald-50 text-emerald-800',
    exped:    'bg-blue-50 text-blue-800',
  };
  const labels: Record<Urgency, string> = {
    atrasado: `Atrasado ${p.urgencyDias ?? '?'}d`,
    parado:   `Parado ${p.urgencyDias ?? '?'}d`,
    prod:     'Em produção',
    pend:     'Pendente',
    concl:    'Concluído',
    exped:    'Expedido',
  };
  return { label: labels[p.urgency], cls: cores[p.urgency] };
}

const FILTERS: Array<{ id: string; label: string; match: (p: ProjetoNode) => boolean }> = [
  { id: 'todos', label: 'Todos',        match: () => true },
  { id: 'risco', label: 'Em risco',     match: (p) => p.urgency === 'atrasado' || p.urgency === 'parado' },
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

function Dot({ status }: { status: string }) {
  const map = STATUS_CHART;
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${map[status] ?? map[OUTROS]}`} aria-hidden />
  );
}

function StackedBar({
  porStatus, total, height,
}: {
  porStatus: Record<string, number>; total: number; height: string;
}) {
  if (total === 0) return null;
  const map = STATUS_CHART;
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

/**
 * Indicador do topo. Na TV rótulo e número dividem a mesma linha de base —
 * a faixa cai de ~150px para ~80px, e a altura vai para os cards.
 */
function Kpi({
  dot, label, value, valueCls = '', sub, tv, theme, alert = '', children,
}: {
  dot: React.ReactNode; label: string; value: React.ReactNode; valueCls?: string;
  sub: React.ReactNode; tv: boolean; theme: Theme; alert?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${tv ? 'p-3' : 'p-4'} ${theme.card} ${alert}`}>
      <div className={tv ? 'flex items-baseline justify-between gap-2' : ''}>
        <p className={`flex items-center gap-1.5 font-medium whitespace-nowrap ${theme.faint} ${tv ? 'text-base' : 'text-sm'}`}>
          {dot} {label}
        </p>
        <p className={`font-semibold tracking-tight tabular-nums ${tv ? 'text-4xl' : 'text-3xl mt-1'} ${valueCls}`}>{value}</p>
      </div>
      <p className={`${theme.muted} mt-1 tabular-nums ${tv ? 'text-sm' : 'text-[13px]'}`}>{sub}</p>
      {children}
    </div>
  );
}

// ─── Card de projeto ─────────────────────────────────────────────────────────

/** TV destaque (grande, 5 colunas) · TV resto (denso, 6 colunas) · desktop */
type CardSize = 'tv' | 'tvCompact' | 'desk';

const CARD_TYPO: Record<CardSize, {
  pad: string; cliente: string; meta: string; pct: string;
  bar: string; info: string; chip: string;
}> = {
  // Padding e info enxutos na TV: as duas linhas reservadas para localização
  // custam altura, e ela sai daqui — não de cortar códigos de localização.
  tv:        { pad: 'px-5 pt-3 pb-3',   cliente: 'text-2xl', meta: 'text-base',   pct: 'text-4xl', bar: 'h-4',   info: 'text-base',   chip: 'text-lg'     },
  tvCompact: { pad: 'px-3 pt-2 pb-2',   cliente: 'text-base',meta: 'text-[11px]', pct: 'text-xl',  bar: 'h-2',   info: 'text-[11px]', chip: 'text-[11px]' },
  desk:      { pad: 'px-4 pt-3.5 pb-3', cliente: 'text-[15px]', meta: 'text-xs', pct: 'text-xl',  bar: 'h-2',   info: 'text-xs',     chip: 'text-xs'     },
};

interface Theme { card: string; cardAlarme: string; muted: string; faint: string; divider: string }

/**
 * Ciano preenchido: é onde a peça está, o dado que manda alguém andar até um
 * lugar, então precisa saltar. Fora do vocabulário de status de propósito —
 * cinza/âmbar/verde/azul significam etapa e vermelho é alarme; ciano é o único
 * hue que passou a separação CVD contra todos os cinco (skill dataviz).
 * Contraste sobre o card branco: 5.4:1 do chip e do texto branco dentro dele.
 */
const LOC_CHIP = 'bg-cyan-700 text-white';

/**
 * Localizações não repetidas dos quadros do projeto.
 *
 * Na TV a faixa tem altura fixa de duas linhas de chip e corta o excedente, em
 * vez de mostrar poucos chips e um "+N": vale mais ver o máximo de códigos que
 * cabem do que saber que existem outros. Como o flex-wrap só põe chips inteiros
 * numa linha, o corte nunca parte um chip pelo meio. A altura fixa também
 * mantém todos os cards iguais, independente de quantos códigos cada projeto
 * tem — é o que garante as 3 linhas de 5 dentro de 1080p.
 */
// 70px = 2 chips de 32px + o gap-1.5 (6px) entre as linhas. Medido, não estimado:
// com 62px a segunda linha aparecia cortada pela metade.
const LOC_ALTURA: Record<CardSize, string> = {
  tv:        'h-[70px] overflow-hidden content-start',
  tvCompact: 'h-[22px] overflow-hidden content-start',
  desk:      '',
};

function Locais({ locais, size }: { locais: string[]; size: CardSize }) {
  if (locais.length === 0) return null;
  const t = CARD_TYPO[size];
  return (
    <p
      className={`flex flex-wrap items-start gap-1.5 mt-2 ${t.chip} ${LOC_ALTURA[size]}`}
      aria-label={`Localizações dos quadros: ${locais.join(', ')}`}
    >
      {locais.map((l) => (
        <span
          key={l}
          className={`rounded-md px-1.5 py-0.5 font-mono font-semibold tracking-wide whitespace-nowrap ${LOC_CHIP}`}
        >
          {l}
        </span>
      ))}
    </p>
  );
}

function ProjetoCard({
  p, size, theme, expanded, onToggle,
}: {
  p: ProjetoNode; size: CardSize; theme: Theme;
  expanded?: boolean; onToggle?: () => void;
}) {
  const t = CARD_TYPO[size];
  const pill = urgencyPill(p);
  const prontos = (p.counts.porStatus['Concluido'] ?? 0) + (p.counts.porStatus['Expedido'] ?? 0);
  // Vermelho é alarme, nunca cor de etapa: só atrasado/parado o usam
  const alarme = p.urgency === 'atrasado'
    ? `prazo ${fmtData(p.duedate)} vencido`
    : p.urgency === 'parado'
      ? `parado há ${p.urgencyDias ?? '?'}d`
      : null;

  return (
    <article className={`rounded-xl border overflow-hidden ${alarme ? theme.cardAlarme : theme.card}`}>
      <div className={t.pad}>
        {/* Nome numa linha só, truncando: a linha economizada vai para as
            localizações, que é onde a informação vale mais na operação */}
        <p className={`font-semibold leading-tight tracking-tight truncate ${t.cliente}`}>
          {p.cliente || p.summary || p.key}
        </p>
        <div className="flex items-baseline justify-between gap-2 mt-0.5">
          <p className={`font-mono truncate ${theme.faint} ${t.meta}`}>
            {p.key}{p.documento && ` · doc ${p.documento}`}
          </p>
          <span className={`rounded-full px-2 py-0.5 font-medium whitespace-nowrap shrink-0 ${t.meta} ${pill.cls}`}>
            {pill.label}
          </span>
        </div>

        <div className={`flex items-center gap-2.5 ${size === 'tv' ? 'mt-2' : 'mt-3'}`}>
          <span className={`font-semibold tracking-tight tabular-nums ${t.pct}`}>{p.pct}%</span>
          <div className="flex-1">
            <StackedBar porStatus={p.counts.porStatus} total={p.counts.total} height={t.bar} />
          </div>
        </div>

        <p className={`flex flex-wrap gap-x-3 mt-2 tabular-nums ${theme.muted} ${t.info}`}>
          {p.counts.total > 0
            ? <span>{p.counts.total} quadros · {prontos} prontos</span>
            : <span>Sem quadros</span>}
          {/* Última movimentação em todos os cards, não só nos de alarme */}
          {p.lastMove && <span>últ. mov. {fmtData(p.lastMove)}</span>}
          {alarme
            ? <span className="font-semibold text-red-700">{alarme}</span>
            : p.duedate && <span className="font-semibold">prazo {fmtData(p.duedate)}</span>}
        </p>

        <Locais locais={p.locais} size={size} />
      </div>

      {size === 'desk' && onToggle && (
        <>
          <button
            onClick={onToggle}
            aria-expanded={!!expanded}
            className={`flex w-full items-center justify-center gap-1 border-t py-2 text-xs font-medium ${theme.divider} ${theme.faint} hover:bg-slate-50 hover:text-slate-800`}
          >
            Detalhes
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} strokeWidth={2} />
          </button>
          {expanded && (
            <div className="px-4 pb-4 space-y-2">
              {p.porTipoModelo.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className={theme.faint}>
                      <th className="text-left font-semibold py-1">Tipo · Modelo</th>
                      <th className="text-right font-semibold py-1 pl-3">Total</th>
                      <th className="text-right font-semibold py-1 pl-3">Concl.</th>
                      <th className="text-right font-semibold py-1 pl-3">Exped.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.porTipoModelo.map((r) => (
                      <tr key={`${r.tipo}|${r.modelo}`} className={`border-t ${theme.divider}`}>
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
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className={theme.faint}>
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
                        <tr key={q.key} className={`border-t ${theme.divider}`}>
                          <td className="py-1 px-2 font-mono">{q.key}</td>
                          <td className="py-1 px-2">{q.modelo}</td>
                          <td className="py-1 px-2">{q.tipo}</td>
                          <td className="py-1 px-2 font-mono">{q.loc}</td>
                          <td className="py-1 px-2 text-right tabular-nums whitespace-nowrap">
                            {q.largura && q.altura ? `${q.largura}×${q.altura}` : ''}
                          </td>
                          <td className="py-1 px-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1"><Dot status={q.status} />
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
                <p className={`${theme.faint} text-[11px]`}>Cor: {p.cores.join(' · ')}</p>
              )}
            </div>
          )}
        </>
      )}
    </article>
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
      marcarSucesso();
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

  // Tema claro, um só para TV e desktop: o que cresce na TV é a tipografia
  // (CARD_TYPO), não o contraste. Cinzas um passo mais escuros que o padrão do
  // desktop antigo — o painel é lido de longe, e slate-400 some a 3 metros.
  const surface = 'bg-slate-100 text-slate-900';
  const card    = 'bg-white border-slate-200 shadow-card';
  // Card em alarme (atrasado/parado): moldura vermelha inteira. A etapa já
  // está no selo; só o alarme ganha moldura, para saltar aos olhos de longe.
  const cardAlarme = 'bg-white border-red-600 ring-1 ring-red-600 shadow-card';
  const muted   = 'text-slate-600';
  const faint   = 'text-slate-500';
  const divider = 'border-slate-200';
  const theme   = { card, cardAlarme, muted, faint, divider };

  const projetosVisiveis = useMemo(() => {
    if (!data) return [];
    const f = FILTERS.find((x) => x.id === filtro) ?? FILTERS[0];
    const q = busca.trim().toLowerCase();
    return data.projetos.filter((p) =>
      f.match(p) &&
      (!q || `${p.cliente} ${p.key} ${p.documento} ${p.summary}`.toLowerCase().includes(q)),
    );
  }, [data, filtro, busca]);

  // Na TV não há filtro nem busca, então o corte por destaqueCount é fiel à API.
  // No desktop a lista fica plana — o corte não sobreviveria ao filtro.
  const destaque = tv ? projetosVisiveis.slice(0, data?.destaqueCount ?? 0) : [];
  const resto    = tv ? projetosVisiveis.slice(data?.destaqueCount ?? 0) : projetosVisiveis;

  const k = data?.kpis;

  const atualizado = updatedAt && `atualizado às ${updatedAt}`;

  const content = (
      <div className={tv ? 'space-y-2' : 'space-y-4'}>
        {/* Erro */}
        {error && (
          <div role="alert" className={`flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 ${tv ? 'text-lg' : 'text-sm'}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" strokeWidth={2} />
            <span>
              <b className="font-semibold">Falha ao atualizar</b> — {data ? 'mostrando os últimos dados.' : 'tentando novamente.'}
              <span className="text-amber-800"> ({error.replace(/^(Error: )+/, '').slice(0, 120)})</span>
            </span>
          </div>
        )}

        {!data && !error && (
          <p className={`flex items-center justify-center gap-2 py-16 ${muted} ${tv ? 'text-2xl' : 'text-sm'}`}>
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </p>
        )}

        {data && k && (
          <>
            {/* KPIs executivos */}
            <section className={`grid gap-3 ${tv ? 'grid-cols-4' : 'grid-cols-2 xl:grid-cols-4'}`} aria-label="Indicadores">
              <Kpi
                tv={tv} theme={theme}
                dot={<Dot status="Concluido" />}
                label="Conclusão geral"
                valueCls="text-emerald-600"
                value={<>{k.conclusaoPct}<span className={`font-semibold ${tv ? 'text-xl' : 'text-base'}`}>%</span></>}
                sub={<>{nf(k.quadrosProntos)} de {nf(k.quadrosTotal)} quadros produzidos</>}
              >
                <div className="h-1.5 rounded-full mt-2 overflow-hidden bg-slate-200">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${k.conclusaoPct}%` }} />
                </div>
              </Kpi>

              <Kpi
                tv={tv} theme={theme}
                dot={<span className="inline-block w-2 h-2 rounded-full shrink-0 bg-red-600" aria-hidden />}
                label="Projetos em risco"
                alert={k.risco.total > 0 ? '!border-red-600' : ''}
                valueCls={k.risco.total > 0 ? 'text-red-600' : ''}
                value={k.risco.total}
                sub={<>{k.risco.parados} parados &gt; 7 dias · {k.risco.atrasados} com prazo vencido</>}
              />

              <Kpi
                tv={tv} theme={theme}
                dot={<Dot status="Expedido" />}
                label="Expedidos"
                valueCls="text-blue-600"
                value={k.expedidosHoje ?? '—'}
                sub={<>hoje · {k.expedidosSemana ?? '—'} nos últimos 7 dias</>}
              />

              <Kpi
                tv={tv} theme={theme}
                dot={<Dot status="Em Andamento" />}
                label="Em produção agora"
                value={<>{k.emProducao.projetos} <span className={`font-semibold ${muted} ${tv ? 'text-xl' : 'text-base'}`}>projetos</span></>}
                sub={<>{nf(k.emProducao.caixilhos)} caixilhos · {nf(k.emProducao.quadrosFila)} quadros na fila</>}
              />
            </section>

            {/* Visão geral — hierarquia pelo campo Modelo do Jira */}
            {(() => {
              const niveis = [
                ['Projetos',  'Epic',    data.niveis.projetos],
                ['Caixilhos', 'Task',    data.niveis.caixilhos],
                ['Marcos',    'Subtask', data.niveis.marcos],
                ['Folhas',    'Subtask', data.niveis.folhas],
              ] as Array<[string, string, LevelTotals]>;
              const resumoStatuses = (t: LevelTotals) =>
                orderedStatuses(t.porStatus).map((s) => `${t.porStatus[s]} ${s === 'Tarefas Pendentes' ? 'pend' : s === 'Em Andamento' ? 'prod' : s === 'Concluido' ? 'concl' : s === 'Expedido' ? 'exped' : s.toLowerCase()}`).join(' · ');

              // Na TV: uma faixa de 4 colunas, sem título nem legenda — as mesmas
              // cores se repetem nas barras de cada card, com os números escritos
              return (
                <section className={`rounded-xl border ${tv ? 'p-3' : 'p-4 space-y-2.5'} ${card}`} aria-label="Visão geral por nível">
                  {tv ? (
                    <div className="grid grid-cols-4 gap-x-5">
                      {niveis.map(([label, , t]) => (
                        <div key={label} className="space-y-1">
                          <p className="flex items-baseline gap-1.5 text-sm whitespace-nowrap">
                            <b className="tabular-nums text-slate-900">{nf(t.total)}</b>
                            <span className={muted}>{label}</span>
                            <span className={`tabular-nums truncate ${faint}`}>{resumoStatuses(t)}</span>
                          </p>
                          <StackedBar porStatus={t.porStatus} total={t.total} height="h-3" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <h2 className="font-semibold text-sm">Visão geral</h2>
                      {niveis.map(([label, jira, t]) => (
                        <div key={label} className="grid grid-cols-[110px_1fr] md:grid-cols-[130px_1fr_max-content] gap-x-3 gap-y-1 items-center">
                          <span className={`font-semibold text-xs ${muted}`}>
                            <b className="tabular-nums text-slate-800">{nf(t.total)}</b> {label}
                            <span className={`ml-1 text-[10px] border rounded px-1 align-middle ${faint} ${divider}`}>{jira}</span>
                          </span>
                          <StackedBar porStatus={t.porStatus} total={t.total} height="h-3.5" />
                          <span className={`hidden md:block whitespace-nowrap tabular-nums text-[11px] ${faint}`}>
                            {resumoStatuses(t)}
                          </span>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-600">
                        {STATUS_ORDER.map((s) => (
                          <span key={s} className="flex items-center gap-1.5">
                            <Dot status={s} />
                            {s === 'Tarefas Pendentes' ? 'Pendente' : s === 'Em Andamento' ? 'Em produção' : s === 'Concluido' ? 'Concluído' : s}
                          </span>
                        ))}
                      </div>
                      <p className={`${faint} text-[11px]`}>
                        Classificação pelo campo <b className={muted}>Modelo</b> do Jira: Projeto · Caixilho · Marco · Folha.
                      </p>
                    </>
                  )}
                </section>
              );
            })()}

            {/* Filtros */}
            {!tv && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar projetos">
                <span className={`mr-1 text-sm font-semibold text-slate-900`}>Projetos</span>
                {FILTERS.map((f) => {
                  const n = data.projetos.filter(f.match).length;
                  const on = filtro === f.id;
                  const isRisco = f.id === 'risco';
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFiltro(f.id)}
                      aria-pressed={on}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                        on
                          ? isRisco ? 'bg-red-700 border-red-700 text-white' : 'bg-brand border-brand text-white'
                          : isRisco ? 'border-red-300 text-red-700 bg-white hover:bg-red-50' : `${card} text-slate-700 hover:bg-slate-50`
                      }`}
                    >
                      {isRisco && <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} />}
                      {f.label} <span className={`tabular-nums ${on ? 'text-white/70' : 'text-slate-500'}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Grade de projetos: recém-concluídos primeiro, resto por urgência */}
            {tv ? (
              <>
                {destaque.length > 0 && (
                  <section
                    className="grid gap-2.5 items-start grid-cols-3 2xl:grid-cols-5"
                    aria-label="Projetos com conclusão mais recente"
                  >
                    {destaque.map((p) => (
                      <ProjetoCard key={p.key} p={p} size="tv" theme={theme} />
                    ))}
                  </section>
                )}
                {resto.length > 0 && (
                  <section
                    className="grid gap-2 items-start grid-cols-4 2xl:grid-cols-6"
                    aria-label="Demais projetos por urgência"
                  >
                    {resto.map((p) => (
                      <ProjetoCard key={p.key} p={p} size="tvCompact" theme={theme} />
                    ))}
                  </section>
                )}
              </>
            ) : (
            <section
              className="grid gap-3 items-start grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
              aria-label="Projetos"
            >
              {projetosVisiveis.map((p) => (
                <ProjetoCard
                  key={p.key}
                  p={p}
                  size="desk"
                  theme={theme}
                  expanded={!!expanded[p.key]}
                  onToggle={() => setExpanded((e) => ({ ...e, [p.key]: !e[p.key] }))}
                />
              ))}
            </section>
            )}
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
                      <Dot status={c.status} /> {c.key}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
  );

  if (tv) {
    return (
      <div className={`min-h-screen ${surface} p-3`}>
        {/* Barra do topo — na TV uma linha só, para sobrar altura para os cards */}
        <header className="mb-2 flex items-center gap-4 px-1">
          <Logo className="w-24 text-brand" />
          <span className="h-7 w-px bg-slate-300" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Resumo da produção</h1>
          {atualizado && <p className={`ml-auto text-base ${muted}`}>{atualizado}</p>}
        </header>
        {content}
      </div>
    );
  }

  return (
    <AppShell
      title="Resumo da produção"
      actions={
        <>
          {atualizado && <span className={`hidden text-sm xl:block ${faint}`}>{atualizado}</span>}
          <div className="relative max-md:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente ou código…"
              aria-label="Buscar cliente ou código"
              className="h-9 w-64 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          <Button variant="secondary" onClick={load} disabled={loading} aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            <span className="max-sm:hidden">{loading ? 'Atualizando…' : 'Atualizar'}</span>
          </Button>
        </>
      }
    >
      {/* Busca no celular: abaixo do título, largura total */}
      <div className="relative mb-4 md:hidden">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou código…"
          aria-label="Buscar cliente ou código"
          className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>
      {content}
    </AppShell>
  );
}
