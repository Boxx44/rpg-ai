-- ════════════════════════════════════════════════════════════════════
-- 0007 — Criaturas do livro no combate.
-- Guarda qual ficha do bestiário originou o combatente (PV, ataques e
-- Iniciativa vêm do sistema da campanha, com página de referência).
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.combatants
  ADD COLUMN creature_key text CHECK (creature_key IS NULL OR creature_key ~ '^[a-z0-9_]{1,40}$');
