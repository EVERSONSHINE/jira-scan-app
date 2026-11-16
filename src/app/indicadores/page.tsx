'use client';
import { useCallback, useEffect, useState } from 'react';
import CabecalhoGestao from '@/components/CabecalhoGestao';
import Icone from '@/components/Icone';
import { statusLabel, statusSelo } from '@/lib/status';
import {
  dataCurta, dataLonga, inicial, nf, plural, prazoRelativo, reais, reaisCurto,
} from '@/lib/formato';
import type { IndicadoresData, ObraProd, PrazoMes, SemanaProd } from '@/lib/tipos';

/**
 * Indicadores para a diretoria. Quatro perguntas, nesta ordem:
 *   1. Vamos bater a meta do mês?
 *   2. Estamos entregando no prazo?
 *   3. A produção está acelerando ou caindo?
 *   4. Quanto trabalho temos pela frente?
 * Depois, o detalhe: obras atrasadas e todas as obras abertas.
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
    <div className="min-h-screen pb-16">
      <CabecalhoGestao titulo="Indicadores">
        <button
          onClick={carregar}
          disabled={carregando}
          className="h-11 px-4 rounded-xl bg-white text-marca text-base font-bold flex items-center gap-2 disabled:opacity-60"
        >
          <Icone nome="refazer" className={`w-5 h-5 ${carregando ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{carregando ? 'Atualizando…' : 'Atualizar'}</span>
        </button>
      </CabecalhoGestao>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {erro && (
          <p className="mt-5 rounded-xl bg-amber-50 border-2 border-amber-300 p-4 text-amber-900">
            Não foi possível atualizar{d ? '; mostrando os últimos números' : ''}. <span className="text-sm">({erro.slice(0, 140)})</span>
          </p>
        )}
        {!d && !erro && <p className="py-20 text-center text-xl text-tinta-suave">Carregando os indicadores…</p>}

        {d && (
          <>
            <p className="mt-4 text-base text-tinta-suave">
              Dados do Jira às {atualizado} · meta e valores pelas obras com <b className="text-tinta">data de entrega no mês</b>
            </p>
            <Meta d={d} />
            <Bonificacao d={d} />
            <Prazo d={d} />
            <Ritmo d={d} />
            <Carteira d={d} />
            <Atrasadas obras={d.atrasadas} />
            <Abertas obras={d.abertas} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Peças comuns ────────────────────────────────────────────────────────────

function Secao({ titulo, pergunta, children }: { titulo: string; pergunta?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-label={titulo}>
      <h2 className="text-2xl font-bold">{titulo}</h2>
      {pergunta && <p className="text-lg text-tinta-suave">{pergunta}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Numero({ rotulo, valor, sub, destaque = '' }: {
  rotulo: string; valor: React.ReactNode; sub?: React.ReactNode; destaque?: string;
}) {
  return (
    <div className="py-4 sm:px-5 first:sm:pl-0">
      <p className="text-base text-tinta-suave">{rotulo}</p>
      <p className={`text-4xl font-bold leading-tight mt-1 ${destaque}`}>{valor}</p>
      {sub && <p className="text-base text-tinta-suave mt-1">{sub}</p>}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-base text-amber-900">
      <Icone nome="alerta" className="w-5 h-5 mt-0.5 text-amber-700" />
      <span>{children}</span>
    </p>
  );
}

// ─── 1. Meta ─────────────────────────────────────────────────────────────────

function Meta({ d }: { d: IndicadoresData }) {
  const m = d.meta;
  const p = d.projecao;
  const fr = m.metaValor > 0 ? m.valorProduzido / m.metaValor : 0;
  const frPrevisto = m.metaValor > 0 ? m.valorPrevisto / m.metaValor : 0;
  const frProj = p.valorProjetado !== null && m.metaValor > 0 ? p.valorProjetado / m.metaValor : null;
  const faltaVender = Math.max(m.metaValor - m.valorPrevisto, 0);

  return (
    <section className="mt-6 rounded-3xl bg-white border-2 border-linha p-5 sm:p-8" aria-label="Meta do mês">
      <p className="text-xl font-bold">Meta de {m.nomeMes}</p>
      <p className="mt-2 leading-none">
        <span className="text-6xl sm:text-7xl font-bold">{reaisCurto(m.valorProduzido)}</span>
        <span className="text-2xl text-tinta-suave"> produzidos de {reaisCurto(m.metaValor)}</span>
      </p>

      {/* Medidor: produzido (cheio), previsto nas obras do mês (claro), projeção (traço) */}
      <div className="mt-5 relative h-7 rounded-full bg-marca-50" role="img"
        aria-label={`Produzido ${Math.round(fr * 100)}% da meta; obras do mês somam ${Math.round(frPrevisto * 100)}%`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-marca-200" style={{ width: `${Math.min(frPrevisto, 1) * 100}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-marca-600" style={{ width: `${Math.min(fr, 1) * 100}%` }} />
        {frProj !== null && frProj > 0 && (
          <div className="absolute -top-2 -bottom-2 w-1 rounded bg-tinta" style={{ left: `calc(${Math.min(frProj, 1) * 100}% - 2px)` }} />
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-base">
        <li className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-marca-600" />Produzido <b>{Math.round(fr * 100)}%</b></li>
        <li className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-marca-200" />Obras do mês <b>{reaisCurto(m.valorPrevisto)}</b></li>
        {p.valorProjetado !== null && (
          <li className="flex items-center gap-2"><span className="w-1 h-5 rounded bg-tinta" />Projeção no ritmo atual <b>{reaisCurto(p.valorProjetado)}</b></li>
        )}
      </ul>

      <div className="mt-6 grid sm:grid-cols-3 sm:divide-x-2 divide-linha border-t-2 border-linha">
        <Numero
          rotulo="Caixilhos prontos"
          valor={<>{nf(m.caixilhosProntos)} <span className="text-2xl text-tinta-suave">de {nf(m.caixilhosTotal)}</span></>}
          sub={m.diasUteis.passados > 0 ? `pelo calendário, hoje seriam ${nf(m.esperadoHoje)}` : undefined}
        />
        <Numero
          rotulo="No ritmo atual, até o fim do mês"
          valor={p.caixilhosProjetados !== null ? <>{nf(p.caixilhosProjetados)} <span className="text-2xl text-tinta-suave">caixilhos</span></> : '—'}
          sub={p.ritmoDia !== null ? `${p.ritmoDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia útil este mês` : undefined}
        />
        <Numero
          rotulo="Precisa por dia útil"
          valor={<>{nf(m.porDia)} <span className="text-2xl text-tinta-suave">caixilhos</span></>}
          sub={`${m.diasUteis.restantes} dias úteis até o fim do mês`}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {faltaVender > 0 && (
          <Aviso>
            As obras com entrega em {m.nomeMes} somam {reais(m.valorPrevisto)}: mesmo produzindo tudo, faltam{' '}
            <b>{reais(faltaVender)}</b> para a meta.
          </Aviso>
        )}
        {m.obrasSemValor > 0 && (
          <Aviso>
            {m.obrasSemValor} de {plural(m.obras, 'obra', 'obras')} do mês {m.obrasSemValor === 1 ? 'está' : 'estão'} <b>sem valor no Jira</b> — os valores acima estão abaixo do real.
          </Aviso>
        )}
        {m.atrasadasAnteriores.obras > 0 && (
          <Aviso>
            Além do mês: {plural(m.atrasadasAnteriores.obras, 'obra', 'obras')} de meses anteriores ainda não {m.atrasadasAnteriores.obras === 1 ? 'ficou pronta' : 'ficaram prontas'}
            ({plural(m.atrasadasAnteriores.caixilhosFaltando, 'caixilho', 'caixilhos')}).
          </Aviso>
        )}
      </div>
    </section>
  );
}

// ─── Bonificação trimestral ──────────────────────────────────────────────────

function Bonificacao({ d }: { d: IndicadoresData }) {
  const t = d.trimestre;
  const abertos = t.meses.filter((m) => m.batida === null).length;
  return (
    <Secao
      titulo={`Bonificação do trimestre (${t.nome})`}
      pergunta={`Mês batido: o valor produzido das obras com entrega no mês chegou à meta de ${reaisCurto(d.meta.metaValor)}`}
    >
      <p className="text-2xl">
        <b className="text-4xl">{t.batidos}</b> de 3 meses batidos
        {abertos > 0 && <span className="text-tinta-suave"> · {abertos === 1 ? '1 mês ainda em aberto' : `${abertos} meses ainda em aberto`}</span>}
      </p>
      <ul className="mt-4 grid sm:grid-cols-3 gap-4">
        {t.meses.map((m) => {
          const fr = m.valorProduzido !== null && m.metaValor > 0 ? m.valorProduzido / m.metaValor : 0;
          const selo = m.batida === true
            ? { cls: 'bg-emerald-700 text-white', icone: 'check' as const, texto: 'Batida' }
            : m.batida === false
              ? { cls: 'bg-red-700 text-white', icone: 'fechar' as const, texto: 'Não batida' }
              : m.situacao === 'em-andamento'
                ? { cls: 'bg-marca-100 text-marca', icone: null, texto: 'Em andamento' }
                : { cls: 'bg-slate-200 text-slate-800', icone: null, texto: 'Ainda não começou' };
          return (
            <li key={m.mes} className="rounded-2xl bg-white border-2 border-linha p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-bold">{inicial(m.nomeMes)}</p>
                <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-base font-bold ${selo.cls}`}>
                  {selo.icone && <Icone nome={selo.icone} className="w-4 h-4" />}
                  {selo.texto}
                </span>
              </div>
              {m.valorProduzido !== null ? (
                <>
                  <p className="mt-3 leading-none">
                    <span className="text-3xl font-bold">{reaisCurto(m.valorProduzido)}</span>
                    <span className="text-lg text-tinta-suave"> de {reaisCurto(m.metaValor)}</span>
                  </p>
                  <div className="mt-3 h-3 rounded-full bg-marca-50" aria-hidden>
                    <div
                      className={`h-full rounded-full ${m.batida === true ? 'bg-emerald-600' : 'bg-marca-600'}`}
                      style={{ width: `${Math.min(fr, 1) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-base text-tinta-suave">
                    {m.situacao === 'fechado' && 'Fechamento gravado na virada do mês.'}
                    {m.situacao === 'estimado' && 'Estimativa com os dados de hoje: o fechamento deste mês não foi gravado.'}
                    {m.situacao === 'em-andamento' && `${Math.round(fr * 100)}% da meta até agora.`}
                    {m.obrasSemValor > 0 && <span className="text-amber-900 font-bold"> {plural(m.obrasSemValor, 'obra', 'obras')} sem valor.</span>}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-lg text-tinta-suave">Começa em {m.nomeMes}.</p>
              )}
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}

// ─── 2. Prazo ────────────────────────────────────────────────────────────────

const PARTES_PRAZO: Array<{ chave: keyof PrazoMes; nome: string; cor: string; texto: string }> = [
  { chave: 'noPrazo',   nome: 'Entregues no prazo',  cor: 'bg-emerald-600', texto: 'text-white' },
  { chave: 'comAtraso', nome: 'Entregues com atraso', cor: 'bg-amber-400',   texto: 'text-tinta' },
  { chave: 'vencidas',  nome: 'Data passou, sem entregar', cor: 'bg-red-700', texto: 'text-white' },
  { chave: 'aVencer',   nome: 'Ainda no prazo',      cor: 'bg-slate-300',   texto: 'text-tinta' },
];

function Prazo({ d }: { d: IndicadoresData }) {
  return (
    <Secao titulo="Entregas no prazo" pergunta="Obras pela data de entrega prevista, por mês">
      <div className="flex flex-col gap-5">
        {d.prazo.map((m) => {
          const vencidas = m.noPrazo + m.comAtraso + m.vencidas;
          const pct = vencidas > 0 ? Math.round((m.noPrazo / vencidas) * 100) : null;
          return (
            <div key={m.mes} className="grid sm:grid-cols-[10rem_1fr] gap-x-5 gap-y-2 items-center">
              <p className="leading-tight">
                <span className="text-lg font-bold">{inicial(m.nomeMes)}</span>
                <span className="block text-base text-tinta-suave">
                  {pct !== null ? <><b className="text-tinta text-xl">{pct}%</b> no prazo</> : 'nenhuma venceu ainda'}
                </span>
              </p>
              {m.total === 0 ? (
                <p className="text-base text-tinta-suave">Nenhuma obra com entrega neste mês.</p>
              ) : (
                <div className="flex h-7 gap-[2px]" role="img"
                  aria-label={PARTES_PRAZO.map((p) => `${p.nome}: ${m[p.chave]}`).join(', ')}>
                  {PARTES_PRAZO.filter((p) => (m[p.chave] as number) > 0).map((p) => {
                    const n = m[p.chave] as number;
                    return (
                      <div
                        key={p.chave}
                        title={`${p.nome}: ${n}`}
                        className={`${p.cor} ${p.texto} rounded flex items-center px-2 text-base font-bold num overflow-hidden`}
                        style={{ width: `${(n / m.total) * 100}%`, minWidth: '0.5rem' }}
                      >
                        {n / m.total >= 0.08 ? n : ''}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-base">
        {PARTES_PRAZO.map((p) => (
          <li key={p.chave} className="flex items-center gap-2"><span className={`w-4 h-4 rounded ${p.cor}`} />{p.nome}</li>
        ))}
      </ul>
      {d.prazo.some((m) => `${m.mes}-31` < d.historicoDesde || m.mes === d.historicoDesde.slice(0, 7)) && (
        <p className="mt-3 text-base text-tinta-suave">
          Até {dataLonga(d.historicoDesde)} as obras expedidas eram arquivadas no dia seguinte e saíam da contagem;
          os meses até lá aparecem com menos entregas do que tiveram.
        </p>
      )}
    </Secao>
  );
}

// ─── 3. Ritmo semanal ────────────────────────────────────────────────────────

/** Escala "redonda" para o eixo: 0, 20, 40… */
function passoEixo(max: number) {
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? pot * 10;
}

function Ritmo({ d }: { d: IndicadoresData }) {
  const s = d.semanas;
  const valores = s.map((x) => x.caixilhos ?? 0);
  const topo = Math.max(...valores, d.metaSemanal ?? 0, 1);
  const passo = passoEixo(topo);
  const max = Math.ceil(topo / passo) * passo;
  const ticks = Array.from({ length: Math.round(max / passo) + 1 }, (_, i) => i * passo);
  const [foco, setFoco] = useState<number | null>(null);
  const ultimaFechada = s.length >= 2 ? s[s.length - 2] : null;

  return (
    <Secao titulo="Ritmo da produção" pergunta="Caixilhos concluídos por semana (segunda a domingo)">
      <div className="rounded-2xl bg-white border-2 border-linha p-4 sm:p-6">
        <div className="relative h-64 pl-10 pr-2">
          {/* Grade e eixo */}
          {ticks.map((t) => (
            <div key={t} className="absolute left-10 right-0 border-t border-slate-200" style={{ bottom: `${(t / max) * 100}%` }}>
              <span className="absolute -left-10 w-8 -translate-y-1/2 text-right text-sm text-tinta-suave num">{t}</span>
            </div>
          ))}
          {/* Meta semanal */}
          {d.metaSemanal !== null && d.metaSemanal > 0 && (
            <div className="absolute left-10 right-0 border-t-2 border-tinta z-10 pointer-events-none" style={{ bottom: `${(d.metaSemanal / max) * 100}%` }} />
          )}
          {/* Colunas */}
          <div className="absolute inset-0 left-10 flex items-end gap-[2px]">
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
                    className={`w-full max-w-[24px] rounded-t ${atual ? 'bg-marca-200' : 'bg-marca-600'} ${foco === i ? 'ring-2 ring-tinta ring-offset-2' : ''}`}
                    style={{ height: `${((v ?? 0) / max) * 100}%`, minHeight: v ? 2 : 0 }}
                  />
                  {foco === i && (
                    <span className="absolute bottom-full mb-2 z-20 whitespace-nowrap rounded-lg bg-tinta text-white px-3 py-2 text-sm text-left shadow-lg">
                      Semana de {dataCurta(w.inicio)}{atual && ' (em andamento)'}
                      <b className="block text-lg num">{v ?? '—'} caixilhos</b>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {/* Datas: uma sim, uma não no celular */}
        <div className="pl-10 pr-2 mt-2 flex gap-[2px]">
          {s.map((w, i) => (
            <span key={w.inicio} className={`flex-1 text-center text-sm text-tinta-suave num ${i % 2 ? 'hidden sm:block' : ''}`}>
              {dataCurta(w.inicio)}
            </span>
          ))}
        </div>
        {d.metaSemanal !== null && d.metaSemanal > 0 && (
          <p className="mt-3 flex items-center gap-2 text-base">
            <span className="w-6 border-t-2 border-tinta" aria-hidden />
            Precisa de <b>{d.metaSemanal} por semana</b> para entregar os caixilhos de {d.meta.nomeMes}
          </p>
        )}
        <p className="mt-2 text-base">
          {ultimaFechada?.caixilhos != null && (
            <>Semana passada: <b>{ultimaFechada.caixilhos} caixilhos</b>. </>
          )}
          Esta semana, até agora: <b>{s[s.length - 1]?.caixilhos ?? '—'}</b> (coluna clara).
        </p>
        <TabelaSemanas s={s} />
      </div>
      <p className="mt-3 text-base text-tinta-suave">
        Semanas antes de {dataLonga(d.historicoDesde)} contam só os caixilhos de obras que ainda não tinham sido arquivadas.
      </p>
    </Secao>
  );
}

function TabelaSemanas({ s }: { s: SemanaProd[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-base font-bold text-marca-600">Ver os números</summary>
      <table className="mt-2 text-base">
        <thead><tr><th className="text-left pr-6 font-bold">Semana de</th><th className="text-right font-bold">Caixilhos</th></tr></thead>
        <tbody>
          {s.map((w) => (
            <tr key={w.inicio} className="border-t border-linha">
              <td className="pr-6 py-1 num">{dataCurta(w.inicio)}</td>
              <td className="text-right py-1 num">{w.caixilhos ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// ─── 4. Carteira ─────────────────────────────────────────────────────────────

function Carteira({ d }: { d: IndicadoresData }) {
  const c = d.carteira;
  return (
    <Secao titulo="Carteira" pergunta="Tudo o que ainda não foi expedido">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 border-y-2 border-linha">
        <Numero rotulo="Obras abertas" valor={nf(c.obras)} />
        <Numero rotulo="Caixilhos a produzir" valor={nf(c.caixilhosFaltando)} />
        <Numero
          rotulo="Valor a produzir"
          valor={reaisCurto(c.valorAberto)}
          sub={c.obrasSemValor > 0 ? `${plural(c.obrasSemValor, 'obra', 'obras')} sem valor no Jira` : undefined}
        />
        <Numero
          rotulo="Trabalho na fila"
          valor={c.semanasDeProducao !== null
            ? <>{c.semanasDeProducao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-2xl text-tinta-suave">semanas</span></>
            : '—'}
          sub="no ritmo das últimas 4 semanas"
        />
      </div>
    </Secao>
  );
}

// ─── Detalhe ─────────────────────────────────────────────────────────────────

function Atrasadas({ obras }: { obras: ObraProd[] }) {
  if (obras.length === 0) {
    return (
      <Secao titulo="Obras atrasadas">
        <p className="flex items-center gap-2 text-lg text-emerald-800 font-bold">
          <Icone nome="check" className="w-6 h-6" /> Nenhuma obra com a data de entrega vencida.
        </p>
      </Secao>
    );
  }
  const valor = obras.reduce((s, o) => s + (o.valor ?? 0), 0);
  return (
    <Secao
      titulo={`Obras atrasadas (${obras.length})`}
      pergunta={`Data de entrega já passou e ainda não foram expedidas${valor > 0 ? ` · ${reais(valor)}` : ''}`}
    >
      <TabelaObras obras={obras} />
    </Secao>
  );
}

function Abertas({ obras }: { obras: ObraProd[] }) {
  return (
    <Secao titulo="Todas as obras abertas" pergunta="Pela data de entrega, da mais próxima para a mais distante">
      <TabelaObras obras={obras} />
    </Secao>
  );
}

function TabelaObras({ obras }: { obras: ObraProd[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-linha bg-white">
      <table className="w-full min-w-[44rem] text-base">
        <thead>
          <tr className="border-b-2 border-linha text-left text-sm text-tinta-suave">
            <th className="px-4 py-3 font-bold">Entrega</th>
            <th className="px-4 py-3 font-bold">Obra</th>
            <th className="px-4 py-3 font-bold text-right">Valor</th>
            <th className="px-4 py-3 font-bold">Caixilhos prontos</th>
            <th className="px-4 py-3 font-bold">Situação</th>
          </tr>
        </thead>
        <tbody>
          {obras.map((o) => {
            const c = o.caixilhos;
            const atrasada = o.dias !== null && o.dias < 0;
            return (
              <tr key={o.key} className="border-t border-linha align-top">
                <td className="px-4 py-3 whitespace-nowrap">
                  {o.duedate
                    ? <>
                        <b className="num">{dataCurta(o.duedate)}</b>
                        <span className={`block text-sm ${atrasada ? 'text-red-800 font-bold' : 'text-tinta-suave'}`}>
                          {prazoRelativo(o.dias ?? 0)}
                        </span>
                      </>
                    : <span className="text-tinta-suave">sem data</span>}
                </td>
                <td className="px-4 py-3">
                  <b className="leading-snug">{o.nome}</b>
                  {o.documento && <span className="block text-sm text-tinta-suave num">Pedido {o.documento}</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap num">
                  {o.valor !== null ? reais(o.valor) : <span className="text-amber-800 text-sm font-bold">sem valor</span>}
                </td>
                <td className="px-4 py-3 min-w-[11rem]">
                  {c.total > 0 ? (
                    <>
                      <span className="num"><b>{c.prontos}</b> de {c.total}</span>
                      <span className="mt-1 flex h-2 rounded-full overflow-hidden bg-slate-200 gap-[2px]" aria-hidden>
                        {c.prontos > 0 && <span className="bg-emerald-600" style={{ width: `${(c.prontos / c.total) * 100}%` }} />}
                        {c.emProducao > 0 && <span className="bg-amber-500" style={{ width: `${(c.emProducao / c.total) * 100}%` }} />}
                      </span>
                    </>
                  ) : <span className="text-tinta-suave text-sm">sem caixilhos</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-md px-2 font-bold whitespace-nowrap ${statusSelo(o.status)}`}>
                    {statusLabel(o.status)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
