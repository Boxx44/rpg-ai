# Progresso — RPG AI

| Fase                       | Status                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------- |
| 0 — Análise e documentação | ✅ Concluída (17/11/2026)                                                           |
| 1 — Fundação               | ✅ Concluída localmente (17/11/2026) — falta validar com Supabase real (ver abaixo) |
| 2 — Importação de PDFs     | ⏳ Próxima                                                                          |
| 3–9                        | ⬜ Não iniciadas                                                                    |

---

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
