'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { marcarSucesso } from '@/lib/autoreload';
import { etapa, ORDEM } from '@/lib/etapas';
import { reais, reaisCurto, hora, diaSemana } from '@/lib/formato';
import { nomeDoMes } from '@/lib/calendario';
import { BarraEtapas } from '@/components/Etapa';

/** Produção não muda a cada segundo; meio minuto basta e alivia o Jira */
const POLL_MS = 30_000;
/** Cartões grandes no topo (2 linhas de 5); o resto em cartão compacto */
const GRANDES = 10;
/** Quanto tempo o "+R$" de produção nova fica na tela */
const DESTAQUE_MS = 3 * 60_000;

// ─── Tipos (espelham /api/painel) ────────────────────────────────────────────

interface ObraP {
  key: string; cliente: string; etapa: string; entrega: string | null; diasParaEntrega: number | null;
  caixilhos: { total: number; prontos: number };
  pecas: { total: number; prontas: number; porStatus: Record<string, number> };
  pct: number; locais: string[]; diasSemMov: number | null; parada: boolean; atrasada: boolean;
}
interface PainelData {
  mes: string; hoje: string;
  meta: {
    meta: number; produzido: number; pct: number; esperadoHoje: number; faltam: number;
    porDiaNecessario: number | null; dias: { total: number; passados: number; hojeUtil: boolean; restantes: number };
  };
  producao: { pecas: number; caixilhos: number; obrasSemValor: number };
  programado: { obras: number; caixilhos: number; caixilhosProntos: number; valor: number; obrasSemValor: number };
  atrasadas: { obras: number; emProducao: number; caixilhosPendentesAnteriores: number };
  semana: number;
  fila: ObraP[];
  prontas: Array<{ key: string; cliente: string; entrega: string | null; diasParaEntrega: number | null }>;
  fetchedAt: string;
}

/** TV deitada e larga: layout de palco, sem rolagem. Fora disso, lista comum. */
function useModoTV(): boolean {
  const [tv, setTv] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px) and (orientation: landscape)');
    const f = () => setTv(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return tv;
}

/** Cor do bloco de data: quanto mais perto, mais quente; atraso é vermelho */
function corPrazo(dias: number | null): string {
  if (dias === null) return 'bg-slate-100 text-slate-500';
  if (dias < 0) return 'bg-red-600 text-white';
  if (dias <= 3) return 'bg-amber-400 text-amber-950';
  if (dias <= 7) return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-700';
}

const MES3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export default function PainelClient() {
  const [data, setData] = useState<PainelData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ganho, setGanho] = useState<{ valor: number; ate: number } | null>(null);
  const anterior = useRef<number | null>(null);
  const emVoo = useRef(false);
  const tv = useModoTV();

  // A letra acompanha a largura da TV (globals.css); some quando a expedição
  // assume a tela, que tem o tamanho dela
  useEffect(() => {
    document.documentElement.classList.add('palco-tv');
    return () => document.documentElement.classList.remove('palco-tv');
  }, []);

  const carregar = useCallback(async () => {
    if (emVoo.current || document.hidden) return;
    emVoo.current = true;
    try {
      const r = await fetch('/api/painel');
      const d = await r.json().catch(() => null);
      if (!r.ok || d?.error) throw new Error(d?.error ?? `HTTP ${r.status}`);
      // Produção nova desde a última leitura: vira um "+R$" ao lado do valor
      if (anterior.current !== null && d.meta.produzido > anterior.current + 1) {
        setGanho((g) => ({
          valor: (g && g.ate > Date.now() ? g.valor : 0) + d.meta.produzido - anterior.current!,
          ate: Date.now() + DESTAQUE_MS,
        }));
      }
      anterior.current = d.meta.produzido;
      setData(d);
      setErro(null);
      marcarSucesso();
    } catch (e) {
      setErro(String(e));
    } finally {
      emVoo.current = false;
    }
  }, []);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, POLL_MS);
    return () => clearInterval(id);
  }, [carregar]);

  useEffect(() => {
    if (!ganho) return;
    const t = setTimeout(() => setGanho(null), Math.max(ganho.ate - Date.now(), 0));
    return () => clearTimeout(t);
  }, [ganho]);

  if (!data) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-marca text-white/70 text-2xl font-titulo">
        {erro ? `Sem conexão com o Jira — tentando de novo…` : 'Carregando painel…'}
      </div>
    );
  }

  const m = data.meta;
  const noRitmo = m.produzido >= m.esperadoHoje;
  const diaUtil = m.dias.passados + (m.dias.hojeUtil ? 1 : 0);
  const faltamCx = data.programado.caixilhos - data.programado.caixilhosProntos;

  return (
    <div className={`bg-[#E7EAF0] text-tinta flex flex-col ${tv ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'}`}>

      {/* ═══ Faixa do mês ═══ */}
      <header className="bg-marca text-white px-4 py-4 shrink-0 lg:px-[1.5rem] lg:py-[1.1rem]">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 mb-3">
          <div className="flex items-center gap-4 lg:gap-[1.1rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-shine-branco.svg" alt="Shine" className="h-9 lg:h-[2.6rem] w-auto" />
            <h1 className="font-titulo font-extrabold tracking-tight text-xl lg:text-[1.75rem] uppercase border-l border-white/25 pl-4 lg:pl-[1.1rem]">
              Produção · {nomeDoMes(data.mes)}
            </h1>
          </div>
          <p className="text-white/60 text-sm lg:text-[1.05rem] num">
            {diaSemana(data.hoje)} {data.hoje.slice(8, 10)}/{data.hoje.slice(5, 7)}
            {' · '}dia útil <b className="text-white">{diaUtil}</b> de {m.dias.total}
            {' · '}atualizado {hora(data.fetchedAt)}
            {erro && <span className="text-amber-300 font-semibold"> · sem conexão, mostrando o último dado</span>}
          </p>
        </div>

        <div className="grid gap-3 lg:gap-[1rem] md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Meta */}
          <section className="rounded-xl bg-white/[0.06] ring-1 ring-white/10 p-4 lg:p-[1.1rem]">
            <p className="text-white/60 text-xs lg:text-[0.95rem] font-semibold uppercase tracking-wider">Meta de produção do mês</p>
            <div className="flex flex-wrap items-baseline gap-x-3 mt-1">
              <span className="font-titulo font-extrabold num text-4xl lg:text-[3.6rem] leading-none">{reais(m.produzido)}</span>
              <span className="text-white/60 text-lg lg:text-[1.5rem] num">de {reais(m.meta)}</span>
              {ganho && (
                <span className="rounded-lg bg-emerald-500 text-emerald-950 font-bold num px-2.5 py-0.5 text-base lg:text-[1.3rem] motion-safe:animate-pulse">
                  +{reaisCurto(ganho.valor)} agora
                </span>
              )}
            </div>
            {/* Barra com a marca de onde deveria estar ao fim de hoje */}
            <div className="relative mt-3 lg:mt-[0.9rem]">
              <div className="h-4 lg:h-[1.4rem] rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${noRitmo ? 'bg-emerald-500' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min(m.pct, 100)}%` }} />
              </div>
              {m.esperadoHoje > 0 && m.esperadoHoje < m.meta && (
                <div className="absolute -top-1 -bottom-1 w-[3px] bg-white rounded"
                  style={{ left: `${(m.esperadoHoje / m.meta) * 100}%` }} aria-hidden />
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-2 text-sm lg:text-[1.05rem] num">
              <span>
                <b className={`text-lg lg:text-[1.35rem] ${noRitmo ? 'text-emerald-400' : 'text-amber-300'}`}>{m.pct.toLocaleString('pt-BR')}%</b>
                <span className="text-white/70"> · {noRitmo ? 'acima' : 'abaixo'} do ritmo (hoje: {reaisCurto(m.esperadoHoje)})</span>
              </span>
              {m.faltam > 0 && m.porDiaNecessario !== null && (
                <span className="text-white/70">
                  faltam <b className="text-white">{reaisCurto(m.faltam)}</b> → <b className="text-white">{reaisCurto(m.porDiaNecessario)}</b>/dia útil
                </span>
              )}
              {m.faltam === 0 && <b className="text-emerald-400">Meta batida!</b>}
            </div>
          </section>

          {/* Caixilhos do mês */}
          <section className="rounded-xl bg-white/[0.06] ring-1 ring-white/10 p-4 lg:p-[1.1rem] flex flex-col">
            <p className="text-white/60 text-xs lg:text-[0.95rem] font-semibold uppercase tracking-wider">
              Caixilhos com entrega em {nomeDoMes(data.mes)}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-titulo font-extrabold num text-4xl lg:text-[3.6rem] leading-none">{faltamCx}</span>
              <span className="text-white/80 text-lg lg:text-[1.5rem]">a produzir</span>
            </div>
            <div className="mt-auto pt-3 space-y-1 text-sm lg:text-[1.05rem] text-white/70 num">
              <p><b className="text-white">{data.programado.caixilhosProntos}</b> de {data.programado.caixilhos} prontos · {data.programado.obras} obras</p>
              {data.atrasadas.caixilhosPendentesAnteriores > 0 && (
                <p className="text-red-300 font-semibold">+ {data.atrasadas.caixilhosPendentesAnteriores} de obras atrasadas</p>
              )}
              <p><b className="text-white">{data.producao.caixilhos}</b> caixilhos produzidos no mês</p>
            </div>
          </section>

          {/* Entregas */}
          <section className={`rounded-xl p-4 lg:p-[1.1rem] flex flex-col ${
            data.atrasadas.obras > 0 ? 'bg-red-600 ring-1 ring-red-400' : 'bg-white/[0.06] ring-1 ring-white/10'
          }`}>
            <p className={`text-xs lg:text-[0.95rem] font-semibold uppercase tracking-wider ${data.atrasadas.obras > 0 ? 'text-white/85' : 'text-white/60'}`}>
              Obras com entrega atrasada
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-titulo font-extrabold num text-4xl lg:text-[3.6rem] leading-none">{data.atrasadas.obras}</span>
              <span className="text-lg lg:text-[1.5rem] text-white/85">{data.atrasadas.obras === 1 ? 'obra' : 'obras'}</span>
            </div>
            <div className={`mt-auto pt-3 space-y-1 text-sm lg:text-[1.05rem] num ${data.atrasadas.obras > 0 ? 'text-white/90' : 'text-white/70'}`}>
              <p><b className="text-white">{data.semana}</b> {data.semana === 1 ? 'entrega' : 'entregas'} nos próximos 7 dias</p>
              <p><b className="text-white">{data.prontas.length}</b> prontas esperando expedição</p>
            </div>
          </section>
        </div>
      </header>

      {/* ═══ Obras por prazo ═══ */}
      <main className={`flex-1 min-h-0 flex flex-col px-4 pt-3 pb-2 lg:px-[1.5rem] lg:pt-[0.9rem] ${tv ? '' : 'pb-6'}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-2 lg:mb-[0.6rem]">
          <h2 className="font-titulo font-bold text-lg lg:text-[1.4rem]">
            Obras em produção <span className="font-medium text-suave">— entrega mais próxima primeiro</span>
          </h2>
          <Legenda />
        </div>
        <Obras fila={data.fila} tv={tv} />
      </main>
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:text-[0.95rem] text-suave">
      {ORDEM.slice(0, 4).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-sm ${etapa(s).barra}`} aria-hidden />{etapa(s).rotulo}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded px-1.5 bg-cyan-700 text-white font-bold text-xs lg:text-[0.8rem]">C07</span> onde estão as peças
      </span>
    </div>
  );
}

/**
 * Grade de obras. Na TV não há rolagem: o que não cabe é contado e avisado
 * no rodapé ("+N obras com entrega depois") — como a ordem é por prazo, o que
 * fica de fora é sempre o que pode esperar.
 */
function Obras({ fila, tv }: { fila: ObraP[]; tv: boolean }) {
  const grandes = tv ? fila.slice(0, GRANDES) : fila;
  const compactas = tv ? fila.slice(GRANDES) : [];
  const caixa = useRef<HTMLDivElement>(null);
  const [escondidas, setEscondidas] = useState(0);

  useLayoutEffect(() => {
    if (!tv || !caixa.current) { setEscondidas(0); return; }
    const el = caixa.current;
    const medir = () => {
      const limite = el.getBoundingClientRect().bottom;
      setEscondidas([...el.children].filter((c) => c.getBoundingClientRect().bottom > limite + 1).length);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tv, compactas.length, fila]);

  if (fila.length === 0) {
    return <p className="text-center text-suave text-xl py-16">Nenhuma obra com produção pendente.</p>;
  }

  return (
    <>
      <div className={`grid gap-3 ${tv ? 'grid-cols-5 gap-[0.75rem]' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
        {grandes.map((o) => <CartaoObra key={o.key} o={o} />)}
      </div>
      {tv && compactas.length > 0 && (
        <>
          <div ref={caixa} className="flex-1 min-h-0 overflow-hidden grid grid-cols-6 gap-[0.6rem] content-start mt-[0.75rem]">
            {compactas.map((o) => <CartaoCompacto key={o.key} o={o} />)}
          </div>
          {escondidas > 0 && (
            <p className="shrink-0 text-right text-suave text-[1rem] pt-[0.3rem]">
              + {escondidas} {escondidas === 1 ? 'obra' : 'obras'} com entrega mais adiante
            </p>
          )}
        </>
      )}
    </>
  );
}

function BlocoData({ o, compacto = false }: { o: ObraP; compacto?: boolean }) {
  const d = o.diasParaEntrega;
  if (!o.entrega) {
    return (
      <div className={`grid place-items-center text-center ${corPrazo(null)} ${compacto ? 'w-[3.6rem] text-[0.75rem]' : 'w-[5.4rem] text-[0.85rem]'} font-semibold leading-tight px-1`}>
        sem data
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center justify-center shrink-0 ${corPrazo(d)} ${compacto ? 'w-[3.6rem]' : 'w-[5.4rem]'}`}>
      <span className={`font-titulo font-extrabold num leading-none ${compacto ? 'text-[1.5rem]' : 'text-[2.4rem]'}`}>{o.entrega.slice(8, 10)}</span>
      <span className={`font-bold tracking-wider ${compacto ? 'text-[0.7rem]' : 'text-[0.9rem]'}`}>{MES3[Number(o.entrega.slice(5, 7)) - 1]}</span>
      {!compacto && (
        <span className="text-[0.75rem] font-semibold mt-1 px-1 text-center leading-tight">
          {d !== null && d < 0 ? `${-d}d atraso` : d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d}d`}
        </span>
      )}
    </div>
  );
}

function CartaoObra({ o }: { o: ObraP }) {
  return (
    <article className={`flex rounded-xl overflow-hidden bg-white shadow-sm ${o.atrasada ? 'ring-2 ring-red-600' : 'ring-1 ring-black/5'}`}>
      <BlocoData o={o} />
      <div className="flex-1 min-w-0 p-3 lg:p-[0.8rem] flex flex-col gap-[0.45rem]">
        <p className="font-titulo font-bold leading-tight truncate text-base lg:text-[1.25rem]" title={o.cliente}>{o.cliente}</p>
        <div className="flex items-center gap-2">
          <BarraEtapas porStatus={o.pecas.porStatus} total={o.pecas.total} altura="h-3 lg:h-[0.85rem]" className="flex-1" />
          <span className="font-titulo font-extrabold num text-lg lg:text-[1.35rem] leading-none w-[3.2rem] text-right">{o.pct}%</span>
        </div>
        <p className="text-sm lg:text-[0.95rem] text-suave num">
          <b className="text-tinta">{o.caixilhos.prontos}/{o.caixilhos.total}</b> caixilhos
          {' · '}<b className="text-tinta">{o.pecas.prontas}/{o.pecas.total}</b> peças
          {o.parada && <span className="ml-1.5 font-semibold text-red-700">· parada {o.diasSemMov}d</span>}
        </p>
        {/* Duas linhas fixas de localização: cartões da mesma altura na grade */}
        <div className="flex flex-wrap gap-[0.3rem] content-start overflow-hidden h-[3.5rem]" aria-label={`Localizações: ${o.locais.join(', ')}`}>
          {o.locais.length === 0
            ? <span className="text-apagado text-[0.85rem]">sem peças localizadas</span>
            : o.locais.map((l) => (
              <span key={l} className="rounded px-[0.4rem] py-[0.1rem] bg-cyan-700 text-white font-bold num text-[0.95rem] leading-snug whitespace-nowrap h-fit">{l}</span>
            ))}
        </div>
      </div>
    </article>
  );
}

function CartaoCompacto({ o }: { o: ObraP }) {
  return (
    <article className={`flex rounded-lg overflow-hidden bg-white h-[3.6rem] ${o.atrasada ? 'ring-2 ring-red-600' : 'ring-1 ring-black/5'}`}>
      <BlocoData o={o} compacto />
      <div className="flex-1 min-w-0 px-[0.6rem] py-[0.4rem] flex flex-col justify-center gap-[0.3rem]">
        <div className="flex items-baseline gap-2">
          <p className="font-semibold truncate text-[0.95rem] flex-1" title={o.cliente}>{o.cliente}</p>
          <span className="font-bold num text-[0.95rem]">{o.pct}%</span>
        </div>
        <BarraEtapas porStatus={o.pecas.porStatus} total={o.pecas.total} altura="h-[0.45rem]" />
      </div>
    </article>
  );
}
