# RPG AI

Plataforma multiplayer de RPG de mesa com Mestre humano, Mestre de IA ou Mestre humano assistido por IA — capaz de importar PDFs de qualquer sistema de RPG e transformá-los em regras jogáveis.

**Status:** Fase 1 (Fundação) concluída localmente. Veja `docs/progress.md`.

## Rodar no seu computador (custo zero)

Pré-requisitos: [Node.js 22+](https://nodejs.org), [pnpm](https://pnpm.io) e [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env               # 1. configurações locais (já vêm prontas para uso local)
cp .env.example apps/web/.env.local
docker compose up -d               # 2. sobe banco de dados e Redis
pnpm install                       # 3. instala dependências
pnpm build                         # 4. compila
pnpm db:bootstrap-local && pnpm db:migrate   # 5. prepara o banco
```

Depois, em três terminais (com as variáveis do `.env` carregadas, ex.: `set -a; source .env; set +a`):

```bash
pnpm auth:emulator                 # login local (somente desenvolvimento)
pnpm --filter @rpg-ai/api start    # servidor em http://localhost:4000
pnpm --filter @rpg-ai/web dev      # site em http://localhost:3000
```

> O **emulador de login** existe só para desenvolvimento e testes. Para usar com pessoas reais (e para o login com Google), siga `docs/setup-supabase.md` — o plano gratuito do Supabase é suficiente.

## Testes

```bash
pnpm test        # unidade + integração (precisa do Postgres e Redis do docker compose)
pnpm test:e2e    # ponta a ponta no navegador (sobe tudo sozinho)
pnpm lint && pnpm typecheck && pnpm check:secrets
```

## Documentação

| Arquivo                  | Conteúdo                                                              |
| ------------------------ | --------------------------------------------------------------------- |
| `CLAUDE.md`              | Regras permanentes de desenvolvimento                                 |
| `docs/architecture.md`   | Arquitetura, diretórios, fluxo de PDFs, motor de regras, Mestre de IA |
| `docs/database.md`       | Modelo de dados e segurança do banco                                  |
| `docs/roadmap.md`        | Fases e critérios de aceitação                                        |
| `docs/decisions.md`      | Decisões tomadas e pendentes                                          |
| `docs/risks.md`          | Riscos técnicos e financeiros                                         |
| `docs/progress.md`       | O que foi feito, o que falta, como testar                             |
| `docs/setup-supabase.md` | Passo a passo: Supabase gratuito + login com Google                   |

## Pequeno glossário

- **API / backend:** o servidor que decide e guarda tudo.
- **Frontend:** o site que o usuário vê.
- **RLS (Row Level Security):** regra no próprio banco que impede alguém de ler dados que não são seus, mesmo se houver erro no servidor.
- **Migration:** alteração versionada na estrutura do banco.
- **Teste E2E:** robô que usa o site como um usuário real para verificar se tudo funciona.
- **Emulador:** imitação local de um serviço externo, usada só para testar sem custo e sem internet.
