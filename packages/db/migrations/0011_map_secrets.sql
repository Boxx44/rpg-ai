-- ════════════════════════════════════════════════════════════════════
-- 0011 — Segredos no mapa: peças ocultas que um jogador pode descobrir
-- rolando uma perícia (ex.: Percepção DT 15 até 2 casas de distância).
-- Quem passa no teste passa a ver a peça; os outros jogadores continuam sem ver.
-- A regra de quem vê fica aqui (RLS), não na interface.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.map_tokens
  ADD COLUMN secret_skill text CHECK (secret_skill ~ '^[a-z0-9_]{1,40}$'),
  ADD COLUMN secret_dt int CHECK (secret_dt BETWEEN 1 AND 60),
  ADD COLUMN secret_radius int NOT NULL DEFAULT 2 CHECK (secret_radius BETWEEN 0 AND 20);
GRANT UPDATE (secret_skill, secret_dt, secret_radius) ON public.map_tokens TO authenticated;

-- Quem já descobriu qual peça.
CREATE TABLE public.map_token_reveals (
  token_id uuid NOT NULL REFERENCES public.map_tokens (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  roll_total int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_id, user_id)
);
CREATE INDEX map_token_reveals_user_idx ON public.map_token_reveals (user_id);
ALTER TABLE public.map_token_reveals ENABLE ROW LEVEL SECURITY;
-- Cada um vê as próprias descobertas; o mestre vê todas. Ninguém grava direto:
-- só o servidor, depois de rolar o dado (função abaixo, sem permissão para usuários).
CREATE POLICY reveals_select ON public.map_token_reveals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.is_campaign_manager(campaign_id));
GRANT SELECT ON public.map_token_reveals TO authenticated;

CREATE OR REPLACE FUNCTION app_private.revealed_to_me(p_token uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.map_token_reveals r WHERE r.token_id = p_token AND r.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION app_private.revealed_to_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.revealed_to_me(uuid) TO authenticated;

-- Peças: ocultas só para o mestre — ou para quem já as descobriu.
ALTER POLICY tokens_select ON public.map_tokens
  USING (app_private.is_campaign_manager(campaign_id)
         OR ((NOT hidden OR app_private.revealed_to_me(id))
             AND app_private.is_campaign_member(campaign_id)
             AND EXISTS (SELECT 1 FROM public.maps m WHERE m.id = map_id AND m.shared AND m.deleted_at IS NULL)));

/**
 * Registra o que um jogador descobriu. Chamada só pelo servidor (conexão própria),
 * depois de rolar o teste no servidor. Confere aqui mesmo: mapa compartilhado,
 * peça oculta com segredo da mesma perícia, DT alcançada e distância (em casas)
 * até o personagem dentro do alcance do segredo. Devolve as peças novas.
 */
CREATE OR REPLACE FUNCTION app_private.reveal_secrets(
  p_map uuid, p_user uuid, p_x int, p_y int, p_size int, p_skill text, p_total int
) RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH found AS (
    SELECT t.id, t.campaign_id
    FROM public.map_tokens t
    JOIN public.maps m ON m.id = t.map_id AND m.shared AND m.deleted_at IS NULL
    WHERE t.map_id = p_map
      AND t.hidden
      AND t.secret_skill = p_skill
      AND t.secret_dt <= p_total
      -- distância em casas entre as bordas das duas peças (diagonal conta 1)
      AND GREATEST(
            GREATEST(t.x - (p_x + p_size - 1), p_x - (t.x + t.size - 1), 0),
            GREATEST(t.y - (p_y + p_size - 1), p_y - (t.y + t.size - 1), 0)
          ) <= t.secret_radius
      AND NOT EXISTS (SELECT 1 FROM public.map_token_reveals r WHERE r.token_id = t.id AND r.user_id = p_user)
  ), ins AS (
    INSERT INTO public.map_token_reveals (token_id, user_id, campaign_id, roll_total)
    SELECT f.id, p_user, f.campaign_id, p_total FROM found f
    RETURNING token_id
  )
  SELECT token_id FROM ins;
END $$;
REVOKE ALL ON FUNCTION app_private.reveal_secrets(uuid, uuid, int, int, int, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.reveal_secrets(uuid, uuid, int, int, int, text, int) FROM authenticated;

-- Usar objeto (porta, baú…) também vale para quem descobriu o objeto oculto.
CREATE OR REPLACE FUNCTION app_private.toggle_prop(p_token uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.map_tokens%ROWTYPE; m public.maps%ROWTYPE; v_next text; v_seen boolean;
BEGIN
  SELECT * INTO t FROM public.map_tokens WHERE id = p_token FOR UPDATE;
  IF NOT FOUND OR t.kind <> 'object' OR t.state IS NULL THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO m FROM public.maps WHERE id = t.map_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002'; END IF;
  v_seen := NOT t.hidden OR app_private.revealed_to_me(t.id);
  -- Objeto oculto (e não descoberto): para quem não é mestre, ele simplesmente não existe.
  IF NOT v_seen AND NOT app_private.is_campaign_manager(t.campaign_id) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (app_private.is_campaign_manager(t.campaign_id)
          OR (v_seen AND m.shared AND app_private.can_play(t.campaign_id))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_next := CASE t.state WHEN 'open' THEN 'closed' WHEN 'closed' THEN 'open' WHEN 'on' THEN 'off' ELSE 'on' END;
  UPDATE public.map_tokens SET state = v_next WHERE id = p_token;
  RETURN v_next;
END $$;

-- Imagem de um token descoberto: quem descobriu também pode ver.
CREATE OR REPLACE FUNCTION app_private.can_view_asset(p_asset uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record;
BEGIN
  SELECT campaign_id, owner_id INTO a FROM public.assets WHERE id = p_asset;
  IF NOT FOUND THEN RETURN false; END IF;
  IF a.owner_id = auth.uid() OR app_private.is_campaign_manager(a.campaign_id) THEN RETURN true; END IF;
  IF NOT app_private.is_campaign_member(a.campaign_id) THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.characters c
                 WHERE c.portrait_asset = p_asset AND c.campaign_id = a.campaign_id AND c.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.npcs n
                 WHERE n.portrait_asset = p_asset AND n.campaign_id = a.campaign_id AND n.revealed AND n.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.maps m
                 WHERE m.background_asset = p_asset AND m.campaign_id = a.campaign_id AND m.shared AND m.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.map_tokens t JOIN public.maps m ON m.id = t.map_id
                 WHERE t.image_asset = p_asset AND t.campaign_id = a.campaign_id
                   AND (NOT t.hidden OR EXISTS (SELECT 1 FROM public.map_token_reveals r
                                                WHERE r.token_id = t.id AND r.user_id = auth.uid()))
                   AND m.shared AND m.deleted_at IS NULL);
END $$;
