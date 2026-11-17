'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, Printer, RefreshCw, Search } from 'lucide-react';
import AppShell, { Button, Panel } from '@/components/AppShell';
import Logo from '@/components/Logo';
import StatusBadge from '@/components/StatusBadge';
import { usePolling } from '@/components/usePolling';
import { STATUS_ORDER, stageLabel } from '@/lib/status';
import type { ObraResumo, QuadroRelatorio, Relatorio } from '@/lib/tiposApi';
import { diaMes, plural, prazoRelativo } from '@/lib/formato';

type Agrupar = 'obra' | 'local';
/** "fabrica" = tudo menos Expedido: o que ainda está fisicamente na fábrica */
type Etapa = 'fabrica' | 'todas' | (typeof STATUS_ORDER)[number];

interface Linha extends QuadroRelatorio { obra: ObraResumo }

const SEM_LOCAL = 'Sem local';
const porTexto = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

/**
 * Relatório do PCP: onde estão as peças de cada obra. Agrupa por obra ou por
 * localização, filtra, e imprime em A4 exatamente o que está na tela.
 */
export default function RelatorioQuadros() {
  const { data, error, loading, reload } = usePolling<Relatorio>('/api/relatorio');
  const [agrupar, setAgrupar] = useState<Agrupar>('obra');
  const [busca, setBusca] = useState('');
  const [local, setLocal] = useState('');
  const [etapa, setEtapa] = useState<Etapa>('fabrica');

  const linhas = useMemo<Linha[]>(
    () => (data?.obras ?? []).flatMap((g) => g.quadros.map((q) => ({ ...q, obra: g.obra }))),
    [data],
  );
  const locais = useMemo(() => [...new Set(linhas.map((l) => l.loc).filter(Boolean))].sort(porTexto), [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) =>
      (etapa === 'todas' || (etapa === 'fabrica' ? l.status !== 'Expedido' : l.status === etapa)) &&
      (!local || (local === SEM_LOCAL ? !l.loc : l.loc === local)) &&
      (!q || `${l.key} ${l.caixilho} ${l.caixilhoNome} ${l.obra.key} ${l.obra.cliente} ${l.obra.documento}`.toLowerCase().includes(q)),
    );
  }, [linhas, busca, local, etapa]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Linha[]>();
    for (const l of filtradas) {
      const k = agrupar === 'obra' ? l.obra.key : l.loc || SEM_LOCAL;
      const g = mapa.get(k) ?? [];
      g.push(l);
      mapa.set(k, g);
    }
    const lista = [...mapa.entries()].map(([chave, itens]) => ({ chave, itens }));
    if (agrupar === 'obra') {
      // Mesma ordem da API: entrega mais próxima primeiro
      const ordem = new Map((data?.obras ?? []).map((g, i) => [g.obra.key, i]));
      lista.sort((a, b) => (ordem.get(a.chave) ?? 0) - (ordem.get(b.chave) ?? 0));
      for (const g of lista) g.itens.sort((a, b) => (!a.loc !== !b.loc ? (a.loc ? -1 : 1) : porTexto(a.loc, b.loc) || porTexto(a.key, b.key)));
    } else {
      lista.sort((a, b) => (a.chave === SEM_LOCAL ? 1 : b.chave === SEM_LOCAL ? -1 : porTexto(a.chave, b.chave)));
      const ordem = new Map((data?.obras ?? []).map((g, i) => [g.obra.key, i]));
      for (const g of lista) g.itens.sort((a, b) => (ordem.get(a.obra.key)! - ordem.get(b.obra.key)!) || porTexto(a.key, b.key));
    }
    return lista;
  }, [filtradas, agrupar, data]);

  const nObras = new Set(filtradas.map((l) => l.obra.key)).size;
  const filtrosTexto = [
    etapa === 'fabrica' ? 'na fábrica (sem expedidos)' : etapa === 'todas' ? 'todas as etapas' : stageLabel(etapa),
    local && `local ${local}`,
    busca.trim() && `busca “${busca.trim()}”`,
  ].filter(Boolean).join(' · ');

  return (
    <AppShell
      title="Relatório de quadros"
      actions={
        <>
          <Button variant="ghost" onClick={reload} disabled={loading} aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          </Button>
          <Button onClick={() => window.print()} disabled={!data || filtradas.length === 0}>
            <Printer className="h-4 w-4" strokeWidth={2} /> <span className="max-sm:hidden print:!table-cell">Imprimir</span>
          </Button>
        </>
      }
    >
      {/* Cabeçalho que só aparece no papel */}
      <div className="mb-4 hidden items-end justify-between border-b border-slate-300 pb-3 print:flex">
        <div className="flex items-center gap-4">
          <Logo className="w-28 text-brand" />
          <div>
            <p className="text-lg font-semibold">Relatório de quadros · por {agrupar === 'obra' ? 'obra' : 'localização'}</p>
            <p className="text-xs text-slate-600">{filtradas.length} quadros · {nObras} obras · {filtrosTexto}</p>
          </div>
        </div>
        <p className="text-xs text-slate-600">Emitido em {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Obra, cliente, documento, quadro ou caixilho…" aria-label="Buscar"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base outline-none focus:border-brand focus:ring-1 focus:ring-brand lg:text-sm"
          />
        </div>
        <Seletor label="Local" value={local} onChange={setLocal}
          options={[['', 'Todos'], ...locais.map((l) => [l, l] as [string, string]), [SEM_LOCAL, SEM_LOCAL]]} />
        <Seletor label="Etapa" value={etapa} onChange={(v) => setEtapa(v as Etapa)}
          options={[['fabrica', 'Na fábrica'], ['todas', 'Todas'], ...STATUS_ORDER.map((s) => [s, stageLabel(s)] as [string, string])]} />
        <div role="radiogroup" aria-label="Agrupar por" className="flex h-10 rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(['obra', 'local'] as const).map((a) => (
            <button key={a} role="radio" aria-checked={agrupar === a} onClick={() => setAgrupar(a)}
              className={`rounded-md px-3 font-medium transition-colors ${agrupar === a ? 'bg-brand text-white' : 'text-slate-600 hover:text-slate-900'}`}>
              Por {a}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <span><b className="font-semibold">Não foi possível falar com o Jira</b> — {data ? 'mostrando os últimos dados.' : 'tente atualizar.'} <span className="text-amber-800">({error.slice(0, 140)})</span></span>
        </div>
      )}
      {!data && !error && (
        <p className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando quadros de todas as obras…</p>
      )}

      {data && (
        <>
          <p className="mb-3 text-sm text-slate-600 print:hidden">
            <b className="font-semibold text-slate-900">{filtradas.length}</b> quadros em <b className="font-semibold text-slate-900">{nObras}</b> obras
          </p>
          {grupos.length === 0 ? (
            <Panel className="px-5 py-10 text-center text-sm text-slate-500">Nenhum quadro com esses filtros.</Panel>
          ) : (
            <div className="space-y-4 print:space-y-3">
              {grupos.map((g) => agrupar === 'obra'
                ? <GrupoObra key={g.chave} itens={g.itens} />
                : <GrupoLocal key={g.chave} local={g.chave} itens={g.itens} />)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function Seletor({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>;
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`mt-1 block h-10 min-w-36 rounded-lg border bg-white px-2.5 text-base outline-none focus:border-brand focus:ring-1 focus:ring-brand lg:text-sm ${value && value !== 'fabrica' ? 'border-brand font-medium text-brand' : 'border-slate-300 text-slate-900'}`}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

const th = 'px-3 py-2 font-medium print:px-1.5 print:py-1';
const td = 'px-3 py-1.5 print:px-1.5 print:py-0.5';

function Medidas({ q }: { q: QuadroRelatorio }) {
  return q.largura || q.altura ? <>{q.largura} × {q.altura}</> : <span className="text-slate-400">—</span>;
}

function Local({ loc }: { loc: string }) {
  return loc
    ? <span className="whitespace-nowrap rounded-md bg-cyan-700 px-1.5 py-0.5 font-mono text-xs font-semibold text-white print:border print:border-slate-800 print:bg-white print:text-slate-900">{loc}</span>
    : <span className="text-slate-400">—</span>;
}

function GrupoObra({ itens }: { itens: Linha[] }) {
  const o = itens[0].obra;
  const atrasada = o.diasParaEntrega !== null && o.diasParaEntrega < 0 && o.situacao !== 'concluida';
  return (
    <Panel className="overflow-hidden print:break-inside-auto print:rounded-none print:border-slate-400 print:shadow-none">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5 print:break-after-avoid print:px-2 print:py-1.5">
        <p className="min-w-0 font-semibold text-slate-900">{o.cliente}</p>
        <p className="font-mono text-xs text-slate-600">{o.key}{o.documento && ` · doc ${o.documento}`}</p>
        <p className={`text-sm ${atrasada ? 'font-medium text-red-700' : 'text-slate-600'}`}>
          Entrega {o.duedate ? `${diaMes(o.duedate)} (${prazoRelativo(o.diasParaEntrega)})` : 'sem data'}
        </p>
        <p className="ml-auto flex items-center gap-3 text-sm text-slate-600">
          {o.pct}% pronto · {plural(itens.length, 'quadro', 'quadros')} <StatusBadge status={o.status} />
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm lg:table-fixed print:table-auto print:text-[8.5pt]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className={`${th} w-28`}>Quadro</th><th className={`${th} w-28 max-md:hidden print:!table-cell`}>Caixilho</th><th className={`${th} w-20`}>Modelo</th>
              <th className={`${th} w-36 max-sm:hidden print:!table-cell`}>Tipo</th><th className={`${th} w-32 max-sm:hidden print:!table-cell`}>Medidas (mm)</th><th className={`${th} max-lg:hidden print:!table-cell`}>Cor</th>
              <th className={`${th} w-24`}>Local</th><th className={`${th} w-32 text-right`}>Etapa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {itens.map((q) => (
              <tr key={q.key} className="break-inside-avoid">
                <td className={`${td} whitespace-nowrap font-mono font-medium text-slate-900`}>{q.key}</td>
                <td className={`${td} max-md:hidden print:!table-cell whitespace-nowrap font-mono text-xs text-slate-600`}>{q.caixilho}</td>
                <td className={`${td} text-slate-700`}>{q.modelo || '—'}</td>
                <td className={`${td} max-sm:hidden print:!table-cell text-slate-700`}>{q.tipo || '—'}</td>
                <td className={`${td} max-sm:hidden print:!table-cell whitespace-nowrap text-slate-700`}><Medidas q={q} /></td>
                <td className={`${td} max-lg:hidden print:!table-cell text-slate-700`}>{q.cor || '—'}</td>
                <td className={td}><Local loc={q.loc} /></td>
                <td className={`${td} text-right`}><StatusBadge status={q.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function GrupoLocal({ local, itens }: { local: string; itens: Linha[] }) {
  const nObras = new Set(itens.map((i) => i.obra.key)).size;
  return (
    <Panel className="overflow-hidden print:rounded-none print:border-slate-400 print:shadow-none">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5 print:break-after-avoid print:px-2 print:py-1.5">
        <MapPin className="h-4 w-4 text-cyan-700" strokeWidth={2} />
        {local === SEM_LOCAL ? <p className="font-semibold text-slate-700">{SEM_LOCAL}</p> : <Local loc={local} />}
        <p className="text-sm text-slate-600">{plural(itens.length, 'quadro', 'quadros')} · {plural(nObras, 'obra', 'obras')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm lg:table-fixed print:table-auto print:text-[8.5pt]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className={`${th} w-28`}>Quadro</th><th className={th}>Obra</th><th className={`${th} w-28 max-md:hidden print:!table-cell`}>Caixilho</th>
              <th className={`${th} w-20`}>Modelo</th><th className={`${th} w-36 max-sm:hidden print:!table-cell`}>Tipo</th><th className={`${th} w-32 max-sm:hidden print:!table-cell`}>Medidas (mm)</th>
              <th className={`${th} w-20 max-lg:hidden print:!table-cell`}>Entrega</th><th className={`${th} w-32 text-right`}>Etapa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {itens.map((q) => (
              <tr key={q.key} className="break-inside-avoid">
                <td className={`${td} whitespace-nowrap font-mono font-medium text-slate-900`}>{q.key}</td>
                <td className={`${td} text-slate-800`}>
                  <span className="block max-w-[16rem] truncate print:max-w-none print:whitespace-normal">{q.obra.cliente}</span>
                  <span className="font-mono text-xs text-slate-500">{q.obra.key}</span>
                </td>
                <td className={`${td} max-md:hidden print:!table-cell whitespace-nowrap font-mono text-xs text-slate-600`}>{q.caixilho}</td>
                <td className={`${td} text-slate-700`}>{q.modelo || '—'}</td>
                <td className={`${td} max-sm:hidden print:!table-cell text-slate-700`}>{q.tipo || '—'}</td>
                <td className={`${td} max-sm:hidden print:!table-cell whitespace-nowrap text-slate-700`}><Medidas q={q} /></td>
                <td className={`${td} max-lg:hidden print:!table-cell whitespace-nowrap text-slate-700`}>{q.obra.duedate ? diaMes(q.obra.duedate) : '—'}</td>
                <td className={`${td} text-right`}><StatusBadge status={q.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
