-- ════════════════════════════════════════════════════════════════════
-- 0002 — Mesa de jogo: chat, rolagens, personagens, NPCs, mapas e tokens.
-- Leitura: RLS por campanha e visibilidade.
-- Escrita: RLS para dados editáveis; funções em app_private para operações
-- que exigem regras por coluna (rolagens, mensagens, mover token).
-- ════════════════════════════════════════════════════════════════════

-- ───────────── personagens (ficha livre até existir sistema de regras) ─────────────
CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  concept text NOT NULL DEFAULT '' CHECK (char_length(concept) <= 200),
  color text NOT NULL DEFAULT '#7c4ff0' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  sheet jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(sheet) = 'object' AND pg_column_size(sheet) < 65536),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX characters_campaign_idx ON public.characters (campaign_id) WHERE deleted_at IS NULL;
CREATE INDEX characters_owner_idx ON public.characters (owner_id);
CREATE TRIGGER characters_updated_at BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- ───────────── NPCs: parte visível (quando revelado) + detalhes só do mestre ─────────────
CREATE TABLE public.npcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  appearance text NOT NULL DEFAULT '' CHECK (char_length(appearance) <= 2000),
  public_description text NOT NULL DEFAULT '' CHECK (char_length(public_description) <= 2000),
  color text NOT NULL DEFAULT '#c9a24b' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  revealed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX npcs_campaign_idx ON public.npcs (campaign_id) WHERE deleted_at IS NULL;
CREATE TRIGGER npcs_updated_at BEFORE UPDATE ON public.npcs FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TABLE public.npc_gm_details (
  npc_id uuid PRIMARY KEY REFERENCES public.npcs (id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  personality text NOT NULL DEFAULT '' CHECK (char_length(personality) <= 4000),
  backstory text NOT NULL DEFAULT '' CHECK (char_length(backstory) <= 8000),
  motivations text NOT NULL DEFAULT '' CHECK (char_length(motivations) <= 4000),
  secrets text NOT NULL DEFAULT '' CHECK (char_length(secrets) <= 4000),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 8000),
  stats jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stats) = 'array' AND pg_column_size(stats) < 32768),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX npc_gm_details_campaign_idx ON public.npc_gm_details (campaign_id);
CREATE TRIGGER npc_gm_details_updated_at BEFORE UPDATE ON public.npc_gm_details FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- ───────────── mapas e tokens ─────────────
CREATE TABLE public.maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  cols int NOT NULL DEFAULT 24 CHECK (cols BETWEEN 4 AND 100),
  rows int NOT NULL DEFAULT 16 CHECK (rows BETWEEN 4 AND 100),
  cell_label text NOT NULL DEFAULT '1,5 m' CHECK (char_length(cell_label) <= 20),
  -- células pintadas: {"x,y": "wall" | "water" | ...}
  terrain jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(terrain) = 'object' AND pg_column_size(terrain) < 262144),
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX maps_campaign_idx ON public.maps (campaign_id) WHERE deleted_at IS NULL;
CREATE TRIGGER maps_updated_at BEFORE UPDATE ON public.maps FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TABLE public.map_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps (id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('character', 'npc', 'enemy', 'object')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  color text NOT NULL DEFAULT '#7c4ff0' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  character_id uuid REFERENCES public.characters (id) ON DELETE CASCADE,
  npc_id uuid REFERENCES public.npcs (id) ON DELETE CASCADE,
  controlled_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  x int NOT NULL CHECK (x >= 0),
  y int NOT NULL CHECK (y >= 0),
  size int NOT NULL DEFAULT 1 CHECK (size BETWEEN 1 AND 4),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX map_tokens_map_idx ON public.map_tokens (map_id);
CREATE INDEX map_tokens_campaign_idx ON public.map_tokens (campaign_id);
CREATE TRIGGER map_tokens_updated_at BEFORE UPDATE ON public.map_tokens FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- ───────────── rolagens e chat (somente inserção) ─────────────
CREATE TABLE public.dice_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  roller_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  expression text NOT NULL CHECK (char_length(expression) <= 120),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  result jsonb NOT NULL,
  total int NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public', 'gm')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dice_rolls_campaign_idx ON public.dice_rolls (campaign_id, created_at DESC);

CREATE TABLE public.chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  npc_id uuid REFERENCES public.npcs (id) ON DELETE SET NULL,
  -- nome/cor do NPC no momento da fala (os jogadores veem a fala mesmo sem ver a ficha do NPC)
  speaker_name text,
  speaker_color text,
  kind text NOT NULL CHECK (kind IN ('text', 'roll')),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 2000),
  roll_id uuid REFERENCES public.dice_rolls (id) ON DELETE CASCADE,
  visibility text NOT NULL CHECK (visibility IN ('public', 'gm')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'roll') = (roll_id IS NOT NULL))
);
CREATE INDEX chat_messages_campaign_idx ON public.chat_messages (campaign_id, id DESC);

CREATE OR REPLACE FUNCTION app_private.immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER dice_rolls_immutable BEFORE UPDATE ON public.dice_rolls FOR EACH ROW EXECUTE FUNCTION app_private.immutable_row();
CREATE TRIGGER chat_messages_immutable BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION app_private.immutable_row();

-- ───────────── funções de escrita controlada ─────────────
CREATE OR REPLACE FUNCTION app_private.can_play(p_campaign uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(app_private.campaign_role(p_campaign) IN ('owner', 'gm', 'player'), false)
$$;

-- Mensagem de texto. Só o mestre pode falar "como NPC".
CREATE OR REPLACE FUNCTION app_private.post_message(p_campaign uuid, p_content text, p_npc uuid, p_visibility text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id bigint; v_name text; v_color text;
BEGIN
  IF NOT app_private.can_play(p_campaign) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_npc IS NOT NULL THEN
    SELECT n.name, n.color INTO v_name, v_color FROM public.npcs n
      WHERE n.id = p_npc AND n.campaign_id = p_campaign AND n.deleted_at IS NULL;
    IF NOT FOUND OR NOT app_private.is_campaign_manager(p_campaign) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO public.chat_messages (campaign_id, author_id, npc_id, speaker_name, speaker_color, kind, content, visibility)
    VALUES (p_campaign, auth.uid(), p_npc, v_name, v_color, 'text', p_content, p_visibility) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Rolagem calculada pela API (motor determinístico) e registrada aqui.
CREATE OR REPLACE FUNCTION app_private.record_roll(
  p_campaign uuid, p_expression text, p_label text, p_result jsonb, p_total int, p_visibility text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_roll uuid; v_id bigint;
BEGIN
  IF NOT app_private.can_play(p_campaign) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.dice_rolls (campaign_id, roller_id, expression, label, result, total, visibility)
    VALUES (p_campaign, auth.uid(), p_expression, p_label, p_result, p_total, p_visibility) RETURNING id INTO v_roll;
  INSERT INTO public.chat_messages (campaign_id, author_id, kind, content, roll_id, visibility)
    VALUES (p_campaign, auth.uid(), 'roll', p_label, v_roll, p_visibility) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Mover token: mestre move qualquer um; jogador só o que controla (e visível).
CREATE OR REPLACE FUNCTION app_private.move_token(p_token uuid, p_x int, p_y int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.map_tokens%ROWTYPE; m public.maps%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.map_tokens WHERE id = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO m FROM public.maps WHERE id = t.map_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT (app_private.is_campaign_manager(t.campaign_id)
          OR (t.controlled_by = auth.uid() AND NOT t.hidden AND m.shared AND app_private.can_play(t.campaign_id))) THEN
    RETURN false;
  END IF;
  IF p_x < 0 OR p_y < 0 OR p_x + t.size > m.cols OR p_y + t.size > m.rows THEN
    RAISE EXCEPTION 'out of bounds' USING ERRCODE = '22023';
  END IF;
  UPDATE public.map_tokens SET x = p_x, y = p_y WHERE id = p_token;
  RETURN true;
END $$;

-- Mapa diminuiu: traz para dentro os tokens que ficaram de fora (somente mestre).
CREATE OR REPLACE FUNCTION app_private.clamp_tokens(p_map uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.maps%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.maps WHERE id = p_map;
  IF NOT FOUND OR NOT app_private.is_campaign_manager(m.campaign_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.map_tokens SET
    x = least(x, greatest(0, m.cols - size)),
    y = least(y, greatest(0, m.rows - size))
  WHERE map_id = p_map AND (x + size > m.cols OR y + size > m.rows);
END $$;
REVOKE ALL ON FUNCTION app_private.clamp_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.clamp_tokens(uuid) TO authenticated;

REVOKE ALL ON FUNCTION app_private.can_play(uuid), app_private.post_message(uuid, text, uuid, text),
  app_private.record_roll(uuid, text, text, jsonb, int, text), app_private.move_token(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_play(uuid), app_private.post_message(uuid, text, uuid, text),
  app_private.record_roll(uuid, text, text, jsonb, int, text), app_private.move_token(uuid, int, int) TO authenticated;

-- ───────────── RLS ─────────────
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_gm_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dice_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.characters, public.npcs, public.npc_gm_details, public.maps, public.map_tokens,
  public.dice_rolls, public.chat_messages FROM anon;
-- Rolagens, chat e posição de tokens só mudam pelas funções acima.
REVOKE INSERT, UPDATE, DELETE ON public.dice_rolls, public.chat_messages FROM authenticated;
REVOKE UPDATE ON public.map_tokens FROM authenticated;
GRANT UPDATE (label, color, kind, size, hidden, controlled_by, character_id, npc_id) ON public.map_tokens TO authenticated;

-- personagens: todos os membros veem (fichas compartilhadas); dono do personagem ou mestre edita.
CREATE POLICY characters_select ON public.characters FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND app_private.is_campaign_member(campaign_id));
CREATE POLICY characters_insert ON public.characters FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND app_private.can_play(campaign_id) AND deleted_at IS NULL);
CREATE POLICY characters_update ON public.characters FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND (owner_id = auth.uid() OR app_private.is_campaign_manager(campaign_id))
         AND app_private.is_campaign_member(campaign_id));
REVOKE DELETE ON public.characters FROM authenticated; -- exclusão lógica via UPDATE deleted_at

-- NPCs: mestre vê tudo; jogadores só os revelados (e nunca os detalhes).
CREATE POLICY npcs_select ON public.npcs FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (app_private.is_campaign_manager(campaign_id)
         OR (revealed AND app_private.is_campaign_member(campaign_id))));
CREATE POLICY npcs_insert ON public.npcs FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND app_private.is_campaign_manager(campaign_id) AND deleted_at IS NULL);
CREATE POLICY npcs_update ON public.npcs FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND app_private.is_campaign_manager(campaign_id));
REVOKE DELETE ON public.npcs FROM authenticated;

CREATE POLICY npc_details_all ON public.npc_gm_details FOR ALL TO authenticated
  USING (app_private.is_campaign_manager(campaign_id))
  WITH CHECK (app_private.is_campaign_manager(campaign_id)
              AND EXISTS (SELECT 1 FROM public.npcs n WHERE n.id = npc_id AND n.campaign_id = npc_gm_details.campaign_id));

-- Mapas: mestre vê todos; jogadores só os compartilhados.
CREATE POLICY maps_select ON public.maps FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (app_private.is_campaign_manager(campaign_id)
         OR (shared AND app_private.is_campaign_member(campaign_id))));
CREATE POLICY maps_insert ON public.maps FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND app_private.is_campaign_manager(campaign_id) AND deleted_at IS NULL);
CREATE POLICY maps_update ON public.maps FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND app_private.is_campaign_manager(campaign_id));
REVOKE DELETE ON public.maps FROM authenticated;

-- Tokens: ocultos só para o mestre; jogadores veem os do mapa compartilhado.
CREATE POLICY tokens_select ON public.map_tokens FOR SELECT TO authenticated
  USING (app_private.is_campaign_manager(campaign_id)
         OR (NOT hidden AND app_private.is_campaign_member(campaign_id)
             AND EXISTS (SELECT 1 FROM public.maps m WHERE m.id = map_id AND m.shared AND m.deleted_at IS NULL)));
CREATE POLICY tokens_insert ON public.map_tokens FOR INSERT TO authenticated
  WITH CHECK (app_private.is_campaign_manager(campaign_id)
              AND EXISTS (SELECT 1 FROM public.maps m WHERE m.id = map_id AND m.campaign_id = map_tokens.campaign_id));
CREATE POLICY tokens_update ON public.map_tokens FOR UPDATE TO authenticated
  USING (app_private.is_campaign_manager(campaign_id));
CREATE POLICY tokens_delete ON public.map_tokens FOR DELETE TO authenticated
  USING (app_private.is_campaign_manager(campaign_id));

-- Rolagens e chat: públicas para membros; "só para o mestre" visíveis ao mestre e ao autor.
CREATE POLICY rolls_select ON public.dice_rolls FOR SELECT TO authenticated
  USING (app_private.is_campaign_member(campaign_id)
         AND (visibility = 'public' OR roller_id = auth.uid() OR app_private.is_campaign_manager(campaign_id)));
CREATE POLICY chat_select ON public.chat_messages FOR SELECT TO authenticated
  USING (app_private.is_campaign_member(campaign_id)
         AND (visibility = 'public' OR author_id = auth.uid() OR app_private.is_campaign_manager(campaign_id)));

-- Atualizações só nas colunas editáveis (impede trocar campanha/dono por baixo dos panos).
REVOKE UPDATE ON public.characters, public.npcs, public.maps, public.npc_gm_details FROM authenticated;
GRANT UPDATE (name, concept, color, sheet, version, deleted_at) ON public.characters TO authenticated;
GRANT UPDATE (name, appearance, public_description, color, revealed, deleted_at) ON public.npcs TO authenticated;
GRANT UPDATE (name, cols, rows, cell_label, terrain, shared, deleted_at) ON public.maps TO authenticated;
GRANT UPDATE (personality, backstory, motivations, secrets, notes, stats) ON public.npc_gm_details TO authenticated;
