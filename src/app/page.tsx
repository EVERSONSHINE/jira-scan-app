'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { STATUS_ORDER, canonicalStatus, statusLabel, statusSelo } from '@/lib/status';
import Logo from '@/components/Logo';
import Icone from '@/components/Icone';
import { legivel, mm } from '@/lib/formato';

const QRScanner = dynamic(() => import('@/components/QRScanner'), { ssr: false });

/** Prefixo das etiquetas: a pessoa digita só o número */
const PREFIXO = 'PROJ-';

// ─── Tipos ───────────────────────────────────────────────────────────────────

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

/** Mensagem que fica na tela até a pessoa tocar em OK ou fazer outra coisa */
interface Aviso {
  tipo: 'ok' | 'erro';
  titulo: string;
  linhas?: string[];
  /** Texto do erro original — escondido, para quem for dar suporte */
  tecnico?: string;
}

type Fase = 'inicio' | 'digitar' | 'carregando' | 'peca';

// ─── Sinais para quem não está olhando a tela ────────────────────────────────

let audio: AudioContext | null = null;

/** O iPhone só toca som depois de um toque da pessoa: prepara no primeiro */
function prepararSom() {
  try {
    const C = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    audio ??= new C();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* sem áudio: segue só com vibração */ }
}

/** Bip curto e agudo = deu certo · dois toques graves = deu errado */
function sinal(ok: boolean) {
  try { navigator.vibrate?.(ok ? 80 : [150, 90, 150]); } catch { /* sem vibração */ }
  try {
    prepararSom();
    if (!audio) return;
    const tocar = (inicio: number, freq: number, dur: number) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, inicio);
      g.gain.exponentialRampToValueAtTime(0.3, inicio + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
      o.connect(g);
      g.connect(audio!.destination);
      o.start(inicio);
      o.stop(inicio + dur + 0.02);
    };
    const t = audio.currentTime;
    if (ok) tocar(t, 1046, 0.15);
    else { tocar(t, 220, 0.18); tocar(t + 0.24, 220, 0.18); }
  } catch { /* sem áudio */ }
}

// ─── Textos ──────────────────────────────────────────────────────────────────

/** Erro técnico → o que a pessoa entende e pode fazer */
function erroLegivel(e: unknown, padrao: string): { titulo: string; tecnico: string } {
  const t = e instanceof Error ? e.message : String(e);
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(t)) {
    return { titulo: 'Sem conexão com a internet. Confira o Wi-Fi e tente de novo.', tecnico: t };
  }
  if (/404|does not exist|não existe|No issue/i.test(t)) {
    return { titulo: 'Não achamos essa etiqueta. Confira o número e tente de novo.', tecnico: t };
  }
  if (/\b(401|403)\b/.test(t)) {
    return { titulo: 'O sistema perdeu o acesso ao Jira. Avise o responsável.', tecnico: t };
  }
  return { titulo: padrao, tecnico: t };
}

/** Peça é feminino: "concluída", "expedida" */
const TITULO_STATUS: Record<string, string> = {
  'Tarefas Pendentes': 'Peça voltou para PENDENTE',
  'Em Andamento':      'Peça EM PRODUÇÃO',
  'Concluido':         'Peça CONCLUÍDA',
  'Expedido':          'Peça EXPEDIDA',
};

/** Botão principal: a próxima etapa do processo */
const PROXIMA: Record<string, { status: string; texto: string }> = {
  'Tarefas Pendentes': { status: 'Em Andamento', texto: 'Começar a produção' },
  'Em Andamento':      { status: 'Concluido',    texto: 'Marcar como concluída' },
  'Concluido':         { status: 'Expedido',     texto: 'Marcar como expedida' },
};

const MOTIVO: Record<string, string> = {
  'já estava': 'já estava assim',
  'sem transição no workflow': 'essa mudança não é permitida para ela',
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
  const [fase, setFase] = useState<Fase>('inicio');
  const [showScanner, setShowScanner] = useState(false);
  const [numero, setNumero] = useState('');

  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [salvandoLoc, setSalvandoLoc] = useState<string | null>(null);
  const [locTexto, setLocTexto] = useState('');
  const [outras, setOutras] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Aplicar a todas as peças do caixilho. Desliga a cada leitura: ninguém
  // deve alterar um caixilho inteiro por ter esquecido a opção ligada.
  const [irmaos, setIrmaos] = useState<Irmaos | null>(null);
  const [emLote, setEmLote] = useState(false);
  const [naoMudaram, setNaoMudaram] = useState<ResultadoLote[]>([]);

  const avisoRef = useRef<HTMLDivElement>(null);

  const avisar = useCallback((a: Aviso) => {
    setAviso(a);
    sinal(a.tipo === 'ok');
  }, []);

  // Leva o foco para o aviso: leitor de tela anuncia, e a página rola até ele
  useEffect(() => {
    if (aviso) avisoRef.current?.focus();
  }, [aviso]);

  // ── Carrega a peça ─────────────────────────────────────────────────────────
  const loadIssue = useCallback(async (key: string) => {
    const k = key.trim().toUpperCase();
    if (!k) return;
    setFase('carregando');
    setAviso(null);
    setIssue(null);
    setTransitions([]);
    setIrmaos(null);
    setEmLote(false);
    setNaoMudaram([]);
    setOutras(false);
    try {
      const [issueRes, transRes, irmaosRes] = await Promise.all([
        fetch(`/api/issue/${k}`).then((r) => r.json()),
        fetch(`/api/issue/${k}/transitions`).then((r) => r.json()),
        // Opcional: se falhar, a leitura segue, só sem a opção de caixilho inteiro
        fetch(`/api/issue/${k}/irmaos`).then((r) => r.json()).catch(() => null),
      ]);
      if (issueRes.error) throw new Error(issueRes.error);
      setIssue(issueRes);
      setLocTexto(issueRes.localizacao ?? '');
      setTransitions(Array.isArray(transRes) ? transRes : []);
      setIrmaos(irmaosRes && !irmaosRes.error ? irmaosRes : null);
      setFase('peca');
      window.scrollTo({ top: 0 });
    } catch (e) {
      setFase('inicio');
      avisar({ tipo: 'erro', ...erroLegivel(e, `Não foi possível abrir a etiqueta ${k}. Tente de novo.`) });
    }
  }, [avisar]);

  // ── Leitura do QR ──────────────────────────────────────────────────────────
  const handleScan = useCallback((text: string) => {
    setShowScanner(false);
    sinal(true);
    // O QR contém a chave da peça (ex.: PROJ-123)
    const match = text.match(/([A-Z]+-\d+)/i);
    loadIssue(match ? match[1].toUpperCase() : text.trim());
  }, [loadIssue]);

  const abrirLeitor = () => {
    prepararSom();
    setAviso(null);
    setShowScanner(true);
  };

  const abrirDigitar = () => {
    setShowScanner(false);
    setAviso(null);
    setNumero('');
    setFase('digitar');
  };

  // ── Lote: todas as peças do caixilho ───────────────────────────────────────
  // Só existe para peça de um caixilho com mais de uma peça
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
    updated: Cascata[];
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

  /** "O caixilho também ficou Concluído", "A obra também ficou…" */
  const linhasCascata = (cascata: Cascata[]) =>
    cascata.map((u) =>
      u.nivel === 'epic'
        ? `A obra também ficou ${statusLabel(u.status)}.`
        : `O caixilho ${issue?.tipo ?? ''} também ficou ${statusLabel(u.status)}.`.replace('  ', ' '),
    );

  // ── Muda a situação ────────────────────────────────────────────────────────
  const handleStatusChange = async (statusName: string) => {
    if (!issue || updatingStatus) return;
    const tr = transitions.find(
      (t) => canonicalStatus(t.toStatus) === canonicalStatus(statusName),
    );
    // Em lote, a peça lida já no status escolhido não precisa de transição:
    // o toque ainda serve para levar as outras até ele
    const jaNoStatus = canonicalStatus(issue.status) === canonicalStatus(statusName);
    if (!tr && !(emLoteAtivo && jaNoStatus)) {
      avisar({ tipo: 'erro', titulo: `Essa peça não pode ir para ${statusLabel(statusName)} agora.` });
      return;
    }

    setUpdatingStatus(true);
    setNaoMudaram([]);
    setAviso(null);
    const prev = issue.status;
    setIssue((i) => i ? { ...i, status: statusName } : i);   // otimista

    try {
      let cascata: Cascata[];
      let titulo = TITULO_STATUS[canonicalStatus(statusName)] ?? `Peça: ${statusLabel(statusName)}`;
      const linhas: string[] = [];
      if (emLoteAtivo) {
        const { resultados, updated } = await postLote(issue.key, {
          acao: 'status', transitionId: tr?.id, status: statusName,
        });
        cascata = updated;
        const ok = resultados.filter((r) => r.ok).length;
        titulo = `${ok} de ${resultados.length} peças agora em ${statusLabel(statusName).toUpperCase()}`;
        const falhas = resultados.filter((r) => !r.ok);
        setNaoMudaram(falhas);
        if (falhas.length) linhas.push(`${falhas.length} não mudaram — veja abaixo.`);
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
      setOutras(false);
      avisar({ tipo: 'ok', titulo, linhas: [...linhas, ...linhasCascata(cascata)] });
      // Recarrega as transições possíveis a partir do novo status
      fetch(`/api/issue/${issue.key}/transitions`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setTransitions(d); });
    } catch (e) {
      setIssue((i) => i ? { ...i, status: prev } : i);
      avisar({ tipo: 'erro', ...erroLegivel(e, 'Não deu para mudar a situação. Tente de novo.') });
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── Muda o local ───────────────────────────────────────────────────────────
  const salvarLocal = async (valor: string) => {
    if (!issue || !issue.localizacaoFieldId || salvandoLoc || !valor) return;
    setSalvandoLoc(valor);
    setNaoMudaram([]);
    setAviso(null);
    try {
      if (emLoteAtivo) {
        const { resultados } = await postLote(issue.key, {
          acao: 'localizacao', fieldId: issue.localizacaoFieldId, value: valor,
        });
        setNaoMudaram(resultados.filter((r) => !r.ok));
        if (resultados.some((r) => r.key === issue.key && r.ok)) {
          setIssue((i) => i ? { ...i, localizacao: valor } : i);
        }
        const ok = resultados.filter((r) => r.ok).length;
        const falhas = resultados.length - ok;
        avisar({
          tipo: 'ok',
          titulo: `${ok} de ${resultados.length} peças agora no local ${valor}`,
          linhas: falhas ? [`${falhas} não mudaram — veja abaixo.`] : [],
        });
        recarregarIrmaos(issue.key);
        return;
      }
      const res = await fetch(`/api/issue/${issue.key}/localizacao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId: issue.localizacaoFieldId, value: valor }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIssue((i) => i ? { ...i, localizacao: valor } : i);
      avisar({ tipo: 'ok', titulo: `Local salvo: ${valor}` });
    } catch (e) {
      avisar({ tipo: 'erro', ...erroLegivel(e, 'Não deu para salvar o local. Tente de novo.') });
    } finally {
      setSalvandoLoc(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const atual = issue ? canonicalStatus(issue.status) : '';
  const disponivel = (s: string) => transitions.some((t) => canonicalStatus(t.toStatus) === s);
  const proxima = issue && PROXIMA[atual] && disponivel(PROXIMA[atual].status) ? PROXIMA[atual] : null;
  const outrasOpcoes = STATUS_ORDER.filter((s) =>
    s !== proxima?.status && (s === atual ? emLoteAtivo : disponivel(s)),
  );
  const obra = issue ? obraDaPeca(issue) : null;

  return (
    <div className="min-h-screen flex flex-col">

      {/* Barra da marca */}
      <header className="bg-marca text-white">
        <div className="mx-auto max-w-2xl px-4 h-16 flex items-center gap-3">
          <Logo className="h-7 w-auto" />
          <span className="text-lg text-marca-200">Produção</span>
        </div>
      </header>

      {/* Aviso: fica até tocar em OK ou fazer outra coisa */}
      {aviso && (
        <div className="sticky top-0 z-30 px-3 pt-3">
          <div
            ref={avisoRef}
            tabIndex={-1}
            role={aviso.tipo === 'erro' ? 'alert' : 'status'}
            className={`mx-auto max-w-2xl rounded-2xl shadow-lg outline-none flex items-start gap-3 p-4 ${
              aviso.tipo === 'ok' ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'
            }`}
          >
            <Icone nome={aviso.tipo === 'ok' ? 'check' : 'alerta'} className="w-9 h-9 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold leading-snug">{aviso.titulo}</p>
              {aviso.linhas?.map((l) => (
                <p key={l} className="text-lg leading-snug mt-1">{l}</p>
              ))}
              {aviso.tecnico && (
                <details className="mt-2 text-sm opacity-90">
                  <summary className="cursor-pointer">Detalhe para o suporte</summary>
                  <p className="mt-1 break-words">{aviso.tecnico.slice(0, 300)}</p>
                </details>
              )}
            </div>
            <button
              onClick={() => setAviso(null)}
              className="shrink-0 h-12 px-4 rounded-xl bg-white/20 text-xl font-bold active:bg-white/30"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <main className={`flex-1 w-full mx-auto max-w-2xl px-4 py-5 ${fase === 'peca' ? 'pb-32' : ''}`}>

        {/* ── Início ─────────────────────────────────────────────────────── */}
        {fase === 'inicio' && (
          <div className="flex flex-col gap-4 min-h-[calc(100vh-8rem)]">
            <button
              onClick={abrirLeitor}
              className="flex-1 min-h-[45vh] rounded-3xl bg-marca text-white flex flex-col items-center justify-center gap-4 px-6
                active:bg-marca-800 shadow-[0_6px_0_0_#2b2363] active:shadow-none active:translate-y-1 transition-transform"
            >
              <Icone nome="camera" className="w-24 h-24" />
              <span className="text-5xl font-bold">Ler etiqueta</span>
              <span className="text-xl text-marca-200">Toque aqui e aponte a câmera para o código</span>
            </button>
            <button
              onClick={abrirDigitar}
              className="h-20 rounded-2xl border-[3px] border-marca bg-white text-marca text-2xl font-bold
                flex items-center justify-center gap-3 active:bg-marca-50"
            >
              <Icone nome="numero" className="w-8 h-8" />
              Digitar o número
            </button>
            <Link
              href="/telas"
              className="self-center mt-2 px-4 py-3 text-lg text-tinta-suave underline underline-offset-4"
            >
              Outras telas
            </Link>
          </div>
        )}

        {/* ── Digitar o número ───────────────────────────────────────────── */}
        {fase === 'digitar' && (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (numero) loadIssue(`${PREFIXO}${numero}`);
            }}
          >
            <label htmlFor="numero" className="text-3xl font-bold">Número da etiqueta</label>
            <p className="text-xl text-tinta-suave -mt-3">
              É o número que vem depois de <b className="text-tinta">{PREFIXO}</b> na etiqueta.
            </p>
            <div className="flex items-center h-24 rounded-2xl border-[3px] border-marca bg-white overflow-hidden focus-within:ring-4 focus-within:ring-marca-200">
              <span className="pl-5 pr-2 text-4xl font-bold text-tinta-suave select-none">{PREFIXO}</span>
              <input
                id="numero"
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={numero}
                onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className="flex-1 min-w-0 h-full pr-4 text-5xl font-bold num outline-none bg-transparent placeholder:text-slate-300"
              />
            </div>
            <button
              type="submit"
              disabled={!numero}
              className="h-20 rounded-2xl bg-marca text-white text-2xl font-bold disabled:bg-slate-300 disabled:text-slate-600 active:bg-marca-800"
            >
              Abrir a peça
            </button>
            <button
              type="button"
              onClick={() => setFase('inicio')}
              className="h-16 rounded-2xl border-2 border-linha bg-white text-xl font-bold flex items-center justify-center gap-2"
            >
              <Icone nome="voltar" className="w-6 h-6" />
              Voltar
            </button>
          </form>
        )}

        {/* ── Carregando ─────────────────────────────────────────────────── */}
        {fase === 'carregando' && (
          <div className="py-24 flex flex-col items-center gap-6" role="status">
            <span className="w-16 h-16 rounded-full border-[6px] border-marca-100 border-t-marca animate-spin" aria-hidden />
            <p className="text-2xl font-bold">Abrindo a peça…</p>
          </div>
        )}

        {/* ── Peça ───────────────────────────────────────────────────────── */}
        {fase === 'peca' && issue && obra && (
          <div className="flex flex-col gap-6">

            {/* O que é esta peça — o que a pessoa compara com a peça na mão */}
            <section aria-label="Peça lida" className="rounded-3xl bg-white border-2 border-linha p-5">
              <p className="text-4xl font-bold leading-tight uppercase">
                {issue.modelo || 'Peça'}
                {issue.tipo && <span className="text-tinta-suave"> · {issue.tipo}</span>}
              </p>
              {(issue.largura || issue.altura) && (
                <p className="mt-2 text-4xl font-bold num">
                  {mm(issue.largura)} <span className="text-tinta-suave">×</span> {mm(issue.altura)}
                  <span className="text-2xl text-tinta-suave font-normal"> mm</span>
                </p>
              )}
              <dl className="mt-4 grid gap-2 text-xl">
                <div>
                  <dt className="sr-only">Obra</dt>
                  <dd className="font-bold leading-snug">{obra.obra}</dd>
                  {obra.pedido && <dd className="text-tinta-suave">Pedido {obra.pedido}</dd>}
                </div>
                {issue.cor && (
                  <div className="flex gap-2">
                    <dt className="text-tinta-suave">Cor</dt>
                    <dd className="font-bold">{legivel(issue.cor)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-4 text-lg text-tinta-suave">
                Etiqueta <span className="font-bold text-tinta">{issue.key}</span>
              </p>
            </section>

            {/* Aplicar ao caixilho inteiro */}
            {lote && (
              <section
                aria-label="Aplicar ao caixilho inteiro"
                className={`rounded-3xl bg-white p-5 border-[3px] ${emLote ? 'border-amber-500 bg-amber-50' : 'border-linha'}`}
              >
                <label className="flex items-start gap-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={emLote}
                    onChange={(e) => { setEmLote(e.target.checked); setNaoMudaram([]); }}
                    disabled={updatingStatus || !!salvandoLoc}
                    className="mt-1 w-8 h-8 shrink-0 accent-amber-600"
                  />
                  <span className="text-xl leading-snug">
                    <b>Mudar todas as {lote.subtasks.length} peças do caixilho {issue.tipo}</b>
                    <span className="block text-lg text-tinta-suave mt-1">
                      A situação e o local que você escolher valem para todas.
                    </span>
                  </span>
                </label>

                {emLote && (
                  <ul className="mt-4 divide-y divide-amber-200 border-t-2 border-amber-200">
                    {lote.subtasks.map((s) => (
                      <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-lg">
                        <span className={`font-bold ${s.key === issue.key ? '' : 'text-tinta-suave'}`}>
                          {s.modelo || s.key}
                          {s.key === issue.key && <span className="font-normal"> (esta)</span>}
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          {s.localizacao && <span className="rounded-lg bg-cyan-800 text-white px-2 font-bold">{s.localizacao}</span>}
                          <span className={`rounded-lg px-2 font-bold ${statusSelo(s.status)}`}>{statusLabel(s.status)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {naoMudaram.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-red-50 border-2 border-red-300 p-4 text-lg text-red-900">
                    <p className="font-bold">
                      {naoMudaram.length === 1 ? '1 peça não mudou' : `${naoMudaram.length} peças não mudaram`}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {naoMudaram.map((r) => (
                        <li key={r.key}>
                          {lote.subtasks.find((s) => s.key === r.key)?.modelo ?? 'Peça'} ({r.key}):{' '}
                          {MOTIVO[r.motivo ?? ''] ?? 'deu erro'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Situação */}
            <section aria-labelledby="titulo-situacao" className="flex flex-col gap-3">
              <h2 id="titulo-situacao" className="text-2xl font-bold">Situação</h2>
              <p className={`rounded-2xl px-5 py-4 text-3xl font-bold ${statusSelo(issue.status)}`}>
                {statusLabel(issue.status)}
              </p>

              {proxima && (
                <button
                  onClick={() => handleStatusChange(proxima.status)}
                  disabled={updatingStatus}
                  className="h-24 rounded-2xl bg-marca text-white text-3xl font-bold flex items-center justify-center gap-3
                    disabled:opacity-60 active:bg-marca-800"
                >
                  {updatingStatus ? (
                    <>
                      <span className="w-8 h-8 rounded-full border-4 border-white/40 border-t-white animate-spin" aria-hidden />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <Icone nome="check" className="w-9 h-9" />
                      {emLoteAtivo ? `${proxima.texto.replace('Marcar como', 'Marcar todas como')}` : proxima.texto}
                    </>
                  )}
                </button>
              )}
              {!proxima && atual === 'Expedido' && (
                <p className="text-xl text-tinta-suave">Esta peça já foi expedida.</p>
              )}

              {outrasOpcoes.length > 0 && (
                <>
                  <button
                    onClick={() => setOutras((v) => !v)}
                    aria-expanded={outras}
                    className="h-14 rounded-2xl border-2 border-linha bg-white text-xl font-bold"
                  >
                    {outras ? 'Fechar' : 'Escolher outra situação'}
                  </button>
                  {outras && (
                    <div className="grid gap-3">
                      {outrasOpcoes.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          disabled={updatingStatus}
                          className={`h-16 rounded-2xl text-2xl font-bold border-2 border-black/10 disabled:opacity-60 ${statusSelo(s)}`}
                        >
                          {s === atual ? `Deixar todas em ${statusLabel(s)}` : statusLabel(s)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Local */}
            {issue.localizacaoFieldId && (
              <section aria-labelledby="titulo-local" className="flex flex-col gap-3">
                <h2 id="titulo-local" className="text-2xl font-bold">
                  Local {emLoteAtivo && <span className="text-amber-800 font-normal">· todas as peças</span>}
                </h2>
                <p className="text-xl">
                  {issue.localizacao
                    ? <>Agora em <span className="rounded-lg bg-cyan-800 text-white px-3 py-0.5 font-bold text-2xl">{issue.localizacao}</span></>
                    : <span className="text-tinta-suave">Ainda sem local.</span>}
                </p>
                {issue.localizacaoOptions.length > 0 ? (
                  <>
                    <p className="text-lg text-tinta-suave">Toque no novo local para salvar.</p>
                    <GradeLocais
                      opcoes={issue.localizacaoOptions.map((o) => o.value)}
                      atual={issue.localizacao}
                      salvando={salvandoLoc}
                      // Em lote, a lida pode já estar certa e as outras não
                      jaTodas={(v) => !!lote?.subtasks.every((s) => s.localizacao === v)}
                      emLote={emLoteAtivo}
                      onEscolher={salvarLocal}
                    />
                  </>
                ) : (
                  <div className="flex gap-3">
                    <input
                      value={locTexto}
                      onChange={(e) => setLocTexto(e.target.value)}
                      placeholder="Digite o local"
                      className="flex-1 min-w-0 h-16 rounded-2xl border-2 border-linha px-4 text-2xl bg-white"
                    />
                    <button
                      onClick={() => salvarLocal(locTexto.trim())}
                      disabled={!!salvandoLoc || !locTexto.trim() || locTexto.trim() === issue.localizacao}
                      className="h-16 px-6 rounded-2xl bg-marca text-white text-xl font-bold disabled:opacity-40"
                    >
                      Salvar
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {/* Próxima leitura sempre à mão, na zona do polegar */}
      {fase === 'peca' && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-fundo/95 backdrop-blur border-t-2 border-linha">
          <div className="mx-auto max-w-2xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-3">
            <button
              onClick={abrirLeitor}
              className="flex-1 h-16 rounded-2xl bg-marca text-white text-2xl font-bold flex items-center justify-center gap-3 active:bg-marca-800"
            >
              <Icone nome="camera" className="w-8 h-8" />
              Ler próxima
            </button>
            <button
              onClick={abrirDigitar}
              aria-label="Digitar o número da etiqueta"
              className="h-16 w-16 rounded-2xl border-2 border-marca bg-white text-marca grid place-items-center"
            >
              <Icone nome="numero" className="w-8 h-8" />
            </button>
          </div>
        </div>
      )}

      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          onDigitar={abrirDigitar}
        />
      )}
    </div>
  );
}

/**
 * Os locais (C01…C08, D01…, P01…) em botões grandes, uma linha por letra.
 * Um toque salva — sem lista suspensa e sem botão "Salvar" separado.
 */
function GradeLocais({
  opcoes, atual, salvando, emLote, jaTodas, onEscolher,
}: {
  opcoes: string[];
  atual: string;
  salvando: string | null;
  emLote: boolean;
  jaTodas: (v: string) => boolean;
  onEscolher: (v: string) => void;
}) {
  const grupos = new Map<string, string[]>();
  for (const o of opcoes) {
    const letra = o.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? '';
    grupos.set(letra, [...(grupos.get(letra) ?? []), o]);
  }
  return (
    <div className="flex flex-col gap-4">
      {[...grupos.entries()].map(([letra, itens]) => (
        <div key={letra || 'outros'} className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {itens.map((v) => {
            const marcado = emLote ? jaTodas(v) : v === atual;
            const salvandoEste = salvando === v;
            return (
              <button
                key={v}
                onClick={() => !marcado && onEscolher(v)}
                disabled={!!salvando}
                aria-pressed={marcado}
                className={`h-16 rounded-xl text-2xl font-bold num border-2 transition-colors disabled:cursor-wait ${
                  marcado
                    ? 'bg-cyan-800 border-cyan-800 text-white'
                    : salvandoEste
                      ? 'bg-cyan-100 border-cyan-800 text-cyan-900'
                      : 'bg-white border-linha text-tinta active:bg-cyan-50'
                }`}
              >
                {salvandoEste ? '…' : v}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
