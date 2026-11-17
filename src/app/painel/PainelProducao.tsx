'use client';
import { AlertTriangle, CalendarClock, Hammer, Loader2, Target } from 'lucide-react';
import Logo from '@/components/Logo';
import { usePolling } from '@/components/usePolling';
import type { ObraResumo, Producao } from '@/lib/tiposApi';
import { brl, brlCurto, diaMes, hora, nomeMes, num, plural, prazoRelativo } from '@/lib/formato';

const POLL_MS = 30_000;

/**
 * Painel da produção na TV do galpão (1920×1080, lido a metros, luz forte).
 * Uma peça de cor domina a tela: o bloco da meta em azul-marinho da marca.
 * O resto é branco e cinza, e as cores de etapa aparecem só como dado.
 * Vermelho é exclusivo de atraso.
 */
export default function PainelProducao() {
  const { data, error } = usePolling<Producao>('/api/producao', POLL_MS);

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 text-slate-600">
        <Logo className="w-48 text-brand" />
        {error
          ? <p className="flex max-w-3xl items-center gap-3 text-2xl text-amber-900"><AlertTriangle className="h-7 w-7 shrink-0" /> Sem conexão com o Jira. Tentando de novo… <span className="text-base text-amber-800">({error.slice(0, 120)})</span></p>
          : <p className="flex items-center gap-3 text-2xl"><Loader2 className="h-7 w-7 animate-spin" /> Carregando painel…</p>}
      </div>
    );
  }

  const d = data;
  const pctMeta = d.meta ? d.realizado.valor / d.meta : 0;
  const pctEsperado = d.meta ? d.ritmo.esperadoAteHoje / d.meta : 0;
  const noRitmo = d.realizado.valor >= d.ritmo.esperadoAteHoje;
  const falta = Math.max(d.meta - d.realizado.valor, 0);
  const diasRestantes = Math.max(d.ritmo.diasUteis - d.ritmo.diasDecorridos, 0);
  const me = d.mesEntrega;

  return (
    <div className="flex h-screen min-h-[720px] flex-col gap-5 overflow-hidden bg-slate-100 p-6 text-slate-900 [font-variant-numeric:proportional-nums]">
      {/* Topo */}
      <header className="flex items-center gap-5">
        <Logo className="w-32 text-brand" />
        <span className="h-9 w-px bg-slate-300" aria-hidden />
        <h1 className="text-3xl font-semibold tracking-tight">Produção · {nomeMes(d.mes)}</h1>
        <div className="ml-auto flex items-center gap-4 text-xl text-slate-600">
          {error && (
            <span className="flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 font-medium text-amber-900">
              <AlertTriangle className="h-5 w-5" /> Sem conexão · dados das {hora(d.fetchedAt)}
            </span>
          )}
          {!error && <span>atualizado às {hora(d.fetchedAt)}</span>}
        </div>
      </header>

      {/* Meta + números do mês */}
      <section className="grid grid-cols-[1.3fr_1fr] gap-5">
        <div className="flex flex-col justify-between rounded-3xl bg-brand p-9 text-white shadow-pop">
          <div>
            <p className="flex items-center gap-3 text-2xl font-medium text-white/75">
              <Target className="h-7 w-7" strokeWidth={2} /> Meta de produção de {nomeMes(d.mes)}
            </p>
            <p className="mt-3 text-[104px] font-semibold leading-none tracking-tight">{brl(d.realizado.valor)}</p>
            <p className="mt-3 text-3xl text-white/80">
              de {brl(d.meta)} · <b className="font-semibold text-white">{Math.round(pctMeta * 100)}% da meta</b>
            </p>
          </div>

          {/* Medidor: a marca branca é onde a produção deveria estar hoje */}
          <div className="mt-8">
            <div className="relative h-7">
              <div className="absolute inset-0 overflow-hidden rounded-full bg-white/15"
                role="meter" aria-valuemin={0} aria-valuemax={d.meta} aria-valuenow={d.realizado.valor} aria-label="Produção do mês em relação à meta">
                <div
                  className={`h-full rounded-full transition-[width] duration-1000 ease-out ${noRitmo ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min(pctMeta, 1) * 100}%` }}
                />
              </div>
              {pctEsperado > 0 && pctEsperado < 1 && (
                <div className="absolute -top-2 bottom-[-8px] w-1 -translate-x-1/2 rounded-full bg-white" style={{ left: `${pctEsperado * 100}%` }} aria-hidden />
              )}
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-6 text-xl">
              <p className={`font-semibold ${noRitmo ? 'text-emerald-300' : 'text-amber-300'}`}>
                {noRitmo ? 'No ritmo' : 'Abaixo do ritmo'} · esperado até hoje {brlCurto(d.ritmo.esperadoAteHoje)}
              </p>
              <p className="shrink-0 text-white/65">
                {plural(d.realizado.obras, 'obra concluída', 'obras concluídas')}
                {d.realizado.semValor > 0 && <> · {d.realizado.semValor} sem Valor</>}
              </p>
            </div>
            {falta > 0 ? (
              <p className="mt-4 text-[28px] text-white/85">
                Faltam <b className="font-semibold text-white">{brl(falta)}</b>
                {diasRestantes > 0 && <> · {brlCurto(falta / diasRestantes)} por dia útil ({diasRestantes} dias)</>}
              </p>
            ) : (
              <p className="mt-4 text-[28px] font-semibold text-emerald-300">Meta batida · {brl(d.realizado.valor - d.meta)} acima</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <Tile titulo={`Obras com entrega em ${nomeMes(d.mes)}`} valor={num(me.obras)}
            sub={<>{me.obrasProntas} prontas · {me.obras - me.obrasProntas} a entregar</>} />
          <Tile titulo="Valor das entregas do mês" valor={brlCurto(me.valor)}
            sub={me.semValor > 0 ? <>{me.semValor} {me.semValor === 1 ? 'obra' : 'obras'} sem Valor</> : <>{brl(me.valor)}</>} />
          <Tile titulo="Caixilhos a produzir no mês" valor={num(me.caixilhos - me.caixilhosProntos)}
            sub={<>de {num(me.caixilhos)} · {num(me.caixilhosProntos)} prontos</>}
            pct={me.caixilhos ? me.caixilhosProntos / me.caixilhos : 0} />
          <Tile titulo="Quadros do mês" valor={num(me.quadros)}
            sub={<>{num(me.quadrosProntos)} prontos · faltam {num(me.quadros - me.quadrosProntos)}</>}
            pct={me.quadros ? me.quadrosProntos / me.quadros : 0} />
        </div>
      </section>

      {/* Entregas e próximas obras */}
      <section className="grid min-h-0 flex-1 grid-cols-[1.45fr_1fr] gap-5">
        <Lista icone={<CalendarClock className="h-7 w-7" strokeWidth={2} />} titulo="Entregas mais próximas"
          vazio="Nenhuma obra em aberto com data de entrega.">
          {d.entregas.map((o) => <LinhaEntrega key={o.key} o={o} />)}
        </Lista>
        <Lista icone={<Hammer className="h-7 w-7" strokeWidth={2} />} titulo="Próximas a produzir"
          vazio="Nenhuma obra esperando para começar.">
          {d.aProduzir.map((o) => <LinhaProduzir key={o.key} o={o} />)}
        </Lista>
      </section>

      {(d.qualidade.semData > 0 || d.qualidade.semValor > 0) && (
        <footer className="flex items-center gap-3 text-lg text-slate-600">
          <AlertTriangle className="h-5 w-5 text-amber-700" />
          Preencher no Jira:
          {d.qualidade.semData > 0 && <b className="font-semibold text-slate-800">{d.qualidade.semData} obras sem Data de entrega</b>}
          {d.qualidade.semData > 0 && d.qualidade.semValor > 0 && '·'}
          {d.qualidade.semValor > 0 && <b className="font-semibold text-slate-800">{d.qualidade.semValor} obras sem Valor</b>}
        </footer>
      )}
    </div>
  );
}

function Tile({ titulo, valor, sub, pct }: { titulo: string; valor: string; sub: React.ReactNode; pct?: number }) {
  return (
    <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-7 shadow-card">
      <p className="text-xl font-medium text-slate-600">{titulo}</p>
      <div>
        <p className="text-[64px] font-semibold leading-none tracking-tight">{valor}</p>
        <p className="mt-2 text-xl text-slate-600">{sub}</p>
        {pct !== undefined && (
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-emerald-100" aria-hidden>
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(pct, 1) * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function Lista({ icone, titulo, vazio, children }: { icone: React.ReactNode; titulo: string; vazio: string; children: React.ReactNode[] }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
      <h2 className="flex items-center gap-3 border-b border-slate-200 px-7 py-4 text-2xl font-semibold text-slate-900">
        <span className="text-brand">{icone}</span>{titulo}
      </h2>
      {children.length === 0
        ? <p className="px-7 py-8 text-xl text-slate-500">{vazio}</p>
        : (
          // Coluna que quebra para o lado: uma linha que não cabe inteira vai
          // para uma segunda coluna, fora da caixa, em vez de aparecer cortada
          <ul className="flex min-h-0 flex-1 flex-col flex-wrap overflow-hidden [&>li]:w-full [&>li]:shrink-0 [&>li+li]:border-t [&>li+li]:border-slate-100">{children}</ul>
        )}
    </div>
  );
}

/** Data grande à esquerda; vermelho só quando já passou da entrega */
function DataEntrega({ o }: { o: ObraResumo }) {
  const atrasada = o.diasParaEntrega !== null && o.diasParaEntrega < 0;
  const perto = o.diasParaEntrega !== null && o.diasParaEntrega >= 0 && o.diasParaEntrega <= 7;
  return (
    <div className="w-36 shrink-0">
      <p className={`text-3xl font-semibold tabular-nums ${atrasada ? 'text-red-700' : 'text-slate-900'}`}>{diaMes(o.duedate)}</p>
      <p className={`text-lg font-medium ${atrasada ? 'text-red-700' : perto ? 'text-amber-800' : 'text-slate-500'}`}>
        {prazoRelativo(o.diasParaEntrega)}
      </p>
    </div>
  );
}

function LinhaEntrega({ o }: { o: ObraResumo }) {
  const atrasada = o.situacao === 'atrasada';
  return (
    <li className={`flex items-center gap-6 px-7 py-3.5 ${atrasada ? 'bg-red-50' : ''}`}>
      <DataEntrega o={o} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-2xl font-semibold">{o.cliente}</p>
        <p className="truncate text-lg text-slate-500">
          {o.key}{o.situacao === 'parada' && <span className="font-medium text-red-700"> · parada há {o.diasSemMov} dias</span>}
          {o.status === 'Tarefas Pendentes' && <span className="font-medium text-slate-700"> · não iniciada</span>}
        </p>
      </div>
      <div className="w-56 shrink-0">
        <div className="flex items-baseline justify-between text-lg">
          <span className="text-slate-600">{o.caixilhosProntos}/{o.caixilhos} caixilhos</span>
          <b className="text-2xl font-semibold tabular-nums">{o.pct}%</b>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${o.pct}%` }} />
        </div>
      </div>
      <p className="w-36 shrink-0 text-right text-xl font-medium tabular-nums text-slate-700">
        {o.valor !== null ? brlCurto(o.valor) : <span className="text-slate-400">sem valor</span>}
      </p>
    </li>
  );
}

function LinhaProduzir({ o }: { o: ObraResumo }) {
  return (
    <li className={`flex items-center gap-6 px-7 py-3.5 ${o.situacao === 'atrasada' ? 'bg-red-50' : ''}`}>
      <DataEntrega o={o} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-2xl font-semibold">{o.cliente}</p>
        <p className="truncate text-lg text-slate-500">
          {o.key} · {o.caixilhos} caixilhos · {o.quadros} quadros
        </p>
      </div>
      <p className="shrink-0 text-right text-xl font-medium tabular-nums text-slate-700">
        {o.valor !== null ? brlCurto(o.valor) : <span className="text-slate-400">sem valor</span>}
      </p>
    </li>
  );
}
