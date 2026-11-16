'use client';
import { useEffect, useMemo, useState } from 'react';
import CabecalhoGestao from '@/components/CabecalhoGestao';
import Icone from '@/components/Icone';
import Logo from '@/components/Logo';
import { canonicalStatus, statusLabel, statusSelo } from '@/lib/status';
import type { ObraLoc, PecaLoc } from '@/lib/tipos';
import {
  dataCurta, dataLonga, diasEntre, hojeISO, legivel, mm, nomeObra, prazoRelativo,
} from '@/lib/formato';

/**
 * Relatório de localização para o PCP: onde está cada peça das obras
 * escolhidas, por obra ou por local, pronto para imprimir em A4 deitado.
 */

interface ObraResumo {
  key: string; summary: string; status: string; duedate: string | null;
  cliente: string; documento: string;
}

/** Mesmo limite da API */
const MAX_OBRAS = 40;

interface Linha { obra: ObraLoc; caixilho: string; peca: PecaLoc }

const naturais = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

export default function LocalizacaoPage() {
  const [obras, setObras] = useState<ObraResumo[]>([]);
  const [carregandoObras, setCarregandoObras] = useState(true);
  const [erroObras, setErroObras] = useState('');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [listaAberta, setListaAberta] = useState(true);

  const [rel, setRel] = useState<{ obras: ObraLoc[]; geradoEm: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [visao, setVisao] = useState<'obra' | 'local'>('obra');
  const [mostrar, setMostrar] = useState<'fabrica' | 'todas'>('fabrica');

  const hoje = hojeISO();

  // Obras escolhidas ficam no endereço: dá para salvar o link ou mandar para alguém
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const ini = (p.get('obras') ?? '').split(',').filter(Boolean);
    if (ini.length) { setSel(ini); setListaAberta(false); }
    if (p.get('visao') === 'local') setVisao('local');
    if (p.get('mostrar') === 'todas') setMostrar('todas');

    fetch('/api/epicos')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setObras(Array.isArray(data) ? data : []);
      })
      .catch((e) => setErroObras(String(e)))
      .finally(() => setCarregandoObras(false));
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (sel.length) p.set('obras', sel.join(','));
    if (visao === 'local') p.set('visao', 'local');
    if (mostrar === 'todas') p.set('mostrar', 'todas');
    const q = p.toString();
    history.replaceState(null, '', q ? `?${q}` : location.pathname);
  }, [sel, visao, mostrar]);

  // Busca as peças quando a seleção para de mudar
  useEffect(() => {
    if (sel.length === 0) { setRel(null); setErro(''); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setCarregando(true);
      setErro('');
      try {
        const res = await fetch(`/api/localizacao?obras=${sel.join(',')}`, { signal: ctrl.signal });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setRel(data);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setErro(String(e));
      } finally {
        if (!ctrl.signal.aborted) setCarregando(false);
      }
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [sel]);

  const obrasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return obras;
    return obras.filter((o) =>
      [o.key, o.summary, o.cliente, o.documento].some((v) => v.toLowerCase().includes(q)),
    );
  }, [obras, busca]);

  const alternar = (k: string) =>
    setSel((s) => s.includes(k) ? s.filter((x) => x !== k) : s.length >= MAX_OBRAS ? s : [...s, k]);

  /** Peças que entram no relatório, já filtradas */
  const visivel = (p: PecaLoc) => mostrar === 'todas' || canonicalStatus(p.status) !== 'Expedido';

  const linhas: Linha[] = useMemo(() => {
    if (!rel) return [];
    return rel.obras.flatMap((o) =>
      o.caixilhos.flatMap((c) => c.pecas.filter(visivel).map((p) => ({ obra: o, caixilho: c.tipo || c.key, peca: p }))),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel, mostrar]);

  const semLocal = linhas.filter((l) => !l.peca.loc).length;
  const emitido = rel ? new Date(rel.geradoEm).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';

  return (
    <div className="min-h-screen">
      <CabecalhoGestao titulo="Localização das peças">
        {rel && linhas.length > 0 && (
          <button
            onClick={() => window.print()}
            className="h-11 px-4 rounded-xl bg-white text-marca text-base font-bold flex items-center gap-2 hover:bg-marca-50"
          >
            <Icone nome="imprimir" className="w-5 h-5" />
            Imprimir
          </button>
        )}
      </CabecalhoGestao>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 lg:grid lg:grid-cols-[20rem_1fr] lg:gap-8 print:block print:p-0">

        {/* ── Escolha das obras ──────────────────────────────────────────── */}
        <aside className="nao-imprimir mb-6 lg:mb-0">
          <div className="lg:sticky lg:top-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold">Obras</h2>
              <span className="text-base text-tinta-suave num">
                {sel.length ? `${sel.length} escolhida${sel.length > 1 ? 's' : ''}` : 'nenhuma escolhida'}
              </span>
            </div>

            {!listaAberta ? (
              <button
                onClick={() => setListaAberta(true)}
                className="mt-3 w-full h-12 rounded-xl border-2 border-linha bg-white text-base font-bold lg:hidden"
              >
                Trocar as obras
              </button>
            ) : null}

            <div className={`${listaAberta ? '' : 'hidden'} lg:block`}>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente ou pedido"
                aria-label="Buscar cliente ou pedido"
                className="mt-3 w-full h-12 rounded-xl border-2 border-linha bg-white px-3 text-base outline-none focus:border-marca-600"
              />
              <div className="mt-2 flex gap-2 text-base">
                <button
                  onClick={() => setSel(obrasFiltradas.slice(0, MAX_OBRAS).map((o) => o.key))}
                  className="flex-1 h-11 rounded-xl border-2 border-linha bg-white font-bold"
                >
                  Marcar {busca ? 'as achadas' : 'todas'}
                </button>
                <button
                  onClick={() => setSel([])}
                  disabled={sel.length === 0}
                  className="flex-1 h-11 rounded-xl border-2 border-linha bg-white font-bold disabled:opacity-40"
                >
                  Desmarcar
                </button>
              </div>

              {carregandoObras && <p className="py-6 text-tinta-suave">Carregando obras…</p>}
              {erroObras && <p className="py-4 text-red-800">Não foi possível carregar as obras. ({erroObras.slice(0, 120)})</p>}

              <ul className="mt-3 max-h-[60vh] lg:max-h-[calc(100vh-15rem)] overflow-y-auto divide-y divide-linha border-y border-linha bg-white">
                {obrasFiltradas.map((o) => {
                  const dias = o.duedate ? diasEntre(hoje, o.duedate) : null;
                  return (
                    <li key={o.key}>
                      <label className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-marca-50">
                        <input
                          type="checkbox"
                          checked={sel.includes(o.key)}
                          onChange={() => alternar(o.key)}
                          className="mt-1 w-6 h-6 shrink-0 accent-marca"
                        />
                        <span className="min-w-0">
                          <span className="block font-bold leading-snug">{nomeObra(o)}</span>
                          <span className="block text-sm text-tinta-suave">
                            {o.documento && <>Pedido {o.documento} · </>}
                            {o.duedate
                              ? <span className={dias !== null && dias < 0 ? 'text-red-800 font-bold' : ''}>
                                  entrega {dataCurta(o.duedate)}{dias !== null && dias < 0 ? ' (atrasada)' : ''}
                                </span>
                              : 'sem data de entrega'}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
                {!carregandoObras && obrasFiltradas.length === 0 && (
                  <li className="px-3 py-6 text-tinta-suave">Nenhuma obra encontrada.</li>
                )}
              </ul>
              {sel.length > 0 && (
                <button
                  onClick={() => setListaAberta(false)}
                  className="mt-3 w-full h-12 rounded-xl bg-marca text-white font-bold lg:hidden"
                >
                  Ver o relatório
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* ── Relatório ──────────────────────────────────────────────────── */}
        <main className="min-w-0">
          {sel.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-linha p-8 text-center text-lg text-tinta-suave nao-imprimir">
              Escolha uma ou mais obras na lista para ver onde estão as peças.
            </div>
          )}

          {sel.length > 0 && (
            <>
              {/* Controles (não vão para o papel) */}
              <div className="nao-imprimir flex flex-wrap items-center gap-3 mb-5">
                <div className="inline-flex rounded-xl border-2 border-marca overflow-hidden" role="group" aria-label="Organizar por">
                  {(['obra', 'local'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVisao(v)}
                      aria-pressed={visao === v}
                      className={`h-11 px-4 text-base font-bold ${visao === v ? 'bg-marca text-white' : 'bg-white text-marca'}`}
                    >
                      {v === 'obra' ? 'Por obra' : 'Por local'}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-xl border-2 border-linha overflow-hidden" role="group" aria-label="Quais peças">
                  {(['fabrica', 'todas'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setMostrar(v)}
                      aria-pressed={mostrar === v}
                      className={`h-11 px-4 text-base font-bold ${mostrar === v ? 'bg-marca-100 text-marca' : 'bg-white text-tinta-suave'}`}
                    >
                      {v === 'fabrica' ? 'Ainda na fábrica' : 'Todas, até expedidas'}
                    </button>
                  ))}
                </div>
                {carregando && <span className="text-base text-tinta-suave">Buscando as peças…</span>}
              </div>

              {erro && (
                <p className="nao-imprimir rounded-xl bg-red-50 border-2 border-red-300 p-4 text-red-900">
                  Não foi possível buscar as peças. Tente de novo. <span className="text-sm">({erro.slice(0, 160)})</span>
                </p>
              )}

              {rel && (
                <>
                  {/* Cabeçalho do relatório — na tela e no papel */}
                  <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b-[3px] border-marca pb-3 mb-5">
                    <div className="flex items-center gap-4">
                      <Logo className="h-8 w-auto text-marca hidden print:block" />
                      <div>
                        <p className="text-2xl font-bold leading-tight">
                          Localização das peças · {visao === 'obra' ? 'por obra' : 'por local'}
                        </p>
                        <p className="text-base text-tinta-suave">
                          {mostrar === 'fabrica' ? 'Peças ainda na fábrica' : 'Todas as peças, inclusive expedidas'}
                          {' · '}emitido em {emitido}
                        </p>
                      </div>
                    </div>
                    <p className="text-base num">
                      <b>{rel.obras.length}</b> {rel.obras.length === 1 ? 'obra' : 'obras'} ·{' '}
                      <b>{linhas.length}</b> peças
                      {semLocal > 0 && <> · <b className="text-red-800">{semLocal} sem local</b></>}
                    </p>
                  </div>

                  {linhas.length === 0 && (
                    <p className="text-lg text-tinta-suave py-6">
                      {mostrar === 'fabrica'
                        ? 'Nenhuma peça na fábrica: tudo o que foi escolhido já foi expedido.'
                        : 'Essas obras ainda não têm peças cadastradas.'}
                    </p>
                  )}

                  {visao === 'obra'
                    ? <PorObra obras={rel.obras} visivel={visivel} hoje={hoje} />
                    : <PorLocal linhas={linhas} />}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Peças visuais ───────────────────────────────────────────────────────────

const TH = 'text-left font-bold text-sm uppercase tracking-wide text-tinta-suave px-2 py-2 print:text-[8.5pt] print:text-black';
const TD = 'px-2 py-2.5 align-top print:py-1.5';
/** Colunas que somem na tela do celular (o papel e a tela grande mostram tudo) */
const SO_GRANDE = 'hidden md:table-cell print:table-cell';

function Local({ loc }: { loc: string }) {
  return loc
    ? <span className="inline-block rounded-md bg-cyan-800 text-white px-2 font-bold num print:bg-transparent print:text-black print:p-0 print:text-[11pt]">{loc}</span>
    : <span className="italic text-red-800 print:text-black">sem local</span>;
}

function Situacao({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-md px-2 font-bold whitespace-nowrap print:bg-transparent print:p-0 print:font-normal ${statusSelo(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

/** Quadradinho para o conferente marcar à caneta */
function Conferir() {
  return <span className="inline-block w-5 h-5 border-2 border-tinta rounded-sm align-middle" aria-hidden />;
}

function Medidas({ p }: { p: PecaLoc }) {
  if (!p.largura && !p.altura) return <span className="text-tinta-suave">—</span>;
  return <span className="num whitespace-nowrap">{mm(p.largura)} × {mm(p.altura)}</span>;
}

function PorObra({
  obras, visivel, hoje,
}: { obras: ObraLoc[]; visivel: (p: PecaLoc) => boolean; hoje: string }) {
  let primeira = true;
  return (
    <div className="flex flex-col gap-10 print:gap-0">
      {obras.map((o) => {
        const caixilhos = o.caixilhos
          .map((c) => ({ ...c, pecas: c.pecas.filter(visivel) }))
          .filter((c) => c.pecas.length > 0);
        if (caixilhos.length === 0) return null;
        const total = caixilhos.reduce((s, c) => s + c.pecas.length, 0);
        const semLoc = caixilhos.reduce((s, c) => s + c.pecas.filter((p) => !p.loc).length, 0);
        const dias = o.duedate ? diasEntre(hoje, o.duedate) : null;
        const quebra = primeira ? '' : 'nova-pagina';
        primeira = false;
        return (
          <section key={o.key} className={quebra} aria-label={nomeObra(o)}>
            <div className="manter-junto mb-2">
              <h2 className="text-2xl font-bold leading-tight print:text-[14pt]">{nomeObra(o)}</h2>
              <p className="text-base text-tinta-suave print:text-black">
                {o.documento && <>Pedido <b className="text-tinta">{o.documento}</b> · </>}
                {o.duedate
                  ? <>Entrega <b className="text-tinta">{dataLonga(o.duedate)}</b>
                      {dias !== null && <span className={dias < 0 ? 'text-red-800 font-bold' : ''}> ({prazoRelativo(dias)})</span>}</>
                  : 'Sem data de entrega'}
                {' · '}{statusLabel(o.status)}
                {' · '}{total} peças{semLoc > 0 && <>, <b className="text-red-800 print:text-black">{semLoc} sem local</b></>}
              </p>
            </div>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full md:min-w-[40rem] text-base border-collapse print:text-[10pt]">
                <thead>
                  <tr className="border-b-2 border-tinta">
                    <th className={TH}>Caixilho</th>
                    <th className={TH}>Peça</th>
                    <th className={TH}>Local</th>
                    <th className={`${TH} text-right`}>Medidas (mm)</th>
                    <th className={`${TH} ${SO_GRANDE}`}>Cor</th>
                    <th className={TH}>Situação</th>
                    <th className={`${TH} text-center ${SO_GRANDE}`}>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {caixilhos.map((c) =>
                    c.pecas.map((p, i) => (
                      <tr key={p.key} className={i === 0 ? 'border-t-2 border-slate-400' : 'border-t border-linha'}>
                        <td className={`${TD} font-bold whitespace-nowrap`}>{i === 0 ? (c.tipo || c.key) : ''}</td>
                        <td className={TD}>
                          <span className="font-bold">{p.modelo || 'Peça'}</span>
                          <span className="block text-sm text-tinta-suave whitespace-nowrap print:text-[8pt] print:text-black">{p.key}</span>
                        </td>
                        <td className={TD}><Local loc={p.loc} /></td>
                        <td className={`${TD} text-right`}><Medidas p={p} /></td>
                        <td className={`${TD} text-sm print:text-[8.5pt] ${SO_GRANDE}`}>{legivel(p.cor || c.cor)}</td>
                        <td className={TD}><Situacao status={p.status} /></td>
                        <td className={`${TD} text-center ${SO_GRANDE}`}><Conferir /></td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PorLocal({ linhas }: { linhas: Linha[] }) {
  const grupos = new Map<string, Linha[]>();
  for (const l of linhas) grupos.set(l.peca.loc, [...(grupos.get(l.peca.loc) ?? []), l]);
  // Locais em ordem (C01, C02… D01…); "sem local" no fim, para não sumir
  const locais = [...grupos.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : naturais(a, b)));

  return (
    <div className="flex flex-col gap-8">
      {locais.map((loc) => {
        const itens = grupos.get(loc)!.sort((a, b) =>
          naturais(nomeObra(a.obra), nomeObra(b.obra)) || naturais(a.caixilho, b.caixilho) || naturais(a.peca.key, b.peca.key),
        );
        return (
          <section key={loc || '(sem local)'} aria-label={loc || 'Sem local'}>
            <h2 className="manter-junto flex items-baseline gap-3 mb-2">
              {loc
                ? <span className="rounded-lg bg-cyan-800 text-white px-3 text-2xl font-bold num print:bg-transparent print:text-black print:px-0 print:text-[15pt]">{loc}</span>
                : <span className="text-2xl font-bold text-red-800 print:text-black">Sem local</span>}
              <span className="text-lg text-tinta-suave print:text-black">{itens.length} {itens.length === 1 ? 'peça' : 'peças'}</span>
            </h2>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full md:min-w-[40rem] text-base border-collapse print:text-[10pt]">
                <thead>
                  <tr className="border-b-2 border-tinta">
                    <th className={TH}>Obra</th>
                    <th className={TH}>Caixilho</th>
                    <th className={TH}>Peça</th>
                    <th className={`${TH} text-right`}>Medidas (mm)</th>
                    <th className={`${TH} ${SO_GRANDE}`}>Cor</th>
                    <th className={TH}>Situação</th>
                    <th className={`${TH} text-center ${SO_GRANDE}`}>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((l) => (
                    <tr key={l.peca.key} className="border-t border-linha">
                      <td className={TD}>
                        <span className="font-bold leading-snug">{nomeObra(l.obra)}</span>
                        {l.obra.documento && <span className="block text-sm text-tinta-suave print:text-[8pt] print:text-black">{l.obra.documento}</span>}
                      </td>
                      <td className={`${TD} font-bold whitespace-nowrap`}>{l.caixilho}</td>
                      <td className={TD}>
                        <span className="font-bold">{l.peca.modelo || 'Peça'}</span>
                        <span className="block text-sm text-tinta-suave whitespace-nowrap print:text-[8pt] print:text-black">{l.peca.key}</span>
                      </td>
                      <td className={`${TD} text-right`}><Medidas p={l.peca} /></td>
                      <td className={`${TD} text-sm print:text-[8.5pt] ${SO_GRANDE}`}>{legivel(l.peca.cor)}</td>
                      <td className={TD}><Situacao status={l.peca.status} /></td>
                      <td className={`${TD} text-center ${SO_GRANDE}`}><Conferir /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
