'use client';
import { useCallback, useEffect, useState } from 'react';
import Topo from '@/components/Topo';
import Icone from '@/components/Icone';
import { statusLabel, statusSelo } from '@/lib/status';
import {
  dataCurta, dataLonga, inicial, nf, plural, prazoRelativo, reais, reaisCurto,
} from '@/lib/formato';
import type { IndicadoresData, ObraProd, PrazoMes, SemanaProd } from '@/lib/tipos';

/**
 * Indicadores para a diretoria, no formato do Dashboard do Shine CRM:
 * números do topo, depois cartões com meta, bonificação, prazo e ritmo, e por
 * fim as tabelas de obras atrasadas e abertas.
 */
export default function IndicadoresPage() {
  const [d, setD] = useState<IndicadoresData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/indicadores');
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setD(json);
      setErro(null);
    } catch (e) {
      setErro(String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const atualizado = d ? new Date(d.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="min-h-screen pb-12">
      <Topo>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="btn-icone"
          title="Buscar os dados mais recentes"
          aria-label="Atualizar"
        >
          <Icone nome="refazer" className={`w-[18px] h-[18px] ${carregando ? 'animate-spin' : ''}`} />
        </button>
      </Topo>

      <div className="mx-auto max-w-6xl px-4 sm:px-5 py-4 flex flex-col gap-4">
        <div>
          <h1 className="text-[22px]">Indicadores</h1>
          <p className="text-tinta-suave mt-1">
            {d ? <>Dados do Jira às {atualizado}. </> : null}
            Meta e valores contam as obras com <b className="font-semibold text-tinta">data de entrega no mês</b>.
          </p>
        </div>

        {erro && (
          <p className="rounded-lg bg-perigo-bg text-perigo px-4 py-3">
            Não foi possível atualizar{d ? '; mostrando os últimos números' : ''}. <span className="text-xs">({erro.slice(0, 140)})</span>
          </p>
        )}
        {!d && !erro && <p className="py-16 text-center text-tinta-suave">Carregando os indicadores…</p>}

        {d && (
          <>
            <Kpis d={d} />
            <Avisos d={d} />
            <div className="flex flex-wrap gap-4">
              <Meta d={d} />
              <Bonificacao d={d} />
            </div>
            <div className="flex flex-wrap gap-4">
              <Prazo d={d} />
              <Ritmo d={d} />
            </div>
            {d.atrasadas.length > 0 && (
              <TabelaObras
                titulo={`Obras atrasadas (${d.atrasadas.length})`}
                sub={`Data de entrega já passou e ainda não foram expedidas · ${reais(d.atrasadas.reduce((s, o) => s + (o.valor ?? 0), 0))}`}
                obras={d.atrasadas}
              />
            )}
            <TabelaObras
              titulo="Obras abertas"
              sub="Tudo o que ainda não foi expedido, da entrega mais próxima para a mais distante"
              obras={d.abertas}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Peças comuns ────────────────────────────────────────────────────────────

const pct = (f: number) => `${Math.round(f * 100)}%`;

function Kpi({ titulo, valor, detalhe, dica, medidor }: {
  titulo: string; valor: React.ReactNode; detalhe?: React.ReactNode; dica?: string; medidor?: number;
}) {
  return (
    <div className="kpi" title={dica}>
      <span className="kpi-titulo">{titulo}</span>
      <strong className="kpi-valor">{valor}</strong>
      {detalhe && <span className="kpi-detalhe">{detalhe}</span>}
      {medidor !== undefined && (
        <span className="medidor mt-1.5"><span style={{ width: `${Math.min(1, Math.max(0, medidor)) * 100}%` }} /></span>
      )}
    </div>
  );
}

function Cartao({ titulo, sub, largo = false, children }: {
  titulo: string; sub?: string; largo?: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`cartao ${largo ? 'w-full' : 'flex-[1_1_340px]'}`} aria-label={titulo}>
      <h2>{titulo}</h2>
      {sub && <p className="cartao-sub mb-2">{sub}</p>}
      {children}
    </section>
  );
}

// ─── Números do topo ─────────────────────────────────────────────────────────

function Kpis({ d }: { d: IndicadoresData }) {
  const m = d.meta;
  const p = d.projecao;
  const vencidas = d.prazo.reduce((s, x) => s + x.noPrazo + x.comAtraso + x.vencidas, 0);
  const noPrazo = d.prazo.reduce((s, x) => s + x.noPrazo, 0);
  const atrasadasValor = d.atrasadas.reduce((s, o) => s + (o.valor ?? 0), 0);
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <Kpi
        titulo={`Produzido em ${m.nomeMes}`}
        valor={reaisCurto(m.valorProduzido)}
        detalhe={`${pct(m.metaValor ? m.valorProduzido / m.metaValor : 0)} da meta de ${reaisCurto(m.metaValor)}`}
        medidor={m.metaValor ? m.valorProduzido / m.metaValor : 0}
        dica="Valor de cada obra com entrega no mês × a parte dos caixilhos já prontos"
      />
      <Kpi
        titulo="Projeção do mês"
        valor={p.valorProjetado !== null ? reaisCurto(p.valorProjetado) : '—'}
        detalhe={p.ritmoDia !== null ? `no ritmo de ${p.ritmoDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} caixilhos/dia` : 'sem ritmo ainda'}
        dica="Quanto do valor do mês fica pronto até o fim, mantendo o ritmo deste mês"
      />
      <Kpi
        titulo="Caixilhos prontos"
        valor={<>{nf(m.caixilhosProntos)} <span className="text-base font-semibold text-tinta-suave">de {nf(m.caixilhosTotal)}</span></>}
        detalhe={m.diasUteis.passados > 0 ? `pelo calendário, hoje seriam ${nf(m.esperadoHoje)}` : 'início do mês'}
        medidor={m.caixilhosTotal ? m.caixilhosProntos / m.caixilhosTotal : 0}
        dica="Caixilhos concluídos ou expedidos das obras com entrega no mês"
      />
      <Kpi
        titulo="Precisa por dia útil"
        valor={nf(m.porDia)}
        detalhe={`${plural(m.diasUteis.restantes, 'dia útil', 'dias úteis')} até o fim do mês`}
        dica="Caixilhos que faltam ÷ dias úteis (seg–sex) que restam, contando hoje"
      />
      <Kpi
        titulo={`Trimestre ${d.trimestre.nome}`}
        valor={<>{d.trimestre.batidos} <span className="text-base font-semibold text-tinta-suave">de 3</span></>}
        detalhe="meses com a meta batida"
        dica="A bonificação conta os meses do trimestre em que a meta foi batida"
      />
      <Kpi
        titulo="Entregas no prazo"
        valor={vencidas ? pct(noPrazo / vencidas) : '—'}
        detalhe={`${noPrazo} de ${plural(vencidas, 'entrega', 'entregas')} · 3 meses`}
        medidor={vencidas ? noPrazo / vencidas : undefined}
        dica="Obras expedidas até a data de entrega, entre as que já venceram nos últimos 3 meses"
      />
      <Kpi
        titulo="Entrega atrasada"
        valor={nf(d.atrasadas.length)}
        detalhe={`${plural(d.atrasadas.length, 'obra', 'obras')} · ${reaisCurto(atrasadasValor)}`}
        dica="Obras não expedidas cuja data de entrega já passou"
      />
      <Kpi
        titulo="Carteira"
        valor={reaisCurto(d.carteira.valorAberto)}
        detalhe={`${nf(d.carteira.caixilhosFaltando)} caixilhos${d.carteira.semanasDeProducao !== null
          ? ` · ${d.carteira.semanasDeProducao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} semanas` : ''}`}
        dica="Valor e caixilhos ainda a produzir em todas as obras abertas; semanas no ritmo das últimas 4"
      />
    </div>
  );
}

function Avisos({ d }: { d: IndicadoresData }) {
  const m = d.meta;
  const faltaVender = Math.max(m.metaValor - m.valorPrevisto, 0);
  const itens: React.ReactNode[] = [];
  if (faltaVender > 0) {
    itens.push(<>As obras com entrega em {m.nomeMes} somam {reais(m.valorPrevisto)}: mesmo produzindo tudo, faltam <b>{reais(faltaVender)}</b> para a meta.</>);
  }
  if (m.obrasSemValor > 0) {
    itens.push(<>{m.obrasSemValor} de {plural(m.obras, 'obra', 'obras')} do mês {m.obrasSemValor === 1 ? 'está' : 'estão'} <b>sem valor no Jira</b> — os valores ficam abaixo do real.</>);
  }
  if (m.atrasadasAnteriores.obras > 0) {
    itens.push(<>{plural(m.atrasadasAnteriores.obras, 'obra', 'obras')} de meses anteriores ainda não {m.atrasadasAnteriores.obras === 1 ? 'ficou pronta' : 'ficaram prontas'} ({plural(m.atrasadasAnteriores.caixilhosFaltando, 'caixilho', 'caixilhos')}).</>);
  }
  if (!itens.length) return null;
  return (
    <ul className="flex flex-col gap-1.5 rounded-lg2 bg-atencao-bg px-4 py-3 text-sm">
      {itens.map((t, i) => (
        <li key={i} className="flex items-start gap-2 text-tinta">
          <span className="text-atencao mt-0.5"><Icone nome="alerta" className="w-4 h-4" /></span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Meta ────────────────────────────────────────────────────────────────────

function Meta({ d }: { d: IndicadoresData }) {
  const m = d.meta;
  const p = d.projecao;
  const fr = m.metaValor > 0 ? m.valorProduzido / m.metaValor : 0;
  const frPrevisto = m.metaValor > 0 ? m.valorPrevisto / m.metaValor : 0;
  const frProj = p.valorProjetado !== null && m.metaValor > 0 ? p.valorProjetado / m.metaValor : null;

  return (
    <Cartao titulo={`Meta de ${m.nomeMes}`} sub={`${reais(m.metaValor)} produzidos nas obras com entrega no mês`}>
      <p className="leading-none">
        <span className="font-titulo text-[32px] font-bold num">{reaisCurto(m.valorProduzido)}</span>
        <span className="text-tinta-suave"> produzidos · {pct(fr)}</span>
      </p>
      <div className="relative mt-3 h-3.5 rounded bg-elevada" role="img"
        aria-label={`Produzido ${pct(fr)} da meta; obras do mês somam ${pct(frPrevisto)}`}>
        <div className="absolute inset-y-0 left-0 rounded bg-acento-suave" style={{ width: `${Math.min(frPrevisto, 1) * 100}%` }} />
        <div className="absolute inset-y-0 left-0 rounded bg-acento" style={{ width: `${Math.min(fr, 1) * 100}%` }} />
        {frProj !== null && frProj > 0 && (
          <div className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded bg-tinta" style={{ left: `${Math.min(frProj, 1) * 100}%` }} />
        )}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
        <li className="flex items-center gap-2"><span className="legenda-cor bg-acento" />Produzido<b className="ml-auto num">{reais(m.valorProduzido)}</b></li>
        <li className="flex items-center gap-2"><span className="legenda-cor bg-acento-suave border border-linha" />Obras do mês somam<b className="ml-auto num">{reais(m.valorPrevisto)}</b></li>
        {p.valorProjetado !== null && (
          <li className="flex items-center gap-2"><span className="w-0.5 h-3.5 mx-[5px] rounded bg-tinta" />Projeção no ritmo atual<b className="ml-auto num">{reais(p.valorProjetado)}</b></li>
        )}
        <li className="flex items-center gap-2 text-tinta-suave"><span className="legenda-cor bg-elevada" />Meta<b className="ml-auto num text-tinta">{reais(m.metaValor)}</b></li>
      </ul>
    </Cartao>
  );
}

// ─── Bonificação trimestral ──────────────────────────────────────────────────

function Bonificacao({ d }: { d: IndicadoresData }) {
  const t = d.trimestre;
  return (
    <Cartao
      titulo={`Bonificação do trimestre (${t.nome})`}
      sub={`Mês batido: valor produzido das obras com entrega no mês ≥ ${reaisCurto(d.meta.metaValor)}`}
    >
      <ul className="flex flex-col divide-y divide-linha">
        {t.meses.map((m) => {
          const fr = m.valorProduzido !== null && m.metaValor > 0 ? m.valorProduzido / m.metaValor : 0;
          const tag = m.batida === true
            ? { cls: 'bg-ok-bg text-ok', texto: 'Batida' }
            : m.batida === false
              ? { cls: 'bg-perigo-bg text-perigo', texto: 'Não batida' }
              : m.situacao === 'em-andamento'
                ? { cls: 'bg-acento-suave text-acento', texto: 'Em andamento' }
                : { cls: 'bg-elevada text-tinta-suave', texto: 'Não começou' };
          return (
            <li key={m.mes} className="py-3 first:pt-1 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{inicial(m.nomeMes)}</span>
                <span className={`tag ${tag.cls}`}>
                  {m.batida === true && <Icone nome="check" className="w-3 h-3" />}
                  {tag.texto}
                </span>
                <span className="ml-auto font-semibold num">
                  {m.valorProduzido !== null ? reaisCurto(m.valorProduzido) : '—'}
                </span>
              </div>
              {m.valorProduzido !== null && (
                <span className="medidor mt-2"><span className={m.batida ? '!bg-ok' : ''} style={{ width: `${Math.min(fr, 1) * 100}%` }} /></span>
              )}
              <p className="mt-1 text-xs text-tinta-suave">
                {m.situacao === 'fechado' && 'Fechamento gravado na virada do mês.'}
                {m.situacao === 'estimado' && 'Estimativa com os dados de hoje (fechamento não gravado).'}
                {m.situacao === 'em-andamento' && `${pct(fr)} da meta até agora.`}
                {m.situacao === 'futuro' && `Começa em ${m.nomeMes}.`}
                {m.obrasSemValor > 0 && <span className="text-atencao font-semibold"> {plural(m.obrasSemValor, 'obra', 'obras')} sem valor.</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}

// ─── Prazo ───────────────────────────────────────────────────────────────────

const PARTES_PRAZO: Array<{ chave: keyof PrazoMes; nome: string; cor: string }> = [
  { chave: 'noPrazo',   nome: 'No prazo',             cor: 'bg-ok' },
  { chave: 'comAtraso', nome: 'Com atraso',           cor: 'bg-atencao' },
  { chave: 'vencidas',  nome: 'Venceu sem entregar',  cor: 'bg-perigo' },
  { chave: 'aVencer',   nome: 'Ainda no prazo',       cor: 'bg-linha-forte' },
];

function Prazo({ d }: { d: IndicadoresData }) {
  const parcial = d.prazo.some((m) => m.mes <= d.historicoDesde.slice(0, 7));
  return (
    <Cartao titulo="Entregas no prazo" sub="Obras pela data de entrega prevista">
      <div className="flex flex-col gap-4">
        {d.prazo.map((m) => {
          const vencidas = m.noPrazo + m.comAtraso + m.vencidas;
          return (
            <div key={m.mes}>
              <div className="flex items-baseline gap-2 text-[13px]">
                <span className="font-semibold text-sm">{inicial(m.nomeMes)}</span>
                <span className="text-tinta-suave">{plural(m.total, 'obra', 'obras')}</span>
                <span className="ml-auto font-semibold">
                  {vencidas ? `${pct(m.noPrazo / vencidas)} no prazo` : 'nenhuma venceu ainda'}
                </span>
              </div>
              {m.total > 0 ? (
                <div className="mt-1.5 flex h-3.5 gap-[2px] rounded overflow-hidden" role="img"
                  aria-label={PARTES_PRAZO.map((p) => `${p.nome}: ${m[p.chave]}`).join(', ')}>
                  {PARTES_PRAZO.filter((p) => (m[p.chave] as number) > 0).map((p) => (
                    <span
                      key={p.chave}
                      title={`${p.nome}: ${m[p.chave]}`}
                      className={p.cor}
                      style={{ flex: `${m[p.chave]} 1 0`, minWidth: 6 }}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-tinta-suave">Nenhuma obra com entrega neste mês.</p>
              )}
              <p className="mt-1 text-xs text-tinta-suave num">
                {PARTES_PRAZO.filter((p) => (m[p.chave] as number) > 0).map((p) => `${m[p.chave]} ${p.nome.toLowerCase()}`).join(' · ')}
              </p>
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {PARTES_PRAZO.map((p) => (
          <li key={p.chave} className="flex items-center gap-1.5"><span className={`legenda-cor ${p.cor}`} />{p.nome}</li>
        ))}
      </ul>
      {parcial && (
        <p className="mt-2 text-xs text-tinta-suave">
          Até {dataLonga(d.historicoDesde)} as obras expedidas eram arquivadas no dia seguinte; esses meses aparecem com menos entregas.
        </p>
      )}
    </Cartao>
  );
}

// ─── Ritmo semanal ───────────────────────────────────────────────────────────

/** Passo "redondo" para o eixo: 0, 10, 20… */
function passoEixo(max: number) {
  const bruto = max / 3;
  const pot = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? pot * 10;
}

function Ritmo({ d }: { d: IndicadoresData }) {
  const s = d.semanas;
  const topo = Math.max(...s.map((x) => x.caixilhos ?? 0), d.metaSemanal ?? 0, 1);
  const passo = passoEixo(topo);
  const max = Math.ceil(topo / passo) * passo;
  const ticks = Array.from({ length: Math.round(max / passo) + 1 }, (_, i) => i * passo);
  const [foco, setFoco] = useState<number | null>(null);
  const ultimaFechada = s.length >= 2 ? s[s.length - 2] : null;

  return (
    <Cartao titulo="Ritmo da produção" sub="Caixilhos concluídos por semana (segunda a domingo)">
      <div className="relative h-44 pl-8 mt-2">
        {ticks.map((t) => (
          <div key={t} className="absolute left-8 right-0 border-t border-linha" style={{ bottom: `${(t / max) * 100}%` }}>
            <span className="absolute -left-8 w-6 -translate-y-1/2 text-right text-[11px] text-tinta-suave num">{t}</span>
          </div>
        ))}
        {d.metaSemanal !== null && d.metaSemanal > 0 && (
          <div className="absolute left-8 right-0 border-t-2 border-dashed border-tinta-suave z-10 pointer-events-none"
            style={{ bottom: `${(d.metaSemanal / max) * 100}%` }} />
        )}
        <div className="absolute inset-0 left-8 flex items-end gap-[2px]">
          {s.map((w, i) => {
            const atual = i === s.length - 1;
            const v = w.caixilhos;
            return (
              <button
                key={w.inicio}
                type="button"
                onMouseEnter={() => setFoco(i)}
                onMouseLeave={() => setFoco(null)}
                onFocus={() => setFoco(i)}
                onBlur={() => setFoco(null)}
                onClick={() => setFoco(foco === i ? null : i)}
                aria-label={`Semana de ${dataCurta(w.inicio)}: ${v ?? 'sem dado'} caixilhos${atual ? ', em andamento' : ''}`}
                className="relative flex-1 h-full flex items-end justify-center outline-none"
              >
                <span
                  className={`w-full max-w-[22px] rounded-t-[3px] bg-serie ${atual ? 'opacity-40' : ''} ${foco === i ? 'brightness-110' : ''}`}
                  style={{ height: `${((v ?? 0) / max) * 100}%`, minHeight: v ? 2 : 0 }}
                />
                {foco === i && (
                  <span className="absolute bottom-full mb-1.5 z-20 whitespace-nowrap rounded-lg bg-elevada border border-linha-forte shadow-pop px-2.5 py-1.5 text-xs text-left">
                    Semana de {dataCurta(w.inicio)}{atual && ' (em andamento)'}
                    <b className="block text-sm num">{v ?? '—'} caixilhos</b>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pl-8 mt-1 flex gap-[2px]">
        {s.map((w, i) => (
          <span key={w.inicio} className={`flex-1 min-w-0 whitespace-nowrap text-center text-[11px] text-tinta-suave num ${i % 2 ? 'invisible sm:visible' : ''}`}>
            {dataCurta(w.inicio)}
          </span>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-suave">
        {d.metaSemanal !== null && d.metaSemanal > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-tinta-suave" aria-hidden />
            precisa de {d.metaSemanal} por semana para o mês
          </li>
        )}
        <li className="flex items-center gap-1.5"><span className="legenda-cor bg-serie opacity-40" />semana atual, até agora</li>
      </ul>
      <p className="mt-1 text-[13px]">
        {ultimaFechada?.caixilhos != null && <>Semana passada: <b>{ultimaFechada.caixilhos}</b>. </>}
        Esta semana: <b>{s[s.length - 1]?.caixilhos ?? '—'}</b>.
      </p>
      <TabelaSemanas s={s} />
      <p className="text-xs text-tinta-suave">
        Antes de {dataLonga(d.historicoDesde)} contam só os caixilhos de obras que não tinham sido arquivadas.
      </p>
    </Cartao>
  );
}

function TabelaSemanas({ s }: { s: SemanaProd[] }) {
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer font-semibold text-acento">Ver em tabela</summary>
      <table className="tabela mt-1 max-w-xs text-[13px] [&_td]:py-1 [&_th]:py-1">
        <thead><tr><th>Semana de</th><th className="num">Caixilhos</th></tr></thead>
        <tbody>
          {s.map((w) => (
            <tr key={w.inicio}>
              <td className="num">{dataCurta(w.inicio)}</td>
              <td className="num">{w.caixilhos ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// ─── Tabelas de obras ────────────────────────────────────────────────────────

function TabelaObras({ titulo, sub, obras }: { titulo: string; sub: string; obras: ObraProd[] }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <div>
        <h2 className="text-base">{titulo}</h2>
        <p className="cartao-sub">{sub}</p>
      </div>
      <div className="tabela-rolagem">
        <table className="tabela min-w-[44rem] text-sm">
          <thead>
            <tr>
              <th>Entrega</th>
              <th>Obra</th>
              <th className="num">Valor</th>
              <th>Caixilhos prontos</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {obras.map((o) => {
              const c = o.caixilhos;
              const atrasada = o.dias !== null && o.dias < 0;
              return (
                <tr key={o.key} className="hover:bg-superficie-hover">
                  <td className="whitespace-nowrap">
                    {o.duedate
                      ? <>
                          <span className="font-semibold num">{dataCurta(o.duedate)}</span>
                          <span className={`block text-xs ${atrasada ? 'text-perigo font-semibold' : 'text-tinta-suave'}`}>
                            {prazoRelativo(o.dias ?? 0)}
                          </span>
                        </>
                      : <span className="text-tinta-suave">sem data</span>}
                  </td>
                  <td>
                    <span className="font-semibold leading-snug">{o.nome}</span>
                    {o.documento && <span className="block text-xs text-tinta-suave num">{o.documento}</span>}
                  </td>
                  <td className="num whitespace-nowrap">
                    {o.valor !== null ? reais(o.valor) : <span className="tag bg-atencao-bg text-atencao">sem valor</span>}
                  </td>
                  <td className="min-w-[10rem]">
                    {c.total > 0 ? (
                      <>
                        <span className="num"><b>{c.prontos}</b> de {c.total}</span>
                        <span className="mt-1 flex h-1.5 rounded-full overflow-hidden bg-elevada gap-[2px]" aria-hidden>
                          {c.prontos > 0 && <span className="bg-ok" style={{ width: `${(c.prontos / c.total) * 100}%` }} />}
                          {c.emProducao > 0 && <span className="bg-atencao" style={{ width: `${(c.emProducao / c.total) * 100}%` }} />}
                        </span>
                      </>
                    ) : <span className="text-tinta-suave text-xs">sem caixilhos</span>}
                  </td>
                  <td><span className={`tag ${statusSelo(o.status)}`}>{statusLabel(o.status)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
