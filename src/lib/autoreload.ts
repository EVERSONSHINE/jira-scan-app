// Sem imports de ./jira: este módulo roda no browser (client components),
// e jira.ts usa Buffer/env no escopo do módulo.

/**
 * Recuperação da TV do chão de fábrica: a tela fica ligada o dia todo sem
 * ninguém por perto, então um estado travado só se desfaz sozinho.
 *
 * O sinal de vida é o tempo desde a última resposta boa — de /api/resumo OU de
 * /api/expedicao, porque qualquer uma prova que o app ainda fala com o servidor.
 * Contagem de falhas não serviria: as duas rotas falham em ritmos diferentes e
 * normalizar isso num contador só daria trabalho.
 */
export const SEM_SUCESSO_ATE_RECARREGAR_MS = 5 * 60_000;

let ultimoSucesso = Date.now();

/** Chamado por quem conseguir falar com a API */
export function marcarSucesso(agora = Date.now()): void {
  ultimoSucesso = agora;
}

export function tempoSemSucesso(agora = Date.now()): number {
  return agora - ultimoSucesso;
}

/**
 * Decide se vale recarregar a página. Duas guardas que evitam piorar a situação:
 *
 * - `online === false`: se a internet caiu, recarregar troca uma tela com dados
 *   velhos por uma página de erro do navegador, que não se recupera sozinha. O
 *   polling atual tenta para sempre e se cura quando a rede volta — queda de
 *   rede é trabalho do quiosque, não daqui.
 * - `oculto === true`: o polling já para com a aba em segundo plano, então sem
 *   esta guarda a página recarregaria por inanição, não por defeito.
 */
export function deveRecarregar(
  { agora = Date.now(), online = true, oculto = false, limite = SEM_SUCESSO_ATE_RECARREGAR_MS } = {},
): boolean {
  if (!online || oculto) return false;
  return tempoSemSucesso(agora) > limite;
}

/** Só para os testes: devolve o contador ao estado inicial */
export function reiniciarRelogio(agora = Date.now()): void {
  ultimoSucesso = agora;
}
