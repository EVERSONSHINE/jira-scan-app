import { type Obra, pronto } from './hierarquia';
import { diaBR, diasEntre } from './obras';

/** Dias sem nenhum quadro mexer para uma obra em produção contar como parada */
export const PARADO_DIAS = 7;

export type Situacao = 'atrasada' | 'parada' | 'producao' | 'pendente' | 'concluida' | 'expedida';

/** Uma obra resumida para as telas (sem a lista de quadros) */
export interface ObraResumo {
  key: string;
  cliente: string;
  summary: string;
  documento: string;
  status: string;
  duedate: string | null;
  /** Dias até a entrega (negativo = atrasada); null sem data */
  diasParaEntrega: number | null;
  valor: number | null;
  caixilhos: number;
  caixilhosProntos: number;
  quadros: number;
  quadrosProntos: number;
  pct: number;
  /** Última vez que algum quadro mexeu (ou o próprio épico) */
  ultimaMov: string | null;
  diasSemMov: number | null;
  situacao: Situacao;
}

export function resumirObra(o: Obra, hoje = diaBR(new Date())): ObraResumo {
  const p = o.row;
  const quadrosProntos = o.quadros.filter((q) => pronto(q.status)).length;
  const caixilhosProntos = o.caixilhos.filter((c) => pronto(c.status)).length;
  const ultimaMov = o.quadros.reduce<string>((acc, q) => (q.updated > acc ? q.updated : acc), '') || p.updated || null;
  const diasSemMov = ultimaMov ? diasEntre(diaBR(ultimaMov), hoje) : null;
  const diasParaEntrega = p.duedate ? diasEntre(hoje, p.duedate) : null;

  let situacao: Situacao;
  if (p.status === 'Expedido') situacao = 'expedida';
  else if (p.status === 'Concluido') situacao = 'concluida';
  else if (diasParaEntrega !== null && diasParaEntrega < 0) situacao = 'atrasada';
  else if (p.status === 'Em Andamento' && diasSemMov !== null && diasSemMov > PARADO_DIAS) situacao = 'parada';
  else if (p.status === 'Em Andamento') situacao = 'producao';
  else situacao = 'pendente';

  return {
    key: p.key,
    cliente: p.cliente || p.summary,
    summary: p.summary,
    documento: p.documento,
    status: p.status,
    duedate: p.duedate,
    diasParaEntrega,
    valor: p.valor,
    caixilhos: o.caixilhos.length,
    caixilhosProntos,
    quadros: o.quadros.length,
    quadrosProntos,
    pct: o.quadros.length ? Math.round((quadrosProntos / o.quadros.length) * 100) : 0,
    ultimaMov,
    diasSemMov,
    situacao,
  };
}

/** Por data de entrega, a mais próxima (ou mais atrasada) primeiro; sem data no fim */
export function porEntrega(a: ObraResumo, b: ObraResumo): number {
  if (a.duedate && b.duedate) return a.duedate.localeCompare(b.duedate) || a.key.localeCompare(b.key);
  if (a.duedate) return -1;
  if (b.duedate) return 1;
  return a.key.localeCompare(b.key, 'pt-BR', { numeric: true });
}

export const soma = (xs: Array<number | null>) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
