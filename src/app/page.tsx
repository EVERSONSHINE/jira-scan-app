'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { STATUS_ORDER, canonicalStatus, statusLabel, statusSelo } from '@/lib/status';
import { legivel, mm } from '@/lib/formato';
import Topo from '@/components/Topo';
import Icone from '@/components/Icone';

const QRScanner = dynamic(() => import('@/components/QRScanner'), { ssr: false });

/** Prefixo das etiquetas: na busca a pessoa digita só o número */
const PREFIXO = 'PROJ-';

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
  cor: string;
  codigo: string;
  localizacao: string;
  localizacaoFieldId: string | null;
  localizacaoOptions: Array<{ id: string; value: string }>;
}

interface Transition {
  id: string;
  name: string;
  toStatus: string;
}

/** /api/issue/[key]/irmaos: a peça lida e as outras do mesmo caixilho */
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

interface Cascata { key: string; status: string; nivel?: 'task' | 'epic' }

interface Aviso { tipo: 'ok' | 'erro'; texto: string; detalhe?: string }

// ─── Textos ──────────────────────────────────────────────────────────────────

/** Erro técnico → frase que a pessoa entende */
function erroLegivel(e: unknown, padrao: string): Aviso {
  const t = e instanceof Error ? e.message : String(e);
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(t)) {
    return { tipo: 'erro', texto: 'Sem conexão com a internet. Tente de novo.', detalhe: t };
  }
  if (/404|does not exist|não existe|No issue/i.test(t)) {
    return { tipo: 'erro', texto: 'Etiqueta não encontrada. Confira o número.', detalhe: t };
  }
  if (/\b(401|403)\b/.test(t)) {
    return { tipo: 'erro', texto: 'O sistema perdeu o acesso ao Jira. Avise o responsável.', detalhe: t };
  }
  return { tipo: 'erro', texto: padrao, detalhe: t };
}

const MOTIVO: Record<string, string> = {
  'já estava': 'já estava assim',
  'sem transição no workflow': 'mudança não permitida no Jira',
};

/** Cor do pontinho de cada status (mesmos tons das etiquetas) */
const PONTO: Record<string, string> = {
  'Tarefas Pendentes': 'bg-tinta-suave',
  'Em Andamento': 'bg-atencao',
  'Concluido': 'bg-ok',
  'Expedido': 'bg-info',
};

/**
 * A subtask não tem os campos Cliente/Documento; o nome dela é
 * "CLIENTE DOCUMENTO TIPO". Separa o que dá para separar.
 */
function obraDaPeca(i: IssueDetail): { obra: string; pedido: string } {
  if (i.cliente) return { obra: i.cliente, pedido: i.documento };
  let s = i.summary.trim();
  if (i.tipo && s.toUpperCase().endsWith(i.tipo.toUpperCase())) s = s.slice(0, -i.tipo.length).trim();
  const m = s.match(/^(.*?)\s+(\d[\d./-]{5,})$/);
  return m ? { obra: m[1], pedido: m[2] } : { obra: s, pedido: i.documento };
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Leitura() {
  const [aba, setAba] = useState<'camera' | 'numero'>('camera');
  const [showScanner, setShowScanner] = useState(false);

  const [numero, setNumero] = useState('');
  const [resultados, setResultados] = useState<SearchResult[]>([]);
  const [buscando, setBuscando] = useState(false);
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [carregando, setCarregando] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingLoc, setUpdatingLoc] = useState(false);
  const [locEscolhida, setLocEscolhida] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Aplicar a todas as peças do caixilho. Desliga a cada leitura: ninguém
  // deve alterar um caixilho inteiro por ter esquecido a opção ligada.
  const [irmaos, setIrmaos] = useState<Irmaos | null>(null);
  const [emLote, setEmLote] = useState(false);
  const [naoMudaram, setNaoMudaram] = useState<ResultadoLote[]>([]);

  // Aviso de sucesso some sozinho; o de erro fica até fechar
  useEffect(() => {
    if (aviso?.tipo !== 'ok') return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  // ── Carrega a peça ─────────────────────────────────────────────────────────
  const loadIssue = useCallback(async (key: string) => {
    const k = key.trim().toUpperCase();
    if (!k) return;
    setCarregando(true);
    setAviso(null);
    setIssue(null);
    setTransitions([]);
    setIrmaos(null);
    setEmLote(false);
    setNaoMudaram([]);
    try {
      const [issueRes, transRes, irmaosRes] = await Promise.all([
        fetch(`/api/issue/${k}`).then((r) => r.json()),
        fetch(`/api/issue/${k}/transitions`).then((r) => r.json()),
        // Opcional: se falhar, a leitura segue, só sem a opção de caixilho inteiro
        fetch(`/api/issue/${k}/irmaos`).then((r) => r.json()).catch(() => null),
      ]);
      if (issueRes.error) throw new Error(issueRes.error);
      setIssue(issueRes);
      setLocEscolhida(issueRes.localizacao ?? '');
      setTransitions(Array.isArray(transRes) ? transRes : []);
      setIrmaos(irmaosRes && !irmaosRes.error ? irmaosRes : null);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setAviso(erroLegivel(e, `Não foi possível abrir ${k}. Tente de novo.`));
    } finally {
      setCarregando(false);
    }
  }, []);

  // ── Leitura do QR ──────────────────────────────────────────────────────────
  const handleScan = useCallback((text: string) => {
    setShowScanner(false);
    try { navigator.vibrate?.(40); } catch { /* sem vibração */ }
    // O QR contém a chave da peça (ex.: PROJ-123)
    const match = text.match(/([A-Z]+-\d+)/i);
    loadIssue(match ? match[1].toUpperCase() : text.trim());
  }, [loadIssue]);

  // ── Busca pelo número ──────────────────────────────────────────────────────
  const mudarNumero = (v: string) => {
    const digitos = v.replace(/\D/g, '');
    setNumero(digitos);
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    if (!digitos) { setResultados([]); return; }
    buscaTimer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(PREFIXO + digitos)}`);
        const data = await res.json();
        setResultados(Array.isArray(data) ? data : []);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 400);
  };

  const novaLeitura = (modo: 'camera' | 'numero') => {
    setIssue(null);
    setTransitions([]);
    setIrmaos(null);
    setEmLote(false);
    setNaoMudaram([]);
    setNumero('');
    setResultados([]);
    setAba(modo);
    if (modo === 'camera') setShowScanner(true);
  };

  // ── Lote: todas as peças do caixilho ───────────────────────────────────────
  const lote = irmaos?.task && irmaos.subtasks.length > 1 ? irmaos : null;
  const emLoteAtivo = emLote && lote !== null;

  const recarregarIrmaos = (key: string) => {
    fetch(`/api/issue/${key}/irmaos`)
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) setIrmaos(d); })
      .catch(() => {});
  };

  const postLote = async (key: string, body: object): Promise<{ resultados: ResultadoLote[]; updated: Cascata[] }> => {
    const res = await fetch(`/api/issue/${key}/lote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { resultados: data.resultados ?? [], updated: data.updated ?? [] };
  };

  const textoCascata = (cascata: Cascata[]) =>
    cascata.map((u) => `${u.nivel === 'epic' ? 'Obra' : 'Caixilho'} ${u.key} → ${statusLabel(u.status)}`).join(' · ');

  // ── Status ─────────────────────────────────────────────────────────────────
  const handleStatusChange = async (statusName: string) => {
    if (!issue || updatingStatus) return;
    const tr = transitions.find((t) => canonicalStatus(t.toStatus) === canonicalStatus(statusName));
    // Em lote, a peça lida já no status escolhido não precisa de transição:
    // o toque ainda serve para levar as outras até ele
    const jaNoStatus = canonicalStatus(issue.status) === canonicalStatus(statusName);
    if (!tr && !(emLoteAtivo && jaNoStatus)) {
      setAviso({ tipo: 'erro', texto: `A mudança para "${statusLabel(statusName)}" não está liberada no Jira para esta peça.` });
      return;
    }

    setUpdatingStatus(true);
    setNaoMudaram([]);
    setAviso(null);
    const prev = issue.status;
    setIssue((i) => i ? { ...i, status: statusName } : i);   // otimista

    try {
      let cascata: Cascata[];
      let texto = `Status alterado para ${statusLabel(statusName)}`;
      if (emLoteAtivo) {
        const { resultados, updated } = await postLote(issue.key, {
          acao: 'status', transitionId: tr?.id, status: statusName,
        });
        cascata = updated;
        texto = `${resultados.filter((r) => r.ok).length} de ${resultados.length} peças → ${statusLabel(statusName)}`;
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
      setAviso({ tipo: 'ok', texto, detalhe: cascata.length ? textoCascata(cascata) : undefined });
      fetch(`/api/issue/${issue.key}/transitions`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setTransitions(d); });
    } catch (e) {
      setIssue((i) => i ? { ...i, status: prev } : i);
      setAviso(erroLegivel(e, 'Não foi possível alterar o status. Tente de novo.'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── Localização ────────────────────────────────────────────────────────────
  const salvarLocal = async () => {
    if (!issue || !issue.localizacaoFieldId || updatingLoc) return;
    setUpdatingLoc(true);
    setNaoMudaram([]);
    setAviso(null);
    try {
      if (emLoteAtivo) {
        const { resultados } = await postLote(issue.key, {
          acao: 'localizacao', fieldId: issue.localizacaoFieldId, value: locEscolhida,
        });
        setNaoMudaram(resultados.filter((r) => !r.ok));
        if (resultados.some((r) => r.key === issue.key && r.ok)) {
          setIssue((i) => i ? { ...i, localizacao: locEscolhida } : i);
        }
        setAviso({ tipo: 'ok', texto: `${resultados.filter((r) => r.ok).length} de ${resultados.length} peças → ${locEscolhida}` });
        recarregarIrmaos(issue.key);
        return;
      }
      const res = await fetch(`/api/issue/${issue.key}/localizacao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId: issue.localizacaoFieldId, value: locEscolhida }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIssue((i) => i ? { ...i, localizacao: locEscolhida } : i);
      setAviso({ tipo: 'ok', texto: `Localização salva: ${locEscolhida}` });
    } catch (e) {
      setAviso(erroLegivel(e, 'Não foi possível salvar a localização. Tente de novo.'));
    } finally {
      setUpdatingLoc(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const disponivel = (s: string) => transitions.some((t) => canonicalStatus(t.toStatus) === s);
  const obra = issue ? obraDaPeca(issue) : null;
  const salvarDesabilitado = !issue || updatingLoc || (emLoteAtivo
    // Em lote a lida pode já estar certa e as irmãs não; vazio em lote
    // apagaria a localização do caixilho inteiro
    ? !locEscolhida || !!lote?.subtasks.every((s) => s.localizacao === locEscolhida)
    : locEscolhida === issue.localizacao);

  return (
    <div className="min-h-screen flex flex-col">
      <Topo />

      <main className={`flex-1 w-full mx-auto max-w-xl px-4 py-4 flex flex-col gap-3 ${issue ? 'pb-28' : ''}`}>

        {/* ── Entrada: câmera ou número ──────────────────────────────────── */}
        {!issue && !carregando && (
          <>
            <div className="segmentos grid grid-cols-2" role="group" aria-label="Como ler a etiqueta">
              <button type="button" aria-pressed={aba === 'camera'} onClick={() => setAba('camera')}>
                <span className="inline-flex items-center gap-2"><Icone nome="camera" /> Câmera</span>
              </button>
              <button type="button" aria-pressed={aba === 'numero'} onClick={() => setAba('numero')}>
                <span className="inline-flex items-center gap-2"><Icone nome="numero" /> Número</span>
              </button>
            </div>

            {aba === 'camera' ? (
              <section className="cartao items-center text-center py-8 gap-2">
                <span className="grid place-items-center w-14 h-14 rounded-full bg-acento-suave text-acento mb-1">
                  <Icone nome="camera" className="w-7 h-7" />
                </span>
                <h2 className="text-lg">Ler etiqueta</h2>
                <p className="cartao-sub max-w-xs">Aponte a câmera para o QR code da etiqueta da peça.</p>
                <button type="button" onClick={() => setShowScanner(true)} className="btn btn-primario w-full mt-3">
                  <Icone nome="camera" /> Abrir câmera
                </button>
              </section>
            ) : (
              <section className="cartao gap-3">
                <form
                  onSubmit={(e) => { e.preventDefault(); if (numero) loadIssue(PREFIXO + numero); }}
                  className="flex flex-col gap-2"
                >
                  <label htmlFor="numero" className="text-[13px] font-medium text-tinta-suave">Número da etiqueta</label>
                  <div className="flex gap-2">
                    <div className="flex flex-1 items-center rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] overflow-hidden focus-within:border-acento focus-within:shadow-[inset_0_0_0_1px_var(--accent)]">
                      <span className="pl-3 pr-1 text-tinta-suave font-semibold select-none">{PREFIXO}</span>
                      <input
                        id="numero"
                        autoFocus
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        value={numero}
                        onChange={(e) => mudarNumero(e.target.value)}
                        placeholder="1234"
                        className="flex-1 min-w-0 h-10 pr-3 bg-transparent outline-none text-base num"
                      />
                    </div>
                    <button type="submit" disabled={!numero} className="btn btn-primario">Abrir</button>
                  </div>
                </form>
                {buscando && <p className="text-[13px] text-tinta-suave">Buscando…</p>}
                {resultados.length > 0 && (
                  <ul className="-mx-2 divide-y divide-linha">
                    {resultados.map((r) => (
                      <li key={r.key}>
                        <button
                          type="button"
                          onClick={() => loadIssue(r.key)}
                          className="w-full text-left px-2 py-2.5 rounded-lg hover:bg-superficie-hover"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold num">{r.key}</span>
                            <span className={`tag ${statusSelo(r.status)}`}>{statusLabel(r.status)}</span>
                          </span>
                          <span className="block text-[13px] text-tinta-suave truncate">{r.summary}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}

        {/* ── Carregando ─────────────────────────────────────────────────── */}
        {carregando && (
          <section className="cartao items-center py-10 gap-3" role="status">
            <span className="w-8 h-8 rounded-full border-[3px] border-elevada border-t-acento animate-spin" aria-hidden />
            <p className="text-tinta-suave">Carregando peça…</p>
          </section>
        )}

        {/* ── Peça ───────────────────────────────────────────────────────── */}
        {issue && obra && !carregando && (
          <>
            {/* Identificação */}
            <section className="cartao gap-3" aria-label="Peça lida">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-xl num">{issue.key}</h1>
                <span className={`tag ${statusSelo(issue.status)}`}>{statusLabel(issue.status)}</span>
              </div>
              <div>
                <p className="font-semibold leading-snug">{obra.obra}</p>
                {obra.pedido && <p className="text-[13px] text-tinta-suave num">Pedido {obra.pedido}</p>}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-linha pt-3">
                <Campo nome="Peça" valor={issue.modelo} />
                <Campo nome="Caixilho" valor={issue.tipo} />
                <Campo
                  nome="Medidas"
                  valor={issue.largura || issue.altura ? `${mm(issue.largura)} × ${mm(issue.altura)} mm` : ''}
                />
                <Campo nome="Cor" valor={legivel(issue.cor)} />
              </dl>
            </section>

            {/* Aplicar ao caixilho inteiro */}
            {lote && (
              <section className={`cartao gap-3 ${emLote ? '!border-[color:var(--warning)] bg-atencao-bg' : ''}`}>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={emLote}
                    onChange={(e) => { setEmLote(e.target.checked); setNaoMudaram([]); }}
                    disabled={updatingStatus || updatingLoc}
                    className="mt-0.5 w-5 h-5 shrink-0 accent-[color:var(--accent)]"
                  />
                  <span>
                    <span className="font-semibold">Aplicar a todas as {lote.subtasks.length} peças do caixilho {issue.tipo}</span>
                    <span className="block text-[13px] text-tinta-suave">Status e localização valem para todas, para frente ou para trás.</span>
                  </span>
                </label>

                {emLote && (
                  <ul className="divide-y divide-linha border-t border-linha text-[13px]">
                    {lote.subtasks.map((s) => (
                      <li key={s.key} className="flex items-center gap-2 py-2">
                        <span className={s.key === issue.key ? 'font-semibold' : ''}>{s.modelo || 'Peça'}</span>
                        <span className="text-tinta-suave num">{s.key}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {s.localizacao && <span className="tag bg-roxo-bg text-roxo num">{s.localizacao}</span>}
                          <span className={`tag ${statusSelo(s.status)}`}>{statusLabel(s.status)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {naoMudaram.length > 0 && (
                  <div className="rounded-lg bg-perigo-bg text-perigo px-3 py-2 text-[13px]">
                    <p className="font-semibold">
                      {naoMudaram.length === 1 ? '1 peça não mudou' : `${naoMudaram.length} peças não mudaram`}
                    </p>
                    <ul>
                      {naoMudaram.map((r) => (
                        <li key={r.key}><span className="num">{r.key}</span> — {MOTIVO[r.motivo ?? ''] ?? (r.motivo || 'erro')}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Status: os quatro, como o Jira */}
            <section className="cartao gap-3" aria-labelledby="titulo-status">
              <div className="flex items-center justify-between gap-2">
                <h2 id="titulo-status" className="text-base">Alterar status</h2>
                {emLoteAtivo && <span className="tag bg-atencao-bg text-atencao">{lote?.subtasks.length} peças</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_ORDER.map((s) => {
                  const ativo = canonicalStatus(issue.status) === s;
                  const pode = disponivel(s) || (ativo && emLoteAtivo);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleStatusChange(s)}
                      disabled={updatingStatus || (!pode && !ativo) || (ativo && !emLoteAtivo)}
                      aria-pressed={ativo}
                      title={!pode && !ativo ? 'Mudança não liberada no Jira para esta peça' : undefined}
                      className={`min-h-[48px] px-3 rounded-lg border text-left font-semibold flex items-center gap-2.5 transition-colors
                        ${ativo
                          ? `${statusSelo(s)} border-transparent`
                          : 'bg-superficie border-linha hover:bg-superficie-hover'}
                        ${!pode && !ativo ? 'opacity-45 cursor-not-allowed' : ''}
                        ${ativo && !emLoteAtivo ? 'cursor-default' : ''}`}
                    >
                      {ativo
                        ? <Icone nome="check" className="w-4 h-4 shrink-0" />
                        : <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PONTO[s]}`} aria-hidden />}
                      <span className="leading-tight">{statusLabel(s)}</span>
                    </button>
                  );
                })}
              </div>
              {updatingStatus && <p className="text-[13px] text-tinta-suave">Atualizando…</p>}
            </section>

            {/* Localização */}
            {issue.localizacaoFieldId && (
              <section className="cartao gap-3" aria-labelledby="titulo-local">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="titulo-local" className="text-base">Localização</h2>
                  <span className="text-[13px] text-tinta-suave">
                    Atual: {issue.localizacao
                      ? <span className="tag bg-roxo-bg text-roxo num">{issue.localizacao}</span>
                      : 'sem local'}
                  </span>
                </div>
                {issue.localizacaoOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {issue.localizacaoOptions.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setLocEscolhida(o.value)}
                        aria-pressed={locEscolhida === o.value}
                        className="chip min-w-[60px] num"
                      >
                        {o.value}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    value={locEscolhida}
                    onChange={(e) => setLocEscolhida(e.target.value)}
                    placeholder="Digite a localização"
                    className="campo"
                  />
                )}
                <button type="button" onClick={salvarLocal} disabled={salvarDesabilitado} className="btn btn-primario w-full">
                  {updatingLoc
                    ? 'Salvando…'
                    : emLoteAtivo ? `Salvar em ${lote?.subtasks.length} peças` : 'Salvar localização'}
                </button>
              </section>
            )}
          </>
        )}
      </main>

      {/* Próxima leitura */}
      {issue && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-superficie border-t border-linha">
          <div className="mx-auto max-w-xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
            <button type="button" onClick={() => novaLeitura('camera')} className="btn btn-primario flex-1">
              <Icone nome="camera" /> Nova leitura
            </button>
            <button type="button" onClick={() => novaLeitura('numero')} className="btn btn-secundario" aria-label="Buscar pelo número">
              <Icone nome="numero" /> Número
            </button>
          </div>
        </div>
      )}

      {/* Aviso no canto, no estilo do CRM */}
      {aviso && (
        <div className="fixed inset-x-4 bottom-24 z-40 flex justify-center pointer-events-none">
          <div
            role={aviso.tipo === 'erro' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full max-w-sm flex items-start gap-3 rounded-lg border border-linha-forte border-l-4 bg-elevada px-4 py-2.5 shadow-pop
              ${aviso.tipo === 'ok' ? 'border-l-[color:var(--success)]' : 'border-l-[color:var(--danger)]'}`}
          >
            <span className={aviso.tipo === 'ok' ? 'text-ok mt-0.5' : 'text-perigo mt-0.5'}>
              <Icone nome={aviso.tipo === 'ok' ? 'check' : 'alerta'} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{aviso.texto}</p>
              {aviso.detalhe && <p className="text-[13px] text-tinta-suave break-words">{aviso.detalhe.slice(0, 200)}</p>}
            </div>
            <button type="button" onClick={() => setAviso(null)} className="btn-icone -mr-2 -my-1 w-8 h-8" aria-label="Fechar aviso">
              <Icone nome="fechar" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          onDigitar={() => { setShowScanner(false); setAba('numero'); }}
        />
      )}
    </div>
  );
}

function Campo({ nome, valor }: { nome: string; valor: string }) {
  if (!valor) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tinta-suave">{nome}</dt>
      <dd className="font-medium num break-words">{valor}</dd>
    </div>
  );
}
