'use client';
import { useEffect, useMemo, useState } from 'react';
import Topo from '@/components/Topo';
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
      <Topo>
        {rel && linhas.length > 0 && (
          <button type="button" onClick={() => window.print()} className="btn btn-secundario">
            <Icone nome="imprimir" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        )}
      </Topo>

      <div className="mx-auto max-w-6xl px-4 sm:px-5 py-4 print:p-0 print:max-w-none">
        <div className="nao-imprimir mb-4">
          <h1 className="text-[22px]">Localização das peças</h1>
          <p className="text-tinta-suave mt-1">Onde está cada peça das obras escolhidas, por obra ou por local. Pronto para imprimir.</p>
        </div>

        <div className="lg:grid lg:grid-cols-[19rem_1fr] lg:gap-5 print:block">

          {/* ── Escolha das obras ──────────────────────────────────────────── */}
          <aside className="nao-imprimir mb-4 lg:mb-0">
            <div className="cartao gap-3 lg:sticky lg:top-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2>Obras</h2>
                <span className="text-[13px] text-tinta-suave num">
                  {sel.length ? `${sel.length} escolhida${sel.length > 1 ? 's' : ''}` : 'nenhuma escolhida'}
                </span>
              </div>

              {!listaAberta && (
                <button type="button" onClick={() => setListaAberta(true)} className="btn btn-secundario lg:hidden">
                  Trocar as obras
                </button>
              )}

              <div className={`${listaAberta ? 'flex' : 'hidden'} lg:flex flex-col gap-2`}>
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar cliente ou pedido…"
                  aria-label="Buscar cliente ou pedido"
                  className="campo"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSel(obrasFiltradas.slice(0, MAX_OBRAS).map((o) => o.key))}
                    className="btn btn-secundario flex-1 min-h-[34px] py-1 text-[13px]"
                  >
                    Marcar {busca ? 'as achadas' : 'todas'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSel([])}
                    disabled={sel.length === 0}
                    className="btn btn-fantasma flex-1 min-h-[34px] py-1 text-[13px]"
                  >
                    Desmarcar
                  </button>
                </div>

                {carregandoObras && <p className="py-4 text-tinta-suave">Carregando obras…</p>}
                {erroObras && <p className="py-2 text-perigo text-[13px]">Não foi possível carregar as obras. ({erroObras.slice(0, 120)})</p>}

                <ul className="-mx-2 max-h-[55vh] lg:max-h-[calc(100vh-17rem)] overflow-y-auto">
                  {obrasFiltradas.map((o) => {
                    const dias = o.duedate ? diasEntre(hoje, o.duedate) : null;
                    return (
                      <li key={o.key}>
                        <label className="flex items-start gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-superficie-hover">
                          <input
                            type="checkbox"
                            checked={sel.includes(o.key)}
                            onChange={() => alternar(o.key)}
                            className="mt-0.5 w-4 h-4 shrink-0 accent-[color:var(--accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-sm leading-snug">{nomeObra(o)}</span>
                            <span className="block text-xs text-tinta-suave num">
                              {o.documento && <>{o.documento} · </>}
                              {o.duedate
                                ? <span className={dias !== null && dias < 0 ? 'text-perigo font-semibold' : ''}>
                                    entrega {dataCurta(o.duedate)}{dias !== null && dias < 0 ? ' · atrasada' : ''}
                                  </span>
                                : 'sem data de entrega'}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                  {!carregandoObras && obrasFiltradas.length === 0 && (
                    <li className="px-2 py-4 text-tinta-suave">Nenhuma obra encontrada.</li>
                  )}
                </ul>
                {sel.length > 0 && (
                  <button type="button" onClick={() => setListaAberta(false)} className="btn btn-primario lg:hidden">
                    Ver o relatório
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* ── Relatório ──────────────────────────────────────────────────── */}
          <main className="min-w-0 flex flex-col gap-4">
            {sel.length === 0 && (
              <div className="nao-imprimir rounded-lg2 border border-dashed border-linha-forte p-8 text-center text-tinta-suave">
                Escolha uma ou mais obras na lista para ver onde estão as peças.
              </div>
            )}

            {sel.length > 0 && (
              <>
                {/* Controles (não vão para o papel) */}
                <div className="nao-imprimir flex flex-wrap items-center gap-2">
                  <div className="segmentos" role="group" aria-label="Organizar por">
                    {(['obra', 'local'] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setVisao(v)} aria-pressed={visao === v}>
                        {v === 'obra' ? 'Por obra' : 'Por local'}
                      </button>
                    ))}
                  </div>
                  <div className="segmentos" role="group" aria-label="Quais peças">
                    {(['fabrica', 'todas'] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setMostrar(v)} aria-pressed={mostrar === v}>
                        {v === 'fabrica' ? 'Na fábrica' : 'Todas'}
                      </button>
                    ))}
                  </div>
                  {carregando && <span className="text-[13px] text-tinta-suave">Buscando as peças…</span>}
                </div>

                {erro && (
                  <p className="nao-imprimir rounded-lg bg-perigo-bg text-perigo px-4 py-3">
                    Não foi possível buscar as peças. Tente de novo. <span className="text-xs">({erro.slice(0, 160)})</span>
                  </p>
                )}

                {rel && (
                  <>
                    {/* Resumo — na tela; no papel vira o cabeçalho com o logo */}
                    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 print:border-b-2 print:border-black print:pb-2">
                      <div className="flex items-center gap-4">
                        <Logo className="hidden print:block h-7 w-auto" />
                        <div>
                          <p className="hidden print:block font-titulo text-[15pt] font-semibold">
                            Localização das peças · {visao === 'obra' ? 'por obra' : 'por local'}
                          </p>
                          <p className="text-[13px] text-tinta-suave">
                            {mostrar === 'fabrica' ? 'Peças ainda na fábrica' : 'Todas as peças, inclusive expedidas'}
                            {' · '}emitido em {emitido}
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] num">
                        <b>{rel.obras.length}</b> {rel.obras.length === 1 ? 'obra' : 'obras'} ·{' '}
                        <b>{linhas.length}</b> peças
                        {semLocal > 0 && <> · <b className="text-perigo print:text-black">{semLocal} sem local</b></>}
                      </p>
                    </div>

                    {linhas.length === 0 && (
                      <p className="text-tinta-suave py-4">
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
    </div>
  );
}

// ─── Peças visuais ───────────────────────────────────────────────────────────

const TD = 'print:py-1 print:px-2';
/** Colunas que somem na tela do celular (o papel e a tela grande mostram tudo) */
const SO_GRANDE = 'hidden md:table-cell print:table-cell';
/** Etiquetas viram texto simples no papel */
const TAG_PAPEL = 'print:bg-transparent print:p-0 print:text-black';

function Local({ loc }: { loc: string }) {
  return loc
    ? <span className={`tag bg-roxo-bg text-roxo num text-[13px] ${TAG_PAPEL} print:text-[11pt] print:font-bold`}>{loc}</span>
    : <span className="text-[13px] italic text-perigo print:text-black">sem local</span>;
}

function Situacao({ status }: { status: string }) {
  return <span className={`tag ${statusSelo(status)} ${TAG_PAPEL} print:font-normal`}>{statusLabel(status)}</span>;
}

/** Quadradinho para o conferente marcar à caneta */
function Conferir() {
  return <span className="inline-block w-4 h-4 border-[1.5px] border-tinta-suave rounded-[3px] align-middle print:border-black" aria-hidden />;
}

function Medidas({ p }: { p: PecaLoc }) {
  if (!p.largura && !p.altura) return <span className="text-tinta-suave">—</span>;
  return <span className="num whitespace-nowrap">{mm(p.largura)} × {mm(p.altura)}</span>;
}

function Peca({ p }: { p: PecaLoc }) {
  return (
    <>
      <span className="font-semibold">{p.modelo || 'Peça'}</span>
      <span className="block text-xs text-tinta-suave whitespace-nowrap num print:text-[8pt] print:text-black">{p.key}</span>
    </>
  );
}

/** Cartão de uma tabela: vira bloco simples no papel */
const BLOCO = 'bg-superficie border border-linha rounded-lg2 overflow-hidden print:border-0 print:rounded-none';

function PorObra({
  obras, visivel, hoje,
}: { obras: ObraLoc[]; visivel: (p: PecaLoc) => boolean; hoje: string }) {
  let primeira = true;
  return (
    <div className="flex flex-col gap-4 print:gap-0">
      {obras.map((o) => {
        const caixilhos = o.caixilhos
          .map((c) => ({ ...c, pecas: c.pecas.filter(visivel) }))
          .filter((c) => c.pecas.length > 0);
        if (caixilhos.length === 0) return null;
        const total = caixilhos.reduce((s, c) => s + c.pecas.length, 0);
        const semLoc = caixilhos.reduce((s, c) => s + c.pecas.filter((p) => !p.loc).length, 0);
        const dias = o.duedate ? diasEntre(hoje, o.duedate) : null;
        const quebra = primeira ? 'print:mt-4' : 'nova-pagina print:mt-4';
        primeira = false;
        return (
          <section key={o.key} className={`${BLOCO} ${quebra}`} aria-label={nomeObra(o)}>
            <div className="manter-junto px-4 pt-3.5 pb-3 border-b border-linha print:px-0">
              <h2 className="text-base print:text-[13pt]">{nomeObra(o)}</h2>
              <p className="text-[13px] text-tinta-suave print:text-black">
                {o.documento && <>Pedido <span className="num">{o.documento}</span> · </>}
                {o.duedate
                  ? <>Entrega <b className="text-tinta num">{dataLonga(o.duedate)}</b>
                      {dias !== null && <span className={dias < 0 ? 'text-perigo font-semibold print:text-black' : ''}> ({prazoRelativo(dias)})</span>}</>
                  : 'Sem data de entrega'}
                {' · '}{statusLabel(o.status)}
                {' · '}{total} peças{semLoc > 0 && <>, <b className="text-perigo print:text-black">{semLoc} sem local</b></>}
              </p>
            </div>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="tabela text-sm print:text-[10pt]">
                <thead>
                  <tr>
                    <th className={TD}>Caixilho</th>
                    <th className={TD}>Peça</th>
                    <th className={TD}>Local</th>
                    <th className={`${TD} num`}>Medidas (mm)</th>
                    <th className={`${TD} ${SO_GRANDE}`}>Cor</th>
                    <th className={TD}>Status</th>
                    <th className={`${TD} text-center ${SO_GRANDE}`}>Conf.</th>
                  </tr>
                </thead>
                {caixilhos.map((c) => (
                  // Um tbody por caixilho: a linha mais forte separa os grupos
                  <tbody key={c.key} className="border-t border-linha-forte">
                    {c.pecas.map((p, i) => (
                      <tr key={p.key}>
                        <td className={`${TD} font-semibold whitespace-nowrap align-top`}>{i === 0 ? (c.tipo || c.key) : ''}</td>
                        <td className={TD}><Peca p={p} /></td>
                        <td className={TD}><Local loc={p.loc} /></td>
                        <td className={`${TD} num`}><Medidas p={p} /></td>
                        <td className={`${TD} text-xs ${SO_GRANDE} print:text-[8.5pt]`}>{legivel(p.cor || c.cor)}</td>
                        <td className={TD}><Situacao status={p.status} /></td>
                        <td className={`${TD} text-center ${SO_GRANDE}`}><Conferir /></td>
                      </tr>
                    ))}
                  </tbody>
                ))}
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
    <div className="flex flex-col gap-4">
      {locais.map((loc) => {
        const itens = grupos.get(loc)!.sort((a, b) =>
          naturais(nomeObra(a.obra), nomeObra(b.obra)) || naturais(a.caixilho, b.caixilho) || naturais(a.peca.key, b.peca.key),
        );
        return (
          <section key={loc || '(sem local)'} className={`${BLOCO} print:mt-4`} aria-label={loc || 'Sem local'}>
            <h2 className="manter-junto flex items-center gap-2.5 px-4 pt-3.5 pb-3 border-b border-linha text-base print:px-0">
              {loc
                ? <span className={`tag bg-roxo-bg text-roxo num text-sm ${TAG_PAPEL} print:text-[14pt]`}>{loc}</span>
                : <span className="text-perigo print:text-black">Sem local</span>}
              <span className="text-[13px] font-normal text-tinta-suave print:text-black">
                {itens.length} {itens.length === 1 ? 'peça' : 'peças'}
              </span>
            </h2>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="tabela text-sm print:text-[10pt]">
                <thead>
                  <tr>
                    <th className={TD}>Obra</th>
                    <th className={TD}>Caixilho</th>
                    <th className={TD}>Peça</th>
                    <th className={`${TD} num`}>Medidas (mm)</th>
                    <th className={`${TD} ${SO_GRANDE}`}>Cor</th>
                    <th className={TD}>Status</th>
                    <th className={`${TD} text-center ${SO_GRANDE}`}>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((l) => (
                    <tr key={l.peca.key}>
                      <td className={TD}>
                        <span className="font-semibold leading-snug">{nomeObra(l.obra)}</span>
                        {l.obra.documento && <span className="block text-xs text-tinta-suave num print:text-[8pt] print:text-black">{l.obra.documento}</span>}
                      </td>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>{l.caixilho}</td>
                      <td className={TD}><Peca p={l.peca} /></td>
                      <td className={`${TD} num`}><Medidas p={l.peca} /></td>
                      <td className={`${TD} text-xs ${SO_GRANDE} print:text-[8.5pt]`}>{legivel(l.peca.cor)}</td>
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
