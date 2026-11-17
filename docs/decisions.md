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

### D-05 — Política para PDFs com direitos autorais

Recomendação: livros enviados ficam privados ao usuário/organização; termos de uso exigindo que o usuário possua o material; sem biblioteca pública de livros comerciais; canal de remoção (notificação de direitos). **Sugiro consultar um advogado antes do lançamento público.** Decidir antes da Fase 2.

### ~~D-06 — Login~~ → resolvida (ADR-012)

### D-07 — Modelo de cobrança

Não é necessário agora, mas o custo da IA é variável (ver risks.md). A arquitetura registra consumo por campanha e usuário desde o início, para permitir planos ou limites no futuro.
