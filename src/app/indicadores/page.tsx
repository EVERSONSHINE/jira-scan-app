'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Icone from '@/components/Icone';
import { BarraEtapas, EtapaChip } from '@/components/Etapa';
import { etapa, ORDEM } from '@/lib/etapas';
import { reais, reaisCurto, n, dataCurta, prazoTexto, hora } from '@/lib/formato';
import { nomeDoMes, mesCurto } from '@/lib/calendario';

/** A diretoria olha de tempos em tempos; recarrega sozinho a cada 5 min */
const POLL_MS = 5 * 60_000;

// ─── Tipos (espelham /api/indicadores) ───────────────────────────────────────

interface ObraI {
  key: string; cliente: string; etapa: string; entrega: string | null; diasParaEntrega: number | null;
  valor: number | null; valorPendente: number | null;
  caixilhos: { total: number; prontos: number };
  pecas: { total: number; prontas: number; porStatus: Record<string, number> };
  pct: number; diasSemMov: number | null; parada: boolean; atrasada: boolean;
}
interface Carga {
  grupo: string; obras: number; caixilhos: number; caixilhosProntos: number;
  valor: number; valorPendente: number; obrasSemValor: number;
}
interface Dados {
  mes: string; hoje: string;
  meta: {
    meta: number; produzido: number; pct: number; esperadoHoje: number; faltam: number;
    porDiaNecessario: number | null; projecao: number | null;
    dias: { total: number; passados: number; hojeUtil: boolean; restantes: number };
  };
  producao: {
    valor: number; pecas: number; caixilhos: number; obrasSemValor: number;
    porObra: Array<{ key: string; cliente: string; valor: number | null; pecas: number; caixilhos: number }>;
  };
  programado: { obras: number; caixilhos: number; caixilhosProntos: number; valor: number; obrasSemValor: number };
  atrasadas: { obras: number; emProducao: number };
  historico: Array<{ mes: string; valor: number | null; caixilhos: number | null; meta: number; parcial: boolean }>;
  entregues: { obras: number; valor: number; semValor: number };
  pecasExpedidasMes: number | null;
  carteira: { obras: number; valor: number; valorPendente: number; caixilhos: number; caixilhosProntos: number; prontasAguardando: number };
  carga: Carga[];
  wip: Record<string, number>;
  obras: ObraI[];
  qualidade: { semValor: Array<{ key: string; cliente: string }>; semEntrega: Array<{ key: string; cliente: string }> };
  fetchedAt: string;
}

const nomeGrupo = (g: string) =>
  g === 'atrasadas' ? 'Atrasadas' : g === 'sem-data' ? 'Sem data de entrega' : g === 'depois' ? 'Mais adiante'
  : `${nomeDoMes(g)[0].toUpperCase()}${nomeDoMes(g).slice(1)}/${g.slice(2, 4)}`;

export default function IndicadoresPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch('/api/indicadores');
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? `HTTP ${r.status}`);
      setD(j);
      setErro('');
    } catch (e) {
      setErro(String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const id = setInterval(() => { if (!document.hidden) carregar(); }, POLL_MS);
    return () => clearInterval(id);
  }, [carregar]);

  return (
    <AppShell
      titulo="Indicadores de produção"
      subtitulo={d ? `${nomeDoMes(d.mes)} de ${d.mes.slice(0, 4)} · atualizado às ${hora(d.fetchedAt)}` : 'Carregando…'}
      largura="max-w-7xl"
      acoes={
        <button onClick={carregar} disabled={carregando} className="btn-secundario px-3" aria-label="Atualizar">
          <Icone nome="atualizar" className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      }
    >
      {erro && (
        <div className="cartao border-red-300 bg-red-50 text-red-800 p-4 text-sm mb-4">
          Não foi possível atualizar{d ? ' — mostrando os últimos dados' : ''}: {erro.slice(0, 200)}
        </div>
      )}
      {!d && !erro && (
        <div className="grid gap-4 lg:grid-cols-3" aria-busy>
          <div className="cartao h-64 lg:col-span-2 animate-pulse" /><div className="cartao h-64 animate-pulse" />
        </div>
      )}
      {d && <Conteudo d={d} />}
    </AppShell>
  );
}

function Conteudo({ d }: { d: Dados }) {
  const m = d.meta;
  const noRitmo = m.produzido >= m.esperadoHoje;
  const diferenca = Math.abs(m.produzido - m.esperadoHoje);
  const atencao = d.obras
    .filter((o) => o.atrasada || o.parada)
    .sort((a, b) => (a.diasParaEntrega ?? 0) - (b.diasParaEntrega ?? 0));
  const proximas = d.obras
    .filter((o) => !o.atrasada && o.diasParaEntrega !== null && o.diasParaEntrega <= 15)
    .slice(0, 12);
  const totalCarga = d.carga.reduce((t, c) => ({
    obras: t.obras + c.obras, caixilhos: t.caixilhos + c.caixilhos, caixilhosProntos: t.caixilhosProntos + c.caixilhosProntos,
    valor: t.valor + c.valor, valorPendente: t.valorPendente + c.valorPendente,
  }), { obras: 0, caixilhos: 0, caixilhosProntos: 0, valor: 0, valorPendente: 0 });
  const totalWip = Object.values(d.wip).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4 md:space-y-6">

      {/* ═══ Meta + histórico ═══ */}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="cartao p-5 lg:col-span-3">
          <p className="rotulo">Meta de produção · {nomeDoMes(d.mes)}</p>
          <div className="flex flex-wrap items-baseline gap-x-3 mt-1.5">
            <span className="font-titulo text-4xl md:text-5xl font-bold num tracking-tight">{reais(m.produzido)}</span>
            <span className="text-suave text-lg num">de {reais(m.meta)}</span>
            <span className={`ml-auto font-titulo text-2xl font-bold num ${noRitmo ? 'text-emerald-700' : 'text-amber-700'}`}>
              {m.pct.toLocaleString('pt-BR')}%
            </span>
          </div>
          <div className="relative mt-4">
            <div className="h-3 rounded-full bg-elevado overflow-hidden">
              <div className={`h-full rounded-full ${noRitmo ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${Math.min(m.pct, 100)}%` }} />
            </div>
            {m.esperadoHoje > 0 && m.esperadoHoje < m.meta && (
              <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-tinta" style={{ left: `${(m.esperadoHoje / m.meta) * 100}%` }}
                title={`Esperado até hoje: ${reais(m.esperadoHoje)}`} aria-hidden />
            )}
          </div>
          <p className="mt-3 text-sm flex items-start gap-2">
            <Icone nome={noRitmo ? 'check' : 'alerta'} className={`w-4 h-4 mt-0.5 ${noRitmo ? 'text-emerald-700' : 'text-amber-700'}`} />
            <span>
              <b>{noRitmo ? 'Acima' : 'Abaixo'} do ritmo da meta</b>: para fechar o mês em {reaisCurto(m.meta)}, o esperado ao fim de hoje é{' '}
              <b className="num">{reais(m.esperadoHoje)}</b> ({noRitmo ? `${reais(diferenca)} à frente` : `${reais(diferenca)} atrás`}).
            </span>
          </p>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-linha border border-linha rounded-lg overflow-hidden mt-4">
            {[
              ['Projeção de fechamento', m.projecao !== null ? reaisCurto(m.projecao) : '—',
                m.projecao !== null ? `${Math.round((m.projecao / m.meta) * 100)}% da meta, no ritmo atual` : 'falta 1 dia útil de dados'],
              ['Necessário por dia útil', m.porDiaNecessario !== null && m.faltam > 0 ? reaisCurto(m.porDiaNecessario) : '—',
                m.faltam > 0 ? `faltam ${reaisCurto(m.faltam)}` : 'meta batida'],
              ['Dias úteis', `${m.dias.restantes} de ${m.dias.total}`, 'restantes, contando hoje'],
              ['Caixilhos produzidos', n(d.producao.caixilhos), `${n(d.producao.pecas)} peças no mês`],
            ].map(([k, v, sub]) => (
              <div key={k} className="bg-superficie p-3">
                <dt className="rotulo">{k}</dt>
                <dd className="font-titulo text-xl font-bold num mt-1">{v}</dd>
                <dd className="text-xs text-apagado mt-0.5">{sub}</dd>
              </div>
            ))}
          </dl>
          {d.producao.obrasSemValor > 0 && (
            <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {d.producao.obrasSemValor} {d.producao.obrasSemValor === 1 ? 'obra produziu' : 'obras produziram'} neste mês sem o campo
              Valor preenchido no Jira — o valor produzido está menor do que o real.
            </p>
          )}
        </section>

        <section className="cartao p-5 lg:col-span-2 flex flex-col">
          <h2 className="font-titulo font-bold">Produção por mês</h2>
          <p className="text-xs text-apagado">Valor produzido (R$) — a linha tracejada é a meta</p>
          <Historico historico={d.historico} />
        </section>
      </div>

      {/* ═══ Indicadores do mês ═══ */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do mês">
        <Kpi icone="relogio" rotulo={`Entregas de ${nomeDoMes(d.mes)}`}
          valor={`${n(d.programado.caixilhosProntos)}/${n(d.programado.caixilhos)}`}
          sub={<>caixilhos prontos em {d.programado.obras} obras · {reaisCurto(d.programado.valor)}{d.programado.obrasSemValor > 0 && ` (${d.programado.obrasSemValor} sem valor)`}</>} />
        <Kpi icone="caminhao" rotulo="Obras expedidas no mês" valor={n(d.entregues.obras)}
          sub={<>{reaisCurto(d.entregues.valor)} entregues{d.pecasExpedidasMes !== null && ` · ${n(d.pecasExpedidasMes)} peças`}</>} />
        <Kpi icone="alerta" rotulo="Obras com entrega atrasada" valor={n(d.atrasadas.obras)} alerta={d.atrasadas.obras > 0}
          sub={<>{d.atrasadas.emProducao} em produção · {d.atrasadas.obras - d.atrasadas.emProducao} prontas, sem expedir</>} />
        <Kpi icone="camadas" rotulo="Carteira a produzir" valor={reaisCurto(d.carteira.valorPendente)}
          sub={<>{n(d.carteira.caixilhos - d.carteira.caixilhosProntos)} caixilhos em {d.carteira.obras} obras abertas</>} />
      </section>

      {/* ═══ Carga por mês de entrega ═══ */}
      <section className="cartao overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="font-titulo font-bold">Carteira por mês de entrega</h2>
          <p className="text-xs text-apagado">O que precisa sair da fábrica em cada mês, pela Data de entrega das obras</p>
        </div>
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Entrega</th><th className="text-right">Obras</th><th className="text-right">Caixilhos</th>
                <th className="text-right">Prontos</th><th className="min-w-[8rem]">Avanço</th>
                <th className="text-right">Valor</th><th className="text-right">A produzir</th>
              </tr>
            </thead>
            <tbody>
              {d.carga.map((c) => {
                const p = c.caixilhos ? Math.round((c.caixilhosProntos / c.caixilhos) * 100) : 0;
                const atrasada = c.grupo === 'atrasadas';
                return (
                  <tr key={c.grupo} className={atrasada ? 'bg-red-50/60' : ''}>
                    <td className={`font-semibold whitespace-nowrap ${atrasada ? 'text-red-700' : ''}`}>
                      {nomeGrupo(c.grupo)}{c.grupo === d.mes && <span className="ml-1.5 text-xs font-normal text-apagado">(mês atual)</span>}
                    </td>
                    <td className="text-right num">{c.obras}</td>
                    <td className="text-right num">{n(c.caixilhos)}</td>
                    <td className="text-right num">{n(c.caixilhosProntos)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-elevado overflow-hidden">
                          <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${p}%` }} />
                        </div>
                        <span className="text-xs num w-9 text-right">{p}%</span>
                      </div>
                    </td>
                    <td className="text-right num whitespace-nowrap">
                      {reais(c.valor)}
                      {c.obrasSemValor > 0 && <span className="block text-[11px] text-amber-700">{c.obrasSemValor} sem valor</span>}
                    </td>
                    <td className="text-right num whitespace-nowrap font-semibold">{reais(c.valorPendente)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-elevado/60">
                <td className="px-3 py-2.5">Total em aberto</td>
                <td className="px-3 py-2.5 text-right num">{totalCarga.obras}</td>
                <td className="px-3 py-2.5 text-right num">{n(totalCarga.caixilhos)}</td>
                <td className="px-3 py-2.5 text-right num">{n(totalCarga.caixilhosProntos)}</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right num whitespace-nowrap">{reais(totalCarga.valor)}</td>
                <td className="px-3 py-2.5 text-right num whitespace-nowrap">{reais(totalCarga.valorPendente)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ═══ Atenção + próximas entregas ═══ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <TabelaObras
          titulo="Obras que pedem atenção"
          descricao="Entrega vencida ou produção parada há mais de 7 dias"
          obras={atencao}
          vazio="Nenhuma obra atrasada ou parada."
          situacao={(o) => o.atrasada
            ? <span className="text-red-700 font-semibold">{prazoTexto(o.diasParaEntrega)}</span>
            : <span className="text-amber-800 font-semibold">parada {o.diasSemMov}d</span>}
        />
        <TabelaObras
          titulo="Próximas entregas"
          descricao="Obras com entrega nos próximos 15 dias"
          obras={proximas}
          vazio="Nenhuma entrega nos próximos 15 dias."
          situacao={(o) => <span className="text-suave">{prazoTexto(o.diasParaEntrega)}</span>}
        />
      </div>

      {/* ═══ Produção do mês por obra + peças em aberto ═══ */}
      <div className="grid gap-4 xl:grid-cols-5">
        <section className="cartao overflow-hidden xl:col-span-3">
          <div className="px-5 pt-4 pb-3">
            <h2 className="font-titulo font-bold">De onde veio a produção de {nomeDoMes(d.mes)}</h2>
            <p className="text-xs text-apagado">Valor da obra × peças concluídas no mês ÷ peças da obra</p>
          </div>
          {d.producao.porObra.length === 0
            ? <p className="px-5 pb-5 text-sm text-apagado">Nenhuma peça concluída neste mês ainda.</p>
            : (
              <div className="overflow-x-auto">
                <table className="tabela">
                  <thead><tr><th>Obra</th><th className="text-right">Caixilhos</th><th className="text-right">Peças</th><th className="text-right">Valor produzido</th></tr></thead>
                  <tbody>
                    {d.producao.porObra.slice(0, 10).map((o) => (
                      <tr key={o.key}>
                        <td><span className="font-semibold">{o.cliente}</span> <span className="text-xs text-apagado num">{o.key}</span></td>
                        <td className="text-right num">{o.caixilhos}</td>
                        <td className="text-right num">{o.pecas}</td>
                        <td className="text-right num whitespace-nowrap">
                          {o.valor === null ? <span className="text-amber-700 text-xs font-semibold">sem valor</span> : reais(o.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.producao.porObra.length > 10 && (
                  <p className="px-3 py-2 text-xs text-apagado border-t border-linha">+ {d.producao.porObra.length - 10} obras</p>
                )}
              </div>
            )}
        </section>

        <section className="cartao p-5 xl:col-span-2 space-y-4">
          <div>
            <h2 className="font-titulo font-bold">Peças das obras em aberto</h2>
            <p className="text-xs text-apagado">{n(totalWip)} peças, por etapa</p>
          </div>
          <BarraEtapas porStatus={d.wip} total={totalWip} altura="h-4" />
          <ul className="space-y-2 text-sm">
            {ORDEM.filter((s) => d.wip[s]).map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-sm ${etapa(s).barra}`} aria-hidden />
                <span className="flex-1">{etapa(s).rotulo}</span>
                <b className="num">{n(d.wip[s])}</b>
                <span className="text-apagado num w-11 text-right">{Math.round((d.wip[s] / totalWip) * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-apagado border-t border-linha pt-3">
            {d.carteira.prontasAguardando} {d.carteira.prontasAguardando === 1 ? 'obra pronta' : 'obras prontas'} esperando expedição.
          </p>
        </section>
      </div>

      {/* ═══ Cadastro ═══ */}
      {(d.qualidade.semValor.length > 0 || d.qualidade.semEntrega.length > 0) && (
        <section className="cartao p-5 space-y-4">
          <div>
            <h2 className="font-titulo font-bold">Cadastro incompleto no Jira</h2>
            <p className="text-xs text-apagado">Sem esses campos no Épico a obra fica fora da meta e da carteira por mês</p>
          </div>
          {[['Sem Valor', d.qualidade.semValor], ['Sem Data de entrega', d.qualidade.semEntrega]].map(([rot, lista]) => (
            (lista as Array<{ key: string; cliente: string }>).length > 0 && (
              <details key={rot as string} className="group">
                <summary className="cursor-pointer text-sm font-semibold list-none flex items-center gap-2">
                  <Icone nome="seta" className="w-4 h-4 text-apagado transition-transform group-open:rotate-90" />
                  {rot as string} <span className="rounded bg-amber-100 text-amber-900 px-1.5 text-xs num">{(lista as unknown[]).length}</span>
                </summary>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {(lista as Array<{ key: string; cliente: string }>).map((o) => (
                    <li key={o.key} className="text-xs rounded-md bg-elevado px-2 py-1"><b className="num">{o.key}</b> {o.cliente}</li>
                  ))}
                </ul>
              </details>
            )
          ))}
        </section>
      )}

      <p className="text-xs text-apagado">
        Produzido = peças que entraram em Concluído no mês, proporcional ao Valor da obra. Meta de {reais(m.meta)} por mês;
        dias úteis de segunda a sexta, sem feriados nacionais. Painel da fábrica: <Link href="/painel" className="text-acento font-semibold">Painel TV</Link>.
      </p>
    </div>
  );
}

function Kpi({ icone, rotulo, valor, sub, alerta = false }: {
  icone: string; rotulo: string; valor: React.ReactNode; sub: React.ReactNode; alerta?: boolean;
}) {
  return (
    <div className={`cartao p-4 flex items-start gap-3 ${alerta ? '!border-red-300' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="rotulo">{rotulo}</p>
        <p className={`font-titulo text-3xl font-bold num mt-1 ${alerta ? 'text-red-700' : ''}`}>{valor}</p>
        <p className="text-xs text-apagado mt-1">{sub}</p>
      </div>
      <span className={`grid place-items-center w-10 h-10 rounded-lg ${alerta ? 'bg-red-50 text-red-700' : 'bg-acento/10 text-acento'}`}>
        <Icone nome={icone} className="w-5 h-5" />
      </span>
    </div>
  );
}

/** Barras verticais de um só tom; mês corrente mais claro (parcial); meta tracejada */
function Historico({ historico }: { historico: Dados['historico'] }) {
  const meta = historico[historico.length - 1]?.meta ?? 0;
  const max = Math.max(meta * 1.15, ...historico.map((h) => h.valor ?? 0)) || 1;
  const semDados = historico.every((h) => h.valor === null || (h.parcial && h.valor === 0));
  return (
    <div className="flex-1 flex flex-col mt-4 min-h-[13rem]">
      <div className="relative flex-1 flex items-end gap-3 border-b border-linha-forte">
        {meta > 0 && (
          <div className="absolute inset-x-0 border-t-2 border-dashed border-tinta/40" style={{ bottom: `${(meta / max) * 100}%` }}>
            <span className="absolute left-0 -top-5 text-[11px] font-semibold text-suave bg-superficie pr-1">meta {reaisCurto(meta)}</span>
          </div>
        )}
        {historico.map((h) => (
          <div key={h.mes} className="flex-1 h-full flex flex-col justify-end items-center group relative"
            title={h.valor === null ? `${mesCurto(h.mes)}: sem fechamento` : `${mesCurto(h.mes)}: ${reais(h.valor)}${h.parcial ? ' (parcial)' : ''} · ${h.caixilhos} caixilhos`}>
            {h.valor !== null && (
              <span className="text-[11px] font-semibold num text-suave mb-1 whitespace-nowrap">{reaisCurto(h.valor)}</span>
            )}
            <div
              className={`w-full max-w-[3rem] rounded-t ${h.valor === null ? 'bg-transparent' : h.parcial ? 'bg-acento/35 ring-1 ring-inset ring-acento' : 'bg-acento'}`}
              style={{ height: `${((h.valor ?? 0) / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-1.5">
        {historico.map((h) => (
          <span key={h.mes} className="flex-1 text-center text-[11px] text-apagado">
            {mesCurto(h.mes)}{h.parcial && <span className="block">parcial</span>}
          </span>
        ))}
      </div>
      {semDados && (
        <p className="text-xs text-apagado mt-2">O histórico começa a aparecer no fechamento de cada mês.</p>
      )}
    </div>
  );
}

function TabelaObras({ titulo, descricao, obras, vazio, situacao }: {
  titulo: string; descricao: string; obras: ObraI[]; vazio: string; situacao: (o: ObraI) => React.ReactNode;
}) {
  return (
    <section className="cartao overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <h2 className="font-titulo font-bold">{titulo} <span className="text-apagado font-medium num">· {obras.length}</span></h2>
        <p className="text-xs text-apagado">{descricao}</p>
      </div>
      {obras.length === 0 ? <p className="px-5 pb-5 text-sm text-apagado">{vazio}</p> : (
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Obra</th><th>Entrega</th><th>Situação</th><th className="text-right">Avanço</th><th className="text-right">Valor</th></tr></thead>
            <tbody>
              {obras.map((o) => (
                <tr key={o.key}>
                  <td className="max-w-[14rem]">
                    <p className="font-semibold truncate">{o.cliente}</p>
                    <p className="text-xs text-apagado num">{o.key} · {o.caixilhos.prontos}/{o.caixilhos.total} caixilhos</p>
                  </td>
                  <td className="num whitespace-nowrap">{dataCurta(o.entrega)}</td>
                  <td className="whitespace-nowrap text-sm">{situacao(o)}</td>
                  <td className="text-right whitespace-nowrap">
                    {o.etapa === 'Concluido' ? <EtapaChip status="Concluido" /> : <b className="num">{o.pct}%</b>}
                  </td>
                  <td className="text-right num whitespace-nowrap">{o.valor === null ? <span className="text-apagado">—</span> : reaisCurto(o.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

