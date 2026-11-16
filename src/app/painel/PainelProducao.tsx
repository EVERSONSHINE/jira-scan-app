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

      {/* Barra do topo */}
      <header className="bg-marca text-white px-8 h-[5.5rem] flex items-center gap-6 shrink-0">
        <Logo className="h-12 w-auto" />
        <span className="h-10 w-px bg-white/30" aria-hidden />
        <h1 className="text-[2.6rem] font-bold leading-none">
          Produção de {m?.nomeMes ?? '…'}
        </h1>
        {data && <TrimestreTopo t={data.trimestre} />}
        <div className="ml-8 text-right leading-tight">
          <p className="text-[2.2rem] font-bold num">
            {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className={`text-[1.2rem] ${erro ? 'text-amber-300 font-bold' : 'text-marca-200'}`}>
            {erro
              ? `Sem conexão com o Jira${data ? ' · mostrando os últimos dados' : ''}`
              : atualizado && `atualizado às ${atualizado}`}
          </p>
        </div>
      </header>

      {!data && (
        <p className="flex-1 grid place-items-center text-[3rem] text-tinta-suave">
          {erro ? 'Tentando conectar…' : 'Carregando…'}
        </p>
      )}

      {data && m && (
        <>
          {/* ── Meta do mês ──────────────────────────────────────────────── */}
          <section aria-label="Meta do mês" className="shrink-0 bg-white border-b-2 border-linha grid grid-cols-[1.15fr_1fr_0.9fr] divide-x-2 divide-linha">
            <BlocoCaixilhos m={m} />
            <BlocoValor m={m} />
            <BlocoRitmo m={m} />
          </section>

          {/* ── Próximas entregas ────────────────────────────────────────── */}
          <section aria-label="Próximas entregas" className="flex-1 min-h-0 flex flex-col px-8 pt-4">
            <div className="flex items-baseline gap-4 pb-2">
              <h2 className="text-[2.2rem] font-bold">Próximas entregas</h2>
              <span className="text-[1.6rem] text-tinta-suave">
                {entregas.length} {entregas.length === 1 ? 'obra' : 'obras'} na fábrica
              </span>
              {paginas > 1 && (
                <span className="ml-auto flex items-center gap-2" aria-label={`Página ${pagina + 1} de ${paginas}`}>
                  {Array.from({ length: paginas }, (_, i) => (
                    <span key={i} className={`h-4 rounded-full ${i === pagina ? 'w-10 bg-marca' : 'w-4 bg-linha'}`} />
                  ))}
                </span>
              )}
            </div>

            {entregas.length === 0 ? (
              <p className="py-10 text-[2.4rem] text-tinta-suave">Nenhuma obra com data de entrega na fábrica.</p>
            ) : (
              <ol className="flex flex-col">
                {visiveis.map((o) => <LinhaObra key={o.key} o={o} />)}
              </ol>
            )}

            {data.semData > 0 && (
              <p className="py-3 text-[1.4rem] text-tinta-suave">
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
    <div className="ml-auto flex items-center gap-2.5" aria-label={`Trimestre: ${t.batidos} de 3 meses batidos`}>
      <span className="text-[1.5rem] text-marca-200 mr-1">Trimestre</span>
      {t.meses.map((m) => {
        const nome = m.nomeMes.slice(0, 3).toUpperCase();
        const pct = m.valorProduzido !== null && m.metaValor > 0
          ? Math.round((m.valorProduzido / m.metaValor) * 100) : null;
        const cls = m.batida === true
          ? 'bg-emerald-600 text-white'
          : m.batida === false
            ? 'bg-red-700 text-white'
            : m.situacao === 'em-andamento'
              ? 'bg-white text-marca'
              : 'border-2 border-white/30 text-marca-200';
        return (
          <span key={m.mes} className={`h-12 rounded-xl px-3 flex items-center gap-1.5 text-[1.6rem] font-bold ${cls}`}>
            {nome}
            {m.batida === true && <Icone nome="check" className="w-7 h-7" titulo="batida" />}
            {m.batida === false && <Icone nome="fechar" className="w-7 h-7" titulo="não batida" />}
            {m.batida === null && m.situacao === 'em-andamento' && pct !== null && <span className="num">{pct}%</span>}
          </span>
        );
      })}
    </div>
  );
}

// ─── Faixa da meta ───────────────────────────────────────────────────────────

function Barra({ fracao, cor, marca }: { fracao: number; cor: string; marca?: number }) {
  return (
    <div className="relative h-6 rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, Math.max(0, fracao * 100))}%` }} />
      {marca !== undefined && marca > 0 && marca < 1 && (
        // Onde deveríamos estar hoje, dividindo o mês por igual
        <div className="absolute -top-2 -bottom-2 w-1.5 rounded bg-marca" style={{ left: `calc(${marca * 100}% - 3px)` }} />
      )}
    </div>
  );
}

function BlocoCaixilhos({ m }: { m: PainelData['meta'] }) {
  const fr = m.caixilhosTotal > 0 ? m.caixilhosProntos / m.caixilhosTotal : 0;
  const esperado = m.caixilhosTotal > 0 ? m.esperadoHoje / m.caixilhosTotal : undefined;
  const diferenca = m.caixilhosProntos - m.esperadoHoje;
  return (
    <div className="px-8 py-4 flex flex-col gap-3">
      <p className="text-[1.6rem] text-tinta-suave">Caixilhos com entrega em {m.nomeMes}</p>
      <p className="leading-none">
        <span className="text-[5rem] font-bold num">{nf(m.caixilhosProntos)}</span>
        <span className="text-[2.4rem] text-tinta-suave num"> de {nf(m.caixilhosTotal)} prontos</span>
      </p>
      <Barra fracao={fr} cor="bg-emerald-600" marca={esperado} />
      {m.caixilhosTotal > 0 && m.diasUteis.passados > 0 && (
        <p className={`text-[1.6rem] font-bold ${diferenca >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
          {diferenca >= 0
            ? `${nf(diferenca)} à frente do calendário`
            : `${nf(-diferenca)} atrás do calendário`}
          <span className="font-normal text-tinta-suave"> · hoje deveriam ser {nf(m.esperadoHoje)}</span>
        </p>
      )}
    </div>
  );
}

function BlocoValor({ m }: { m: PainelData['meta'] }) {
  const fr = m.metaValor > 0 ? m.valorProduzido / m.metaValor : 0;
  return (
    <div className="px-8 py-4 flex flex-col gap-3">
      <p className="text-[1.6rem] text-tinta-suave">Valor produzido · meta {reaisCurto(m.metaValor)}</p>
      <p className="leading-none">
        <span className="text-[5rem] font-bold num">{reaisCurto(m.valorProduzido)}</span>
        <span className="text-[2.4rem] text-tinta-suave num"> {Math.round(fr * 100)}%</span>
      </p>
      <Barra fracao={fr} cor="bg-marca-600" />
      <p className="text-[1.6rem] whitespace-nowrap">
        <span className="text-tinta-suave">Obras do mês somam </span>
        <b className="num">{reaisCurto(m.valorPrevisto)}</b>
        {m.obrasSemValor > 0 && (
          <span className="text-amber-800 font-bold"> · {m.obrasSemValor} sem valor</span>
        )}
      </p>
    </div>
  );
}

function BlocoRitmo({ m }: { m: PainelData['meta'] }) {
  const faltam = Math.max(m.caixilhosTotal - m.caixilhosProntos, 0);
  return (
    <div className="px-8 py-4 flex flex-col gap-2">
      <p className="text-[1.6rem] text-tinta-suave">Para fechar o mês</p>
      {faltam === 0 && m.caixilhosTotal > 0 ? (
        <p className="flex items-center gap-3 text-[3rem] font-bold text-emerald-800 leading-tight">
          <Icone nome="check" className="w-14 h-14" />
          Caixilhos do mês prontos
        </p>
      ) : (
        <>
          <p className="leading-none">
            <span className="text-[5rem] font-bold num">{nf(m.porDia)}</span>
            <span className="text-[2.4rem] text-tinta-suave"> por dia</span>
          </p>
          <p className="text-[1.6rem] num">
            faltam <b>{nf(faltam)}</b> em <b>{m.diasUteis.restantes}</b> {m.diasUteis.restantes === 1 ? 'dia útil' : 'dias úteis'}
          </p>
        </>
      )}
      {m.atrasadasAnteriores.caixilhosFaltando > 0 && (
        <p className="text-[1.5rem] font-bold text-red-700 num">
          + {nf(m.atrasadasAnteriores.caixilhosFaltando)} atrasados de meses anteriores
        </p>
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
    ? 'bg-red-700 text-white'
    : urgente
      ? 'bg-amber-300 text-tinta'
      : 'bg-white text-tinta';

  return (
    <li className="h-[6.3rem] grid grid-cols-[13.5rem_1fr_26rem_23rem] items-center gap-6 border-b-2 border-linha py-2">
      {/* Data de entrega */}
      <div className={`h-full rounded-xl px-4 flex flex-col justify-center ${corData} ${!atrasada && !urgente ? 'border-2 border-linha' : ''}`}>
        <p className="text-[2.2rem] font-bold leading-none num">
          <span className="text-[1.6rem]">{diaSemana(o.duedate!)}</span> {dataCurta(o.duedate)}
        </p>
        <p className="text-[1.5rem] font-bold leading-tight mt-1">
          {pronta && dias < 0 ? 'data passou' : prazoRelativo(dias)}
        </p>
      </div>

      {/* Obra */}
      <div className="min-w-0">
        <p className="text-[2.3rem] font-bold leading-tight truncate">{o.nome}</p>
        {o.documento && <p className="text-[1.5rem] leading-tight text-tinta-suave num">Pedido {o.documento}</p>}
      </div>

      {/* Andamento dos caixilhos */}
      <div className="flex flex-col justify-center gap-2.5">
        {pronta ? (
          <p className="flex items-center gap-2 text-[2rem] font-bold text-emerald-800">
            <Icone nome="check" className="w-10 h-10" />
            Pronta · falta expedir
          </p>
        ) : c.total === 0 ? (
          <p className="text-[1.8rem] text-tinta-suave">Sem caixilhos cadastrados</p>
        ) : (
          <>
            <p className="flex items-baseline justify-between gap-3 leading-none num">
              <span>
                <span className="text-[2.6rem] font-bold">{c.prontos}</span>
                <span className="text-[1.7rem] text-tinta-suave"> de {c.total} prontos</span>
              </span>
              {c.emProducao > 0 && (
                <span className="text-[1.5rem] font-bold text-amber-900">{c.emProducao} em produção</span>
              )}
            </p>
            <div className="flex h-4 rounded-full overflow-hidden bg-slate-200 gap-[3px]" aria-hidden>
              {c.prontos > 0 && <div className="bg-emerald-600" style={{ width: `${(c.prontos / c.total) * 100}%` }} />}
              {c.emProducao > 0 && <div className="bg-amber-500" style={{ width: `${(c.emProducao / c.total) * 100}%` }} />}
            </div>
          </>
        )}
      </div>

      {/* Onde estão as peças */}
      <div className="min-w-0 max-h-full flex flex-wrap content-center gap-1.5 overflow-hidden">
        {o.locais.length === 0 ? (
          <span className="text-[1.5rem] text-tinta-suave">sem local</span>
        ) : (
          o.locais.slice(0, 7).map((l) => (
            <span key={l} className="rounded-lg bg-cyan-800 text-white px-2.5 py-0.5 text-[1.6rem] font-bold num leading-tight">
              {l}
            </span>
          ))
        )}
        {o.locais.length > 7 && (
          <span className="text-[1.6rem] font-bold text-cyan-900 self-center">+{o.locais.length - 7}</span>
        )}
      </div>
    </li>
  );
}
