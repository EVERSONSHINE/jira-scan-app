# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Operadores do chão de fábrica** da Shine Windows, no celular, com pressa e muitas vezes de luva: leem o QR code de um quadro e mudam o status e a localização dele no Jira (tela inicial `/`).
- **Equipe da produção, de longe**: acompanha o andamento numa TV fixa no galpão (`/painel`, `/resumo?tv`).
- **Gestão e expedição, no desktop**: consultam projetos, quadros e o que foi expedido (`/resumo`, `/quadros`, `/expedicao`).

## Product Purpose

Tirar o Jira da frente de quem produz: o operador atualiza a etapa de um quadro em segundos lendo um QR code, e todos veem o andamento da fábrica sem abrir o Jira. Sucesso é o status no Jira refletir o chão de fábrica em tempo real, e um projeto atrasado ou parado ser notado de longe.

## Operating Context

- Galpão bem iluminado, luz forte; TV vista a metros de distância, com reflexo. Celulares usados em pé, em movimento.
- Hierarquia de domínio pelo campo Modelo do Jira: Projeto (Épico) → Caixilho (Task) → Marco/Folha (Subtask). "Quadro" é a peça física com QR code.
- Etapas canônicas: Tarefas Pendentes → Em Andamento → Concluído → Expedido. Localização física da peça (ex. `A-01`) é o dado que manda alguém andar até ela.
- O painel da TV recarrega sozinho e mantém a tela acesa.

## Capabilities and Constraints

- Next.js 15 (App Router) + Tailwind 3, deploy na Vercel; dados só via API do Jira (variáveis `JIRA_*`).
- Leitura de QR por câmera (`html5-qrcode`), mudança de status em lote (task + subtasks), localização, arquivamento automático de expedidos.
- Interface toda em português (pt-BR).

### Metas e indicadores (definições confirmadas pelo usuário)

- **Meta mensal de produção:** R$ 850.000 (variável `META_PRODUCAO_MENSAL`).
- **Produzido no mês:** o campo **Valor** (`customfield_10391`) da obra (Épico) entra **inteiro** no mês em que a obra chega a Concluído; a data vem do histórico de status do Épico, no horário de Brasília. Obra reaberta e concluída de novo conta no mês da última conclusão.
- **Obras/caixilhos/quadros do mês:** só obras com **Data de entrega** (`duedate`) dentro do mês corrente.
- **Entrega no prazo:** obra expedida até a Data de entrega. **Tempo da obra:** Data de início (`customfield_10015`, ou criação) até a expedição.
- O arquivamento noturno grava os números mensais das obras arquivadas numa propriedade do projeto no Jira (`jira-scan-app.obras-por-mes`) para o histórico não se perder.
- Em 17/11/2026 nenhuma obra tinha Valor preenchido e 14 de 45 obras abertas estavam sem Data de entrega; as telas mostram essas lacunas em vez de esconder.

### Telas por público

- **Leitura** (`/`): operador no celular. **Quadros** (`/quadros`): relatório do PCP, por obra ou por local, imprimível. **Painel TV** (`/painel`): produção, meta e entregas; vira Expedição sozinho durante a leitura de etiquetas. **Indicadores** (`/indicadores`): diretoria. **Expedição** (`/expedicao`).

## Brand Commitments

- Nome: Shine Windows. Logotipo "Shine" (wordmark + "PORTAS E JANELAS DE PVC"), cor `#120c30`; arquivo original enviado pelo usuário (CMYK.svg).
- Direção visual escolhida pelo usuário: padrão de mercado bem executado, sem tema próprio; régua de acabamento Vercel / Stripe e Notion (ver DESIGN.md).
- Vocabulário de cores das etapas já aprendido pela equipe e obrigatório: cinza = pendente, âmbar = produção, verde = concluído, azul = expedido. Vermelho é reservado para alarme (atrasado/parado), nunca é cor de etapa.

## Evidence on Hand

- Dados reais vêm do Jira em produção; não há dados de exemplo no repositório. Nenhum número, cliente ou métrica deve ser inventado na interface.

## Product Principles

1. Velocidade no chão de fábrica vence enfeite: ler, tocar, confirmar.
2. Legível a distância: o painel é lido a metros, sob luz forte.
3. Alarme só quando é alarme: vermelho significa atraso ou parada, nada mais.
4. O status no Jira é a verdade; a interface nunca esconde erro de sincronização.

## Accessibility & Inclusion

Alvos de toque grandes (uso com luva), contraste alto para leitura sob luz forte e a distância.
