-- ════════════════════════════════════════════════════════════════════
-- 0008 — Ficha completa de NPC, biblioteca pessoal de fichas e mesa de treino.
-- ════════════════════════════════════════════════════════════════════

-- Ficha de sistema do NPC (atributos, armas, rituais…). Fica nos detalhes
-- secretos: só o mestre vê os números do NPC.
ALTER TABLE public.npc_gm_details
  ADD COLUMN sheet jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(sheet) = 'object' AND pg_column_size(sheet) < 65536);

-- Biblioteca: fichas de personagens e NPCs que pertencem ao usuário, fora de
-- qualquer campanha. Depois são copiadas para uma campanha.
CREATE TABLE public.library_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('character', 'npc')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  concept text NOT NULL DEFAULT '' CHECK (char_length(concept) <= 200),
  color text NOT NULL DEFAULT '#8b5cf6' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Modelo de sistema da ficha (ex.: ordem_paranormal); NULL = ficha livre.
  system_template text CHECK (system_template IS NULL OR system_template ~ '^[a-z0-9_]{1,40}$'),
  sheet jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sheet) = 'object' AND pg_column_size(sheet) < 65536),
  -- Só para NPCs: aparência, descrição pública e detalhes do mestre.
  npc jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(npc) = 'object' AND pg_column_size(npc) < 65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX library_sheets_owner_idx ON public.library_sheets (owner_id) WHERE deleted_at IS NULL;
CREATE TRIGGER library_sheets_updated_at BEFORE UPDATE ON public.library_sheets
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

ALTER TABLE public.library_sheets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.library_sheets FROM anon;
-- Cada um só enxerga e mexe nas próprias fichas.
CREATE POLICY library_own ON public.library_sheets FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Mesa de treino: campanha particular para testar tudo (uma por usuário).
ALTER TABLE public.campaigns ADD COLUMN sandbox boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX campaigns_one_sandbox ON public.campaigns (created_by) WHERE sandbox AND deleted_at IS NULL;

-- O mestre grava a ficha do NPC (as colunas de npc_gm_details têm permissão por coluna).
GRANT UPDATE (sheet) ON public.npc_gm_details TO authenticated;

-- Marcar a campanha como mesa de treino: só quem a criou, e uma por pessoa.
CREATE OR REPLACE FUNCTION app_private.mark_sandbox(p_campaign uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.campaigns SET sandbox = true
    WHERE id = p_campaign AND created_by = auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION app_private.mark_sandbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.mark_sandbox(uuid) TO authenticated;
