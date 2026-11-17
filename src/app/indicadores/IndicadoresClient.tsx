'use client';
import { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import AppShell, { Button, Panel } from '@/components/AppShell';
import { usePolling } from '@/components/usePolling';
import type { Indicadores, ObraResumo } from '@/lib/tiposApi';
import { brl, brlCurto, diaMes, hora, mesCurto, nomeMes, num, plural } from '@/lib/formato';

export default function IndicadoresClient() {
  const { data, error, loading, reload } = usePolling<Indicadores>('/api/indicadores');

  return (
    <AppShell
      title="Indicadores"
      actions={
        <>
          {data && <span className="hidden text-sm text-slate-500 xl:block">atualizado às {hora(data.fetchedAt)}</span>}
          <Button variant="secondary" onClick={reload} disabled={loading} aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            <span className="max-sm:hidden">{loading ? 'Atualizando…' : 'Atualizar'}</span>
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <span><b className="font-semibold">Falha ao atualizar</b> — {data ? 'mostrando os últimos dados.' : 'confira a conexão com o Jira.'} <span className="text-amber-800">({error.slice(0, 140)})</span></span>
        </div>
      )}
      {!data && !error && (
        <p className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando indicadores…</p>
      )}
      {data && <Conteudo d={data} />}
    </AppShell>
  );
}

function Conteudo({ d }: { d: Indicadores }) {
  const atual = d.mesAtual;
  const pctMeta = d.meta ? Math.round((atual.valor / d.meta) * 100) : 0;
  const pctProj = d.meta ? Math.round((atual.projecao / d.meta) * 100) : 0;
  const c = d.carteira;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo">
        <Stat label={`Produção de ${nomeMes(d.mes)}`} valor={brl(atual.valor)}
          linhas={[`${pctMeta}% da meta de ${brlCurto(d.meta)}`, `projeção do mês: ${brlCurto(atual.projecao)} (${pctProj}%)`]}
          tom={atual.projecao >= d.meta ? 'bom' : 'atencao'} />
        <Stat label={`Entregas no prazo (${d.prazoJanela.meses} meses)`}
          valor={d.prazoJanela.pct === null ? '—' : `${d.prazoJanela.pct}%`}
          linhas={[d.prazoJanela.comPrazo ? `${d.prazoJanela.noPrazo} de ${d.prazoJanela.comPrazo} obras expedidas até a data` : 'nenhuma obra expedida com data de entrega']} />
        <Stat label="Carteira em produção" valor={brlCurto(c.valor)}
          linhas={[`${c.obras} obras · ${num(c.caixilhos)} caixilhos`, c.semValor ? `${c.semValor} obras sem Valor no Jira` : 'todas com Valor']} />
        <Stat label={`Tempo médio da obra (${d.prazoJanela.meses} meses)`}
          valor={d.prazoJanela.leadTimeMedio === null ? '—' : `${d.prazoJanela.leadTimeMedio} dias`}
          linhas={['da data de início até a expedição']} />
      </section>

      {/* Meta x realizado */}
      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Produção por mês × meta</h2>
          <p className="text-sm text-slate-500">Valor das obras concluídas em cada mês · meta {brl(d.meta)}</p>
        </div>
        <GraficoProducao d={d} />
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 text-right font-medium">Produzido</th>
              <th className="px-3 py-2 text-right font-medium">% da meta</th>
              <th className="px-3 py-2 text-right font-medium max-sm:hidden">Obras</th>
              <th className="px-3 py-2 text-right font-medium max-sm:hidden">Caixilhos</th>
              <th className="px-3 py-2 text-right font-medium">Quadros</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...d.producao].reverse().map((m) => (
              <tr key={m.mes}>
                <td className="px-3 py-2 capitalize text-slate-800">{nomeMes(m.mes)} {m.mes.slice(0, 4)}{m.mes === d.mes && <span className="ml-1.5 text-xs normal-case text-slate-500">(em andamento)</span>}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-900">{brl(m.valor)}{m.semValor > 0 && <span className="ml-1 text-xs font-normal text-amber-800" title="obras concluídas sem Valor no Jira">+{m.semValor} s/ valor</span>}</td>
                <td className="px-3 py-2 text-right text-slate-700">{d.meta ? Math.round((m.valor / d.meta) * 100) : 0}%</td>
                <td className="px-3 py-2 text-right text-slate-700 max-sm:hidden">{m.obras}</td>
                <td className="px-3 py-2 text-right text-slate-700 max-sm:hidden">{num(m.caixilhos)}</td>
                <td className="px-3 py-2 text-right text-slate-700">{num(m.quadros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Entregas no prazo por mês */}
        <Panel className="p-5">
          <h2 className="text-base font-semibold text-slate-900">Entregas no prazo</h2>
          <p className="mb-4 text-sm text-slate-500">Obras expedidas até a Data de entrega, por mês de expedição</p>
          <ul className="space-y-3">
            {[...d.entregas].reverse().map((e) => (
              <li key={e.mes} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="capitalize text-slate-700">{mesCurto(e.mes)} {e.mes.slice(2, 4)}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  {e.pct !== null && <div className="h-full rounded-full bg-brand" style={{ width: `${e.pct}%` }} />}
                </div>
                <span className="w-56 text-right text-slate-600">
                  {e.comPrazo === 0 ? <span className="text-slate-400">sem entregas</span> : (
                    <><b className="font-semibold text-slate-900">{e.pct}%</b> · {e.noPrazo}/{e.comPrazo}
                      {e.atrasoMedio !== null && <> · atraso médio {e.atrasoMedio} d</>}</>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Carteira e ritmo */}
        <Panel className="p-5">
          <h2 className="text-base font-semibold text-slate-900">Carteira</h2>
          <p className="mb-4 text-sm text-slate-500">
            {c.obras} obras não concluídas · {num(c.quadrosProntos)} de {num(c.quadros)} quadros prontos
          </p>
          <ul className="space-y-3">
            {([
              ['Não iniciadas', c.porSituacao.pendente, 'bg-slate-500'],
              ['Em produção', c.porSituacao.producao, 'bg-brand'],
              ['Paradas há mais de 7 dias', c.porSituacao.parada, 'bg-red-600'],
              ['Com entrega vencida', c.porSituacao.atrasada, 'bg-red-600'],
            ] as const).map(([nome, n, cor]) => (
              <li key={nome} className="grid grid-cols-[1fr_minmax(6rem,40%)_2.5rem] items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-slate-700">
                  {cor === 'bg-red-600' && n > 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-700" />}{nome}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={`h-full rounded-full ${cor}`} style={{ width: `${c.obras ? (n / c.obras) * 100 : 0}%` }} />
                </div>
                <b className="text-right font-semibold text-slate-900">{n}</b>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            Concluídas aguardando expedição: <b className="font-semibold text-slate-900">{c.aguardandoExpedicao.obras}</b>
            {c.aguardandoExpedicao.valor > 0 && <> · {brl(c.aguardandoExpedicao.valor)}</>}
          </p>
        </Panel>
      </div>

      {/* Riscos */}
      <Panel className="overflow-hidden">
        <div className="px-5 pt-5">
          <h2 className="text-base font-semibold text-slate-900">Riscos</h2>
          <p className="text-sm text-slate-500">Obras com entrega vencida ou paradas, maior valor primeiro</p>
        </div>
        <TabelaRiscos obras={[...d.riscos.atrasadas, ...d.riscos.paradas]} />
        <div className="grid gap-4 border-t border-slate-100 px-5 py-4 text-sm md:grid-cols-2">
          <Faltando titulo="Sem Data de entrega" itens={d.riscos.semData} />
          <Faltando titulo="Sem Valor" itens={d.riscos.semValor} />
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, valor, linhas, tom }: { label: string; valor: string; linhas: string[]; tom?: 'bom' | 'atencao' }) {
  return (
    <Panel className="p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-[28px] font-semibold tracking-tight text-slate-900 [font-variant-numeric:proportional-nums]">{valor}</p>
      {linhas.map((l, i) => (
        <p key={i} className={`text-[13px] ${i === 1 && tom === 'atencao' ? 'text-amber-800' : i === 1 && tom === 'bom' ? 'text-emerald-800' : 'text-slate-600'}`}>{l}</p>
      ))}
    </Panel>
  );
}

/**
 * Colunas de um só tom (valor produzido) contra a linha da meta. No mês em
 * andamento, a coluna clara atrás é a projeção pelo ritmo de dias úteis.
 */
function GraficoProducao({ d }: { d: Indicadores }) {
  const [foco, setFoco] = useState<number | null>(null);
  const maxVal = Math.max(d.meta, d.mesAtual.projecao, ...d.producao.map((m) => m.valor));
  const passo = maxVal > 1_000_000 ? 250_000 : maxVal > 400_000 ? 250_000 : 100_000;
  const topo = Math.ceil((maxVal * 1.05) / passo) * passo;
  const ticks = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const y = (v: number) => `${100 - (v / topo) * 100}%`;

  return (
    <div className="relative h-64 pl-16 pr-2">
      {/* Grade e eixo */}
      {ticks.map((t) => (
        <div key={t} className="absolute left-16 right-2 border-t border-slate-100" style={{ top: y(t) }}>
          <span className="absolute -left-16 w-14 -translate-y-1/2 text-right text-xs text-slate-500">{t === 0 ? '0' : brlCurto(t).replace('R$ ', '')}</span>
        </div>
      ))}
      {/* Meta */}
      <div className="absolute left-16 right-2 border-t-[1.5px] border-slate-800" style={{ top: y(d.meta) }} aria-hidden>
        <span className="absolute -top-5 right-0 bg-white pl-1 text-xs font-medium text-slate-800">meta {brlCurto(d.meta)}</span>
      </div>
      {/* Colunas */}
      <div className="relative flex h-full items-end">
        {d.producao.map((m, i) => {
          const atual = m.mes === d.mes;
          return (
            <button
              key={m.mes}
              type="button"
              onPointerEnter={() => setFoco(i)} onPointerLeave={() => setFoco(null)}
              onFocus={() => setFoco(i)} onBlur={() => setFoco(null)}
              aria-label={`${nomeMes(m.mes)}: ${brl(m.valor)}${atual ? `, projeção ${brl(d.mesAtual.projecao)}` : ''}`}
              className="group relative flex h-full flex-1 items-end justify-center outline-offset-0"
            >
              {atual && d.mesAtual.projecao > m.valor && (
                <span className="absolute bottom-0 w-6 rounded-t bg-brand-100" style={{ height: `${(d.mesAtual.projecao / topo) * 100}%` }} />
              )}
              <span className={`relative w-6 rounded-t transition-colors ${foco === i ? 'bg-brand-600' : 'bg-brand'}`}
                style={{ height: `${(m.valor / topo) * 100}%`, minHeight: m.valor > 0 ? 2 : 0 }} />
              <span className="absolute -bottom-6 text-xs capitalize text-slate-600">{mesCurto(m.mes)}</span>
              {foco === i && (
                <span className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-lg bg-brand px-3 py-2 text-left text-xs text-white shadow-pop"
                  style={{ bottom: `${(Math.max(m.valor, atual ? d.mesAtual.projecao : 0) / topo) * 100}%` }}>
                  <b className="block text-sm font-semibold">{brl(m.valor)}</b>
                  <span className="block capitalize text-white/75">{nomeMes(m.mes)} · {m.obras} obras · {d.meta ? Math.round((m.valor / d.meta) * 100) : 0}% da meta</span>
                  {atual && <span className="block text-white/75">projeção {brl(d.mesAtual.projecao)}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TabelaRiscos({ obras }: { obras: ObraResumo[] }) {
  if (obras.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-500">Nenhuma obra atrasada ou parada.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <th className="px-5 py-2 font-medium">Obra</th>
            <th className="px-3 py-2 font-medium">Situação</th>
            <th className="px-3 py-2 font-medium">Entrega</th>
            <th className="px-3 py-2 text-right font-medium">Avanço</th>
            <th className="px-5 py-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {obras.map((o) => (
            <tr key={o.key}>
              <td className="px-5 py-2">
                <span className="block font-medium text-slate-900">{o.cliente}</span>
                <span className="font-mono text-xs text-slate-500">{o.key}</span>
              </td>
              <td className="px-3 py-2 text-red-800">
                {o.situacao === 'atrasada' ? `vencida há ${-(o.diasParaEntrega ?? 0)} dias` : `parada há ${o.diasSemMov} dias`}
              </td>
              <td className="px-3 py-2 text-slate-700">{o.duedate ? diaMes(o.duedate) : '—'}</td>
              <td className="px-3 py-2 text-right text-slate-700">{o.pct}%</td>
              <td className="px-5 py-2 text-right font-medium text-slate-900">{o.valor !== null ? brl(o.valor) : <span className="font-normal text-slate-400">sem valor</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Faltando({ titulo, itens }: { titulo: string; itens: Array<{ key: string; cliente: string }> }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-slate-700 marker:hidden">
        <span className="font-medium">{titulo}:</span> <b className={itens.length ? 'text-amber-800' : 'text-slate-900'}>{plural(itens.length, 'obra', 'obras')}</b>
        {itens.length > 0 && <span className="ml-1 text-slate-500 group-open:hidden">· ver lista</span>}
      </summary>
      {itens.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto text-slate-600">
          {itens.map((i) => <li key={i.key}><span className="font-mono text-xs">{i.key}</span> {i.cliente}</li>)}
        </ul>
      )}
    </details>
  );
}
