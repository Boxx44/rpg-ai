# Registro de decisões — RPG AI

Formato: cada decisão tem contexto, escolha e motivo. "Pendente" = precisa da sua aprovação.

## Decisões tomadas (seguindo a especificação)

**ADR-001 — Monorepo com pnpm + Turborepo.** Um repositório com web, API, worker e pacotes compartilhados. Motivo: tipos e validações iguais em todas as partes; builds rápidos com cache.

**ADR-002 — Worker separado da API.** Processamento pesado (PDF, IA, embeddings) roda em processo próprio com BullMQ. Motivo: o jogo não fica lento enquanto um livro é processado.

**ADR-003 — Drizzle ORM em vez de Prisma.** Motivo: suporte direto a pgvector, SQL bruto e políticas RLS dentro das migrations; menos "mágica" escondida. Troca justificada conforme permitido pela seção 3.

**ADR-004 — Motor de regras como pacote puro, sem IA.** Motivo: resultados exatos, testáveis e auditáveis; a IA só pede, nunca calcula sozinha.

**ADR-005 — DSL própria com parser e lista branca.** Em vez de JavaScript sandbox. Motivo: sandboxes de JS têm histórico de falhas de segurança; uma linguagem mínima é verificável por completo.

**ADR-006 — Citação obrigatória e verificada por texto.** Regras extraídas sem trecho literal encontrado na página são descartadas. Motivo: impedir regras inventadas.

**ADR-007 — Supabase para Postgres, Auth e Storage.** Motivo: especificado; reduz infraestrutura. API valida o JWT do Supabase; todas as escritas passam pela API.

**ADR-008 — Socket.IO com adaptador Redis.** Motivo: reconexão, salas e escala horizontal prontas.

**ADR-009 — Campanha presa a uma versão do sistema.** Motivo: atualizar regras de um sistema não quebra campanhas em andamento.

**ADR-010 — Interface em pt-BR, código em inglês, com i18n preparado.** Motivo: público inicial brasileiro; permitir outros idiomas depois.

**ADR-011 — Modo custo zero (aprovado em 17/11/2026).** Desenvolver as Fases 1–5 sem gastos: tudo roda localmente ou em planos gratuitos. A IA paga só entra quando houver usuários reais (perto da Fase 6), e o sistema já é preparado para trocar de provedor sem reescrita.

**ADR-012 — Login: e-mail/senha + Google (aprovado em 17/11/2026).** Implementado via Supabase Auth. Google fica desativado (com aviso na tela) até ser configurado — ver `setup-supabase.md`. Resolve D-06.

**ADR-013 — Emulador local de autenticação, só para testes.** O Supabase Auth não pôde ser executado no ambiente de desenvolvimento. Criado `tools/auth-emulator`, que imita o subconjunto usado da API do Supabase Auth, recusa-se a rodar em produção e é usado apenas em desenvolvimento e testes automatizados. O código do produto não sabe que o emulador existe.

**ADR-014 — RLS também para a API.** A API executa consultas de usuário dentro de uma transação com o papel `authenticated` e as claims do JWT, como o Supabase faz. Assim um erro no código do servidor ainda é barrado pelo banco. Funções sensíveis (aceitar convite, excluir campanha, gravar auditoria) ficam no schema privado `app_private`, que não é exposto pela Data API do Supabase.

**ADR-015 — Migrations em SQL escrito à mão; Drizzle só para consultas tipadas.** Permite controlar RLS, triggers e funções com precisão. Migrations já aplicadas não podem ser editadas (verificado por checksum).

**ADR-016 — Testes de integração com Postgres real em vez de testcontainers.** Cada execução cria um banco descartável. No CI o Postgres (com pgvector) e o Redis rodam como serviços. Menos dependências e mais rápido.

**ADR-017 — Sem pacote `packages/config` separado.** A configuração de ESLint e TypeScript ficou na raiz (`eslint.config.mjs`, `tsconfig.base.json`): é mais simples e suficiente para o tamanho atual.

**ADR-018 — Mesa de jogo antes da importação de PDFs (aprovado em 17/11/2026).** O responsável pelo produto quer jogar e mestrar o quanto antes. Rolagens, chat, personagens, NPCs e mapas foram adiantados usando regras genéricas; a importação de PDFs e o motor de regras vêm depois e se encaixam nessas funções.

**ADR-019 — Ficha livre enquanto não há sistema.** O personagem tem atributos, recursos (atual/máximo), inventário e anotações definidos pelo próprio jogador, validados no servidor. Não é a "ficha universal fixa" proibida pela especificação: é o modo manual, que continuará disponível para sistemas sem regras importadas.

**ADR-020 — Rolagens, chat e posição de tokens só mudam por funções do banco.** Usuários não têm permissão de INSERT/UPDATE nessas tabelas; a API chama funções em `app_private` que conferem a participação. Rolagens são calculadas no servidor com gerador criptográfico pelo pacote `rules-engine` (sem IA) e não podem ser editadas depois.

**ADR-021 — Tempo real só distribui; alterações chegam pela API REST.** Assim toda ação passa por validação, permissão, limite de requisições e auditoria. Conteúdo secreto vai para a sala dos mestres; para mudanças de mapa/NPC envia-se só um sinal e cada cliente recarrega o que tem permissão de ver. Ao remover um membro ou mudar seu papel, ele é tirado das salas na hora.

**ADR-022 — Livros enviados são privados (resolve D-05).** O PDF e o texto extraído ficam acessíveis só à organização de quem enviou e aos membros das campanhas que usam aquele sistema (para consultar regras na mesa). Não há biblioteca pública. Apagar o livro remove o arquivo e o texto. O usuário declara possuir o material. Antes de abrir para o público, ainda recomendo revisão jurídica.

**ADR-023 — Modelos de sistema revisados à mão + busca no livro, antes da extração por IA.** Para o Ordem Paranormal, as mecânicas (atributos, 28 perícias, graus, classes, PV/PE/SAN por NEX, Defesa, 26 origens) foram lidas do livro e codificadas como DADOS em `packages/rules-engine/src/systems/ordem-paranormal.ts`, com a página de cada regra. Nenhum trecho do livro é copiado para o código. A extração automática por IA (Fase "Importação de PDFs") continua no roteiro; ela custa dinheiro por livro e precisará de revisão humana de qualquer forma.

**ADR-024 — Busca de regras por texto completo do Postgres (português, sem acentos), sem embeddings por enquanto.** Custo zero, sem serviços externos, roda localmente e no Supabase. Busca por significado (embeddings/pgvector) entra junto com a IA.

**ADR-025 — Linguagem de fórmulas segura (primeira parte da DSL).** `packages/rules-engine/src/expr.ts`: aritmética, comparações e funções em lista branca (`attr`, `field`, `lookup`, `min`, `max`, `floor`, `ceil`, `round`, `if`). Sem eval. Usada para PV/PE/SAN/Defesa.

**ADR-026 — Correção de exclusão lógica com RLS (migration 0004).** No Postgres, uma linha alterada precisa continuar visível pela política de leitura de quem alterou. As políticas de NPCs, mapas e personagens foram ajustadas: quem pode apagar continua vendo a linha apagada (a API sempre filtra), os demais nunca veem.

**ADR-027 — Instalação no Windows por scripts de dois cliques.** `INSTALAR.bat` instala Node.js e Docker Desktop via winget, dependências, compila e prepara o banco; `INICIAR.bat` sobe tudo e abre o navegador. O banco e o Redis rodam no Docker (a extensão pgvector exigida pelas migrations vem pronta na imagem).

**ADR-028 — Preparar x Jogar com sessões ao vivo (migration 0005).** A campanha passa a ter dois espaços: _Preparar_ (personagens, NPCs, mapas) e _Jogar_ (a mesa). Jogar acontece dentro de uma **sessão** (`sessions`), que só o mestre inicia e encerra, e cada campanha tem no máximo uma ao vivo (índice único parcial). Mensagens e rolagens recebem `session_id` automaticamente por gatilho no banco, para que o cliente não possa forjá-lo. O mestre escolhe o mapa da cena (`set_scene`), que é compartilhado automaticamente, e os jogadores o seguem. O início da sessão é avisado na sala pessoal `u:<id>` de cada membro, de modo que chega mesmo a quem está em outra página. O histórico mostra o resumo escrito pelo mestre e a crônica de cada sessão.

**ADR-029 — Combate (migration 0006).** O combate tem iniciativa, rodadas, turnos, pontos de vida e condições, com um combate ativo por campanha.

- **Iniciativa:** é rolada no servidor pela regra do sistema. Em Ordem Paranormal é o teste da perícia Iniciativa (p. 93). A rolagem aparece na crônica; a de inimigos fica visível só para o mestre.
- **Ordem dos turnos:** maior Iniciativa primeiro, com desempate sorteado no banco. A função `advance_turn` só deixa passar a vez o mestre ou o dono do personagem que está na vez, e recusa cliques repetidos.
- **Inimigos ocultos:** não aparecem para os jogadores por RLS.
- **PV de NPCs e inimigos:** ficam em `combatant_gm_details`, uma tabela só do mestre. Os jogadores veem apenas o estado (Ileso, Machucado, Caído).
- **PV dos personagens:** ficam na ficha. Dano e cura no combate alteram a ficha, então não existe uma segunda cópia de PV que possa divergir.
- **Condições:** vêm da lista do sistema (Ordem: apêndice, p. 320–321), escritas com palavras próprias e com a página do livro. O servidor recusa condições que não existem no sistema.
- **Inimigo com 0 PV:** sai da ordem de turnos automaticamente, e o mestre pode desfazer.

**ADR-030 — Campanhas usam a versão atual do modelo de sistema.** Sistemas criados a partir de um modelo (ex.: Ordem Paranormal) ainda não têm editor próprio. Por isso, a campanha lê a definição atual do modelo, e não a cópia guardada na criação. Assim, novas regras extraídas do livro (como condições e Iniciativa) chegam às campanhas que já existem. Quando houver editor de sistema, uma versão editada passará a ser usada no lugar do modelo.

**ADR-031 — Arsenal, rituais, habilidades e bestiário de Ordem Paranormal (migration 0007).**

_Origem dos dados_

- Os dados vêm do livro v1.3 por extração automática, com conferência por amostragem: 37 armas, 3 proteções, 82 rituais, progressão das 3 classes, 15 trilhas, poderes de classe, 23 poderes paranormais e 49 criaturas.
- Guardamos só a mecânica e a página. O texto descritivo é lido no PDF do próprio mestre (regra 1 e regra 7).

_Correções manuais_

- Nomes de criaturas quebrados em duas linhas foram juntados.
- As trilhas do Ocultista, cuja página tem diagramação misturada, foram digitadas.
- Linhas da tabela do Especialista e do Ocultista que ocupavam duas linhas foram completadas.
- O VD do Estrangeiro foi preenchido.
- As ameaças mundanas (p. 294–299) ficaram de fora porque a extração não foi confiável. O mestre as adiciona como "Inimigo".

_Ataques (p. 64)_

- Corpo a corpo usa Luta e soma Força ao dano.
- Disparo e arma de fogo usam Pontaria, sem atributo no dano.
- Arremesso usa Pontaria e soma Força ao dano.
- O crítico vale quando o d20 que contou atinge a margem da arma, e multiplica só os dados.
- O acerto contra a Defesa fica a cargo da mesa.

_Rituais (p. 129–131)_

- O custo é de 1, 3, 6 ou 10 PE conforme o círculo, mais o extra das formas discente e verdadeiro.
- O servidor recusa o ritual se o custo passar do limite de PE por turno ou se faltar PE.
- DT = 10 + limite de PE + Presença.
- Custo paranormal: teste de Ocultismo contra DT 20 + custo. Se falhar, o personagem perde SAN igual ao custo.
- Rituais de Medo tiram SAN automaticamente. A perda permanente é apenas avisada, porque a ficha ainda não guarda SAN máxima reduzida.

_Equipamento e criaturas_

- Defesa e carga usam a nova função de fórmula `gear()`: soma das proteções e espaços ocupados.
- Carga = 5 × Força, ou 2 com Força 0 (p. 63).
- Criaturas entram no combate com PV e Iniciativa da ficha.
- O ataque da criatura usa o teste e o dano da ficha. O crítico é no 20 natural, com o dobro dos dados.
- Defesa e ataques da criatura aparecem só para o mestre.

## Decisões pendentes (preciso da sua escolha)

### D-01 — Provedor principal de IA (LLM)

| Opção                                 | Prós                                                                                                          | Contras                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Anthropic Claude (recomendado)**    | Forte em seguir regras, uso de ferramentas e leitura de documentos longos; aceita PDF/imagem (útil para OCR). | Custo por uso; dependência de um fornecedor.                    |
| OpenAI                                | Ecossistema amplo; tem embeddings próprios.                                                                   | Mesma dependência.                                              |
| Camada que permite trocar de provedor | Flexibilidade.                                                                                                | Será feita de qualquer forma (interface interna `LlmProvider`). |

Recomendação: Claude como padrão, com a interface interna permitindo trocar depois. **Com o modo custo zero (ADR-011)**, a decisão fica para perto da Fase 6; até lá, testes de IA podem usar um modelo aberto rodando localmente. Modelo maior para narração e estruturação de regras; modelo menor para classificação e resumos.

### D-02 — Hospedagem

Recomendação: **Vercel** (site) + **Railway ou Fly.io** (API e worker) + **Supabase Cloud** + **Upstash ou Redis gerenciado**. Alternativa mais barata e mais trabalhosa: tudo em um servidor VPS com Docker. Só precisa ser decidido antes da Fase 9 (ou antes, se quiser um ambiente de testes online).

### D-03 — Provedor de embeddings (busca por significado)

| Opção                                                                                                                              | Observação                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Voyage AI (recomendado se D-01 = Claude)**                                                                                       | Recomendado pela Anthropic; bom em textos multilíngues.    |
| OpenAI embeddings                                                                                                                  | Barato e popular.                                          |
| Modelo aberto rodando no próprio servidor                                                                                          | Sem custo por uso, mas exige máquina com mais memória/CPU. |
| **Com o modo custo zero, recomendo começar com um modelo aberto rodando no próprio servidor** (gratuito). Decidir antes da Fase 2. |

### D-04 — OCR para PDFs digitalizados

| Opção                                                                                                                                           | Prós                                                       | Contras                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **IA com visão (recomendado)**                                                                                                                  | Lê tabelas e layouts complexos melhor; mesma conta do LLM. | Custo por página.                                                                     |
| Tesseract (gratuito, local)                                                                                                                     | Sem custo por uso.                                         | Qualidade inferior em tabelas, colunas e fontes estilizadas, comuns em livros de RPG. |
| Serviço de nuvem (Google Document AI / AWS Textract)                                                                                            | Ótimo em tabelas.                                          | Mais um fornecedor e conta.                                                           |
| Recomendação: Tesseract como primeira tentativa barata + IA com visão para páginas com baixa confiança ou com tabelas. Decidir antes da Fase 2. |

### ~~D-05 — Política para PDFs com direitos autorais~~ → resolvida pela ADR-022 (privado). Texto original:

Recomendação: livros enviados ficam privados ao usuário/organização; termos de uso exigindo que o usuário possua o material; sem biblioteca pública de livros comerciais; canal de remoção (notificação de direitos). **Sugiro consultar um advogado antes do lançamento público.** Decidir antes da Fase 2.

### ~~D-06 — Login~~ → resolvida (ADR-012)

### D-07 — Modelo de cobrança

Não é necessário agora, mas o custo da IA é variável (ver risks.md). A arquitetura registra consumo por campanha e usuário desde o início, para permitir planos ou limites no futuro.

**ADR-032 — Biblioteca de fichas, mesa de treino, NPC com ficha, criação guiada e regras completadas (migration 0008).**

_Biblioteca (`library_sheets`)_

- Cada usuário tem fichas próprias, fora das campanhas; o RLS só deixa o dono ver.
- A ficha é validada pelo modelo de sistema (`SYSTEM_TEMPLATES`).
- "Levar para a campanha" cria uma cópia e valida de novo. Personagem exige ser membro; NPC exige ser mestre.
- Se a campanha usa outro sistema, o servidor recusa com uma mensagem clara. Se a campanha não tem sistema, a ficha entra só com a parte livre.
- A ida inversa existe: "Guardar cópia nas Fichas" a partir da campanha.

_Mesa de treino_

- É uma campanha comum marcada `sandbox`, uma por pessoa (índice único). Só o criador marca, pela função `app_private.mark_sandbox`, porque as colunas de `campaigns` têm permissão por coluna.
- Já vem com sistema de Ordem Paranormal (reaproveita o sistema do usuário que já tem livro, para que os links de página funcionem), 2 personagens, 2 NPCs (um com ficha completa), mapa compartilhado e mensagem de boas-vindas.
- "Recomeçar do zero" apaga a mesa (exclusão lógica) e cria outra.

_Ver como jogador_

- É um filtro só na tela do mestre. Esconde mensagens do mestre, mapas não compartilhados, peças e combatentes ocultos, PV e fichas de inimigos, e NPCs não revelados.
- Não é segurança: o mestre já tem esses dados, e o sigilo real continua no servidor (regra 6). Por isso não abrimos uma "sessão falsa" de jogador.

_NPC com ficha_

- A ficha fica em `npc_gm_details.sheet`, que só o mestre lê, e é validada como a de personagem.
- Atacar, conjurar e descansar usam o mesmo serviço `SheetActions` dos personagens, com as mesmas regras.
- No combate, o NPC entra com o PV da ficha e o mestre ganha botões de arma e ritual.

_Criação guiada_

- Segue `creation` do sistema:
  - atributos: começam em 1, 4 pontos, um pode cair para 0 com +1 ponto, máximo 3 (p. 24);
  - perícias por classe: escolhas, fixas e livres por fórmula (p. 35, 39, 43);
  - proficiências e 3 rituais iniciais do Ocultista (p. 42).
- No fim, abre o editor completo para ajustes.

_Regras completadas_

- As 18 ameaças da realidade (p. 294–299) foram transcritas página a página, com crítico próprio das armas.
- Perda permanente de recurso (`perm`) reduz o máximo:
  - Medo tira 1, 2 ou 3 de SAN conforme a forma;
  - falhar o custo paranormal por 5 ou mais tira 1.
  - Só regras e o mestre alteram esse valor; o jogador não pode apagar.
- Interlúdio (p. 102–103):
  - dormir recupera PV e PE e relaxar recupera SAN, ambos iguais ao limite de PE × condição (½, 1, 2 ou 3);
  - refeições aumentam um nível ou somam +2 SAN;
  - relaxar junto dá +1 por participante.

**ADR-033 — Ajuda para iniciantes na criação de personagem.**

- O sistema ganhou uma seção opcional `help`, com textos escritos com palavras próprias e conferidos no livro, sempre com a página:
  - explicação de cada passo da criação;
  - os 5 atributos;
  - as 28 perícias;
  - as 26 origens, com o poder de cada uma;
  - as 3 classes;
  - os termos da ficha: PV, PE, SAN, Defesa, NEX, limite de PE, DT de rituais, carga, trilha e grau de treinamento.
- Não há regra nova; os textos só explicam o que o modelo já aplica. Um teste garante que todo atributo, perícia, origem, classe e número da ficha tem explicação.
- Na criação guiada, um "Ajudante" ao lado explica o passo atual e o item sob o mouse ou foco. A origem mostra o poder que concede.
- Na ficha completa há um "?" em cada item; o balão fica fixo na tela, para não ser cortado em listas.
- A ajuda pode ser desligada, e a preferência fica guardada no navegador.
- O botão "?" usa o rótulo genérico "Mais informações", para não competir com o rótulo do campo ao lado (acessibilidade e testes).

**ADR-034 — Objetos interativos no mapa (migration 0009).**

- Objetos são tokens do tipo `object` com `icon` (catálogo `PROPS` em `packages/shared`), `state` (`open/closed/on/off`) e `rotation`.
- Os desenhos são SVG feitos à mão no próprio código (`map-props.tsx`): nada de imagens de terceiros.
- Abrir/fechar e acender/apagar passa pela função `app_private.toggle_prop`, que só alterna o estado. Os jogadores podem usar objetos visíveis de mapas compartilhados, e o mestre pode usar qualquer um. Um objeto oculto responde "não encontrado" para jogadores, para não revelar que existe.
- Isso é só cenário: abrir uma porta não aplica regra do sistema (nenhuma regra inventada).

**ADR-035 — Mesa "viva" e acessibilidade no navegador.**

- As preferências (tamanho do texto, tema, contraste, menos movimento e sons) ficam no `localStorage` e são aplicadas como atributos `data-*` no `<html>`. Um pequeno script roda antes da página aparecer, para não "piscar".
- As animações usam classes CSS e respeitam "menos movimento", tanto pela preferência do sistema quanto pela do site.
- Os sons são sintetizados com WebAudio, sem baixar arquivos.
- A bandeja de dados é só visual: o resultado mostrado é sempre o que o servidor rolou.

**ADR-036 — Imagens guardadas no banco de dados (migration 0010).**

- **Opções:**
  - (a) disco do servidor: o Render gratuito apaga o disco ao reiniciar;
  - (b) Supabase Storage: exige chave de serviço e configuração extra;
  - (c) coluna `bytea` no Postgres.
- **Escolhida: (c).** Não exige nenhuma configuração nova, não some e fica protegida pelas mesmas regras de acesso (RLS) do resto do jogo.
- **Custo:** ocupa espaço do banco. Por isso as imagens são reduzidas no navegador (WebP; fundo até 4096 px, token e retrato até 512 px) e há limite de 4 MB por arquivo e 60 MB por campanha.
- Se o espaço apertar no futuro, as imagens podem migrar para o Storage sem mudar a interface, porque o acesso já passa por `/assets/:id/file`.
- **Quem vê:** a função `app_private.can_view_asset` libera a imagem para o mestre, para quem enviou e para membros que já podem ver onde ela está em uso (mapa compartilhado, token visível, retrato de personagem, NPC revelado).
- O gatilho `check_asset_ref` impede usar imagem de outra campanha ou enviada por outra pessoa, a menos que quem usa seja o mestre.
- **Formato:** o tipo é conferido pelos bytes (`imageInfo` em `packages/shared`): só PNG, JPEG e WebP. SVG é sempre recusado, porque pode conter código. As imagens são servidas com `nosniff` e `sandbox`.

**ADR-037 — Modelos de mapa gerados por código.**

- Os 5 modelos (`packages/shared/src/map-templates.ts`) são montados por código, com um gerador fixo: o mesmo modelo sai sempre igual.
- Não usam imagens de terceiros, e cada modelo vira um mapa comum, editável.

**ADR-038 — Entrada em combate.**

- A faixa "Combate!" é só visual: não bloqueia cliques, some sozinha ou com Esc e respeita "menos movimento".
- A barra de iniciativa usa os dados que o servidor já filtrou, então combatentes ocultos não aparecem para jogadores.
- Inimigos sem retrato usam a imagem do token de mesmo nome que está no mapa.

**ADR-039 — Mesa no celular com um painel por vez.**

- Abaixo de 1280 px, a mesa troca as duas colunas (mapa + painel lateral) por uma barra fixa embaixo. O painel escolhido ocupa a tela entre o cabeçalho e a barra (`position: fixed`).
- **Por quê:** empilhar o mapa e o painel obrigava a rolar a página sem parar, e o campo de mensagem ficava escondido.
- **Gestos do mapa:** implementados com Pointer Events (`touch-action: none` no mapa). Um dedo arrasta a vista e dois dedos dão zoom; o toque sem movimento vira clique.
- O computador não muda: as abas laterais continuam como eram.

**ADR-040 — Texturas procedurais no navegador.**

- O chão e os materiais usam texturas geradas por ruído (`apps/web/lib/textures.ts`) num canvas, uma vez por aba, e usadas como `<pattern>` no SVG.
- **Por quê:** fica com aparência realista sem baixar imagens de terceiros (sem risco de direitos autorais) e sem pesar o site.
- **Plano B:** os objetos usam pinturas com cor reserva (`url(#x) cor`), então aparecem também fora do mapa, como na paleta.

**ADR-041 — Imagem por arrastar e colar.**

- O mapa aceita arquivos soltos e `paste` com imagem.
- A peça sob o mouse decide o destino: a imagem dela, o retrato (no caso do jogador e do próprio personagem) ou o fundo do mapa.
- A permissão continua sendo checada no servidor (RLS e regras de imagens da ADR-036).
- O retrato salva na hora, com controle de versão, para não dar conflito ao salvar a ficha depois.

**ADR-042 — Segredos revelados por jogador (migration 0011).**

- **Colunas** em `map_tokens`: `secret_skill`, `secret_dt` e `secret_radius`.
- **Tabela** `map_token_reveals` (peça + jogador).
- **Quem vê:** a política `tokens_select` libera uma peça oculta só para quem tem uma descoberta registrada.
- **Como a descoberta é gravada:** o teste é rolado no servidor pela regra do sistema (`buildCheck`) e fica no chat como mensagem secreta.
  - Depois, a API chama `app_private.reveal_secrets` pela própria conexão; a função não pode ser chamada por usuários.
  - A função confere tudo de novo: mapa compartilhado, perícia, DT alcançada e distância (casas entre as bordas, diagonal conta 1).
- **Para o jogador**, a peça descoberta chega como visível e marcada `discovered`, sem DT nem perícia. O mestre recebe `secret` e `foundBy`.
- `toggle_prop` e `can_view_asset` também consideram a descoberta.
- **Para não entregar a existência do segredo:** o jogador escolhe a perícia ao procurar. Quando não acha nada, a resposta é a mesma, haja segredo ali ou não.

**ADR-043 — Tokens 2D procedurais.**

- Os bonecos são SVG gerados por código (`token-figure.tsx`), com aparência sorteada de forma fixa pelo id do token. Não usam imagens de terceiros.
- A respiração usa animação CSS, que respeita "menos movimento".
- Os testes rodam com `reducedMotion: 'reduce'`, para os cliques não esperarem animações infinitas.

**ADR-044 — Aparência do personagem como dado da ficha.**

- A aparência (corpo, pele, olhos, cabelo, roupas, calçados, acessórios, item na mão, capuz) fica em `sheet.appearance`, validada por Zod (`packages/shared/src/appearance.ts`). Só aceita opções de listas fechadas e cores `#rrggbb` — nada de texto livre que vire CSS ou SVG.
- Não precisou de migration: a ficha já é JSON versionado.
- O boneco (`avatar-figure.tsx`) é desenhado por código, em estilo próprio (visto de cima, contorno escuro, sombra). As imagens de referência enviadas pelo responsável serviram só de direção; nenhuma arte de terceiros foi copiada.
- Sem aparência escolhida, o boneco é sorteado de forma fixa pelo id do token, e o item na mão vem do equipamento/classe.

**ADR-045 — Recorte de fundo liso no navegador.**

- Ao enviar imagem de token ou retrato, o navegador apaga o fundo se os quatro cantos tiverem a mesma cor (preenchimento a partir das bordas, com borda suave). Fotos com fundo variado ficam intactas.
- Imagem com transparência vira figura recortada que respira no mapa (`data-figure="cutout"`); sem transparência, continua como "carta" com moldura.
- Feito no cliente para não gastar servidor; o servidor continua validando tipo e tamanho. Há uma caixa para desligar o recorte.
