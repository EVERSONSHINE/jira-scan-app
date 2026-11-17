# Design — Shine · Produção

Sistema visual "padrão de mercado bem executado": app de trabalho limpo e previsível, com régua de acabamento de **Vercel / Stripe** (precisão, números, tabelas) e **Notion** (calma, amigável para quem não é técnico). A marca entra pelo logo Shine e pelo azul-marinho; o resto é disciplina.

## Colors

| Papel | Token | Valor | Uso |
|---|---|---|---|
| Marca | `brand` | `#120c30` | Logo, botão primário, item ativo do menu, foco, seleção |
| Marca suave | `brand-50` / `brand-100` | `#f3f2f9` / `#e9e7f3` | Fundo do item ativo, botão de etapa selecionado |
| Neutros | `slate-50…950` | cinzas puxados para o marinho (ver `tailwind.config.ts`) | Texto, bordas, fundos. Substituem o slate padrão do Tailwind |
| Fundo da página | `slate-100` | `#efeef4` | Sempre claro: galpão bem iluminado, TV com reflexo |
| Superfície | `white` + borda `slate-200` | | Painéis, cards, tabelas |

**Etapas (obrigatório, a equipe já aprendeu):** cinza = pendente (`slate-500`), âmbar = produção (`amber-600`), verde = concluído (`emerald-600`), azul = expedido (`blue-600`). Selos usam fundo `*-50` e texto `*-800`.
**Vermelho é só alarme** (atrasado/parado): moldura inteira `red-600` no card, nunca faixa lateral, nunca cor de etapa.
**Ciano** (`cyan-700`, chip preenchido com texto branco) é exclusivo de **localização física**.

Texto: corpo `slate-900`, secundário `slate-600`, apoio `slate-500` (mínimo para texto; `slate-400` só em ícones e bordas).

## Typography

- **Inter** (via `next/font`), números tabulares no sistema todo.
- Códigos do Jira, localizações e medidas em `font-mono` (dado, não enfeite).
- Escala: título de tela 18px semibold · seção 14–16px semibold · corpo 14px · apoio 12–13px. Nada abaixo de 12px no desktop.
- TV: mesma família, escala maior (cards `tv` / `tvCompact` em `ResumoClient`), lida a metros.

## Layout

- `AppShell` (`src/components/AppShell.tsx`): menu lateral fixo de 240px no desktop; no celular, barra superior com logo + título e **abas no rodapé** (Leitura, Quadros, Resumo, Expedição) ao alcance do polegar.
- Telas de TV (`/painel`, `/resumo?tv=1`, expedição dentro do painel) não usam o shell: cabeçalho com logo e título, o resto é conteúdo.
- Largura: `narrow` (leitura, máx. 768px) e `wide` (máx. 1280px).

## Components

- `Button`: primário marinho, secundário branco com borda, fantasma. `size="lg"` = 56px de altura para uso com luva.
- `Panel`: branco, borda `slate-200`, raio 12px, sombra mínima `shadow-card`.
- `StatusBadge` / `StageDot` (`src/components/StatusBadge.tsx`): selo de etapa com ponto; nomes curtos via `stageLabel()` (Pendente, Em produção, Concluído, Expedido).
- Botões de etapa na leitura: 64px de altura, grade 2×2, selecionado com borda e fundo da marca + ícone de check.
- Ícones: **lucide-react**, traço 1.75–2. Nunca emoji como ícone.
- Raio: 8px (controles), 12px (painéis/cards/botões grandes), pílula para selos e filtros.

## Surfaces

Duas linguagens, por público:

- **Painel TV (`/painel`) — dashboard para chamar a atenção da produção.** 1920×1080, sem rolagem, lido a metros. Uma única peça de cor domina: o bloco da **meta** em `brand` cheio, com o número-herói (104px, algarismos proporcionais), o medidor (preenchimento `emerald-400` no ritmo, `amber-400` abaixo) e a **marca branca do ritmo esperado** (meta × dias úteis decorridos / dias úteis do mês). Ao lado, quatro blocos brancos (obras, valor, caixilhos, quadros do mês). Embaixo, duas listas por data de entrega: "Entregas mais próximas" e "Próximas a produzir"; data grande à esquerda, **vermelho só para entrega vencida**, linha que não cabe inteira não aparece. Rodapé lembra o que falta preencher no Jira.
- **Indicadores, Relatório, Leitura, Expedição — sóbrio, de sistema de estoque.** Tabelas densas com cabeçalho `slate-50`, texto 13–14px, cor só para etapa e alarme. Gráficos em SVG/HTML sem biblioteca, um só tom (`brand`) contra a linha da meta (`slate-800`, 1,5px); projeção do mês em `brand-100`. Toda série tem tabela ao lado.
- **Relatório de quadros:** agrupa por obra ou por local; colunas de largura fixa iguais em todos os grupos; **impressão A4** com cabeçalho próprio (logo, filtros, data de emissão), cabeçalho de tabela repetido por página, chip de local vira contorno preto no papel.
- **Botões de etapa (Leitura):** cada um na cor da etapa (`*-50` com borda `*-300`); a etapa atual fica cheia em tom `*-700` com texto branco, anel e ícone de check.

## Motion

Mínimo e funcional: toast entra com leve deslize e desfoque (220ms, ease-out exponencial); spinners só onde há espera real; respeita `prefers-reduced-motion`.

## Browser surfaces

Seleção de texto em `brand-200`, foco visível com contorno marinho de 2px, cursor de texto marinho, scrollbar fina em `slate-300`, placeholder em `slate-500`.
