'use client';
import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { STATUS_ORDER, canonicalStatus } from '@/lib/status';
import { etapa } from '@/lib/etapas';
import AppShell from '@/components/AppShell';
import Icone from '@/components/Icone';
import { EtapaChip } from '@/components/Etapa';

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
  codigo: string;
  cor: string;
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

/** Compara pelo canônico: subtasks dizem "Tarefas pendentes", o app "Tarefas Pendentes" */
const mesmoStatus = (a: string, b: string) => canonicalStatus(a) === canonicalStatus(b);

// ─── Componente principal ────────────────────────────────────────────────────

export default function Home() {
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
    const tr = transitions.find((t) => mesmoStatus(t.toStatus, statusName));
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
  const statusAtual = issue ? canonicalStatus(issue.status) : '';

  return (
    <AppShell
      titulo={issue ? issue.key : 'Leitura de etiquetas'}
      subtitulo={issue ? (issue.cliente || issue.summary) : 'Leia o QR da peça ou digite o número'}
      largura="max-w-5xl"
      acoes={issue && (
        <button onClick={handleClear} className="btn-secundario whitespace-nowrap">
          <Icone nome="qr" className="w-4 h-4" /> Nova<span className="hidden sm:inline"> leitura</span>
        </button>
      )}
    >
      {/* ── Início: ler ou buscar ── */}
      {!issue && !loadingIssue && (
        <section className="max-w-xl mx-auto space-y-4">
          <button
            onClick={() => setShowScanner(true)}
            className="w-full rounded-2xl bg-marca text-white py-9 flex flex-col items-center gap-3
              active:bg-black transition-colors shadow-sm"
          >
            <Icone nome="qr" className="w-14 h-14" />
            <span className="font-titulo text-2xl font-bold">Ler etiqueta</span>
            <span className="text-sm text-white/70">Abre a câmera traseira</span>
          </button>

          <div className="cartao p-4 space-y-3">
            <label htmlFor="busca-peca" className="rotulo block">Ou digite o número da peça</label>
            <div className="flex items-stretch rounded-lg border border-linha-forte overflow-hidden
              focus-within:border-acento focus-within:ring-[3px] focus-within:ring-acento/15">
              <span className="px-3.5 grid place-items-center bg-elevado text-suave font-semibold text-[15px] border-r border-linha-forte select-none">
                PROJ-
              </span>
              <input
                id="busca-peca"
                type="number"
                inputMode="numeric"
                placeholder="4375"
                value={searchQuery.replace(/^PROJ-/i, '')}
                onChange={(e) => handleSearchChange(e.target.value ? `PROJ-${e.target.value}` : '')}
                className="flex-1 min-w-0 px-3.5 py-3 text-lg font-semibold num outline-none bg-superficie"
              />
            </div>
            {searching && <p className="text-sm text-apagado">Buscando…</p>}
            {searchResults.length > 0 && (
              <ul className="divide-y divide-linha -mx-1">
                {searchResults.map((r) => (
                  <li key={r.key}>
                    <button
                      onClick={() => { setSearchQuery(''); setSearchResults([]); loadIssue(r.key); }}
                      className="w-full text-left px-1 py-3 flex items-center gap-3 active:bg-elevado rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold num">{r.key}</p>
                        <p className="text-xs text-apagado truncate">{r.summary}</p>
                      </div>
                      <EtapaChip status={canonicalStatus(r.status)} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ── Carregando ── */}
      {loadingIssue && (
        <div className="max-w-xl mx-auto cartao p-10 text-center space-y-3" aria-live="polite">
          <div className="mx-auto w-8 h-8 rounded-full border-[3px] border-linha border-t-acento animate-spin" />
          <p className="text-suave">Carregando peça…</p>
        </div>
      )}

      {/* ── Peça lida ── */}
      {issue && !loadingIssue && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start">

          <div className="space-y-4">
            {/* Identificação */}
            <section className="cartao overflow-hidden">
              <div className="px-4 pt-4 pb-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-titulo text-2xl font-bold num">{issue.key}</span>
                  <EtapaChip status={statusAtual} />
                </div>
                <p className="font-semibold leading-snug">{issue.cliente || issue.summary}</p>
                {issue.documento && <p className="text-sm text-apagado">Documento {issue.documento}</p>}
              </div>
              <dl className="grid grid-cols-2 border-t border-linha text-sm">
                {[
                  ['Caixilho', issue.tipo],
                  ['Modelo', issue.modelo],
                  ['Medidas', (issue.largura || issue.altura) ? `${issue.largura} × ${issue.altura} mm` : ''],
                  ['Código', issue.codigo],
                  ['Cor', issue.cor],
                  ['Task', issue.parent],
                ].filter(([, v]) => v).map(([k, v], i) => (
                  <div key={k} className={`px-4 py-2.5 border-linha ${i % 2 === 0 ? 'border-r' : ''} ${i >= 2 ? 'border-t' : ''}`}>
                    <dt className="rotulo">{k}</dt>
                    <dd className="font-semibold mt-0.5 num break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Aplicar a todas as subtasks da Task */}
            {lote && (
              <section className={`rounded-xl border-2 bg-superficie p-4 ${emLote ? 'border-amber-500' : 'border-linha'}`}>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={emLote}
                    onChange={(e) => { setEmLote(e.target.checked); setNaoMudaram([]); }}
                    disabled={updatingStatus || updatingLoc}
                    className="mt-0.5 w-6 h-6 shrink-0 accent-amber-500"
                  />
                  <span className="text-sm">
                    <b>Aplicar às {lote.subtasks.length} peças</b> do caixilho{' '}
                    <span className="font-semibold num">{lote.task}</span>
                    <span className="block text-xs text-apagado mt-0.5">
                      Etapa e localização valem para todas, para frente ou para trás.
                    </span>
                  </span>
                </label>

                {emLote && (
                  <ul className="mt-3 divide-y divide-linha border-t border-linha text-sm">
                    {lote.subtasks.map((s) => (
                      <li key={s.key} className="flex items-center gap-2 py-2">
                        <span className={`num ${s.key === issue.key ? 'font-bold' : 'text-suave'}`}>{s.key}</span>
                        {s.modelo && <span className="text-apagado">{s.modelo}</span>}
                        <span className="ml-auto flex items-center gap-2">
                          {s.localizacao && <span className="font-semibold text-suave">{s.localizacao}</span>}
                          <EtapaChip status={canonicalStatus(s.status)} curto />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {naoMudaram.length > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-900">
                    <p className="font-semibold mb-1">
                      {naoMudaram.length} {naoMudaram.length === 1 ? 'peça não mudou' : 'peças não mudaram'}
                    </p>
                    <ul className="space-y-0.5 text-xs">
                      {naoMudaram.map((r) => (
                        <li key={r.key}><span className="num font-semibold">{r.key}</span> — {r.motivo ?? 'erro'}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </div>

          <div className="space-y-4">
            {/* Etapa: um botão sólido por cor, para achar de relance */}
            <section className={`cartao p-4 ${emLoteAtivo ? '!border-2 !border-amber-500' : ''}`}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-titulo font-bold text-base">Mudar etapa</h2>
                {emLoteAtivo
                  ? <span className="text-xs font-semibold text-amber-700">em lote · {lote?.subtasks.length} peças</span>
                  : updatingStatus && <span className="text-xs text-apagado">Atualizando…</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {STATUSES.map((s) => {
                  const e = etapa(s);
                  const atual = statusAtual === s;
                  const disponivel = transitions.some((t) => mesmoStatus(t.toStatus, s));
                  // Em lote, a etapa atual ainda serve para levar as irmãs até ela
                  const clicavel = !updatingStatus && (disponivel || (atual && emLoteAtivo));
                  return (
                    <button
                      key={s}
                      disabled={!clicavel}
                      onClick={() => handleStatusChange(s)}
                      aria-pressed={atual}
                      className={`relative rounded-xl min-h-[84px] px-3.5 py-3 text-left transition-transform ${e.solido}
                        ${atual ? 'ring-[3px] ring-offset-2 ring-tinta' : ''}
                        ${!clicavel && !atual ? 'opacity-30' : 'active:scale-[0.97]'}
                        disabled:cursor-not-allowed`}
                    >
                      <span className="block text-[11px] font-bold uppercase tracking-wider opacity-80">Etapa {e.passo}</span>
                      <span className="block font-titulo text-xl font-bold leading-tight mt-0.5">{e.rotulo}</span>
                      {atual && (
                        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white text-tinta text-[11px] font-bold pl-1.5 pr-2 py-0.5">
                          <Icone nome="check" className="w-3.5 h-3.5" forte /> Atual
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Localização */}
            {issue.localizacaoFieldId && (
              <section className={`cartao p-4 ${emLoteAtivo ? '!border-2 !border-amber-500' : ''}`}>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-titulo font-bold text-base">Localização</h2>
                  <span className="text-xs text-apagado">
                    {emLoteAtivo
                      ? <span className="font-semibold text-amber-700">em lote · {lote?.subtasks.length} peças</span>
                      : <>Atual: <b className="text-tinta">{issue.localizacao || '—'}</b></>}
                  </span>
                </div>
                <div className="flex gap-2">
                  {issue.localizacaoOptions.length > 0 ? (
                    <select
                      value={selectedLoc}
                      onChange={(e) => setSelectedLoc(e.target.value)}
                      className="campo font-semibold"
                      aria-label="Localização"
                    >
                      <option value="">— escolha —</option>
                      {issue.localizacaoOptions.map((o) => (
                        <option key={o.id} value={o.value}>{o.value}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={selectedLoc}
                      onChange={(e) => setSelectedLoc(e.target.value)}
                      placeholder="Ex.: C07"
                      className="campo font-semibold"
                      aria-label="Localização"
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
                    className="btn-primario px-5 shrink-0"
                  >
                    {updatingLoc ? 'Salvando…' : emLoteAtivo ? `Salvar em ${lote?.subtasks.length}` : 'Salvar'}
                  </button>
                </div>
              </section>
            )}

            <button onClick={() => { handleClear(); setShowScanner(true); }} className="btn-secundario w-full py-3.5 text-base">
              <Icone nome="qr" /> Ler próxima etiqueta
            </button>
          </div>
        </div>
      )}

      {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {/* Aviso */}
      {toast && (
        <div role="status" className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-tinta text-white text-sm
          px-5 py-3 rounded-xl shadow-lg w-max max-w-[calc(100vw-2rem)] text-center">
          {/* Quebra linha em vez de vazar da tela: o resumo do lote e a
              cascata passam da largura de um celular */}
          {toast}
        </div>
      )}
    </AppShell>
  );
}
