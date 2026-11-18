-- ════════════════════════════════════════════════════════════════════
-- 0006 — Combate: iniciativa, rodadas, turnos e condições.
-- Um combate ativo por campanha. Inimigos podem ficar ocultos dos jogadores
-- e os pontos de vida deles ficam numa tabela só do mestre (como os segredos de NPC).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  round int NOT NULL DEFAULT 1 CHECK (round > 0),
  current_combatant_id uuid,
  started_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX encounters_one_active ON public.encounters (campaign_id) WHERE status = 'active';

CREATE TABLE public.combatants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters (id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('character', 'npc', 'enemy')),
  character_id uuid REFERENCES public.characters (id) ON DELETE CASCADE,
  npc_id uuid REFERENCES public.npcs (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  color text NOT NULL DEFAULT '#b4232f' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  initiative int CHECK (initiative BETWEEN -999 AND 999),
  -- Desempate sorteado no servidor ao entrar (o livro manda rolar entre empatados).
  tiebreak int NOT NULL DEFAULT floor(random() * 1000000)::int,
  conditions text[] NOT NULL DEFAULT '{}' CHECK (cardinality(conditions) <= 30),
  -- Estado de saúde público: ok / hurt (metade ou menos) / down (0 ou menos).
  health text NOT NULL DEFAULT 'ok' CHECK (health IN ('ok', 'hurt', 'down')),
  hidden boolean NOT NULL DEFAULT false,
  defeated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'character') = (character_id IS NOT NULL))
);
CREATE INDEX combatants_encounter_idx ON public.combatants (encounter_id);
CREATE UNIQUE INDEX combatants_one_character ON public.combatants (encounter_id, character_id) WHERE character_id IS NOT NULL;

ALTER TABLE public.encounters ADD CONSTRAINT encounters_current_fk
  FOREIGN KEY (current_combatant_id) REFERENCES public.combatants (id) ON DELETE SET NULL;

-- Pontos de vida de NPCs/inimigos: só o mestre vê.
CREATE TABLE public.combatant_gm_details (
  combatant_id uuid PRIMARY KEY REFERENCES public.combatants (id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  hp_current int NOT NULL DEFAULT 0 CHECK (hp_current BETWEEN -99999 AND 99999),
  hp_max int NOT NULL DEFAULT 0 CHECK (hp_max BETWEEN 0 AND 99999)
);

-- Ordem dos turnos: Iniciativa maior primeiro; sem Iniciativa ainda, por último.
CREATE OR REPLACE FUNCTION app_private.combat_order(p_encounter uuid)
RETURNS TABLE (id uuid, pos int) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id, (row_number() OVER (ORDER BY c.initiative DESC NULLS LAST, c.tiebreak DESC, c.created_at))::int
  FROM public.combatants c WHERE c.encounter_id = p_encounter;
$$;

-- Jogador define a Iniciativa do PRÓPRIO personagem (o valor vem da rolagem feita no servidor).
CREATE OR REPLACE FUNCTION app_private.set_initiative(p_combatant uuid, p_value int) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.combatants%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.combatants WHERE id = p_combatant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (app_private.is_campaign_manager(v.campaign_id)
          OR (v.character_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.characters ch WHERE ch.id = v.character_id AND ch.owner_id = auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.combatants SET initiative = p_value WHERE id = p_combatant;
  RETURN v.encounter_id;
END $$;

-- Passa o turno. O mestre sempre pode; o jogador só no turno do próprio personagem.
-- p_expected evita passar dois turnos quando dois cliques chegam juntos.
CREATE OR REPLACE FUNCTION app_private.advance_turn(p_encounter uuid, p_expected uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.encounters%ROWTYPE; v_pos int; v_total int; v_next uuid; v_wrapped boolean := false;
BEGIN
  SELECT * INTO e FROM public.encounters WHERE id = p_encounter AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (app_private.is_campaign_manager(e.campaign_id)
          OR EXISTS (SELECT 1 FROM public.combatants c JOIN public.characters ch ON ch.id = c.character_id
                     WHERE c.id = e.current_combatant_id AND ch.owner_id = auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF e.current_combatant_id IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'turn changed' USING ERRCODE = '40001';
  END IF;
  SELECT count(*) INTO v_total FROM public.combatants WHERE encounter_id = p_encounter AND NOT defeated;
  IF v_total = 0 THEN RETURN; END IF;
  SELECT o.pos INTO v_pos FROM app_private.combat_order(p_encounter) o WHERE o.id = e.current_combatant_id;
  -- Próximo não derrotado depois da posição atual; se acabar a lista, nova rodada.
  SELECT o.id INTO v_next FROM app_private.combat_order(p_encounter) o
    JOIN public.combatants c ON c.id = o.id
    WHERE NOT c.defeated AND o.pos > coalesce(v_pos, 0) ORDER BY o.pos LIMIT 1;
  IF v_next IS NULL THEN
    v_wrapped := e.current_combatant_id IS NOT NULL;
    SELECT o.id INTO v_next FROM app_private.combat_order(p_encounter) o
      JOIN public.combatants c ON c.id = o.id WHERE NOT c.defeated ORDER BY o.pos LIMIT 1;
  END IF;
  UPDATE public.encounters
    SET current_combatant_id = v_next, round = round + CASE WHEN v_wrapped THEN 1 ELSE 0 END
    WHERE id = p_encounter;
END $$;

REVOKE ALL ON FUNCTION app_private.combat_order(uuid), app_private.set_initiative(uuid, int),
  app_private.advance_turn(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.combat_order(uuid), app_private.set_initiative(uuid, int),
  app_private.advance_turn(uuid, uuid) TO authenticated;

ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combatants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combatant_gm_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.encounters, public.combatants, public.combatant_gm_details FROM anon;

-- Combate: todos os membros acompanham; só o mestre cria/altera diretamente.
CREATE POLICY encounters_select ON public.encounters FOR SELECT TO authenticated
  USING (app_private.is_campaign_member(campaign_id));
CREATE POLICY encounters_write ON public.encounters FOR ALL TO authenticated
  USING (app_private.is_campaign_manager(campaign_id)) WITH CHECK (app_private.is_campaign_manager(campaign_id));

-- Combatentes ocultos (emboscada, inimigo escondido) não existem para os jogadores.
CREATE POLICY combatants_select ON public.combatants FOR SELECT TO authenticated
  USING (app_private.is_campaign_member(campaign_id) AND (NOT hidden OR app_private.is_campaign_manager(campaign_id)));
CREATE POLICY combatants_write ON public.combatants FOR ALL TO authenticated
  USING (app_private.is_campaign_manager(campaign_id)) WITH CHECK (app_private.is_campaign_manager(campaign_id));

CREATE POLICY combatant_gm_all ON public.combatant_gm_details FOR ALL TO authenticated
  USING (app_private.is_campaign_manager(campaign_id)) WITH CHECK (app_private.is_campaign_manager(campaign_id));
