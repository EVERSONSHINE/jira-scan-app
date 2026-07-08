'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

const QRScanner = dynamic(() => import('@/components/QRScanner'), { ssr: false });

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SearchResult {
  key: string;
  summary: string;
  status: string;
  parent: string;
}

interface IssueDetail {
  key: string;
  summary: string;
  status: string;
  parent: string;
  cliente: string;
  documento: string;
  tipo: string;
  largura: string;
  altura: string;
  modelo: string;
  localizacao: string;
  localizacaoFieldId: string | null;
  localizacaoOptions: Array<{ id: string; value: string }>;
}

interface Transition {
  id: string;
  name: string;
  toStatus: string;
}

// ─── Helpers de status ────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'Tarefas Pendentes': { bg: 'bg-slate-100',  text: 'text-slate-700',  border: 'border-slate-300' },
  'Em Andamento':      { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-400' },
  'Concluido':         { bg: 'bg-emerald-100',text: 'text-emerald-700',border: 'border-emerald-400' },
  'Expedido':          { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-400'   },
};

const STATUS_ACTIVE: Record<string, string> = {
  'Tarefas Pendentes': 'bg-slate-500  text-white border-slate-500',
  'Em Andamento':      'bg-amber-500  text-white border-amber-500',
  'Concluido':         'bg-emerald-500 text-white border-emerald-500',
  'Expedido':          'bg-blue-600   text-white border-blue-600',
};

const STATUSES = ['Tarefas Pendentes', 'Em Andamento', 'Concluido', 'Expedido'];

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
      {status}
    </span>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab]             = useState<'scan' | 'search'>('scan');
  const [showScanner, setShowScanner] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching]     = useState(false);

  const [issue, setIssue]             = useState<IssueDetail | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [loadingIssue, setLoadingIssue] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingLoc, setUpdatingLoc]       = useState(false);
  const [selectedLoc, setSelectedLoc]       = useState('');
  const [toast, setToast]                   = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // ── Carrega issue ──────────────────────────────────────────────────────────
  const loadIssue = useCallback(async (key: string) => {
    const k = key.trim().toUpperCase();
    if (!k) return;
    setLoadingIssue(true);
    setIssue(null);
    setTransitions([]);
    try {
      const [issueRes, transRes] = await Promise.all([
        fetch(`/api/issue/${k}`).then((r) => r.json()),
        fetch(`/api/issue/${k}/transitions`).then((r) => r.json()),
      ]);
      if (issueRes.error) throw new Error(issueRes.error);
      setIssue(issueRes);
      setSelectedLoc(issueRes.localizacao ?? '');
      setTransitions(Array.isArray(transRes) ? transRes : []);
    } catch (e) {
      showToast(`Erro: ${e}`);
    } finally {
      setLoadingIssue(false);
    }
  }, []);

  // ── QR scan ────────────────────────────────────────────────────────────────
  const handleScan = useCallback((text: string) => {
    setShowScanner(false);
    // O QR contém o ID da subtask (ex: PROJ-123)
    const match = text.match(/([A-Z]+-\d+)/i);
    const key = match ? match[1].toUpperCase() : text.trim();
    loadIssue(key);
  }, [loadIssue]);

  // ── Busca manual ────────────────────────────────────────────────────────────
  const handleSearchChange = (v: string) => {
    setSearchQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!v.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(v)}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  // ── Atualiza status ─────────────────────────────────────────────────────────
  const handleStatusChange = async (statusName: string) => {
    if (!issue || updatingStatus) return;
    const tr = transitions.find(
      (t) => t.toStatus.toLowerCase() === statusName.toLowerCase(),
    );
    if (!tr) { showToast(`Transição "${statusName}" não disponível`); return; }

    setUpdatingStatus(true);
    const prev = issue.status;
    setIssue((i) => i ? { ...i, status: statusName } : i);   // optimistic

    try {
      const res = await fetch(`/api/issue/${issue.key}/transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transitionId: tr.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(
        data.epicUpdated
          ? `Status → ${statusName} · Epic ${data.epicUpdated} → Em Andamento`
          : `Status → ${statusName}`,
      );
      // Recarrega transições disponíveis
      fetch(`/api/issue/${issue.key}/transitions`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setTransitions(d); });
    } catch (e) {
      setIssue((i) => i ? { ...i, status: prev } : i);
      showToast(`Erro: ${e}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── Atualiza Localização ────────────────────────────────────────────────────
  const handleLocalizacaoSave = async () => {
    if (!issue || !issue.localizacaoFieldId || updatingLoc) return;
    setUpdatingLoc(true);
    try {
      const res = await fetch(`/api/issue/${issue.key}/localizacao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId: issue.localizacaoFieldId, value: selectedLoc }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIssue((i) => i ? { ...i, localizacao: selectedLoc } : i);
      showToast('Localização atualizada');
    } catch (e) {
      showToast(`Erro: ${e}`);
    } finally {
      setUpdatingLoc(false);
    }
  };

  // ── Limpar tela ─────────────────────────────────────────────────────────────
  const handleClear = () => {
    setIssue(null);
    setTransitions([]);
    setSearchQuery('');
    setSearchResults([]);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">

      {/* Header */}
      <header className="bg-slate-800 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow">
        <div>
          <h1 className="font-bold text-lg leading-tight">Shine Windows</h1>
          <p className="text-slate-400 text-xs">Controle de Produção</p>
        </div>
        {issue && (
          <button onClick={handleClear} className="text-slate-300 text-sm underline">
            Nova leitura
          </button>
        )}
      </header>

      <main className="flex-1 p-4 space-y-4">

        {/* Tabs (apenas quando não há issue carregada) */}
        {!issue && !loadingIssue && (
          <>
            <div className="flex rounded-xl overflow-hidden border border-slate-300 bg-white">
              {(['scan', 'search'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    tab === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'scan' ? '📷  Escanear QR' : '🔍  Buscar'}
                </button>
              ))}
            </div>

            {/* Aba Scan */}
            {tab === 'scan' && (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-slate-200">
                <div className="text-6xl mb-4">📷</div>
                <p className="text-slate-600 text-sm mb-5">
                  Aponte a câmera para o QR code da etiqueta do quadro.
                </p>
                <button
                  onClick={() => setShowScanner(true)}
                  className="w-full bg-slate-800 text-white py-4 rounded-xl font-semibold text-lg active:bg-slate-700 transition-colors"
                >
                  Iniciar Scanner
                </button>
              </div>
            )}

            {/* Aba Buscar */}
            {tab === 'search' && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
                <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-slate-400">
                  <span className="px-3 py-3 bg-slate-100 text-slate-500 font-mono text-sm border-r border-slate-300 select-none whitespace-nowrap">
                    PROJ-
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="184"
                    value={searchQuery.replace(/^PROJ-/i, '')}
                    onChange={(e) => handleSearchChange(e.target.value ? `PROJ-${e.target.value}` : '')}
                    className="flex-1 px-3 py-3 text-sm outline-none bg-white"
                  />
                </div>
                {searching && (
                  <p className="text-center text-slate-400 text-sm py-2">Buscando…</p>
                )}
                {searchResults.length > 0 && (
                  <ul className="divide-y divide-slate-100">
                    {searchResults.map((r) => (
                      <li key={r.key}>
                        <button
                          onClick={() => { setSearchQuery(''); setSearchResults([]); loadIssue(r.key); }}
                          className="w-full text-left px-2 py-3 hover:bg-slate-50 active:bg-slate-100 rounded-lg"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-slate-800 text-sm">{r.key}</span>
                            <StatusBadge status={r.status} />
                          </div>
                          <p className="text-slate-500 text-xs mt-0.5 truncate">{r.summary}</p>
                          {r.parent && <p className="text-slate-400 text-xs">Task: {r.parent}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {/* Loading */}
        {loadingIssue && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-slate-200">
            <div className="text-4xl animate-spin mb-3">⏳</div>
            <p className="text-slate-500 text-sm">Carregando quadro…</p>
          </div>
        )}

        {/* Painel do Issue */}
        {issue && !loadingIssue && (
          <div className="space-y-4">

            {/* Card de identificação */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                <span className="font-mono font-bold text-white text-lg">{issue.key}</span>
                <StatusBadge status={issue.status} />
              </div>
              <div className="px-4 py-3 space-y-1 text-sm">
                <p className="font-semibold text-slate-800">{issue.summary}</p>
                {issue.parent && <p className="text-slate-500 text-xs">Task: {issue.parent}</p>}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 text-xs text-slate-600">
                  {issue.cliente   && <span><span className="font-medium">Cliente:</span> {issue.cliente}</span>}
                  {issue.documento && <span><span className="font-medium">Doc:</span> {issue.documento}</span>}
                  {issue.tipo      && <span><span className="font-medium">Tipo:</span> {issue.tipo}</span>}
                  {issue.modelo    && <span><span className="font-medium">Modelo:</span> {issue.modelo}</span>}
                  {(issue.largura || issue.altura) && (
                    <span className="col-span-2 font-semibold text-slate-700">
                      📐 {issue.largura} × {issue.altura} mm
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Alterar Status */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <h2 className="font-semibold text-slate-700 text-sm mb-3">Alterar Status</h2>
              <div className="grid grid-cols-2 gap-2">
                {STATUSES.map((s) => {
                  const isActive = issue.status === s;
                  const isAvailable = transitions.some((t) => t.toStatus.toLowerCase() === s.toLowerCase());
                  const style = STATUS_STYLES[s] ?? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
                  const activeStyle = STATUS_ACTIVE[s] ?? 'bg-gray-500 text-white border-gray-500';

                  return (
                    <button
                      key={s}
                      disabled={updatingStatus || (!isAvailable && !isActive)}
                      onClick={() => handleStatusChange(s)}
                      className={`py-3 px-2 rounded-xl border-2 text-sm font-medium transition-all
                        ${isActive ? activeStyle : `${style.bg} ${style.text} ${style.border}`}
                        ${!isAvailable && !isActive ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}
                      `}
                    >
                      {isActive && '✓ '}{s}
                    </button>
                  );
                })}
              </div>
              {updatingStatus && (
                <p className="text-center text-slate-400 text-xs mt-2">Atualizando…</p>
              )}
            </div>

            {/* Alterar Localização */}
            {issue.localizacaoFieldId && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                <h2 className="font-semibold text-slate-700 text-sm mb-3">Localização</h2>
                {issue.localizacaoOptions.length > 0 ? (
                  <select
                    value={selectedLoc}
                    onChange={(e) => setSelectedLoc(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  >
                    <option value="">— selecione —</option>
                    {issue.localizacaoOptions.map((o) => (
                      <option key={o.id} value={o.value}>{o.value}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedLoc}
                    onChange={(e) => setSelectedLoc(e.target.value)}
                    placeholder="Digite a localização"
                    className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                )}
                <button
                  disabled={updatingLoc || selectedLoc === issue.localizacao}
                  onClick={handleLocalizacaoSave}
                  className="mt-3 w-full bg-slate-800 text-white py-3 rounded-xl font-medium text-sm
                    disabled:opacity-40 active:bg-slate-700 transition-colors"
                >
                  {updatingLoc ? 'Salvando…' : 'Salvar Localização'}
                </button>
                {issue.localizacao && (
                  <p className="text-slate-400 text-xs mt-1 text-center">
                    Atual: <span className="font-medium text-slate-600">{issue.localizacao}</span>
                  </p>
                )}
              </div>
            )}

          </div>
        )}
      </main>

      {/* Scanner modal */}
      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm
          px-5 py-3 rounded-full shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}
