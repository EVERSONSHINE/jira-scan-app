'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { stageLabel } from '@/lib/status';
import AppShell, { Button, Panel } from '@/components/AppShell';
import StatusBadge from '@/components/StatusBadge';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface EpicItem {
  key: string;
  summary: string;
  status: string;
  cliente: string;
  documento: string;
}

interface QuadroItem {
  key: string;
  summary: string;
  status: string;
  tipo: string;
  modelo: string;
  localizacao: string;
}

/** Valores distintos (não vazios) de um campo, ordenados */
function distinct(rows: QuadroItem[], get: (q: QuadroItem) => string): string[] {
  return [...new Set(rows.map(get).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function QuadrosPage() {
  const [epics, setEpics] = useState<EpicItem[]>([]);
  const [loadingEpics, setLoadingEpics] = useState(true);
  const [epicsError, setEpicsError] = useState('');
  const [busca, setBusca] = useState('');

  const [epic, setEpic] = useState<EpicItem | null>(null);
  const [quadros, setQuadros] = useState<QuadroItem[]>([]);
  const [loadingQuadros, setLoadingQuadros] = useState(false);
  const [quadrosError, setQuadrosError] = useState('');

  const [fTipo, setFTipo] = useState('');
  const [fModelo, setFModelo] = useState('');
  const [fLoc, setFLoc] = useState('');
  const [fStatus, setFStatus] = useState('');

  useEffect(() => {
    fetch('/api/epicos')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEpics(Array.isArray(data) ? data : []);
      })
      .catch((e) => setEpicsError(String(e)))
      .finally(() => setLoadingEpics(false));
  }, []);

  const selectEpic = async (e: EpicItem) => {
    setEpic(e);
    setQuadros([]);
    setQuadrosError('');
    setFTipo(''); setFModelo(''); setFLoc(''); setFStatus('');
    setLoadingQuadros(true);
    try {
      const res = await fetch(`/api/epicos/${e.key}/quadros`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuadros(Array.isArray(data) ? data : []);
    } catch (err) {
      setQuadrosError(String(err));
    } finally {
      setLoadingQuadros(false);
    }
  };

  const epicsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return epics;
    return epics.filter((e) =>
      [e.key, e.summary, e.cliente, e.documento].some((v) => v.toLowerCase().includes(q)),
    );
  }, [epics, busca]);

  const tipos = useMemo(() => distinct(quadros, (q) => q.tipo), [quadros]);
  const modelos = useMemo(() => distinct(quadros, (q) => q.modelo), [quadros]);
  const locs = useMemo(() => distinct(quadros, (q) => q.localizacao), [quadros]);
  const statuses = useMemo(() => distinct(quadros, (q) => q.status), [quadros]);

  const quadrosFiltrados = useMemo(() => {
    return quadros
      .filter((q) =>
        (!fTipo || q.tipo === fTipo) &&
        (!fModelo || q.modelo === fModelo) &&
        (!fLoc || q.localizacao === fLoc) &&
        (!fStatus || q.status === fStatus),
      )
      // Ordena por localização (vazias por último) para facilitar a coleta física
      .sort((a, b) => {
        if (!a.localizacao !== !b.localizacao) return a.localizacao ? -1 : 1;
        const l = a.localizacao.localeCompare(b.localizacao, 'pt-BR');
        return l !== 0 ? l : a.key.localeCompare(b.key, 'pt-BR', { numeric: true });
      });
  }, [quadros, fTipo, fModelo, fLoc, fStatus]);

  const temFiltro = !!(fTipo || fModelo || fLoc || fStatus);

  return (
    <AppShell
      title={epic ? (epic.cliente || epic.summary) : 'Quadros'}
      actions={epic && (
        <Button variant="ghost" onClick={() => { setEpic(null); setQuadros([]); }}>
          <ArrowLeft className="h-4 w-4" strokeWidth={2} /> <span className="max-sm:hidden">Trocar projeto</span>
        </Button>
      )}
    >
      <div className="space-y-4">

        {/* Passo 1: escolher o projeto */}
        {!epic && (
          <>
            <div>
              <p className="mb-3 text-sm text-slate-600">Escolha um projeto para ver onde estão os quadros dele.</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por cliente, documento ou chave…"
                  aria-label="Buscar projeto"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base outline-none focus:border-brand focus:ring-1 focus:ring-brand lg:max-w-md lg:text-sm"
                />
              </div>
            </div>

            {loadingEpics && (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando projetos…
              </p>
            )}
            {epicsError && <ErrorBox msg={epicsError} />}
            {!loadingEpics && !epicsError && epicsFiltrados.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-500">
                {busca ? `Nenhum projeto encontrado para “${busca}”.` : 'Nenhum projeto aberto.'}
              </p>
            )}

            {epicsFiltrados.length > 0 && (
              <Panel>
                <ul className="divide-y divide-slate-100">
                  {epicsFiltrados.map((e) => (
                    <li key={e.key}>
                      <button
                        onClick={() => selectEpic(e)}
                        className="flex w-full items-center gap-4 px-4 py-3 text-left first:rounded-t-xl last:rounded-b-xl hover:bg-slate-50 active:bg-slate-100"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-900">{e.cliente || e.summary}</span>
                          <span className="block truncate text-sm text-slate-500">
                            <span className="font-mono">{e.key}</span>
                            {e.cliente && ` · ${e.summary}`}
                            {e.documento && ` · doc ${e.documento}`}
                          </span>
                        </span>
                        <StatusBadge status={e.status} />
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}

        {/* Passo 2: quadros do projeto */}
        {epic && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span className="font-mono font-medium text-slate-800">{epic.key}</span>
              {epic.cliente && <span>{epic.summary}</span>}
              {epic.documento && <span>doc {epic.documento}</span>}
              <StatusBadge status={epic.status} />
            </div>

            {loadingQuadros && (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando quadros…
              </p>
            )}
            {quadrosError && <ErrorBox msg={quadrosError} />}

            {!loadingQuadros && !quadrosError && (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {([
                    ['Tipo', fTipo, setFTipo, tipos],
                    ['Modelo', fModelo, setFModelo, modelos],
                    ['Localização', fLoc, setFLoc, locs],
                    ['Status', fStatus, setFStatus, statuses],
                  ] as const).map(([label, value, setter, options]) => (
                    <label key={label} className="text-sm font-medium text-slate-700">
                      {label}
                      <select
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className={`mt-1 h-11 w-full rounded-lg border bg-white px-2.5 text-base outline-none focus:border-brand focus:ring-1 focus:ring-brand lg:h-10 lg:text-sm ${
                          value ? 'border-brand font-medium text-brand' : 'border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="">Todos</option>
                        {options.map((o) => <option key={o} value={o}>{label === 'Status' ? stageLabel(o) : o}</option>)}
                      </select>
                    </label>
                  ))}
                </div>

                <Panel className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-slate-900">
                      {quadrosFiltrados.length} <span className="font-normal text-slate-500">de {quadros.length} quadros</span>
                    </h2>
                    {temFiltro && (
                      <Button variant="ghost" onClick={() => { setFTipo(''); setFModelo(''); setFLoc(''); setFStatus(''); }}>
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                  {quadros.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">Este projeto ainda não tem quadros.</p>
                  ) : quadrosFiltrados.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">Nenhum quadro com esses filtros.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
                            <th className="py-2.5 pl-3 pr-2 font-medium sm:px-4">Quadro</th>
                            <th className="px-2 py-2.5 font-medium sm:px-3">Modelo</th>
                            <th className="px-3 py-2.5 font-medium max-sm:hidden">Tipo</th>
                            <th className="px-2 py-2.5 font-medium sm:px-3">Local</th>
                            <th className="py-2.5 pl-2 pr-3 text-right font-medium sm:px-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {quadrosFiltrados.map((q) => (
                            <tr key={q.key} className="hover:bg-slate-50">
                              <td className="whitespace-nowrap py-2.5 pl-3 pr-2 font-mono sm:px-4 font-medium text-slate-900">{q.key}</td>
                              <td className="px-2 py-2.5 text-slate-700 sm:px-3">{q.modelo || <span className="text-slate-400">—</span>}</td>
                              <td className="px-3 py-2.5 text-slate-700 max-sm:hidden">{q.tipo || <span className="text-slate-400">—</span>}</td>
                              <td className="px-2 py-2.5 sm:px-3">
                                {q.localizacao
                                  ? <span className="whitespace-nowrap rounded-md bg-cyan-700 px-1.5 py-0.5 font-mono text-xs font-semibold text-white">{q.localizacao}</span>
                                  : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="py-2.5 pl-2 pr-3 text-right sm:px-4"><StatusBadge status={q.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
      <div className="min-w-0">
        <p className="font-semibold">Não foi possível falar com o Jira.</p>
        <p className="mt-0.5 break-words text-red-800">{msg.replace(/^(Error: )+/, '')}</p>
      </div>
    </div>
  );
}
