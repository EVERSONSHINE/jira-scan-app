'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { STATUS_ORDER, canonicalStatus } from '@/lib/status';

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

/** Resposta de /api/issue/[key]/irmaos: a issue lida e as irmãs da mesma Task */
interface Irmaos {
  task: string | null;
  subtasks: Array<{ key: string; summary: string; status: string; modelo: string; localizacao: string }>;
}

/** Uma linha do resultado de /api/issue/[key]/lote */
interface ResultadoLote {
  key: string;
  ok: boolean;
  de: string;
  para: string;
  motivo?: string;
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

const STATUSES: readonly string[] = STATUS_ORDER;

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

  // Aplicar a todas as subtasks da Task. Desmarca a cada leitura: ninguém
  // deve alterar uma task inteira por ter esquecido a opção ligada.
  const [irmaos, setIrmaos]                 = useState<Irmaos | null>(null);
  const [emLote, setEmLote]                 = useState(false);
  const [naoMudaram, setNaoMudaram]         = useState<ResultadoLote[]>([]);

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
    setIrmaos(null);
    setEmLote(false);
    setNaoMudaram([]);
    try {
      const [issueRes, transRes, irmaosRes] = await Promise.all([
        fetch(`/api/issue/${k}`).then((r) => r.json()),
        fetch(`/api/issue/${k}/transitions`).then((r) => r.json()),
        // Opcional: se falhar, a leitura segue normal, só sem a opção de lote
        fetch(`/api/issue/${k}/irmaos`).then((r) => r.json()).catch(() => null),
      ]);
      if (issueRes.error) throw new Error(issueRes.error);
      setIssue(issueRes);
      setSelectedLoc(issueRes.localizacao ?? '');
      setTransitions(Array.isArray(transRes) ? transRes : []);
      setIrmaos(irmaosRes && !irmaosRes.error ? irmaosRes : null);
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

  // ── Lote: todas as subtasks da Task ────────────────────────────────────────
  // Só existe para subtask de uma Task com mais de uma subtask
  const lote = irmaos?.task && irmaos.subtasks.length > 1 ? irmaos : null;
  const emLoteAtivo = emLote && lote !== null;

  const recarregarIrmaos = (key: string) => {
    fetch(`/api/issue/${key}/irmaos`)
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) setIrmaos(d); })
      .catch(() => {});
  };

  const postLote = async (key: string, body: object): Promise<{
    resultados: ResultadoLote[];
    updated: Array<{ key: string; status: string }>;
  }> => {
    const res = await fetch(`/api/issue/${key}/lote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { resultados: data.resultados ?? [], updated: data.updated ?? [] };
  };

  // ── Atualiza status ─────────────────────────────────────────────────────────
  const handleStatusChange = async (statusName: string) => {
    if (!issue || updatingStatus) return;
    const tr = transitions.find(
      (t) => t.toStatus.toLowerCase() === statusName.toLowerCase(),
    );
    // Em lote, a lida já no status escolhido não precisa de transição: o
    // clique ainda serve para levar as irmãs até ele
    const jaNoStatus = canonicalStatus(issue.status) === canonicalStatus(statusName);
    if (!tr && !(emLoteAtivo && jaNoStatus)) {
      showToast(`Transição "${statusName}" não disponível`);
      return;
    }

    setUpdatingStatus(true);
    setNaoMudaram([]);
    const prev = issue.status;
    setIssue((i) => i ? { ...i, status: statusName } : i);   // optimistic

    try {
      let cascata: Array<{ key: string; status: string }>;
      let resumo = `Status → ${statusName}`;
      if (emLoteAtivo) {
        const { resultados, updated } = await postLote(issue.key, {
          acao: 'status', transitionId: tr?.id, status: statusName,
        });
        cascata = updated;
        resumo = `${resultados.filter((r) => r.ok).length}/${resultados.length} subtasks → ${statusName}`;
        setNaoMudaram(resultados.filter((r) => !r.ok));
        recarregarIrmaos(issue.key);
      } else {
        const res = await fetch(`/api/issue/${issue.key}/transitions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transitionId: tr!.id }),   // fora do lote o guard exige tr
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        cascata = data.updated ?? [];
      }
      showToast(
        cascata.length > 0
          ? `${resumo} · ${cascata.map((u) => `${u.key} → ${u.status}`).join(' · ')}`
          : resumo,
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
    setNaoMudaram([]);
    try {
      if (emLoteAtivo) {
        const { resultados } = await postLote(issue.key, {
          acao: 'localizacao', fieldId: issue.localizacaoFieldId, value: selectedLoc,
        });
        setNaoMudaram(resultados.filter((r) => !r.ok));
        if (resultados.some((r) => r.key === issue.key && r.ok)) {
          setIssue((i) => i ? { ...i, localizacao: selectedLoc } : i);
        }
        showToast(`${resultados.filter((r) => r.ok).length}/${resultados.length} subtasks → ${selectedLoc}`);
        recarregarIrmaos(issue.key);
        return;
      }
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
    setIrmaos(null);
    setEmLote(false);
    setNaoMudaram([]);
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
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {issue ? (
            <button onClick={handleClear} className="text-slate-300 text-sm underline">
              Nova leitura
            </button>
          ) : (
            <>
              <a href="/quadros" className="text-slate-300 text-xs underline whitespace-nowrap">
                📦 Quadros
              </a>
              {/* Tela da TV: alterna entre resumo e expedição sozinha */}
              <a href="/painel" className="text-slate-300 text-xs underline whitespace-nowrap">
                📺 Painel
              </a>
              <a href="/expedicao" className="text-slate-300 text-xs underline whitespace-nowrap">
                🚚 Expedição
              </a>
              <a href="/resumo" className="text-slate-300 text-xs underline whitespace-nowrap">
                📊 Resumo
              </a>
            </>
          )}
        </div>
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

            {/* Aplicar a todas as subtasks da Task */}
            {lote && (
              <div className={`bg-white rounded-2xl shadow-sm border-2 p-4 ${emLote ? 'border-amber-400' : 'border-slate-200'}`}>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={emLote}
                    onChange={(e) => { setEmLote(e.target.checked); setNaoMudaram([]); }}
                    disabled={updatingStatus || updatingLoc}
                    className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
                  />
                  <span className="text-sm text-slate-700">
                    Aplicar a todas as <b>{lote.subtasks.length} subtasks</b> da task{' '}
                    <span className="font-mono font-semibold">{lote.task}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Status e localização valem para todas, para frente ou para trás.
                    </span>
                  </span>
                </label>

                {/* O que vai mudar — visível só com a opção ligada */}
                {emLote && (
                  <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-xs">
                    {lote.subtasks.map((s) => (
                      <li key={s.key} className="flex items-center gap-2 py-1.5">
                        <span className={`font-mono ${s.key === issue.key ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                          {s.key}
                        </span>
                        {s.modelo && <span className="text-slate-500">{s.modelo}</span>}
                        <span className="ml-auto flex items-center gap-2">
                          {s.localizacao && <span className="font-mono text-slate-500">{s.localizacao}</span>}
                          <StatusBadge status={s.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Irmãs que não mudaram na última ação em lote */}
                {naoMudaram.length > 0 && (
                  <div className="mt-3 rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800">
                    <p className="font-semibold mb-1">
                      {naoMudaram.length} {naoMudaram.length === 1 ? 'subtask não mudou' : 'subtasks não mudaram'}
                    </p>
                    <ul className="space-y-0.5">
                      {naoMudaram.map((r) => (
                        <li key={r.key}>
                          <span className="font-mono">{r.key}</span> — {r.motivo ?? 'erro'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Alterar Status */}
            <div className={`bg-white rounded-2xl shadow-sm p-4 ${emLoteAtivo ? 'border-2 border-amber-400' : 'border border-slate-200'}`}>
              <h2 className="font-semibold text-slate-700 text-sm mb-3">
                Alterar Status
                {emLoteAtivo && <span className="ml-2 font-normal text-amber-700">em lote · {lote?.subtasks.length} subtasks</span>}
              </h2>
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
              <div className={`bg-white rounded-2xl shadow-sm p-4 ${emLoteAtivo ? 'border-2 border-amber-400' : 'border border-slate-200'}`}>
                <h2 className="font-semibold text-slate-700 text-sm mb-3">
                  Localização
                  {emLoteAtivo && <span className="ml-2 font-normal text-amber-700">em lote · {lote?.subtasks.length} subtasks</span>}
                </h2>
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
                  disabled={
                    updatingLoc || (emLoteAtivo
                      // Em lote a lida pode já estar certa e as irmãs não; vazio
                      // em lote apagaria a localização da task inteira
                      ? !selectedLoc || !!lote?.subtasks.every((s) => s.localizacao === selectedLoc)
                      : selectedLoc === issue.localizacao)
                  }
                  onClick={handleLocalizacaoSave}
                  className="mt-3 w-full bg-slate-800 text-white py-3 rounded-xl font-medium text-sm
                    disabled:opacity-40 active:bg-slate-700 transition-colors"
                >
                  {updatingLoc
                    ? 'Salvando…'
                    : emLoteAtivo ? `Salvar em ${lote?.subtasks.length} subtasks` : 'Salvar Localização'}
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
          px-5 py-3 rounded-2xl shadow-lg z-50 w-max max-w-[calc(100vw-2rem)] text-center">
          {/* Quebra linha em vez de vazar da tela: o resumo do lote e a
              cascata passam da largura de um celular */}
          {toast}
        </div>
      )}
    </div>
  );
}
