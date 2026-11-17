# Roadmap — RPG AI

## Fases

| Fase | Entrega                            | Resultado visível para você                                                  |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------- |
| 1    | Fundação                           | Criar conta, entrar, ver painel, criar campanha, convidar jogadores.         |
| 2    | Importação de PDFs                 | Enviar um PDF, acompanhar processamento, ver páginas e trechos extraídos.    |
| 3    | Modelo universal + motor de regras | Revisar regras extraídas lado a lado com o PDF, aprovar, testar uma rolagem. |
| 4    | Fichas dinâmicas                   | Cada sistema gera sua ficha; criação manual e assistida por IA.              |
| 5    | NPCs e criaturas                   | Criar/gerenciar NPCs com personalidade, segredos e estatísticas.             |
| 6    | Mestre de IA e memória             | Jogar com IA narrando; modo assistente para mestre humano.                   |
| 7    | Multiplayer                        | Mesa em tempo real: chat, rolagens, fichas compartilhadas.                   |
| 8    | Mapas e combate                    | Grade, tokens, iniciativa, turnos, alcance.                                  |
| 9    | Segurança, testes e produção       | Endurecimento, carga, backups, deploy de produção.                           |

Observação: chat e presença básicos aparecem já na Fase 7, mas a infraestrutura de WebSocket é preparada desde a Fase 1 (sem funcionalidade exposta).

---

## FASE 1 — Plano detalhado

**Objetivo:** base sólida sobre a qual tudo será construído. Ao fim, um usuário real consegue se cadastrar, entrar, criar campanha e convidar outra pessoa — com segurança, testes e tema visual definitivo.

### 1.1 Repositório e ferramentas

- Monorepo pnpm + Turborepo; TypeScript strict; ESLint + Prettier; Husky + lint-staged.
- `docker-compose.yml`: Postgres 16 + pgvector, Redis 7. Supabase local via Supabase CLI.
- `.env.example` documentado; validação das variáveis no boot (falha clara se faltar algo).
- CI (GitHub Actions): instalar, lint, typecheck, testes unitários, integração (com containers) e E2E.

### 1.2 Banco

- Pacote `packages/db` com Drizzle; migrations SQL das tabelas da Fase 1 (ver database.md).
- Extensões: `pgcrypto`, `vector`, `pg_trgm`.
- Trigger: ao criar usuário no Supabase Auth → cria `users`, `user_profiles` e organização pessoal.
- Políticas RLS + testes de RLS.

### 1.3 API (NestJS)

- Módulos: `health`, `auth` (guard que valida JWT do Supabase), `users`, `organizations`, `campaigns`, `invitations`, `audit`.
- Validação Zod em todas as rotas; formato de erro padronizado.
- Logs estruturados (pino) com request id; rate limiting por IP e por usuário (Redis).
- Documentação OpenAPI gerada automaticamente.
- Gateway WebSocket esqueleto com autenticação (somente teste de conexão).

Rotas iniciais:

```
GET    /health
GET    /me                      PATCH /me
GET    /organizations           (minhas)
GET    /campaigns               POST /campaigns
GET    /campaigns/:id           PATCH /campaigns/:id   DELETE /campaigns/:id (lógico)
GET    /campaigns/:id/members   PATCH/DELETE membros (owner/gm)
POST   /campaigns/:id/invitations
POST   /invitations/:token/accept
```

### 1.4 Web (Next.js)

- Design system Dark Fantasy em `packages/ui`: paleta preto/grafite/roxo com acentos dourados, tipografia (serifada para títulos + sans legível para texto), componentes shadcn customizados, animações discretas, estados de foco acessíveis.
- Telas: Login, Cadastro, Recuperar senha, Painel (campanhas, convites pendentes), Criar campanha, Detalhe da campanha (membros, convites, modo de mestre), Perfil.
- Responsivo (desktop primeiro, funcional em celular).
- Avisos claros quando integração não estiver configurada (ex.: e-mail).

### 1.5 Testes

- Vitest: serviços da API, validações, utilitários.
- Integração: API + Postgres real (testcontainers), incluindo RLS ("usuário B não vê campanha de A").
- Playwright: cadastro → login → criar campanha → convidar → segundo usuário aceita → ambos veem a campanha.

### 1.6 Documentação

- README com "como rodar em 5 comandos".
- Atualizar architecture, database, decisions, progress.

### Estimativa de esforço

Fase 1 ≈ 4–7 sessões de trabalho intensivo comigo, dependendo do ritmo de revisão. (Estimativa, não promessa.)

---

## Critérios de aceitação

### Gerais (valem para todas as fases)

- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:e2e` passam no CI.
- Nenhum segredo no repositório (verificação automática no CI).
- Toda rota nova tem validação de entrada, verificação de permissão e teste.
- Documentação e `progress.md` atualizados, com "o que não funciona" explícito.

### Fase 1

1. Um novo usuário se cadastra com e-mail e senha, confirma (quando o e-mail estiver configurado) e entra.
2. Sessão expira e renova corretamente; sair encerra a sessão.
3. O usuário cria uma campanha escolhendo nome, descrição e modo de mestre; ela aparece no painel.
4. O dono gera convite; outro usuário aceita e passa a ver a campanha com o papel correto.
5. Um terceiro usuário sem convite **não consegue** ver nem alterar a campanha, nem pela API direta (teste automatizado).
6. Toda criação/alteração de campanha e membro gera registro em `audit_logs`.
7. Excesso de requisições retorna erro 429 com mensagem clara.
8. Interface segue o tema Dark Fantasy em desktop e celular (verificação visual com capturas no Playwright).
9. `docker compose up` + comandos do README sobem o ambiente local do zero.
10. `/health` informa estado de banco e Redis.

### Fases seguintes (resumo — detalhados ao iniciar cada fase)

- **F2:** PDF de texto e PDF digitalizado processados; páginas e trechos ligados à página correta; arquivo inválido rejeitado com mensagem.
- **F3:** ≥ 90% das regras propostas têm citação verificada; nenhuma regra é aprovada sem fonte; DSL rejeita expressões fora da lista branca; rolagens reproduzíveis por semente.
- **F4:** dois sistemas diferentes (ex.: um d20 e um de parada de dados) geram fichas diferentes; alteração inválida rejeitada no servidor.
- **F6:** em teste de vazamento, a IA não revela segredos de GM a jogadores; toda mudança mecânica feita pela IA aparece no audit log.
- **F7:** dois navegadores sincronizam em < 1 s; reconexão recupera mensagens perdidas.
- **F8:** movimento e alcance respeitam a grade e as regras do sistema.
- **F9:** teste de carga, restauração de backup, revisão de segurança.
