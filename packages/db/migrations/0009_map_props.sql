-- ════════════════════════════════════════════════════════════════════
-- 0009 — Objetos do mapa: portas, baús, tochas, móveis, armas no chão…
-- São peças (map_tokens, kind = 'object') com um desenho (icon), um estado
-- (aberta/fechada, acesa/apagada) e rotação.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.map_tokens
  ADD COLUMN icon text CHECK (icon IS NULL OR icon ~ '^[a-z0-9_]{1,30}$'),
  ADD COLUMN state text CHECK (state IS NULL OR state IN ('open', 'closed', 'on', 'off')),
  ADD COLUMN rotation int NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270));

GRANT UPDATE (icon, state, rotation) ON public.map_tokens TO authenticated;

-- Interagir com um objeto (abrir porta, acender tocha). O mestre sempre pode;
-- jogadores (não espectadores) só em objetos visíveis de um mapa compartilhado.
CREATE OR REPLACE FUNCTION app_private.toggle_prop(p_token uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.map_tokens%ROWTYPE; m public.maps%ROWTYPE; v_next text;
BEGIN
  SELECT * INTO t FROM public.map_tokens WHERE id = p_token FOR UPDATE;
  IF NOT FOUND OR t.kind <> 'object' OR t.state IS NULL THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO m FROM public.maps WHERE id = t.map_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002'; END IF;
  -- Objeto oculto: para quem não é mestre, ele simplesmente não existe.
  IF t.hidden AND NOT app_private.is_campaign_manager(t.campaign_id) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (app_private.is_campaign_manager(t.campaign_id)
          OR (NOT t.hidden AND m.shared AND app_private.can_play(t.campaign_id))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_next := CASE t.state WHEN 'open' THEN 'closed' WHEN 'closed' THEN 'open' WHEN 'on' THEN 'off' ELSE 'on' END;
  UPDATE public.map_tokens SET state = v_next WHERE id = p_token;
  RETURN v_next;
END $$;
REVOKE ALL ON FUNCTION app_private.toggle_prop(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.toggle_prop(uuid) TO authenticated;
