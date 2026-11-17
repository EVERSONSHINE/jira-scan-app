'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { STATUS_ORDER, canonicalStatus, stageLabel } from '@/lib/status';
import {
  AlertTriangle, Camera, Check, ChevronRight, Loader2, MapPin, RotateCcw, Ruler, ScanLine, Search,
} from 'lucide-react';
import AppShell, { Button, Panel } from '@/components/AppShell';
import StatusBadge, { STAGE_BUTTON, StageDot } from '@/components/StatusBadge';

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

const STATUSES: readonly string[] = STATUS_ORDER;

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
  const emLoteLabel = emLoteAtivo && (
    <span className="ml-2 font-medium text-amber-800">em lote · {lote?.subtasks.length} subtasks</span>
  );

  return (
    <AppShell
      title="Leitura"
      width="narrow"
      actions={issue && (
        <Button variant="ghost" onClick={handleClear}>
          <RotateCcw className="h-4 w-4" strokeWidth={2} /> Nova leitura
        </Button>
      )}
    >
      <div className="space-y-4">

        {/* Escanear ou buscar (só sem quadro carregado) */}
        {!issue && !loadingIssue && (
          <>
            <div className="grid grid-cols-2 rounded-xl bg-slate-200/70 p-1" role="tablist" aria-label="Como encontrar o quadro">
              {(['scan', 'search'] as const).map((t) => {
                const Icon = t === 'scan' ? ScanLine : Search;
                return (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors ${
                      tab === t ? 'bg-white text-slate-900 shadow-card' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    {t === 'scan' ? 'Escanear QR' : 'Buscar'}
                  </button>
                );
              })}
            </div>

            {tab === 'scan' && (
              <Panel className="p-4">
                {/* O visor é o botão: tocar em qualquer ponto dele abre a câmera */}
                <button
                  onClick={() => setShowScanner(true)}
                  className="group relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 text-slate-600 transition-colors hover:bg-brand-50 active:bg-brand-100"
                >
                  <svg viewBox="0 0 100 75" className="pointer-events-none absolute inset-4 z-0 h-[calc(100%-2rem)] w-[calc(100%-2rem)] text-brand" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" preserveAspectRatio="none" aria-hidden>
                    <path d="M2 14V4a2 2 0 0 1 2-2h12M84 2h12a2 2 0 0 1 2 2v10M98 61v10a2 2 0 0 1-2 2H84M16 73H4a2 2 0 0 1-2-2V61" vectorEffect="non-scaling-stroke" strokeWidth="3" />
                  </svg>
                  <span className="relative z-10 flex flex-col items-center gap-2">
                    <Camera className="h-9 w-9 text-brand transition-transform group-active:scale-95" strokeWidth={1.5} />
                    <span className="text-base font-semibold text-slate-900">Toque para abrir a câmera</span>
                    <span className="max-w-[16rem] text-center text-sm">Aponte para o QR code da etiqueta do quadro.</span>
                  </span>
                </button>
              </Panel>
            )}

            {tab === 'search' && (
              <Panel className="space-y-3 p-4">
                <label htmlFor="busca-quadro" className="text-sm font-medium text-slate-700">Número do quadro</label>
                <div className="flex h-12 items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                  <span className="flex h-full select-none items-center border-r border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-600">
                    PROJ-
                  </span>
                  <input
                    id="busca-quadro"
                    type="number"
                    inputMode="numeric"
                    placeholder="184"
                    value={searchQuery.replace(/^PROJ-/i, '')}
                    onChange={(e) => handleSearchChange(e.target.value ? `PROJ-${e.target.value}` : '')}
                    className="h-full flex-1 bg-white px-3 text-base outline-none"
                  />
                </div>
                {searching && (
                  <p className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                  </p>
                )}
                {searchResults.length > 0 && (
                  <ul className="-mx-2 divide-y divide-slate-100">
                    {searchResults.map((r) => (
                      <li key={r.key}>
                        <button
                          onClick={() => { setSearchQuery(''); setSearchResults([]); loadIssue(r.key); }}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="font-mono text-sm font-semibold text-slate-900">{r.key}</span>
                              <StatusBadge status={r.status} />
                            </span>
                            <span className="mt-0.5 block truncate text-sm text-slate-600">{r.summary}</span>
                            {r.parent && <span className="block text-xs text-slate-500">Task {r.parent}</span>}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </>
        )}

        {/* Carregando */}
        {loadingIssue && (
          <Panel className="flex flex-col items-center gap-3 px-6 py-14 text-sm text-slate-600">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
            Carregando quadro…
          </Panel>
        )}

        {/* Quadro lido */}
        {issue && !loadingIssue && (
          <>
            <Panel className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
                <div className="min-w-0">
                  <p className="font-mono text-2xl font-semibold tracking-tight text-slate-900">{issue.key}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-700">{issue.summary}</p>
                </div>
                <StatusBadge status={issue.status} size="md" />
              </div>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-3 text-sm">
                {issue.cliente   && <><dt className="text-slate-500">Cliente</dt><dd className="font-medium text-slate-900">{issue.cliente}</dd></>}
                {issue.documento && <><dt className="text-slate-500">Documento</dt><dd className="font-medium text-slate-900">{issue.documento}</dd></>}
                {issue.modelo    && <><dt className="text-slate-500">Modelo</dt><dd className="font-medium text-slate-900">{issue.modelo}</dd></>}
                {issue.tipo      && <><dt className="text-slate-500">Tipo</dt><dd className="font-medium text-slate-900">{issue.tipo}</dd></>}
                {(issue.largura || issue.altura) && (
                  <><dt className="text-slate-500">Medidas</dt>
                  <dd className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <Ruler className="h-4 w-4 text-slate-400" strokeWidth={1.75} />{issue.largura} × {issue.altura} mm
                  </dd></>
                )}
                {issue.parent    && <><dt className="text-slate-500">Task</dt><dd className="font-mono text-slate-700">{issue.parent}</dd></>}
              </dl>
            </Panel>

            {/* Aplicar a todas as subtasks da Task */}
            {lote && (
              <Panel className={`p-4 transition-shadow ${emLote ? 'border-amber-400 ring-1 ring-amber-400' : ''}`}>
                <label className="flex cursor-pointer select-none items-start gap-3">
                  <input
                    type="checkbox"
                    checked={emLote}
                    onChange={(e) => { setEmLote(e.target.checked); setNaoMudaram([]); }}
                    disabled={updatingStatus || updatingLoc}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-amber-600"
                  />
                  <span className="text-sm text-slate-800">
                    Aplicar a todas as <b>{lote.subtasks.length} subtasks</b> da task{' '}
                    <span className="font-mono font-semibold">{lote.task}</span>
                    <span className="mt-0.5 block text-slate-600">
                      Status e localização valem para todas, para frente ou para trás.
                    </span>
                  </span>
                </label>

                {emLote && (
                  <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
                    {lote.subtasks.map((s) => (
                      <li key={s.key} className="flex items-center gap-2 py-2">
                        <span className={`font-mono ${s.key === issue.key ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                          {s.key}
                        </span>
                        {s.modelo && <span className="truncate text-slate-500">{s.modelo}</span>}
                        <span className="ml-auto flex items-center gap-2">
                          {s.localizacao && <span className="font-mono text-slate-600">{s.localizacao}</span>}
                          <StatusBadge status={s.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {naoMudaram.length > 0 && (
                  <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <p className="font-semibold">
                        {naoMudaram.length} {naoMudaram.length === 1 ? 'subtask não mudou' : 'subtasks não mudaram'}
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {naoMudaram.map((r) => (
                          <li key={r.key}><span className="font-mono">{r.key}</span> — {r.motivo ?? 'erro'}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </Panel>
            )}

            {/* Etapa */}
            <section aria-labelledby="titulo-etapa">
              <h2 id="titulo-etapa" className="mb-2 px-1 text-sm font-semibold text-slate-700">
                Mover para{emLoteLabel}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {STATUSES.map((s) => {
                  const isActive = issue.status === s;
                  const isAvailable = transitions.some((t) => t.toStatus.toLowerCase() === s.toLowerCase());
                  const cor = STAGE_BUTTON[s];
                  return (
                    <button
                      key={s}
                      disabled={updatingStatus || (!isAvailable && !isActive)}
                      onClick={() => handleStatusChange(s)}
                      aria-pressed={isActive}
                      className={`flex min-h-16 items-center gap-2.5 rounded-xl border-2 px-3.5 text-left text-[15px] font-semibold leading-tight shadow-card transition-[transform,background-color,border-color] active:scale-[0.98] disabled:cursor-not-allowed ${
                        isActive ? `${cor.active} ring-2 ring-offset-2 ring-offset-slate-100` : cor.idle
                      } ${!isAvailable && !isActive ? 'opacity-40' : ''}`}
                    >
                      {isActive
                        ? <Check className="h-5 w-5 shrink-0" strokeWidth={3} />
                        : <StageDot status={s} className="h-3 w-3" />}
                      <span className="flex-1">{stageLabel(s)}</span>
                    </button>
                  );
                })}
              </div>
              {updatingStatus && (
                <p className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Atualizando no Jira…
                </p>
              )}
            </section>

            {/* Localização */}
            {issue.localizacaoFieldId && (
              <Panel className={`p-4 ${emLoteAtivo ? 'border-amber-400 ring-1 ring-amber-400' : ''}`}>
                <label htmlFor="localizacao" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <MapPin className="h-4 w-4 text-slate-400" strokeWidth={2} /> Localização{emLoteLabel}
                </label>
                {issue.localizacaoOptions.length > 0 ? (
                  <select
                    id="localizacao"
                    value={selectedLoc}
                    onChange={(e) => setSelectedLoc(e.target.value)}
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-base outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  >
                    <option value="">Selecione…</option>
                    {issue.localizacaoOptions.map((o) => (
                      <option key={o.id} value={o.value}>{o.value}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="localizacao"
                    type="text"
                    value={selectedLoc}
                    onChange={(e) => setSelectedLoc(e.target.value)}
                    placeholder="Ex.: A-01"
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-base outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                )}
                <Button
                  size="lg"
                  className="mt-3 w-full"
                  disabled={
                    updatingLoc || (emLoteAtivo
                      // Em lote a lida pode já estar certa e as irmãs não; vazio
                      // em lote apagaria a localização da task inteira
                      ? !selectedLoc || !!lote?.subtasks.every((s) => s.localizacao === selectedLoc)
                      : selectedLoc === issue.localizacao)
                  }
                  onClick={handleLocalizacaoSave}
                >
                  {updatingLoc && <Loader2 className="h-5 w-5 animate-spin" />}
                  {updatingLoc
                    ? 'Salvando…'
                    : emLoteAtivo ? `Salvar em ${lote?.subtasks.length} subtasks` : 'Salvar localização'}
                </Button>
                {issue.localizacao && (
                  <p className="mt-2 text-center text-sm text-slate-500">
                    Atual: <span className="font-mono font-medium text-slate-800">{issue.localizacao}</span>
                  </p>
                )}
              </Panel>
            )}
          </>
        )}
      </div>

      {showScanner && (
        <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-toast-in rounded-xl bg-brand px-5 py-3 text-center text-sm font-medium text-white shadow-pop lg:bottom-8"
        >
          {/* Quebra linha em vez de vazar da tela: o resumo do lote e a
              cascata passam da largura de um celular */}
          {toast}
        </div>
      )}
    </AppShell>
  );
}
