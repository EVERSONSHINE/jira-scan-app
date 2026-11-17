// Formas das respostas de /api/producao, /api/indicadores e /api/relatorio,
// para os componentes do browser (espelham lib/visao.ts)

export type Situacao = 'atrasada' | 'parada' | 'producao' | 'pendente' | 'concluida' | 'expedida';

export interface ObraResumo {
  key: string;
  cliente: string;
  summary: string;
  documento: string;
  status: string;
  duedate: string | null;
  diasParaEntrega: number | null;
  valor: number | null;
  caixilhos: number;
  caixilhosProntos: number;
  quadros: number;
  quadrosProntos: number;
  pct: number;
  ultimaMov: string | null;
  diasSemMov: number | null;
  situacao: Situacao;
}

export interface Producao {
  mes: string;
  hoje: string;
  meta: number;
  realizado: { valor: number; obras: number; semValor: number; lista: Array<{ key: string; cliente: string; valor: number | null; concluidoAt: string | null }> };
  ritmo: { diasUteis: number; diasDecorridos: number; esperadoAteHoje: number };
  mesEntrega: {
    obras: number; obrasProntas: number; caixilhos: number; caixilhosProntos: number;
    quadros: number; quadrosProntos: number; valor: number; semValor: number;
  };
  entregas: ObraResumo[];
  aProduzir: ObraResumo[];
  emProducao: number;
  qualidade: { semData: number; semValor: number; abertas: number };
  fetchedAt: string;
}

export interface Indicadores {
  mes: string;
  hoje: string;
  meta: number;
  mesAtual: { valor: number; obras: number; semValor: number; quadros: number; caixilhos: number; projecao: number; diasUteis: number; diasDecorridos: number };
  producao: Array<{ mes: string; meta: number; valor: number; obras: number; semValor: number; quadros: number; caixilhos: number }>;
  entregas: Array<{ mes: string; comPrazo: number; noPrazo: number; pct: number | null; atrasoMedio: number | null }>;
  prazoJanela: { meses: number; comPrazo: number; noPrazo: number; pct: number | null; leadTimeMedio: number | null };
  carteira: {
    obras: number; valor: number; semValor: number; caixilhos: number; quadros: number; quadrosProntos: number;
    porSituacao: { pendente: number; producao: number; parada: number; atrasada: number };
    aguardandoExpedicao: { obras: number; valor: number };
  };
  riscos: {
    atrasadas: ObraResumo[];
    paradas: ObraResumo[];
    semData: Array<{ key: string; cliente: string }>;
    semValor: Array<{ key: string; cliente: string }>;
  };
  fetchedAt: string;
}

export interface QuadroRelatorio {
  key: string; summary: string; caixilho: string; caixilhoNome: string;
  modelo: string; tipo: string; largura: string; altura: string; cor: string; loc: string; status: string;
}

export interface Relatorio {
  obras: Array<{ obra: ObraResumo; quadros: QuadroRelatorio[] }>;
  hoje: string;
  fetchedAt: string;
}
