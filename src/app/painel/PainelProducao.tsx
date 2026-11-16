'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Logo from '@/components/Logo';
import Icone from '@/components/Icone';
import { marcarSucesso } from '@/lib/autoreload';
import { dataCurta, diaSemana, nf, prazoRelativo, reaisCurto } from '@/lib/formato';
import type { ObraProd, PainelData } from '@/lib/tipos';

const POLL_MS = 30_000;
/** Linhas de obra por página; mais que isso a letra não cabe a 3–4 m */
const POR_PAGINA = 6;
const TROCA_PAGINA_MS = 15_000;

/**
 * Tela da produção na TV. Responde, de cima para baixo:
 *   1. Estamos na meta do mês? (caixilhos, valor, ritmo que falta)
 *   2. O que tem que sair primeiro? (obras pela data de entrega)
 *
 * Toda medida é em rem e a raiz da página escala com a altura da tela
 * (16px numa TV 1080p). Assim a mesma tela serve TV Box que diz ter 540px de
 * altura e TV que diz ter 1080, sem quebrar a grade.
 */
export default function PainelProducao() {
  const [data, setData] = useState<PainelData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizado, setAtualizado] = useState('');
  const [pagina, setPagina] = useState(0);
  const [agora, setAgora] = useState(() => new Date());
  const emCurso = useRef(false);

  // Raiz proporcional à altura da TV — só enquanto esta tela está montada,
  // para não mexer na tela de expedição
  useEffect(() => {
    const html = document.documentElement;
    const antes = html.style.fontSize;
    html.style.fontSize = 'clamp(9px, calc(100vh / 67.5), 32px)';
    return () => { html.style.fontSize = antes; };
  }, []);

  const carregar = useCallback(async () => {
    if (emCurso.current || document.hidden) return;
    emCurso.current = true;
    try {
      const res = await fetch('/api/painel');
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json);
      setErro(null);
      marcarSucesso();
      setAtualizado(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setErro(String(e));
    } finally {
      emCurso.current = false;
    }
  }, []);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, POLL_MS);
    const relogio = setInterval(() => setAgora(new Date()), 20_000);
    return () => { clearInterval(id); clearInterval(relogio); };
  }, [carregar]);

  const entregas = data?.entregas ?? [];
  const paginas = Math.max(1, Math.ceil(entregas.length / POR_PAGINA));

  useEffect(() => {
    if (paginas <= 1) { setPagina(0); return; }
    const id = setInterval(() => setPagina((p) => (p + 1) % paginas), TROCA_PAGINA_MS);
    return () => clearInterval(id);
  }, [paginas]);

  const visiveis = entregas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const m = data?.meta;

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-fundo text-tinta">

      {/* Topo, como o do CRM */}
      <header className="shrink-0 bg-superficie border-b border-linha px-8 h-[5rem] flex items-center gap-6">
        <div className="flex items-center gap-3">
          <Logo className="h-[1.9rem] w-auto text-tinta" />
          <span className="font-titulo text-[1.9rem] font-bold text-acento">Produção</span>
        </div>
        <span className="h-[2.2rem] w-px bg-linha-forte" aria-hidden />
        <h1 className="text-[2rem] font-semibold">Entregas de {m?.nomeMes ?? '…'}</h1>
        {data && <TrimestreTopo t={data.trimestre} />}
        <div className="ml-6 text-right leading-tight">
          <p className="font-titulo text-[2rem] font-semibold num">
            {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className={`text-[1.1rem] ${erro ? 'text-atencao font-semibold' : 'text-tinta-suave'}`}>
            {erro
              ? `Sem conexão com o Jira${data ? ' · últimos dados' : ''}`
              : atualizado && `atualizado às ${atualizado}`}
          </p>
        </div>
      </header>

      {!data && (
        <p className="flex-1 grid place-items-center text-[2.4rem] text-tinta-suave">
          {erro ? 'Tentando conectar…' : 'Carregando…'}
        </p>
      )}

      {data && m && (
        <>
          {/* ── Meta do mês ──────────────────────────────────────────────── */}
          <section aria-label="Meta do mês" className="shrink-0 px-8 pt-5 grid grid-cols-3 gap-5">
            <BlocoCaixilhos m={m} />
            <BlocoValor m={m} />
            <BlocoRitmo m={m} />
          </section>

          {/* ── Próximas entregas ────────────────────────────────────────── */}
          <section aria-label="Próximas entregas" className="flex-1 min-h-0 flex flex-col px-8 pt-5">
            <div className="flex items-baseline gap-4 pb-3">
              <h2 className="text-[1.8rem]">Próximas entregas</h2>
              <span className="text-[1.35rem] text-tinta-suave">
                {entregas.length} {entregas.length === 1 ? 'obra' : 'obras'} na fábrica
              </span>
              {paginas > 1 && (
                <span className="ml-auto flex items-center gap-2" aria-label={`Página ${pagina + 1} de ${paginas}`}>
                  {Array.from({ length: paginas }, (_, i) => (
                    <span key={i} className={`h-[0.7rem] rounded-full ${i === pagina ? 'w-[2.2rem] bg-acento' : 'w-[0.7rem] bg-linha-forte'}`} />
                  ))}
                </span>
              )}
            </div>

            {entregas.length === 0 ? (
              <p className="py-10 text-[2rem] text-tinta-suave">Nenhuma obra com data de entrega na fábrica.</p>
            ) : (
              <ol className="flex flex-col gap-[0.6rem]">
                {visiveis.map((o) => <LinhaObra key={o.key} o={o} />)}
              </ol>
            )}

            {data.semData > 0 && (
              <p className="pt-3 text-[1.25rem] text-tinta-suave">
                {data.semData} {data.semData === 1 ? 'obra sem data de entrega não aparece' : 'obras sem data de entrega não aparecem'} aqui.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─── Trimestre da bonificação ────────────────────────────────────────────────

/** OUT ✓ · NOV 34% · DEZ — os meses que contam para a bonificação */
function TrimestreTopo({ t }: { t: PainelData['trimestre'] }) {
  return (
    <div className="ml-auto flex items-center gap-2" aria-label={`Trimestre: ${t.batidos} de 3 meses batidos`}>
      <span className="text-[1.3rem] text-tinta-suave mr-1">Trimestre</span>
      {t.meses.map((m) => {
        const nome = m.nomeMes.slice(0, 3).toUpperCase();
        const pct = m.valorProduzido !== null && m.metaValor > 0
          ? Math.round((m.valorProduzido / m.metaValor) * 100) : null;
        const cls = m.batida === true
          ? 'bg-ok-bg text-ok'
          : m.batida === false
            ? 'bg-perigo-bg text-perigo'
            : m.situacao === 'em-andamento'
              ? 'bg-acento-suave text-acento'
              : 'bg-elevada text-tinta-suave';
        return (
          <span key={m.mes} className={`h-[2.6rem] rounded-full px-[1rem] flex items-center gap-1.5 text-[1.35rem] font-semibold ${cls}`}>
            {nome}
            {m.batida === true && <Icone nome="check" className="w-[1.4rem] h-[1.4rem]" titulo="batida" />}
            {m.batida === false && <Icone nome="fechar" className="w-[1.4rem] h-[1.4rem]" titulo="não batida" />}
            {m.batida === null && m.situacao === 'em-andamento' && pct !== null && <span className="num">{pct}%</span>}
          </span>
        );
      })}
    </div>
  );
}

// ─── Faixa da meta ───────────────────────────────────────────────────────────

/** Medidor fino do CRM, com a marca de onde deveríamos estar hoje */
function Medidor({ fracao, cor, marca }: { fracao: number; cor: string; marca?: number }) {
  return (
    <div className="relative mt-3 h-[0.6rem] rounded-full bg-elevada">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, Math.max(0, fracao * 100))}%` }} />
      {marca !== undefined && marca > 0 && marca < 1 && (
        <div className="absolute -top-[0.35rem] -bottom-[0.35rem] w-[0.2rem] rounded bg-tinta" style={{ left: `${marca * 100}%` }} />
      )}
    </div>
  );
}

const KPI = 'kpi !px-6 !py-4 !gap-1';
const KPI_TITULO = 'text-[1.35rem] font-semibold text-tinta-suave';
const KPI_VALOR = 'font-titulo text-[3.4rem] font-bold leading-[1.1] num';
const KPI_DETALHE = 'text-[1.3rem] text-tinta-suave';

function BlocoCaixilhos({ m }: { m: PainelData['meta'] }) {
  const fr = m.caixilhosTotal > 0 ? m.caixilhosProntos / m.caixilhosTotal : 0;
  const esperado = m.caixilhosTotal > 0 ? m.esperadoHoje / m.caixilhosTotal : undefined;
  const diferenca = m.caixilhosProntos - m.esperadoHoje;
  return (
    <div className={KPI}>
      <span className={KPI_TITULO}>Caixilhos com entrega em {m.nomeMes}</span>
      <p className={KPI_VALOR}>
        {nf(m.caixilhosProntos)}
        <span className="text-[1.8rem] font-semibold text-tinta-suave"> de {nf(m.caixilhosTotal)} prontos</span>
      </p>
      <Medidor fracao={fr} cor="bg-ok" marca={esperado} />
      {m.caixilhosTotal > 0 && m.diasUteis.passados > 0 && (
        <span className={`${KPI_DETALHE} mt-2`}>
          <b className={diferenca >= 0 ? 'text-ok' : 'text-perigo'}>
            {diferenca >= 0 ? `${nf(diferenca)} à frente` : `${nf(-diferenca)} atrás`} do calendário
          </b>
          {' · '}hoje deveriam ser {nf(m.esperadoHoje)}
        </span>
      )}
    </div>
  );
}

function BlocoValor({ m }: { m: PainelData['meta'] }) {
  const fr = m.metaValor > 0 ? m.valorProduzido / m.metaValor : 0;
  return (
    <div className={KPI}>
      <span className={KPI_TITULO}>Valor produzido · meta {reaisCurto(m.metaValor)}</span>
      <p className={KPI_VALOR}>
        {reaisCurto(m.valorProduzido)}
        <span className="text-[1.8rem] font-semibold text-tinta-suave"> {Math.round(fr * 100)}%</span>
      </p>
      <Medidor fracao={fr} cor="bg-acento" />
      <span className={`${KPI_DETALHE} mt-2 whitespace-nowrap`}>
        Obras do mês somam <b className="text-tinta num">{reaisCurto(m.valorPrevisto)}</b>
        {m.obrasSemValor > 0 && <b className="text-atencao"> · {m.obrasSemValor} sem valor</b>}
      </span>
    </div>
  );
}

function BlocoRitmo({ m }: { m: PainelData['meta'] }) {
  const faltam = Math.max(m.caixilhosTotal - m.caixilhosProntos, 0);
  return (
    <div className={KPI}>
      <span className={KPI_TITULO}>Para fechar o mês</span>
      {faltam === 0 && m.caixilhosTotal > 0 ? (
        <p className="flex items-center gap-3 font-titulo text-[2.4rem] font-semibold text-ok leading-tight">
          <Icone nome="check" className="w-[2.6rem] h-[2.6rem]" />
          Caixilhos do mês prontos
        </p>
      ) : (
        <>
          <p className={KPI_VALOR}>
            {nf(m.porDia)}
            <span className="text-[1.8rem] font-semibold text-tinta-suave"> por dia útil</span>
          </p>
          <span className={`${KPI_DETALHE} mt-2 num`}>
            faltam <b className="text-tinta">{nf(faltam)}</b> em <b className="text-tinta">{m.diasUteis.restantes}</b> {m.diasUteis.restantes === 1 ? 'dia útil' : 'dias úteis'}
          </span>
        </>
      )}
      {m.atrasadasAnteriores.caixilhosFaltando > 0 && (
        <span className="text-[1.3rem] font-semibold text-perigo num">
          + {nf(m.atrasadasAnteriores.caixilhosFaltando)} atrasados de meses anteriores
        </span>
      )}
    </div>
  );
}

// ─── Linha de obra ───────────────────────────────────────────────────────────

function LinhaObra({ o }: { o: ObraProd }) {
  const c = o.caixilhos;
  const pronta = c.total > 0 ? c.prontos === c.total : o.status === 'Concluido';
  const dias = o.dias ?? 0;
  const atrasada = dias < 0 && !pronta;
  const urgente = dias >= 0 && dias <= 2 && !pronta;

  const corData = atrasada
    ? 'bg-perigo-bg text-perigo'
    : urgente
      ? 'bg-atencao-bg text-atencao'
      : 'bg-elevada text-tinta';

  return (
    <li className="h-[6.1rem] grid grid-cols-[12.5rem_1fr_25rem_22rem] items-center gap-6 rounded-[0.8rem] bg-superficie border border-linha shadow-cartao px-3">
      {/* Data de entrega */}
      <div className={`h-[4.9rem] rounded-[0.6rem] px-4 flex flex-col justify-center ${corData}`}>
        <p className="font-titulo text-[1.9rem] font-semibold leading-none num">
          <span className="text-[1.3rem]">{diaSemana(o.duedate!)}</span> {dataCurta(o.duedate)}
        </p>
        <p className="text-[1.25rem] font-semibold leading-tight mt-1">
          {pronta && dias < 0 ? 'data passou' : prazoRelativo(dias)}
        </p>
      </div>

      {/* Obra */}
      <div className="min-w-0">
        <p className="text-[1.9rem] font-semibold leading-tight truncate">{o.nome}</p>
        {o.documento && <p className="text-[1.25rem] text-tinta-suave num">Pedido {o.documento}</p>}
      </div>

      {/* Andamento dos caixilhos */}
      <div className="flex flex-col justify-center gap-2">
        {pronta ? (
          <span className="self-start inline-flex items-center gap-2 rounded-full bg-ok-bg text-ok px-4 py-1 text-[1.4rem] font-semibold">
            <Icone nome="check" className="w-[1.5rem] h-[1.5rem]" />
            Pronta · falta expedir
          </span>
        ) : c.total === 0 ? (
          <p className="text-[1.4rem] text-tinta-suave">Sem caixilhos cadastrados</p>
        ) : (
          <>
            <p className="flex items-baseline justify-between gap-3 leading-none num">
              <span>
                <span className="font-titulo text-[1.9rem] font-semibold">{c.prontos}</span>
                <span className="text-[1.35rem] text-tinta-suave"> de {c.total} prontos</span>
              </span>
              {c.emProducao > 0 && (
                <span className="rounded-full bg-atencao-bg text-atencao px-3 text-[1.15rem] font-semibold">
                  {c.emProducao} em andamento
                </span>
              )}
            </p>
            <div className="flex h-[0.6rem] rounded-full overflow-hidden bg-elevada gap-[2px]" aria-hidden>
              {c.prontos > 0 && <div className="bg-ok" style={{ width: `${(c.prontos / c.total) * 100}%` }} />}
              {c.emProducao > 0 && <div className="bg-atencao" style={{ width: `${(c.emProducao / c.total) * 100}%` }} />}
            </div>
          </>
        )}
      </div>

      {/* Onde estão as peças */}
      <div className="min-w-0 max-h-full flex flex-wrap content-center gap-1.5 overflow-hidden">
        {o.locais.length === 0 ? (
          <span className="text-[1.25rem] text-tinta-suave">sem local</span>
        ) : (
          o.locais.slice(0, 7).map((l) => (
            <span key={l} className="rounded-full bg-roxo-bg text-roxo px-3 py-0.5 text-[1.3rem] font-semibold num leading-tight">
              {l}
            </span>
          ))
        )}
        {o.locais.length > 7 && (
          <span className="text-[1.3rem] font-semibold text-roxo self-center">+{o.locais.length - 7}</span>
        )}
      </div>
    </li>
  );
}
