'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import Icone from '@/components/Icone';
import { EtapaChip } from '@/components/Etapa';
import { etapa, ORDEM } from '@/lib/etapas';
import { diaMes, dataCurta, prazoTexto, n } from '@/lib/formato';
import { diasEntre } from '@/lib/calendario';

// ─── Tipos (espelham /api/relatorio) ─────────────────────────────────────────

interface PecaR {
  key: string; status: string; modelo: string; codigo: string;
  largura: string; altura: string; loc: string;
}
interface CaixilhoR { key: string; tipo: string; cor: string; status: string; pecas: PecaR[] }
interface ObraR {
  key: string; cliente: string; documento: string; entrega: string | null;
  etapa: string; caixilhos: CaixilhoR[];
}
interface Linha { obra: ObraR; cx: CaixilhoR; p: PecaR }

type Agrupar = 'obra' | 'local';

const SEM_LOCAL = '(sem localização)';
const natural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
const medidas = (p: PecaR) => (p.largura && p.altura ? `${p.largura} × ${p.altura}` : '—');

/**
 * Relatório do PCP: onde está cada peça. Agrupa por obra (o que falta de
 * cada cliente) ou por localização (o que há em cada ponto do galpão), e
 * imprime em A4 do jeito que está na tela.
 */
export default function QuadrosPage() {
  const [obras, setObras] = useState<ObraR[] | null>(null);
  const [hoje, setHoje] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [geradoEm, setGeradoEm] = useState('');

  const [agrupar, setAgrupar] = useState<Agrupar>('obra');
  const [fObra, setFObra] = useState('');
  const [busca, setBusca] = useState('');
  const [fLocal, setFLocal] = useState('');
  const [fEtapas, setFEtapas] = useState<string[]>([]);
  const [fModelo, setFModelo] = useState('');
  const [comExpedidas, setComExpedidas] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch('/api/relatorio');
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? `HTTP ${r.status}`);
      setObras(d.obras);
      setHoje(d.hoje);
      setErro('');
      setGeradoEm(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
    } catch (e) {
      setErro(String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Obras na ordem de entrega, as sem data no fim
  const obrasOrdenadas = useMemo(() => [...(obras ?? [])].sort((a, b) => {
    if (a.entrega && b.entrega) return a.entrega.localeCompare(b.entrega);
    return a.entrega ? -1 : b.entrega ? 1 : natural(a.key, b.key);
  }), [obras]);

  const todas: Linha[] = useMemo(() => obrasOrdenadas
    .filter((o) => comExpedidas || o.etapa !== 'Expedido')
    .flatMap((obra) => obra.caixilhos.flatMap((cx) => cx.pecas.map((p) => ({ obra, cx, p })))),
  [obrasOrdenadas, comExpedidas]);

  const locais = useMemo(() => [...new Set(todas.map((l) => l.p.loc).filter(Boolean))].sort(natural), [todas]);
  const modelos = useMemo(() => [...new Set(todas.map((l) => l.p.modelo).filter(Boolean))].sort(natural), [todas]);

  const q = busca.trim().toLowerCase();
  const linhas = useMemo(() => todas.filter(({ obra, cx, p }) =>
    (!fObra || obra.key === fObra) &&
    (!q || `${obra.cliente} ${obra.key} ${obra.documento} ${cx.tipo} ${p.key} ${p.codigo}`.toLowerCase().includes(q)) &&
    (!fLocal || (fLocal === SEM_LOCAL ? !p.loc : p.loc === fLocal)) &&
    (fEtapas.length === 0 || fEtapas.includes(p.status)) &&
    (!fModelo || p.modelo === fModelo),
  ), [todas, fObra, q, fLocal, fEtapas, fModelo]);

  // Contagem por etapa ignora o próprio filtro de etapa: os botões mostram o que existe
  const porEtapa = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { obra, cx, p } of todas) {
      if (fObra && obra.key !== fObra) continue;
      if (q && !`${obra.cliente} ${obra.key} ${obra.documento} ${cx.tipo} ${p.key} ${p.codigo}`.toLowerCase().includes(q)) continue;
      if (fLocal && (fLocal === SEM_LOCAL ? !!p.loc : p.loc !== fLocal)) continue;
      if (fModelo && p.modelo !== fModelo) continue;
      c[p.status] = (c[p.status] ?? 0) + 1;
    }
    return c;
  }, [todas, fObra, q, fLocal, fModelo]);

  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) {
      const k = agrupar === 'obra' ? l.obra.key : (l.p.loc || SEM_LOCAL);
      (m.get(k) ?? m.set(k, []).get(k)!).push(l);
    }
    const arr = [...m.entries()];
    if (agrupar === 'local') {
      arr.sort(([a], [b]) => (a === SEM_LOCAL ? 1 : b === SEM_LOCAL ? -1 : natural(a, b)));
      for (const [, ls] of arr) ls.sort((x, y) => natural(x.obra.key, y.obra.key) || natural(x.p.key, y.p.key));
    }
    return arr;
  }, [linhas, agrupar]);

  const nObras = new Set(linhas.map((l) => l.obra.key)).size;
  const nLocais = new Set(linhas.map((l) => l.p.loc).filter(Boolean)).size;
  // Poucos grupos: abre todos; muitos: fechados, cada um com o resumo de onde estão as peças
  const abertoPadrao = grupos.length <= 3;
  const estaAberto = (k: string) => abertos[k] ?? abertoPadrao;
  const temFiltro = !!(fObra || busca || fLocal || fEtapas.length || fModelo);

  const limpar = () => { setFObra(''); setBusca(''); setFLocal(''); setFEtapas([]); setFModelo(''); };
  const alternarEtapa = (s: string) =>
    setFEtapas((f) => (f.includes(s) ? f.filter((x) => x !== s) : [...f, s]));
  const todosAbertos = grupos.length > 0 && grupos.every(([k]) => estaAberto(k));
  const abrirTodos = (v: boolean) => setAbertos(Object.fromEntries(grupos.map(([k]) => [k, v])));

  const descricaoFiltros = [
    fObra && `obra ${fObra}`,
    busca && `busca "${busca}"`,
    fLocal && `local ${fLocal}`,
    fEtapas.length && `etapa ${fEtapas.map((s) => etapa(s).rotulo).join(', ')}`,
    fModelo && `modelo ${fModelo}`,
    !comExpedidas && 'sem obras expedidas',
  ].filter(Boolean).join(' · ');

  return (
    <AppShell
      titulo="Quadros"
      subtitulo="Onde está cada peça, por obra ou por localização"
      largura="max-w-7xl"
      acoes={
        <div className="flex gap-2">
          <button onClick={carregar} disabled={carregando} className="btn-secundario px-3" aria-label="Atualizar">
            <Icone nome="atualizar" className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button onClick={() => window.print()} disabled={!obras} className="btn-primario px-3">
            <Icone nome="impressora" className="w-4 h-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      }
    >
      {/* Cabeçalho que só sai no papel */}
      <div className="hidden print:flex items-end gap-4 mb-3 border-b-2 border-tinta pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-shine.svg" alt="Shine" className="h-10 w-auto" />
        <div>
          <p className="text-lg font-bold font-titulo leading-tight">
            Peças por {agrupar === 'obra' ? 'obra' : 'localização'}
          </p>
          <p className="text-xs">
            Emitido em {geradoEm} · {n(linhas.length)} peças em {nObras} {nObras === 1 ? 'obra' : 'obras'}
            {descricaoFiltros && ` · Filtros: ${descricaoFiltros}`}
          </p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <section className="nao-imprimir cartao p-3 md:p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="relative block col-span-2 md:col-span-1">
            <span className="sr-only">Buscar</span>
            <Icone nome="busca" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-apagado pointer-events-none" />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Cliente, documento, caixilho, peça ou código"
              className="campo pl-10" />
          </label>
          <select value={fObra} onChange={(e) => setFObra(e.target.value)} className="campo" aria-label="Obra">
            <option value="">Todas as obras</option>
            {obrasOrdenadas.filter((o) => comExpedidas || o.etapa !== 'Expedido').map((o) => (
              <option key={o.key} value={o.key}>{diaMes(o.entrega)} · {o.cliente}</option>
            ))}
          </select>
          <select value={fLocal} onChange={(e) => setFLocal(e.target.value)} className="campo" aria-label="Localização">
            <option value="">Todas as localizações</option>
            {locais.map((l) => <option key={l} value={l}>{l}</option>)}
            <option value={SEM_LOCAL}>Sem localização</option>
          </select>
          <select value={fModelo} onChange={(e) => setFModelo(e.target.value)} className="campo col-span-2 md:col-span-1" aria-label="Modelo">
            <option value="">Marcos e folhas</option>
            {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Agrupar */}
          <div className="inline-flex rounded-lg border border-linha-forte p-0.5 bg-elevado" role="group" aria-label="Agrupar por">
            {([['obra', 'Por obra'], ['local', 'Por localização']] as const).map(([v, r]) => (
              <button key={v} onClick={() => setAgrupar(v)} aria-pressed={agrupar === v}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold ${agrupar === v ? 'bg-superficie shadow-sm text-tinta' : 'text-suave'}`}>
                {r}
              </button>
            ))}
          </div>

          {/* Etapas: contam e filtram */}
          {ORDEM.filter((s) => porEtapa[s]).map((s) => {
            const on = fEtapas.includes(s);
            const e = etapa(s);
            return (
              <button key={s} onClick={() => alternarEtapa(s)} aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
                  on ? `${e.solido} ring-transparent` : 'bg-superficie text-suave ring-linha-forte'
                }`}>
                {!on && <span className={`w-2 h-2 rounded-full ${e.barra}`} aria-hidden />}
                {e.rotulo} <span className="num opacity-75">{n(porEtapa[s])}</span>
              </button>
            );
          })}

          <label className="inline-flex items-center gap-2 text-sm text-suave ml-auto cursor-pointer select-none">
            <input type="checkbox" checked={comExpedidas} onChange={(e) => setComExpedidas(e.target.checked)}
              className="w-4 h-4 accent-acento" />
            Incluir obras expedidas
          </label>
          {temFiltro && (
            <button onClick={limpar} className="text-sm font-semibold text-acento px-1">Limpar filtros</button>
          )}
        </div>
      </section>

      {/* ── Totais ── */}
      {obras && (
        <div className="nao-imprimir flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 mb-2 text-sm text-suave">
          <span><b className="text-tinta num">{n(linhas.length)}</b> peças</span>
          <span><b className="text-tinta num">{nObras}</b> {nObras === 1 ? 'obra' : 'obras'}</span>
          <span><b className="text-tinta num">{nLocais}</b> localizações</span>
          {grupos.length > 1 && (
            <button onClick={() => abrirTodos(!todosAbertos)} className="ml-auto text-sm font-semibold text-acento">
              {todosAbertos ? 'Recolher tudo' : 'Abrir tudo'}
            </button>
          )}
        </div>
      )}

      {erro && (
        <div className="cartao border-red-300 bg-red-50 text-red-800 p-4 text-sm mt-4">
          Não foi possível carregar: {erro.slice(0, 200)}
        </div>
      )}
      {!obras && !erro && (
        <div className="space-y-3 mt-4" aria-busy>
          {[0, 1, 2].map((i) => <div key={i} className="cartao h-24 animate-pulse" />)}
        </div>
      )}
      {obras && linhas.length === 0 && (
        <p className="text-center text-apagado py-16">Nenhuma peça com esses filtros.</p>
      )}

      {/* ── Grupos ── */}
      <div className="space-y-3">
        {grupos.map(([k, ls]) => (
          agrupar === 'obra'
            ? <GrupoObra key={k} linhas={ls} hoje={hoje} aberto={estaAberto(k)}
                onToggle={() => setAbertos((a) => ({ ...a, [k]: !estaAberto(k) }))} />
            : <GrupoLocal key={k} local={k} linhas={ls} aberto={estaAberto(k)}
                onToggle={() => setAbertos((a) => ({ ...a, [k]: !estaAberto(k) }))} />
        ))}
      </div>
    </AppShell>
  );
}

// ─── Peças visuais ───────────────────────────────────────────────────────────

function Local({ loc }: { loc: string }) {
  return loc
    ? <span className="inline-flex items-center rounded px-1.5 py-0.5 font-bold text-cyan-900 bg-cyan-50 ring-1 ring-inset ring-cyan-200 whitespace-nowrap num">{loc}</span>
    : <span className="text-apagado">—</span>;
}

/** "C07 ×12 · B02 ×4" — onde estão as peças do grupo, sem abrir a tabela */
function ResumoLocais({ linhas }: { linhas: Linha[] }) {
  const c = new Map<string, number>();
  for (const { p } of linhas) c.set(p.loc, (c.get(p.loc) ?? 0) + 1);
  const arr = [...c.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : natural(a, b)));
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {arr.map(([loc, q]) => (
        <span key={loc || '-'} className={`inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 ring-1 ring-inset ${
          loc ? 'bg-cyan-50 text-cyan-900 ring-cyan-200 font-bold' : 'bg-elevado text-suave ring-linha'
        }`}>
          {loc || 'sem local'} <span className="font-semibold opacity-70 num">×{q}</span>
        </span>
      ))}
    </div>
  );
}

function Cabecalho({ aberto, onToggle, children }: { aberto: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onToggle} aria-expanded={aberto}
      className="w-full text-left px-4 py-3 flex items-start gap-3 active:bg-elevado print:px-0">
      <Icone nome="seta" className={`nao-imprimir w-5 h-5 mt-0.5 text-apagado transition-transform ${aberto ? 'rotate-90' : ''}`} />
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </button>
  );
}

function GrupoObra({ linhas, hoje, aberto, onToggle }: {
  linhas: Linha[]; hoje: string; aberto: boolean; onToggle: () => void;
}) {
  const o = linhas[0].obra;
  const dias = o.entrega && hoje ? diasEntre(hoje, o.entrega) : null;
  const atrasada = dias !== null && dias < 0 && o.etapa !== 'Expedido';
  const prontas = linhas.filter((l) => l.p.status === 'Concluido' || l.p.status === 'Expedido').length;
  return (
    <section className="cartao overflow-hidden print:shadow-none print:border-0 print:rounded-none print:mb-4">
      <Cabecalho aberto={aberto} onToggle={onToggle}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="font-titulo font-bold text-base leading-tight">{o.cliente}</h2>
          <span className="text-xs text-apagado num">{o.key}{o.documento && ` · doc ${o.documento}`}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className={atrasada ? 'font-semibold text-red-700' : 'text-suave'}>
            Entrega <b className="num">{dataCurta(o.entrega)}</b>{o.entrega && ` · ${prazoTexto(dias)}`}
          </span>
          <span className="text-suave"><b className="text-tinta num">{prontas}/{linhas.length}</b> peças prontas</span>
          <EtapaChip status={o.etapa} />
        </div>
        <ResumoLocais linhas={linhas} />
      </Cabecalho>

      <div className={aberto ? '' : 'hidden print:block'}>
        {/* Celular: uma linha por peça */}
        <ul className="md:hidden print:hidden divide-y divide-linha border-t border-linha">
          {linhas.map(({ cx, p }) => (
            <li key={p.key} className="px-4 py-2.5 flex items-center gap-3">
              <Local loc={p.loc} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold num">{p.key} <span className="font-normal text-suave">· {p.modelo} · {medidas(p)}</span></p>
                <p className="text-xs text-apagado truncate">{cx.tipo}{cx.cor && ` · ${cx.cor}`}</p>
              </div>
              <EtapaChip status={p.status} curto />
            </li>
          ))}
        </ul>
        {/* Tablet, desktop e papel: tabela */}
        <div className="hidden md:block print:block overflow-x-auto print:overflow-visible border-t border-linha">
          {/* Larguras fixas: as tabelas de obras diferentes ficam alinhadas entre si */}
          <table className="tabela table-fixed min-w-[44rem]">
            <thead>
              <tr>
                <th className="w-[17%]">Caixilho</th><th className="w-[11%]">Peça</th><th className="w-[8%]">Modelo</th>
                <th className="w-[11%]">Código</th><th className="w-[13%] text-right">Medidas (mm)</th>
                <th className="w-[13%]">Cor</th><th className="w-[11%]">Local</th><th className="w-[16%]">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ cx, p }, i) => {
                const repete = i > 0 && linhas[i - 1].cx.key === cx.key;
                return (
                  <tr key={p.key} className={repete ? '' : 'border-t-2 border-linha'}>
                    <td className={repete ? 'text-transparent print:text-transparent' : 'font-semibold'}>{cx.tipo || cx.key}</td>
                    <td className="num whitespace-nowrap">{p.key}</td>
                    <td>{p.modelo}</td>
                    <td className="num whitespace-nowrap">{p.codigo || '—'}</td>
                    <td className="num text-right whitespace-nowrap">{medidas(p)}</td>
                    <td className="text-suave">{cx.cor || '—'}</td>
                    <td><Local loc={p.loc} /></td>
                    <td><EtapaChip status={p.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function GrupoLocal({ local, linhas, aberto, onToggle }: {
  local: string; linhas: Linha[]; aberto: boolean; onToggle: () => void;
}) {
  const nObras = new Set(linhas.map((l) => l.obra.key)).size;
  const porEtapa: Record<string, number> = {};
  for (const { p } of linhas) porEtapa[p.status] = (porEtapa[p.status] ?? 0) + 1;
  return (
    <section className="cartao overflow-hidden print:shadow-none print:border-0 print:rounded-none print:mb-4">
      <Cabecalho aberto={aberto} onToggle={onToggle}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-titulo font-bold text-lg leading-tight inline-flex items-center gap-2">
            <Icone nome="local" className="w-5 h-5 text-cyan-700" />
            {local === SEM_LOCAL ? 'Sem localização' : local}
          </h2>
          <span className="text-sm text-suave"><b className="text-tinta num">{linhas.length}</b> peças de <b className="text-tinta">{nObras}</b> {nObras === 1 ? 'obra' : 'obras'}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ORDEM.filter((s) => porEtapa[s]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1 text-xs text-suave">
              <span className={`w-2 h-2 rounded-full ${etapa(s).barra}`} aria-hidden />
              {etapa(s).rotulo} <b className="num text-tinta">{porEtapa[s]}</b>
            </span>
          ))}
        </div>
      </Cabecalho>

      <div className={aberto ? '' : 'hidden print:block'}>
        <ul className="md:hidden print:hidden divide-y divide-linha border-t border-linha">
          {linhas.map(({ obra, cx, p }) => (
            <li key={p.key} className="px-4 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold truncate">{obra.cliente}</p>
                <p className="text-xs text-apagado truncate num">{p.key} · {p.modelo} · {medidas(p)} · {cx.tipo}</p>
              </div>
              <EtapaChip status={p.status} curto />
            </li>
          ))}
        </ul>
        <div className="hidden md:block print:block overflow-x-auto print:overflow-visible border-t border-linha">
          <table className="tabela table-fixed min-w-[44rem]">
            <thead>
              <tr>
                <th className="w-[26%]">Obra</th><th className="w-[9%]">Entrega</th><th className="w-[17%]">Caixilho</th>
                <th className="w-[11%]">Peça</th><th className="w-[8%]">Modelo</th>
                <th className="w-[13%] text-right">Medidas (mm)</th><th className="w-[16%]">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ obra, cx, p }, i) => {
                const repete = i > 0 && linhas[i - 1].obra.key === obra.key;
                return (
                  <tr key={p.key}>
                    <td className={`truncate ${repete ? 'text-transparent' : 'font-semibold'}`} title={obra.cliente}>{obra.cliente}</td>
                    <td className={`num whitespace-nowrap ${repete ? 'text-transparent' : 'text-suave'}`}>{diaMes(obra.entrega)}</td>
                    <td>{cx.tipo || cx.key}</td>
                    <td className="num whitespace-nowrap">{p.key}</td>
                    <td>{p.modelo}</td>
                    <td className="num text-right whitespace-nowrap">{medidas(p)}</td>
                    <td><EtapaChip status={p.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
