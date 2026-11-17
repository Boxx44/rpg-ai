# Progresso — RPG AI

| Fase                       | Status                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------- |
| 0 — Análise e documentação | ✅ Concluída (17/11/2026)                                                           |
| 1 — Fundação               | ✅ Concluída localmente (17/11/2026) — falta validar com Supabase real (ver abaixo) |
| 2 — Importação de PDFs     | ⏳ Próxima                                                                          |
| 3–9                        | ⬜ Não iniciadas                                                                    |

---

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
