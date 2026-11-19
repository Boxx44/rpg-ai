# Progresso — RPG AI

| Fase                             | Status                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0 — Análise e documentação       | ✅ Concluída                                                                                                         |
| 1 — Fundação                     | ✅ Concluída (site e banco no ar com Supabase real)                                                                  |
| 2 — Importação de PDFs           | 🟡 Parcial: envio do livro, texto por página, busca e "abrir página do livro"; falta OCR de páginas digitalizadas    |
| 3 — Modelo universal + motor     | 🟡 Parcial: Ordem Paranormal completo no motor de regras; extração automática de regras de outros sistemas ainda não |
| 4 — Fichas dinâmicas             | ✅ Para Ordem Paranormal (criação guiada, ficha completa, biblioteca)                                                |
| 5 — NPCs e criaturas             | ✅ NPCs com ficha, bestiário do livro e ameaças mundanas                                                             |
| 6 — Mestre de IA e memória       | ⬜ Não iniciada (precisa de uma chave de IA paga)                                                                    |
| 7 — Multiplayer                  | ✅ Mesa em tempo real, sessões ao vivo, chat, rolagens                                                               |
| 8 — Mapas e combate              | ✅ Mapas com objetos, imagens e modelos; iniciativa, turnos, ataques, rituais                                        |
| 9 — Segurança, testes e produção | 🟡 Testes automáticos e site no ar; faltam teste de carga e rotina de backup                                         |
| Extra — Celular e acessibilidade | ✅ Mesa adaptada ao celular, preferências de acessibilidade                                                          |

-------------------------- | ----------------------------------------------------------------------------------- |
| 0 — Análise e documentação | ✅ Concluída (17/11/2026) |
| 1 — Fundação | ✅ Concluída localmente (17/11/2026) — falta validar com Supabase real (ver abaixo) |
| 2 — Importação de PDFs | ⏳ Próxima |
| 3–9 | ⬜ Não iniciadas |

---

## 19/11/2026 — Bonecos em estilo anime

**O que funciona (testado):**

- **Bonecos redesenhados em estilo anime:**
  - corpo inteiro, sombras chapadas, olhos grandes e contorno escuro;
  - no mapa, a figura ocupa cerca de dois quadrados de altura e continua respirando e piscando.
- **Aba Aparência ampliada:**
  - silhueta feminina/masculina;
  - corpos magro, médio, atlético, musculoso, robusto e gordo;
  - novos cabelos (chanel, longo ondulado);
  - novas roupas (cropped, camisa social, quimono aberto, saia longa);
  - coturno alto e salto plataforma;
  - colar com pingente, brincos, tatuagens e cinto;
  - celular na mão.

**Testes:** unidade (db 58, api 92, shared 18, regras 57) e ponta a ponta (54) passando; lint e tipos sem erros.

## 19/11/2026 — Bonecos 2D que respiram e aba Aparência

**O que funciona (testado):**

- **Tokens desenhados em 2D** (vistos de cima, contorno escuro), que respiram e piscam. Inimigos mantêm visuais próprios (zumbi, cultista, capanga, sombra, fera).
- **Aba "Aparência"** na ficha e um passo "Aparência" na criação guiada:
  - 4 tipos de corpo, 12 cabelos (com mecha colorida opcional), 8 roupas de cima, 5 de baixo, 4 calçados, 8 acessórios, 9 itens na mão e capuz;
  - paletas de cores e seletor de qualquer cor;
  - botão "Aleatório" e pré-visualização animada.
- **Arte própria:** imagem com fundo liso (branco, cinza…) enviada para token ou retrato tem o fundo apagado e vira figura recortada que respira no mapa.

**Como testar:** abra um personagem → aba "Aparência" → escolha cabelo, roupa e cores → salve → o token no mapa muda. Ou arraste uma arte de corpo inteiro com fundo branco sobre um token.

**Testes:** unidade (db 58, api 92, shared 18, regras 57) e ponta a ponta (54) passando; lint e tipos sem erros.

## 19/11/2026 — Mapa grande, tokens 2D e segredos no mapa

**O que funciona (testado):**

- **Mapa muito maior:**
  - a mesa e o editor usam a largura toda da tela;
  - o mapa ocupa a altura disponível e já abre ampliado do maior tamanho que cabe inteiro;
  - zoom até 300%, botões + e − sobre o mapa, "Ajustar à tela" e **Tela cheia** (Esc sai).
- **Tokens em 2D:** cada personagem virou um bonequinho desenhado, em pé sobre uma base, como uma miniatura de papel.
  - Pele, cabelo e penteado mudam de token para token. A roupa usa a cor do token.
  - O equipamento segue a classe: colete e arma no Combatente, mochila e lanterna no Especialista, livro brilhando no Ocultista. A primeira arma da ficha aparece na mão.
  - NPCs usam casaco (alguns, óculos).
  - Inimigos têm visual próprio pelo nome: zumbi, sombra, fera, cultista ou capanga.
  - Com retrato enviado, o token vira um cartão em pé com a imagem.
  - O boneco respira de leve e se levanta ao ser arrastado. Caído, fica deitado e sem cor. A barra de vida fica na base.
  - Quem está mais embaixo no mapa aparece na frente.
- **Segredos no mapa:**
  - **No editor:** selecione uma peça oculta e preencha "Segredo": a perícia que encontra (ex.: Percepção, Investigação, Ocultismo), a DT e o alcance em casas.
  - **Na mesa:** o jogador usa **Procurar ao redor**, escolhe a perícia e o servidor rola o teste do personagem. A rolagem é secreta: só ele e o mestre veem.
  - **Se passar:** o objeto aparece **só para quem achou**, com brilho, faíscas e som, e ele pode usar o que achou (abrir o baú, por exemplo).
  - **O mestre** é avisado ("Fulana encontrou algo") e vê no editor quem descobriu cada segredo.
  - Serve para itens, pistas, armadilhas, portas, corpos e até inimigos escondidos.

**Testes:** banco 58 (+6 segredos), API 91 (+6), ponta a ponta 54 (+3), shared 15, regras 57, lint e typecheck sem erros.

## 19/11/2026 — Mapas realistas e imagens fáceis

**O que funciona (testado):**

- **Chão realista:** madeira com veios e tábuas desencontradas, pedra, tijolo, grama com folhas, terra com pedrinhas, areia, rocha, neve, tapete estampado, azulejo, asfalto, água com reflexos e lava com rachaduras brilhantes. As texturas são geradas pelo próprio site, sem imagens de terceiros.
- **Paredes com volume:** projetam sombra no chão.
- **Árvores:** copas cheias com sombra.
- **Objetos refeitos:** luz e sombra; madeira, metal, vidro e tecido com aparência própria; sombra projetada. Isso vale para portas, móveis, baú, armas, carro, fogueira, círculo ritual com velas e outros.
- **Imagens fáceis:**
  - botão **"Imagem de fundo"** na barra do editor de mapas;
  - **arrastar uma imagem do computador** para o mapa: no vazio vira o fundo; sobre um token vira a imagem dele, e um aviso mostra onde ela vai cair;
  - **Ctrl+V** cola uma imagem copiada (de um site, por exemplo) como fundo; com um token selecionado, cola nele;
  - na mesa, o mestre faz o mesmo; o jogador solta a imagem sobre o token do próprio personagem para virar o retrato;
  - **retrato que salva na hora:** botão de câmera no cartão do personagem (clique ou solte a imagem); na ficha, trocar o retrato não depende mais de "Salvar ficha". O mesmo vale para o retrato do NPC.

**Testes:** ponta a ponta 51 (novo: imagens fáceis), API 85, banco 52, shared 15, regras 57, lint e typecheck sem erros.

## 19/11/2026 — Mesa no celular

**O que funciona (testado num celular simulado, Pixel 7):**

- **Barra fixa embaixo** na mesa (celular e tablet): Mapa · Crônica · Combate · Ficha · Regras. Mostra uma coisa por vez, ocupando a tela.
  - A Crônica mostra quantas mensagens novas chegaram.
  - O Combate ganha um ponto vermelho quando há combate e pisca quando é a sua vez.
- **Mapa com toque:**
  - um dedo arrasta a vista;
  - dois dedos dão zoom (pinça);
  - um toque rápido numa casa vale como clique;
  - o botão "Ajustar à tela" faz o mapa caber na largura, e ele já abre assim no celular.
- **Crônica, Combate, Ficha e Regras** ocupam o espaço entre o topo e a barra de baixo, com o campo de mensagem sempre à vista.
- Dados rolados e a faixa "Combate!" aparecem em qualquer painel.
- **Editor de mapas:** o formulário "Novo mapa" fica recolhido num botão, e o mapa aparece logo.
- **Fichas de personagem e NPC:** os botões Salvar/Cancelar ficam presos embaixo da tela.
- **Menu da campanha:** rola de lado e deixa a seção atual à vista.
- Iniciais dos tokens ignoram símbolos: "Arthur (exemplo)" vira "AE".
- Nenhuma tela tem rolagem para o lado. Isso é verificado automaticamente em 13 telas.

**Testes:** ponta a ponta 48 (incluindo o novo teste da mesa no celular), lint e typecheck sem erros.

## 18/11/2026 — Imagens, modelos de mapa e entrada em combate

**O que funciona (testado):**

- **Fundo de mapa por imagem:** o mestre envia um mapa desenhado ou uma foto (PNG, JPG ou WebP). A grade fica por cima e pode ser escondida. O botão "Ajustar grade à imagem" calcula as linhas para a imagem não ficar esticada.
- **Modelos de mapa prontos:** ao criar um mapa, dá para escolher Casa abandonada, Floresta à noite, Rua da cidade, Cemitério ou Base da Ordem. Cada um já vem com piso, paredes, portas e objetos, e tudo pode ser editado.
- **Imagem nos tokens:**
  - o mestre põe uma imagem em qualquer token;
  - o jogador põe um **retrato** no próprio personagem, que aparece no token e no combate;
  - NPCs também têm retrato, que os jogadores só veem depois de o NPC ser revelado.
- **Imagens já enviadas** podem ser reaproveitadas ou apagadas. O site reduz o tamanho da imagem antes de enviar e remove dados escondidos da foto, como a localização GPS.
- **Entrada em combate:**
  - aparece para todos uma faixa "Combate!" com som e a ordem de iniciativa, e a aba Combate abre sozinha;
  - acima do mapa fica uma **barra de iniciativa** com retratos, rodada, vida e quem é o próximo;
  - clicar num combatente leva o mapa até a peça dele, e o mapa acompanha sozinho a peça da vez;
  - aparecem avisos de "X entrou no combate" e "Combate encerrado";
  - quando é a sua vez, o aviso de combate fica dourado.
- **Ajustes:** a porta aberta ficou mais bonita, e o estado concorda com o objeto ("porta aberta", "baú aberto", "computador ligado").

**Segurança das imagens:**

- O servidor confere o conteúdo real do arquivo. SVG e arquivos disfarçados são recusados.
- Quem pode ver cada imagem é decidido no banco de dados:
  - fundo de mapa oculto ou token oculto não aparece para jogadores;
  - um jogador não consegue usar uma imagem secreta do mestre.

**Limite:** 4 MB por imagem e 60 MB por campanha. As imagens ficam no banco de dados do Supabase (o plano gratuito tem 500 MB no total).

**Testes:** rules-engine 57, shared 15, banco 52, API 85 e ponta a ponta 44, todos passando, além de lint e typecheck sem erros.

## 18/11/2026 — Mesa viva, objetos no mapa e acessibilidade

**O que funciona (testado):**

- **Mapa mais bonito:** pisos com textura (assoalho, pedra, tapete, asfalto, terra, neve, azulejo, grama, areia), paredes com volume e sombra, **água e lava se mexendo**, árvores balançando.
- **Objetos no mapa** (editor → "Objetos"): porta, portão, janela, casa, escada, mesa, cadeira, cama, sofá, estante, computador, baú, caixa, barril, faca, pistola, espingarda, machado, tocha, fogueira, poste de luz, círculo ritual, mancha de sangue, lápide, corpo, armadilha, carro, arbusto e pedra grande. Dá para girar e ocultar.
- **Objetos que funcionam:** clicar (ou Enter no teclado) abre/fecha portas e baús, acende/apaga tochas e fogueiras, liga o computador e o círculo ritual. Todos veem na hora. Tochas e fogueiras **iluminam** o chão em volta e a chama tremula.
- **Peças vivas:** sombra, anel de vida (verde/amarelo/vermelho) durante o combate, anel dourado pulsando em quem está na vez, número de dano/cura subindo, peça caída fica cinza, nome aparece ao passar o mouse, movimento suave. As setas do teclado movem a sua peça.
- **Dados animados:** toda rolagem aparece numa bandeja sobre o mapa, com dados girando até o resultado (o resultado é sempre o do servidor). 20 natural brilha dourado, 1 natural fica vermelho.
- **Sons** (feitos pelo próprio site, sem arquivos de terceiros): dados, portas, fogo, golpe, crítico, turno e aviso.
- **Avisos na tela:** "É a sua vez!", sessão começou, ficha salva, acerto crítico, ritual conjurado.
- **Acessibilidade (botão "Aa" no topo):** tamanho do texto (A, A+, A++), tema escuro ou claro, alto contraste, "menos movimento" e sons com volume. Fica salvo no navegador. Também há o atalho "Pular para o conteúdo" (tecla Tab) e as abas laterais da mesa funcionam com as setas.

**Testes:** rules-engine 57, shared 8, banco 45, API 77 e ponta a ponta 43, todos passando, além de lint e typecheck sem erros.

## 18/11/2026 — Ajuda na criação de personagem

**O que funciona (testado):**

- **Criação guiada:** um "Ajudante" explica cada passo em linguagem simples e com a página do livro. Ao passar o mouse sobre um atributo, perícia, classe, arma ou ritual, ele explica o que aquilo faz. A origem escolhida mostra o poder que concede.
- **Ficha completa:** um "?" ao lado de cada atributo, perícia, recurso (PV/PE/SAN), Defesa, NEX, limite de PE, DT, carga, classe e origem. Ao tocar, aparece a explicação.
- **Ligar e desligar:** o botão "Ajuda ligada/desligada" fica lembrado neste navegador.

**Testes:** rules-engine 57, shared 8, banco 45, API 76 e ponta a ponta 38, todos passando, além de lint e typecheck sem erros.

## 18/11/2026 — Fichas, mesa de treino e regras completas

**O que funciona (testado):**

- **Fichas** (menu principal): biblioteca pessoal de personagens e NPCs, fora das campanhas.
  - Criação guiada passo a passo: conceito, atributos com contador de pontos, origem, classe, perícias, equipamento e rituais iniciais, com a página do livro em cada passo.
  - Ou ficha em branco.
  - "Levar para a campanha" faz uma cópia, e "Guardar cópia nas Fichas" faz o caminho inverso.
- **Mesa de treino** (menu "Treino"): um clique cria uma campanha particular pronta, com personagens de exemplo, NPC com ficha, mapa e criaturas. "Recomeçar do zero" limpa tudo.
- **Ver como jogador** na mesa: o mestre confere o que os jogadores enxergam.
- **NPC com ficha completa:** atributos, armas e rituais. No combate, o mestre ataca e conjura pelo NPC com um clique.
- **Regras que faltavam:**
  - 18 ameaças comuns do livro (bandido, policial, cultistas, animais…);
  - perda permanente de Sanidade aplicada pelas regras e mostrada na ficha;
  - Interlúdio (dormir, relaxar, refeições) com o cálculo do livro.

**Testes:** rules-engine 56, shared 8, banco 45, API 76 e ponta a ponta 38, todos passando, além de lint e typecheck sem erros.

**Ainda não feito:**

- Efeito automático das habilidades de classe (por enquanto: nome, NEX e página).
- Ajustes para celular.
- Mestre por IA (os modos com IA exigem uma chave de IA paga).

## 18/11/2026 — Arsenal, rituais, habilidades e bestiário (Ordem Paranormal)

**O que funciona (testado):**

- **Armas e proteções na ficha:** escolha entre as 37 armas do livro ou crie uma arma própria. Proteções já somam na Defesa. A carga (5 × Força) avisa quando o personagem está sobrecarregado.
- **Atacar na mesa:** o botão **Atacar** rola Luta ou Pontaria e, em seguida, o dano. O crítico é detectado e multiplica os dados. Armas de arremesso têm o botão **Arremessar**.
- **Rituais:** são 82 rituais, com filtro por círculo e elemento. A ficha mostra custo, execução, alcance, alvo, duração e resistência.
- **Conjurar:** o botão **Conjurar** (também nas formas Discente e Verdadeiro) desconta PE e respeita o limite por turno. Ele rola o custo paranormal (Ocultismo, DT 20 + custo) e tira SAN se falhar; rituais de Medo tiram SAN direto. Também rola o dano ou a cura do ritual quando o livro dá o dado.
- **Habilidades:** a ficha mostra a tabela da classe por NEX (o que já foi liberado fica aceso), a escolha de trilha com as habilidades de 10/40/65/99%, os poderes de classe e os poderes paranormais.
- **Bestiário:** no combate, o mestre escolhe entre 49 criaturas do livro. Elas entram com PV, Iniciativa e ataques, e o mestre vê a Defesa e um botão de ataque para cada golpe.
- **Página do livro:** cada item tem um link "p. X" que abre a página no livro enviado.

**Testes:** rules-engine 53, shared 8, banco 43, API 70 e ponta a ponta 34, todos passando, além de lint e typecheck sem erros.

**Ainda não feito:**

- Ameaças mundanas (bandido, policial…) no bestiário; por enquanto entram como "Inimigo".
- SAN máxima reduzida por perda permanente.
- Efeito automático de cada habilidade (por enquanto: nome, NEX e página).

## 17/11/2026 — Combate na mesa

**O que funciona (testado):**

- **Cadastro:** a confirmação de e-mail foi desligada no Supabase, a pedido do responsável. Amigos criam conta e já entram.
- **Iniciar combate:** a mesa tem uma aba **Combate**. O mestre clica em "Iniciar combate" e todos os personagens entram. O mestre adiciona inimigos (vários de uma vez: "Zumbi 1, 2…") ou NPCs, com PV, e pode deixá-los **ocultos**.
- **Iniciativa:** cada jogador rola a do próprio personagem. A rolagem é feita no servidor pela regra do livro (Ordem: perícia Iniciativa, p. 93) e aparece na crônica. O mestre pode digitar a Iniciativa dos inimigos.
- **Turnos:** uma faixa sobre o mapa mostra "Rodada N · Vez de X". O mestre passa os turnos. O jogador vê "(sua vez!)" e um botão "Encerrar meu turno". Quando a lista acaba, começa a próxima rodada.
- **Dano e cura:** nos personagens, alteram a ficha. Nos inimigos, os PV ficam só para o mestre; os jogadores veem apenas Ileso, Machucado ou Caído. Inimigo com 0 PV sai da ordem de turnos.
- **Condições:** em Ordem Paranormal são as 36 condições do livro (p. 320–321), cada uma com um resumo ao passar o mouse.

**Testes:** rules-engine 47, shared 8, banco 43, API 66 e ponta a ponta 32, todos passando, além de lint e typecheck sem erros.

**Ainda não feito:** rituais com botão de conjurar e gasto de PE; habilidades de classe e trilhas por NEX; armas com botão de ataque e dano; bestiário de criaturas do livro.

## 17/11/2026 — Preparar x Jogar (sessões ao vivo)

**O que funciona (testado):**

- As abas da campanha estão separadas em **Jogar** (Mesa) e **Preparar** (Personagens, NPCs, Mapas), além de Sessões e Gerenciar.
- O mestre clica em **Iniciar sessão** (com título opcional). Todos os membros recebem o aviso "Sessão ao vivo — Entrar na mesa", mesmo que estejam em outra página. O painel de campanhas mostra o selo "ao vivo".
- Durante a sessão, o mestre escolhe **qual mapa todos veem**, e a tela dos jogadores troca sozinha.
- A crônica mostra só o que aconteceu na sessão atual. O mestre encerra a sessão com um resumo.
- Na aba **Sessões** fica o histórico: número, título, datas, total de mensagens, resumo (que o mestre pode editar) e a crônica completa de cada sessão.

**Testes:** rules-engine 44, shared 8, banco 38, API 60 e ponta a ponta 26, todos passando, além de lint e typecheck sem erros.

**Como testar:** abra a campanha como mestre, vá em Mesa e clique em Iniciar sessão. Em outro navegador, entre como jogador e veja o aviso. Depois escolha um mapa em "Mapa para todos" e encerre a sessão; o resumo aparece na aba Sessões.

**Ainda não feito:** combate com iniciativa e turnos, rituais e habilidades por NEX (próximos passos de Ordem Paranormal).

## 17/11/2026 — Fase 1: Fundação

### O que foi implementado e testado

- **Monorepo** (pnpm + Turborepo), TypeScript estrito, ESLint, Prettier, CI no GitHub Actions, `docker-compose.yml`.
- **Banco** (`packages/db`): 8 tabelas, migrations versionadas com proteção contra edição, trigger que cria perfil + organização pessoal a cada novo usuário, **RLS em todas as tabelas**, auditoria somente-inserção, convites com token guardado como hash.
- **API** (`apps/api`, NestJS): saúde do sistema, perfil, organizações, campanhas (criar, listar, ver, editar, arquivar, excluir), membros (papéis, remover, sair), convites (criar, listar, cancelar, aceitar). Validação de entrada, erros padronizados em português, logs estruturados com identificador de requisição, limite de requisições por usuário/IP, proteção de cabeçalhos, conexão WebSocket autenticada (base para a Fase 7). A API executa as consultas com o papel do usuário, então o RLS vale também para ela.
- **Site** (`apps/web`, Next.js): tema Dark Fantasy próprio (preto/grafite/roxo/dourado, fontes Cinzel + Inter), entrar, cadastrar, recuperar senha, nova senha, painel de campanhas, criar campanha, página da campanha (membros, convites, configurações), aceitar convite, perfil, página 404. Responsivo.
- **Login com Google**: implementado (botão, retorno OAuth). Fica desativado com aviso até ser configurado (ver "O que ainda não funciona").

### Resultado dos testes (executados em 17/11/2026)

| Conjunto                                              | Resultado |
| ----------------------------------------------------- | --------- |
| Unidade (validações compartilhadas)                   | 8/8 ✅    |
| Banco — segurança RLS, trigger, auditoria, migrations | 15/15 ✅  |
| API — integração com Postgres e Redis reais           | 23/23 ✅  |
| Ponta a ponta no navegador (desktop + celular)        | 11/11 ✅  |
| Lint, verificação de tipos, varredura de segredos     | ✅        |

### Critérios de aceitação da Fase 1

| #   | Critério                                                                  | Situação                                                                                                                                       |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cadastro e login com e-mail e senha                                       | ✅ testado (emulador)                                                                                                                          |
| 2   | Sessão renova; sair encerra                                               | ✅ sair testado; renovação implementada pela biblioteca do Supabase, não testada com expiração real                                            |
| 3   | Criar campanha e vê-la no painel                                          | ✅                                                                                                                                             |
| 4   | Convite aceito por outro usuário com papel correto                        | ✅                                                                                                                                             |
| 5   | Terceiro usuário não vê nem altera (inclusive pela API e direto no banco) | ✅                                                                                                                                             |
| 6   | Auditoria de campanhas e membros                                          | ✅                                                                                                                                             |
| 7   | Excesso de requisições → 429 com mensagem clara                           | ✅                                                                                                                                             |
| 8   | Tema Dark Fantasy em desktop e celular                                    | ✅ capturas de tela geradas pelos testes                                                                                                       |
| 9   | Ambiente local sobe pelo README                                           | ⚠️ testado com Postgres/Redis instalados direto; o `docker compose` não pôde ser executado aqui (download de imagens bloqueado neste ambiente) |
| 10  | `/health` informa banco e Redis                                           | ✅                                                                                                                                             |

### O que ainda NÃO funciona (honestamente)

1. **Supabase real não foi testado.** Neste ambiente não foi possível baixar nem compilar o Supabase Auth. Os testes usaram um **emulador próprio** (`tools/auth-emulator`), que imita só o necessário e é marcado como "somente desenvolvimento". O código do site e da API é o mesmo que roda com o Supabase real, mas **é preciso validar** criando o projeto gratuito (`docs/setup-supabase.md`).
2. **Login com Google**: depende do passo acima + credenciais gratuitas do Google. Não testado.
3. **Envio de e-mails** (confirmação, recuperação de senha, convites por e-mail): não configurado. A recuperação de senha está implementada, mas só funciona com o Supabase real. Convites funcionam por link copiado.
4. **Escolha do sistema de RPG na campanha**: chega nas Fases 2–3.
5. **Mesa de jogo** (chat, fichas, rolagens, mapas, IA): fases futuras; a interface avisa isso.

### Como testar você mesmo

1. Siga o README ("Rodar no seu computador").
2. Abra http://localhost:3000, crie uma conta, crie uma campanha, gere um link de convite.
3. Abra uma janela anônima, cole o link, crie outra conta e aceite: a campanha aparece para as duas contas.
4. Crie uma terceira conta e tente abrir o endereço da campanha: deve aparecer "Caminho perdido".

### Próxima fase (2 — Importação de PDFs)

Upload seguro de PDFs, validação, extração de texto por página, detecção de páginas digitalizadas, OCR gratuito (Tesseract), divisão em trechos, fila de processamento (BullMQ) e tela de acompanhamento. Antes de começar preciso de duas decisões: **D-03** (busca por significado: recomendo modelo gratuito local para manter custo zero) e **D-05** (política de direitos autorais dos PDFs).
