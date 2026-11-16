// Tipos compartilhados entre as rotas de API e as telas. Só tipos: pode ser
// importado por client components sem levar código de servidor junto.

// ─── /api/localizacao ────────────────────────────────────────────────────────

export interface PecaLoc {
  key: string; modelo: string; largura: string; altura: string;
  cor: string; loc: string; status: string; codigo: string;
}
export interface CaixilhoLoc { key: string; tipo: string; status: string; cor: string; pecas: PecaLoc[] }
export interface ObraLoc {
  key: string; cliente: string; documento: string; summary: string;
  duedate: string | null; status: string; caixilhos: CaixilhoLoc[];
}

// ─── Produção: Painel da TV e Indicadores ────────────────────────────────────

export interface ContagemCaixilhos {
  total: number;
  /** Concluídos ou expedidos */
  prontos: number;
  emProducao: number;
  pendentes: number;
}

export interface ObraProd {
  key: string;
  nome: string;
  documento: string;
  duedate: string | null;
  /** Status canônico do Épico */
  status: string;
  /** Campo Valor do Épico; null quando ainda não preenchido */
  valor: number | null;
  caixilhos: ContagemCaixilhos;
  /** Locais das peças que ainda não saíram da fábrica */
  locais: string[];
  /** Dias até a entrega (negativo = atrasada); null sem data */
  dias: number | null;
}

export interface MetaMes {
  /** "2026-11" */
  mes: string;
  nomeMes: string;
  metaValor: number;
  /** Obras com entrega prevista no mês */
  obras: number;
  obrasSemValor: number;
  caixilhosTotal: number;
  caixilhosProntos: number;
  /** Soma do Valor das obras do mês */
  valorPrevisto: number;
  /** Valor de cada obra × fração dos seus caixilhos prontos */
  valorProduzido: number;
  diasUteis: { total: number; passados: number; restantes: number };
  /** Caixilhos que já deveriam estar prontos hoje, dividindo o mês por igual */
  esperadoHoje: number;
  /** Caixilhos por dia útil para fechar o mês */
  porDia: number;
  /** Obras de meses anteriores que ainda não ficaram prontas */
  atrasadasAnteriores: { obras: number; caixilhosFaltando: number };
}

/** Um mês do trimestre da bonificação */
export interface MesTrimestre {
  mes: string;
  nomeMes: string;
  metaValor: number;
  /** Valor produzido das obras com entrega no mês; null se o mês não começou */
  valorProduzido: number | null;
  /** true batida · false não batida · null ainda em aberto */
  batida: boolean | null;
  /**
   * fechado: número gravado na virada do mês (não muda mais)
   * estimado: mês passado sem fechamento gravado; calculado com o Jira de hoje
   * em-andamento: mês atual · futuro: ainda não começou
   */
  situacao: 'fechado' | 'estimado' | 'em-andamento' | 'futuro';
  obrasSemValor: number;
}

export interface Trimestre {
  /** "out–dez" */
  nome: string;
  meses: MesTrimestre[];
  batidos: number;
}

/** O que fica gravado no Jira para cada mês (propriedade do projeto) */
export interface FechamentoMes {
  valorProduzido: number;
  valorPrevisto: number;
  metaValor: number;
  caixilhosTotal: number;
  caixilhosProntos: number;
  obrasSemValor: number;
  gravadoEm: string;
}

export interface PainelData {
  hoje: string;
  meta: MetaMes;
  trimestre: Trimestre;
  /** Obras não expedidas com data de entrega, da mais próxima para a mais distante */
  entregas: ObraProd[];
  /** Obras não expedidas sem data de entrega */
  semData: number;
  fetchedAt: string;
}

export interface SemanaProd {
  /** Segunda-feira da semana */
  inicio: string;
  caixilhos: number | null;
}

export interface PrazoMes {
  mes: string;
  nomeMes: string;
  /** Expedidas até a data de entrega */
  noPrazo: number;
  /** Expedidas depois da data */
  comAtraso: number;
  /** Data passou e ainda não foram expedidas */
  vencidas: number;
  /** Data ainda não chegou */
  aVencer: number;
  total: number;
}

export interface IndicadoresData {
  hoje: string;
  meta: MetaMes;
  trimestre: Trimestre;
  projecao: {
    /** Caixilhos concluídos no mês (todas as obras) */
    concluidosMes: number | null;
    /** Média por dia útil no mês até agora */
    ritmoDia: number | null;
    /** Caixilhos das obras do mês prontos até o fim, no ritmo atual */
    caixilhosProjetados: number | null;
    valorProjetado: number | null;
  };
  semanas: SemanaProd[];
  /** Caixilhos por semana para cumprir o mês atual */
  metaSemanal: number | null;
  prazo: PrazoMes[];
  carteira: {
    obras: number;
    caixilhosFaltando: number;
    valorAberto: number;
    obrasSemValor: number;
    /** Caixilhos que faltam ÷ média das últimas 4 semanas */
    semanasDeProducao: number | null;
  };
  atrasadas: ObraProd[];
  abertas: ObraProd[];
  /** Antes desta data, obras expedidas foram arquivadas e não entram nas contas */
  historicoDesde: string;
  fetchedAt: string;
}
