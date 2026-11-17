# Arquitetura técnica — RPG AI

> Versão 0.2 — Fase 1 implementada (17/11/2026)

## 1. Visão geral em linguagem simples

Pense no RPG AI como uma mesa de jogo com quatro "funcionários":

| Peça                              | Analogia              | O que faz                                                                |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| **Web** (site)                    | A mesa e as fichas    | O que o jogador vê e clica. Não decide nada sozinho.                     |
| **API** (servidor)                | O árbitro             | Recebe pedidos, verifica permissões, aplica regras, guarda tudo.         |
| **Worker** (trabalhador de fundo) | O bibliotecário       | Lê PDFs, extrai regras, gera resumos e memórias sem travar o jogo.       |
| **Motor de regras**               | A calculadora oficial | Executa regras aprovadas de forma exata e repetível. Não "imagina" nada. |

A **IA** é como um narrador talentoso que **não pode tocar nos dados nem nas fichas**: ela só pode _pedir_ ao árbitro ("role um teste de Furtividade para o Jogador 2"). O árbitro confere e executa.

```
           ┌────────────────────────── Navegador ──────────────────────────┐
           │  apps/web (Next.js)  — telas, fichas, chat, mapa               │
           └───────────┬───────────────────────────────┬───────────────────┘
                       │ HTTPS (REST)                  │ WebSocket (tempo real)
           ┌───────────▼───────────────────────────────▼───────────────────┐
           │  apps/api (NestJS)                                             │
           │  Auth guard · Permissões · Campanhas · Fichas · Chat · Combate │
           │  ┌─────────────────────┐   ┌──────────────────────────────┐    │
           │  │ rules-engine (puro) │◄──┤ AI Tool Gateway (ferramentas) │    │
           │  └─────────────────────┘   └──────────────────────────────┘    │
           └──────┬──────────────┬──────────────────┬──────────────────────┘
                  │              │ enfileira jobs   │
          ┌───────▼─────┐  ┌─────▼─────┐   ┌────────▼────────┐
          │ PostgreSQL  │  │  Redis    │   │ apps/worker      │
          │ + pgvector  │  │ (BullMQ,  │◄──┤ PDF · OCR · RAG  │
          │ + RLS       │  │  pub/sub, │   │ Embeddings · IA  │
          │ (Supabase)  │  │  rate lim)│   └────────┬─────────┘
          └─────────────┘  └───────────┘            │
                 ▲                                  ▼
          Supabase Auth / Storage           Provedores externos
                                            (LLM, embeddings, OCR)
```

## 2. Decisões de arquitetura principais

- **Monorepo** (pnpm workspaces + Turborepo): um único repositório, várias aplicações, código compartilhado sem duplicação.
- **Next.js só para interface.** Nenhuma regra de negócio no frontend; ele chama a API.
- **NestJS como único ponto de escrita.** Web, IA e Worker passam pelos mesmos serviços e validações.
- **Worker separado da API.** Processar um PDF de 400 páginas pode levar minutos; não pode deixar o jogo lento.
- **Supabase** fornece Postgres gerenciado (com pgvector e RLS), Auth e Storage em um só serviço, reduzindo infraestrutura.
- **Drizzle ORM** (em vez de Prisma): melhor suporte a SQL bruto, pgvector e políticas RLS em migrations (ver `decisions.md`, ADR-003).
- **Socket.IO** via gateway NestJS com adaptador Redis: permite vários servidores API compartilhando salas.
- **Motor de regras como pacote TypeScript puro**: roda igual na API, no Worker e nos testes; 100% testável sem banco.

## 3. Estrutura de diretórios

```
rpg-ai/
├── CLAUDE.md
├── README.md
├── docker-compose.yml          # Postgres+pgvector, Redis, (Supabase local via CLI)
├── .env.example
├── turbo.json · pnpm-workspace.yaml · tsconfig.base.json
├── apps/
│   ├── web/                    # Next.js
│   │   ├── app/
│   │   │   ├── (auth)/login, register, reset
│   │   │   ├── (app)/dashboard
│   │   │   ├── (app)/campaigns/[id]/          # mesa, chat, fichas, mapa
│   │   │   ├── (app)/systems/[id]/            # sistemas, documentos, revisão de regras
│   │   │   └── (app)/settings
│   │   ├── components/          # componentes de tela (sem regra de negócio)
│   │   ├── lib/api-client/      # cliente tipado da API
│   │   └── e2e/                 # testes Playwright
│   ├── api/                    # NestJS
│   │   └── src/modules/
│   │       ├── auth/            # valida JWT do Supabase, guards
│   │       ├── users/ organizations/
│   │       ├── campaigns/ invitations/ permissions/
│   │       ├── systems/ documents/ rules/        # catálogo, upload, revisão
│   │       ├── characters/ npcs/ creatures/ inventory/
│   │       ├── game/            # rolagens, testes, condições (usa rules-engine)
│   │       ├── combat/ maps/
│   │       ├── chat/ realtime/  # gateways WebSocket
│   │       ├── memory/          # memória de campanha + busca vetorial
│   │       ├── ai/              # orquestrador do Mestre IA + tool gateway
│   │       ├── audit/           # registro auditável
│   │       └── health/
│   └── worker/                 # NestJS standalone (BullMQ)
│       └── src/processors/
│           ├── document-ingest/  # validação, extração, OCR, chunking
│           ├── rule-extraction/  # classificação e estruturação por IA
│           ├── embeddings/
│           └── memory-summarize/
├── packages/
│   ├── shared/                 # schemas Zod, tipos, enums, erros padronizados
│   ├── db/                     # schema Drizzle, migrations/, rls/, seeds de teste
│   ├── rules-dsl/              # parser, AST, verificador de tipos da DSL
│   ├── rules-engine/           # executor determinístico, dados, efeitos, auditoria
│   ├── system-model/           # modelo universal de sistemas (schemas)
│   ├── ai/                     # cliente LLM, prompts versionados, definições de ferramentas
│   ├── ui/                     # design system Dark Fantasy (componentes estilo shadcn + theme.css)
│   └── logger/                 # pino configurado
├── tools/
│   ├── auth-emulator/          # imitação LOCAL do Supabase Auth (somente dev/testes)
│   └── check-secrets.mjs       # varredura de segredos no repositório
└── docs/
    ├── architecture.md  database.md  roadmap.md
    ├── decisions.md     progress.md  risks.md
```

## 4. Fluxo de importação e interpretação de PDFs

Objetivo: transformar um livro de regras em **regras estruturadas, rastreáveis e aprovadas por humano**, sem que a IA invente nada.

```
[1] Upload ─► [2] Validação ─► [3] Extração ─► [4] OCR (se preciso) ─► [5] Chunking
                                                                           │
[10] Aprovação humana ◄─ [9] Revisão ◄─ [8] Contradições ◄─ [7] Estruturação ◄─ [6] Classificação
       │
       └─► regras "approved" ficam disponíveis ao motor e à IA
```

| Etapa            | O que acontece                                                                                                                                                                                                                                   | Proteções                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1. Upload        | Navegador envia direto ao Supabase Storage com URL assinada temporária.                                                                                                                                                                          | Bucket privado; só o dono/organização acessa.                                                                                  |
| 2. Validação     | Worker confere assinatura real do arquivo (não só a extensão), tamanho (limite inicial 200 MB), nº de páginas (≤ 1.500), PDF não criptografado, hash SHA-256 (evita duplicata e cria versão).                                                    | Rejeita arquivos malformados; PDF nunca é "executado".                                                                         |
| 3. Extração      | Texto por página com posição (pdf.js). Detecção de colunas, cabeçalhos e tabelas por heurística de layout.                                                                                                                                       | Cada trecho guarda página e coordenadas.                                                                                       |
| 4. OCR           | Páginas com pouco texto extraível são marcadas como "digitalizadas" e enviadas a OCR (ver decisão pendente D-04).                                                                                                                                | OCR é opcional por documento e tem custo exibido antes.                                                                        |
| 5. Chunking      | Divide por seção/título (não por tamanho cego), ~500–1.200 tokens, com sobreposição. Gera embeddings (pgvector).                                                                                                                                 | Chunk sempre aponta para `document_page`.                                                                                      |
| 6. Classificação | IA rotula cada chunk: atributo, teste, combate, magia, item, condição, progressão, lore, irrelevante…                                                                                                                                            | Saída validada por schema Zod; inválida → reprocessa ou marca "falha".                                                         |
| 7. Estruturação  | IA propõe a regra no **modelo universal** + expressão na DSL. **Obrigatório citar o trecho literal**. O sistema confere por busca de texto que a citação existe naquela página; se não existir, a regra é descartada ("citação não verificada"). | Anti-alucinação automática. Grau de confiança calculado (citação verificada, validade da DSL, concordância entre 2 passagens). |
| 8. Contradições  | Compara regras de mesma categoria/alvo (busca vetorial + mesmo identificador). Conflitos viram itens de revisão.                                                                                                                                 | Nunca resolve conflito sozinha.                                                                                                |
| 9. Revisão       | Tela lado a lado: página original do PDF ↔ regra estruturada ↔ teste rápido no motor.                                                                                                                                                            | Usuário edita, aprova, rejeita ou marca "precisa de definição".                                                                |
| 10. Aprovação    | Regra aprovada gera nova `rule_version`. Sistema ganha nova `system_version` quando publicado.                                                                                                                                                   | Campanhas ficam presas a uma versão; atualizar é opcional.                                                                     |

**Quando a informação não existe:** a IA responde com o estado `not_found` (campo obrigatório no schema), e a interface mostra "Regra não localizada no material importado".

**Direitos autorais:** PDFs ficam privados para quem enviou (ou sua organização). Não há compartilhamento público de livros. Ver `risks.md`.

## 5. Motor universal de regras

### 5.1 Ideia central

Nenhum conceito é obrigatório. Um sistema é um **conjunto de definições** declaradas em dados (JSON validado), não em código. O motor sabe apenas executar _operações genéricas_.

### 5.2 Modelo universal (`packages/system-model`)

```
SystemDefinition
├── meta: nome, versão, idioma, fontes
├── dice:        mecanismos de aleatoriedade (d20, pool de d6, d100, 2d6+, cartas, sem dados)
├── stats:       StatDefinition[]  (atributo | perícia | recurso | derivado | contador | tag)
│                 id, nome, tipo de valor (int, decimal, bool, texto, lista),
│                 limites, valor padrão, fórmula (DSL) se derivado
├── checks:      CheckDefinition[] (como um teste é resolvido: fórmula, alvo, graus de sucesso)
├── modifiers:   regras de empilhamento (soma, maior vence, por fonte, por tipo)
├── conditions:  ConditionDefinition[] (efeitos, duração, como termina)
├── actions:     ActionDefinition[] (custo, requisitos, efeitos) — habilidades, magias, manobras
├── collections: tipos extensíveis definidos pelo sistema: classe, raça, carreira,
│                clã, arquétipo, equipamento, magia… (o sistema decide quais existem)
├── combat:      opcional — iniciativa (fórmula ou ordem fixa), estrutura de turno,
│                ações por turno, alcance/distância, dano e recursos afetados
├── progression: opcional — XP, níveis, marcos, compra de pontos, uso-melhora
├── sheet:       layout da ficha (seções → campos referenciando stats/coleções)
└── customRules: regras textuais aprovadas sem automação ("o mestre decide")
```

Toda regra que não puder ser automatizada é aceita como **regra textual** — o produto continua utilizável, a IA consulta e o mestre arbitra.

### 5.3 DSL segura (`packages/rules-dsl`)

Linguagem de expressões pequena, com parser próprio → AST → verificação de tipos → interpretação.

Exemplos:

```
mod(STR)                      = floor((stat("STR") - 10) / 2)
ataque                        = roll("1d20") + mod("STR") + stat("proficiency")
teste_pool                    = count(roll_pool(stat("Agility"), 6), d => d >= 5)
dano                          = roll("2d6") + max(0, stat("Might") - 2)
sucesso                       = if(total >= target, "sucesso", "falha")
```

Garantias:

- **Lista branca** de funções: aritmética, comparação, `if`, `min/max/floor/ceil/round`, `roll`, `roll_pool`, `keep_highest/lowest`, `explode`, `count`, `sum`, `stat`, `has_condition`, `lookup(tabela, valor)`.
- Sem variáveis globais, sem acesso a rede/arquivo, sem `eval`.
- Limites: profundidade da AST, nº de dados por rolagem (ex.: ≤ 1.000), tempo de execução, sem laços infinitos (apenas funções de coleção finitas).
- Erros de DSL viram mensagens legíveis para o revisor.

### 5.4 Execução

```
Pedido (humano ou IA) ─► validação de permissão ─► rules-engine.execute(op, estado, sistema)
   ─► resultado + lista de efeitos propostos ─► API aplica em transação ─► audit_log + evento WebSocket
```

- O motor é **função pura**: recebe estado + operação + semente/RNG injetado, devolve resultado e efeitos. Isso permite testes repetíveis e "reprodução" de qualquer rolagem auditada.
- Em produção, o RNG usa `crypto.randomInt`; cada dado rolado é registrado.
- Operações: `check`, `roll`, `apply_modifier`, `apply_condition`, `remove_condition`, `spend_resource`, `restore_resource`, `use_action`, `transfer_item`, `advance` (progressão), `start_combat`, `next_turn`, `move_token`.

## 6. Arquitetura do Mestre de IA

```
Mensagem do jogador / evento
        │
        ▼
┌────────────────── Orquestrador (apps/api/modules/ai) ──────────────────┐
│ 1. Context Builder                                                      │
│    • resumo do sistema e regras relevantes (RAG em regras APROVADAS)    │
│    • estado da cena (local, NPCs presentes, combate)                    │
│    • memórias recuperadas (busca vetorial + recência + importância),    │
│      FILTRADAS pela visibilidade permitida                              │
│    • últimas N mensagens + resumo da sessão                             │
│ 2. LLM com ferramentas (tool use)                                        │
│ 3. Tool Gateway: cada chamada → schema Zod → permissão → serviço real    │
│ 4. Resposta narrativa → filtro de vazamento → chat                       │
│ 5. Pós-processamento (worker): extrair fatos → campaign_memories         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Ferramentas autorizadas (exemplos):** `lookup_rule`, `request_check`, `roll_dice`, `apply_effect`, `start_combat`, `npc_act`, `create_npc` (rascunho), `create_quest`, `update_quest`, `recall_memory`, `record_event`, `reveal_secret` (somente ao destinatário correto).
A IA **não tem** ferramenta de SQL, de editar ficha livremente ou de ler dados de outra campanha.

**Os três modos:**

| Modo         | Comportamento                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Human GM     | IA desligada na mesa; o mestre usa ferramentas manualmente.                                                      |
| AI GM        | IA narra e chama ferramentas; efeitos mecânicos são aplicados automaticamente após validação.                    |
| AI Assistant | IA sugere (narração, NPC, teste, consequência) **somente ao mestre**; nada é aplicado sem o clique de aprovação. |

**Proteção de segredos:** o contexto enviado à IA é montado com o mesmo filtro de permissão do usuário-alvo. No modo AI GM, a IA vê segredos do mestre, mas cada mensagem tem destinatário; antes de publicar, um verificador compara a resposta com segredos marcados e bloqueia/reescreve vazamentos.

**NPCs:** cada NPC tem "conhecimentos" e "segredos" próprios; ao interpretar um NPC, a IA recebe só o que **aquele NPC sabe**.

**Controle de custo:** limite de tokens por sessão/campanha, modelo menor para tarefas simples (classificação, resumo), cache de prompt para o bloco de regras do sistema, e painel de consumo.

## 7. Multiplayer (resumo)

- Salas Socket.IO por campanha/sessão; autenticação no handshake com JWT.
- Toda mensagem do cliente é um **comando** validado; o servidor emite **eventos** com número de sequência (permite reconectar e recuperar o que perdeu).
- Estado oficial no Postgres; Redis para presença, pub/sub entre instâncias e rate limiting.

## 7.1 Estado após a Fase 1

Existem hoje: `apps/web`, `apps/api`, `packages/{db,shared,ui,logger,rules-engine}`, `tools/`. O `rules-engine` já contém o motor de dados (notação segura: `2d6+3`, `4d6kh3`, `3d6!`, `4dF`, limites contra abuso, gerador injetável). Os demais diretórios (`apps/worker`, `rules-dsl`, `system-model`, `ai`) são criados nas fases correspondentes.

**Mesa de jogo (tempo real):** o navegador conecta ao namespace `/realtime` com o token, entra na sala `c:<campanha>` (mestres também em `c:<campanha>:gm`). Ações vão pela API REST; a API grava no banco e distribui o evento para a sala certa (`chat.message`, `token.moved`, `maps.changed`, `npcs.changed`, `characters.changed`). Ao reconectar, o cliente busca o que perdeu (`GET /messages?after=`).

**Fluxo de autenticação implementado:** o navegador faz login no Supabase Auth → recebe um token (JWT) → envia o token à API → a API verifica a assinatura (segredo HS256 ou chaves públicas JWKS) → confirma que a conta existe e está ativa → executa a consulta no banco com o papel do usuário (RLS ativo).

## 8. Dependências externas

| Serviço                                                      | Uso                            | Obrigatório na Fase 1?                            |
| ------------------------------------------------------------ | ------------------------------ | ------------------------------------------------- |
| Supabase (Postgres, Auth, Storage)                           | Banco, login, arquivos         | Sim (local via Supabase CLI/Docker)               |
| Redis                                                        | Filas, tempo real, limites     | Sim (local via Docker)                            |
| Provedor LLM (recomendado: Anthropic Claude)                 | Mestre IA, extração de regras  | Não (Fase 2+)                                     |
| Provedor de embeddings (Voyage AI ou OpenAI)                 | Busca semântica                | Não (Fase 2)                                      |
| OCR (decisão D-04)                                           | PDFs digitalizados             | Não (Fase 2)                                      |
| Hospedagem web (Vercel) e API/Worker (Railway/Fly.io/Render) | Produção                       | Não (Fase 9; staging opcional antes)              |
| Sentry (ou similar)                                          | Monitoramento de erros         | Recomendado a partir da Fase 1                    |
| E-mail transacional (via Supabase/Resend)                    | Convites, recuperação de senha | Sim para convites (Fase 1 usa e-mail do Supabase) |

Bibliotecas principais: next, react, tailwindcss, shadcn/ui, @nestjs/*, socket.io, drizzle-orm, zod, bullmq, ioredis, pino, pdfjs-dist, vitest, @playwright/test, Tailwind CSS v4, @supabase/ssr, jose, helmet.
