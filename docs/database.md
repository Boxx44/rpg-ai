# Modelo de banco de dados — RPG AI

> Versão 0.1 — proposta. PostgreSQL 15+ com pgvector, gerenciado pelo Supabase.

## Convenções

- Chave primária `id uuid default gen_random_uuid()`.
- Toda tabela tem `created_at`, `updated_at` (timestamptz); entidades apagáveis têm `deleted_at` (exclusão lógica).
- Chaves estrangeiras com `ON DELETE` explícito; índices em toda FK.
- Dados específicos de cada sistema ficam em colunas `jsonb` **validadas por schema** na API (o banco não impõe forma fixa de ficha).
- **Visibilidade** (`visibility`): `public` | `gm` | `players` (lista em `visible_to uuid[]`).
- **RLS ativado em todas as tabelas.** A API usa conexão com o papel do usuário (claims do JWT) em consultas de leitura sensíveis; o worker usa papel de serviço e filtra explicitamente. Ver "Segurança".
- Migrations em `packages/db/migrations`, numeradas, nunca editadas depois de aplicadas.

## Diagrama de alto nível

```
organizations ─< organization_members >─ users ─ user_profiles
      │
      ├─< rpg_systems ─< system_versions ─< extracted_rules ─< rule_versions
      │        │                │                │
      │        └─< documents ─< document_pages ─< document_chunks (embedding)
      │                                    rule_sources (regra ↔ página/trecho)
      │                         system_versions ─< character_templates ─< character_fields
      │
      └─< campaigns (presa a uma system_version)
             ├─< campaign_members (papel: owner | gm | player | spectator)
             ├─< characters ─< character_stats, inventories ─< inventory_items
             ├─< npcs, creatures
             ├─< sessions ─< chat_messages, dice_rolls, ai_interactions
             ├─< combat_encounters ─< combat_turns
             ├─< maps ─< map_tokens
             ├─< campaign_events, campaign_memories (embedding)
             └─ audit_logs (todas as ações relevantes)
```

## Tabelas

### Identidade e organizações

| Tabela                 | Colunas principais                                         | Observações                                                      |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `users`                | id (= `auth.users.id`), email, status                      | Espelho mínimo do Supabase Auth, criado por trigger.             |
| `user_profiles`        | user_id PK/FK, display_name, avatar_path, locale, timezone |                                                                  |
| `organizations`        | id, name, slug (único), owner_id                           | Grupo/mesa/editora. Todo usuário recebe uma organização pessoal. |
| `organization_members` | organization_id, user_id, role (`owner`/`admin`/`member`)  | Único (org, user).                                               |

### Sistemas, documentos e regras

| Tabela                         | Colunas principais                                                                                                                                                                                          | Observações                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `rpg_systems`                  | id, organization_id, name, slug, description, visibility                                                                                                                                                    | Um sistema pertence a uma organização.                                      |
| `system_versions`              | id, system_id, version_label, status (`draft`/`published`/`archived`), definition jsonb (SystemDefinition), published_at                                                                                    | `definition` é o modelo universal consolidado. Versão publicada é imutável. |
| `documents`                    | id, system_id, storage_path, filename, sha256, size_bytes, page_count, status (`uploaded`/`validating`/`extracting`/`ocr`/`chunking`/`classifying`/`review`/`done`/`failed`), error, version, supersedes_id | Unique (system_id, sha256).                                                 |
| `document_pages`               | id, document_id, page_number, text, layout jsonb, is_scanned, ocr_confidence                                                                                                                                | Unique (document_id, page_number).                                          |
| `document_chunks`              | id, document_id, page_start, page_end, heading_path text[], content, token_count, category, embedding vector(N)                                                                                             | Índice HNSW no embedding. Dimensão N definida pelo provedor (D-03).         |
| `extracted_rules`              | id, system_id, stable_key, category, current_version_id, status (`proposed`/`needs_review`/`approved`/`rejected`/`not_automatable`)                                                                         | Identidade da regra ao longo das versões.                                   |
| `rule_versions`                | id, rule_id, version, original_text, structured jsonb, dsl_expression, confidence numeric(3,2), approval_state, approved_by, approved_at, created_by (`ai`/`user`)                                          | Imutável após aprovação.                                                    |
| `rule_sources`                 | id, rule_version_id, document_id, page_number, quote, quote_verified bool, bbox jsonb                                                                                                                       | "Associe cada regra à sua fonte."                                           |
| `rule_conflicts` _(adicional)_ | id, rule_version_a, rule_version_b, description, resolution, resolved_by                                                                                                                                    | Registro de contradições.                                                   |
| `rule_tests`                   | id, rule_id, input jsonb, expected jsonb, last_result, last_run_at                                                                                                                                          | Testes automáticos da regra no motor.                                       |
| `character_templates`          | id, system_version_id, name, layout jsonb                                                                                                                                                                   | Modelo de ficha gerado por sistema.                                         |
| `character_fields`             | id, template_id, key, label, type, stat_ref, section, order, constraints jsonb                                                                                                                              |                                                                             |

### Campanhas e jogo

| Tabela                               | Colunas principais                                                                                                                                                                               | Observações                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `campaigns`                          | id, organization_id, system_version_id (nulo na Fase 1), name, description, gm_mode (`human`/`ai`/`assistant`), status, cover_path                                                               |                                                              |
| `campaign_members`                   | campaign_id, user_id, role (`owner`/`gm`/`player`/`spectator`), invited_by, joined_at                                                                                                            | Unique (campaign, user). Base de quase toda política RLS.    |
| `campaign_invitations` _(adicional)_ | id, campaign_id, email, token_hash, role, expires_at, accepted_at                                                                                                                                | Convites por link/e-mail; token guardado só como hash.       |
| `characters`                         | id, campaign_id, owner_user_id, template_id, name, data jsonb, version int                                                                                                                       | `version` para controle de concorrência otimista.            |
| `character_stats`                    | id, character_id, stat_key, base_value, current_value, meta jsonb                                                                                                                                | Valores consultáveis/indexáveis; validados pelo motor.       |
| `inventories`                        | id, owner_type (`character`/`npc`/`creature`/`campaign`), owner_id, name                                                                                                                         |                                                              |
| `inventory_items`                    | id, inventory_id, item_rule_id (nullable), name, quantity, data jsonb, equipped                                                                                                                  |                                                              |
| `npcs`                               | id, campaign_id, name, appearance, personality, backstory, motivations, goals, knowledge jsonb, secrets jsonb, stats jsonb, visibility                                                           | Segredos visíveis só a `gm`.                                 |
| `npc_relationships` _(adicional)_    | npc_id, target_type, target_id, kind, intensity, notes                                                                                                                                           |                                                              |
| `creatures`                          | id, system_version_id ou campaign_id, name, stats jsonb, abilities jsonb, source_rule_id                                                                                                         | Bestiário (do sistema) ou específicas da campanha.           |
| `sessions`                           | id, campaign_id, number, title, started_at, ended_at, summary                                                                                                                                    |                                                              |
| `chat_messages`                      | id, campaign_id, session_id, author_type (`user`/`ai`/`system`/`npc`), author_id, content, visibility, visible_to uuid[], seq bigint                                                             | `seq` crescente por campanha (reconexão).                    |
| `dice_rolls`                         | id, campaign_id, session_id, roller_id, expression, results jsonb (cada dado), total, context jsonb, visibility                                                                                  | Auditável e reproduzível.                                    |
| `combat_encounters`                  | id, campaign_id, session_id, map_id, status, round, initiative_order jsonb                                                                                                                       |                                                              |
| `combat_turns`                       | id, encounter_id, round, actor_type, actor_id, actions jsonb, started_at, ended_at                                                                                                               |                                                              |
| `maps`                               | id, campaign_id, name, image_path, grid jsonb (tipo, tamanho, unidade), visibility                                                                                                               |                                                              |
| `map_tokens`                         | id, map_id, entity_type, entity_id, x, y, size, hidden bool                                                                                                                                      |                                                              |
| `campaign_events`                    | id, campaign_id, session_id, type, payload jsonb, visibility, occurred_at                                                                                                                        | Linha do tempo bruta.                                        |
| `campaign_memories`                  | id, campaign_id, kind (`fact`/`decision`/`npc`/`relation`/`quest`/`location`/`secret`/`consequence`), content, importance smallint, visibility, visible_to, source_event_id, embedding vector(N) | Recuperação contextual.                                      |
| `quests` _(adicional)_               | id, campaign_id, title, status, description, visibility                                                                                                                                          |                                                              |
| `locations` _(adicional)_            | id, campaign_id, name, description, visibility                                                                                                                                                   |                                                              |
| `ai_interactions`                    | id, campaign_id, session_id, mode, model, prompt_hash, input_tokens, output_tokens, cost_estimate, tool_calls jsonb, latency_ms, status                                                          | Sem armazenar segredos em texto puro fora da campanha.       |
| `audit_logs`                         | id, actor_type (`user`/`ai`/`system`), actor_id, organization_id, campaign_id, action, entity_type, entity_id, before jsonb, after jsonb, request_id, ip_hash, created_at                        | Somente inserção (sem update/delete). Particionável por mês. |

Tabelas marcadas _(adicional)_ não estavam na lista original; são propostas porque o documento pede convites, contradições, relações, missões e locais.

## Segurança no banco (RLS)

Funções auxiliares (SECURITY DEFINER, `search_path` fixo):

- `is_org_member(org_id)`, `is_campaign_member(campaign_id)`, `campaign_role(campaign_id)`.

Políticas típicas:

- **campaigns**: lê quem é membro; altera só `owner`/`gm`.
- **characters**: lê membros da campanha; altera o dono do personagem ou o GM (e a API valida via motor).
- **npcs / campaign_memories / chat_messages / dice_rolls**: `visibility = 'public'` → membros; `'gm'` → só GM; `'players'` → `auth.uid() = ANY(visible_to)` ou GM.
- **documents / rules**: membros da organização dona do sistema.
- **audit_logs**: inserção só pelo serviço; leitura pelo owner da organização/campanha.

Testes automatizados de RLS (Fase 1): para cada tabela, verificar que um usuário de fora da campanha não lê nem escreve.

## Índices principais

- FKs; `(campaign_id, seq)` em chat; `(campaign_id, created_at)` em eventos e rolagens.
- HNSW em `document_chunks.embedding` e `campaign_memories.embedding`.
- GIN em colunas `jsonb` consultadas (`characters.data`, `system_versions.definition` quando necessário).
- Índice de texto (pg_trgm) em `document_pages.text` para verificar citações.

## Implementado na Fase 1 (migration `0001_foundation.sql`)

`users`, `user_profiles`, `organizations`, `organization_members`, `campaigns` (com `created_by`), `campaign_members`, `campaign_invitations`, `audit_logs` + extensões (`pgcrypto`, `vector`, `pg_trgm`, no schema `extensions`).

Schema privado `app_private` (não exposto pela Data API): funções de permissão (`campaign_role`, `is_campaign_member`, `is_campaign_manager`, `is_org_member`, `shares_campaign_with`, `campaign_has_members`), `accept_invitation` (aceite atômico), `soft_delete_campaign` (só o dono), `write_audit` (ator sempre = usuário do JWT), triggers de novo usuário e de `updated_at`, e a tabela `schema_migrations`.

Regras garantidas pelo banco (e testadas):

- Anônimos não leem nada; e-mail de um usuário só é visível para ele mesmo.
- Perfis só são visíveis para quem divide campanha.
- Só um dono por campanha; dono não pode ser removido nem rebaixado.
- Jogadores não alteram a campanha nem se promovem; não veem convites.
- Auditoria não pode ser alterada nem apagada, nem inserida diretamente por usuários.

## Implementado na mesa de jogo (migration `0002_game_table.sql`)

| Tabela           | Observações                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `characters`     | Ficha livre em `sheet` (jsonb validado na API, limite de 64 KB), `version` para evitar sobrescrever edição de outra pessoa. Todos da mesa veem; dono do personagem ou mestre editam. |
| `npcs`           | Parte que pode ser revelada (nome, aparência, descrição pública, `revealed`).                                                                                                        |
| `npc_gm_details` | Personalidade, história, motivações, segredos, anotações, estatísticas. **Somente mestres** (RLS).                                                                                   |
| `maps`           | Grade (`cols`, `rows`, `cell_label`), terreno pintado em `terrain` (`{"x,y": "wall"}`), `shared` controla se jogadores veem.                                                         |
| `map_tokens`     | Posição, tamanho, `hidden` (só mestre vê), `controlled_by` (jogador que pode mover), ligação opcional a personagem/NPC.                                                              |
| `dice_rolls`     | Resultado completo de cada dado, total, expressão, visibilidade. Imutável.                                                                                                           |
| `chat_messages`  | Texto ou rolagem, visibilidade (`public`/`gm`), fala como NPC com nome gravado no momento. Imutável.                                                                                 |

Funções novas em `app_private`: `can_play`, `post_message`, `record_roll`, `move_token`, `clamp_tokens`.
Atualizações limitadas por coluna (não é possível trocar a campanha ou o dono de um registro).

## Sistemas e livros (migrations `0003` e `0004`)

| Tabela                        | Observações                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `rpg_systems`                 | Sistema de uma organização; `template_id` indica o modelo pronto usado (ex.: `ordem_paranormal`).                                     |
| `system_versions`             | Definição completa em JSON (validada pelo motor de regras). Imutável: campanhas ficam presas a uma versão.                            |
| `documents`                   | PDF enviado: nome, tamanho, SHA-256 (evita duplicata), status (`queued`/`processing`/`ready`/`failed`), progresso, páginas sem texto. |
| `document_pages`              | Texto de cada página + índice de busca em português sem acentos (`tsv`, GIN).                                                         |
| `campaigns.system_version_id` | Agora com chave estrangeira; só muda pela função `set_campaign_system` (mestre, mesma organização).                                   |

Acesso ao livro: `app_private.can_read_system` = membro da organização dona OU membro de campanha que usa o sistema.
Migration `0004`: correção das políticas de exclusão lógica (ver ADR-026).

O restante (regras extraídas, sessões, combate, memória, IA) entra nas fases correspondentes.

## Sessões de jogo (migration `0005_sessions.sql`)

- `sessions`: número sequencial por campanha, título, status `live`/`ended`, mapa da cena (`active_map_id`), resumo, quem iniciou e as datas. Índice único parcial: no máximo uma sessão `live` por campanha.
- `chat_messages.session_id` e `dice_rolls.session_id` são preenchidos pelo gatilho `app_private.attach_live_session` (BEFORE INSERT) com a sessão ao vivo da campanha.
- Funções (SECURITY DEFINER, só mestre/co-mestre): `start_session` (erro 23505 se já houver uma ao vivo), `set_scene` (também marca o mapa como compartilhado), `end_session`.
- RLS: membros leem; mestres podem editar só `title` e `summary`.

## Combate (migration `0006_combat.sql`)

- `encounters`: combate da campanha (no máximo um `active`, por índice único parcial), com rodada, combatente da vez (`current_combatant_id`) e ligação com a sessão ao vivo.
- `combatants`: personagens (ligados à ficha), NPCs e inimigos, com Iniciativa, desempate sorteado (`tiebreak`), condições (`text[]`), estado público de saúde (`ok`/`hurt`/`down`), `hidden` e `defeated`.
- `combatant_gm_details`: PV de NPCs e inimigos, visíveis só para o mestre.
- Funções: `combat_order` (ordem dos turnos), `set_initiative` (mestre ou dono do personagem) e `advance_turn` (mestre ou dono do personagem da vez; recusa clique repetido com erro 40001).
- RLS: membros leem o combate; ocultos só para o mestre; escrita direta só do mestre.

## Backups

Supabase Pro: backups diários (ponto no tempo opcional, pago à parte). Além disso: dump lógico semanal para armazenamento externo e teste de restauração trimestral (Fase 9).
