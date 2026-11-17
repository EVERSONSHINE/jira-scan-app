// Vocabulário visual das etapas. Sem imports de ./jira: roda no browser.
import { STATUS_ORDER, OUTROS } from './status';

/**
 * Uma cor por etapa, a mesma em todo o sistema — botão de leitura, chip,
 * barra de progresso, TV:
 *   cinza = pendente · âmbar = em andamento · verde = concluído · azul = expedido
 * Vermelho é reservado para alarme (atraso), nunca é cor de etapa.
 * Contraste do texto sobre o sólido ≥ 4.5:1 em todas.
 */
export interface Etapa {
  status: string;
  rotulo: string;
  curto: string;
  passo: number;
  /** Fundo sólido + texto (botões de leitura) */
  solido: string;
  /** Fundo claro + texto escuro (chips) */
  claro: string;
  /** Só a cor de preenchimento (barras) */
  barra: string;
  /** Hex para SVG */
  hex: string;
}

export const ETAPAS: Record<string, Etapa> = {
  'Tarefas Pendentes': {
    status: 'Tarefas Pendentes', rotulo: 'Pendente', curto: 'Pend.', passo: 1,
    solido: 'bg-slate-600 text-white', claro: 'bg-slate-100 text-slate-700 ring-slate-300',
    barra: 'bg-slate-400', hex: '#94A3B8',
  },
  'Em Andamento': {
    status: 'Em Andamento', rotulo: 'Em andamento', curto: 'Andam.', passo: 2,
    solido: 'bg-amber-400 text-amber-950', claro: 'bg-amber-50 text-amber-800 ring-amber-300',
    barra: 'bg-amber-500', hex: '#F59E0B',
  },
  Concluido: {
    status: 'Concluido', rotulo: 'Concluído', curto: 'Concl.', passo: 3,
    solido: 'bg-emerald-700 text-white', claro: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
    barra: 'bg-emerald-600', hex: '#059669',
  },
  Expedido: {
    status: 'Expedido', rotulo: 'Expedido', curto: 'Exped.', passo: 4,
    solido: 'bg-blue-600 text-white', claro: 'bg-blue-50 text-blue-800 ring-blue-300',
    barra: 'bg-blue-600', hex: '#2563EB',
  },
  [OUTROS]: {
    status: OUTROS, rotulo: 'Outro', curto: 'Outro', passo: 0,
    solido: 'bg-gray-500 text-white', claro: 'bg-gray-100 text-gray-700 ring-gray-300',
    barra: 'bg-gray-300', hex: '#D1D5DB',
  },
};

export const etapa = (status: string) => ETAPAS[status] ?? ETAPAS[OUTROS];

export const ORDEM = [...STATUS_ORDER, OUTROS] as const;
