'use client';
import { useEffect, useMemo, useState } from 'react';
import { canonicalStatus } from '@/lib/status';

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

// ─── Helpers visuais (mesma linguagem de page.tsx) ───────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'Tarefas Pendentes': { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-300' },
  'Em Andamento':      { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-400' },
  'Concluido':         { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-400' },
  'Expedido':          { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-400' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[canonicalStatus(status)] ??
    { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${s.bg} ${s.text} ${s.border}`}>
      {status}
    </span>
  );
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
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">

      {/* Header */}
      <header className="bg-slate-800 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow">
        <div>
          <h1 className="font-bold text-lg leading-tight">Quadros</h1>
          <p className="text-slate-400 text-xs">Localização por projeto</p>
        </div>
        <div className="flex items-center gap-3">
          {epic ? (
            <button onClick={() => { setEpic(null); setQuadros([]); }} className="text-slate-300 text-sm underline">
              Trocar projeto
            </button>
          ) : (
            <a href="/" className="text-slate-300 text-xs underline whitespace-nowrap">← Início</a>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">

        {/* Passo 1: escolher o Epic */}
        {!epic && (
          <>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente, documento ou chave…"
              className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm bg-white
                focus:outline-none focus:ring-2 focus:ring-slate-400"
            />

            {loadingEpics && (
              <p className="text-center text-slate-400 text-sm py-6">Carregando projetos…</p>
            )}
            {epicsError && (
              <p className="text-center text-red-600 text-sm py-4">Erro: {epicsError}</p>
            )}
            {!loadingEpics && !epicsError && epicsFiltrados.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-6">Nenhum projeto encontrado.</p>
            )}

            <ul className="space-y-2">
              {epicsFiltrados.map((e) => (
                <li key={e.key}>
                  <button
                    onClick={() => selectEpic(e)}
                    className="w-full text-left bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-3
                      hover:bg-slate-50 active:bg-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-slate-800 text-sm">{e.key}</span>
                      <StatusBadge status={e.status} />
                    </div>
                    <p className="font-semibold text-slate-700 text-sm mt-0.5 truncate">
                      {e.cliente || e.summary}
                    </p>
                    <p className="text-slate-400 text-xs truncate">
                      {e.cliente && e.summary}
                      {e.documento && ` · Doc: ${e.documento}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Passo 2: quadros do Epic selecionado */}
        {epic && (
          <div className="space-y-4">

            {/* Card do projeto */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-slate-800">{epic.key}</span>
                <StatusBadge status={epic.status} />
              </div>
              <p className="font-semibold text-slate-700 text-sm mt-0.5">{epic.cliente || epic.summary}</p>
              {(epic.cliente || epic.documento) && (
                <p className="text-slate-400 text-xs">
                  {epic.cliente && epic.summary}
                  {epic.documento && ` · Doc: ${epic.documento}`}
                </p>
              )}
            </div>

            {loadingQuadros && (
              <p className="text-center text-slate-400 text-sm py-6">Carregando quadros…</p>
            )}
            {quadrosError && (
              <p className="text-center text-red-600 text-sm py-4">Erro: {quadrosError}</p>
            )}

            {!loadingQuadros && !quadrosError && (
              <>
                {/* Filtros */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-slate-700 text-sm">Filtros</h2>
                    {temFiltro && (
                      <button
                        onClick={() => { setFTipo(''); setFModelo(''); setFLoc(''); setFStatus(''); }}
                        className="text-slate-500 text-xs underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['Tipo', fTipo, setFTipo, tipos],
                      ['Modelo', fModelo, setFModelo, modelos],
                      ['Localização', fLoc, setFLoc, locs],
                      ['Status', fStatus, setFStatus, statuses],
                    ] as const).map(([label, value, setter, options]) => (
                      <label key={label} className="text-xs text-slate-500">
                        {label}
                        <select
                          value={value}
                          onChange={(e) => setter(e.target.value)}
                          className="mt-1 w-full border border-slate-300 rounded-xl px-2 py-2 text-sm bg-white
                            focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                          <option value="">Todos</option>
                          {options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Tabela de quadros */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-700 text-sm">
                      {quadrosFiltrados.length} de {quadros.length} quadros
                    </h2>
                  </div>
                  {quadros.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-6">Projeto sem quadros.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                            <th className="px-4 py-2 font-medium">Quadro</th>
                            <th className="px-2 py-2 font-medium">Modelo</th>
                            <th className="px-2 py-2 font-medium">Tipo</th>
                            <th className="px-2 py-2 font-medium">Localização</th>
                            <th className="px-4 py-2 font-medium text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {quadrosFiltrados.map((q) => (
                            <tr key={q.key}>
                              <td className="px-4 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">{q.key}</td>
                              <td className="px-2 py-2 text-slate-600">{q.modelo || '—'}</td>
                              <td className="px-2 py-2 text-slate-600">{q.tipo || '—'}</td>
                              <td className="px-2 py-2 font-medium text-slate-700">{q.localizacao || '—'}</td>
                              <td className="px-4 py-2 text-right"><StatusBadge status={q.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
