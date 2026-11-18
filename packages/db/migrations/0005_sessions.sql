-- ════════════════════════════════════════════════════════════════════
-- 0005 — Sessões de jogo.
-- Preparar (fora da sessão) × Jogar (sessão ao vivo). Uma sessão ao vivo
-- por campanha; mensagens e rolagens feitas durante ela ficam ligadas a ela.
-- O mestre escolhe a "cena" (mapa mostrado a todos).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  number int NOT NULL CHECK (number > 0),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  active_map_id uuid REFERENCES public.maps (id) ON DELETE SET NULL,
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 8000),
  started_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (campaign_id, number)
);
CREATE UNIQUE INDEX sessions_one_live ON public.sessions (campaign_id) WHERE status = 'live';
CREATE INDEX sessions_campaign_idx ON public.sessions (campaign_id, number DESC);

ALTER TABLE public.chat_messages ADD COLUMN session_id uuid REFERENCES public.sessions (id) ON DELETE SET NULL;
ALTER TABLE public.dice_rolls ADD COLUMN session_id uuid REFERENCES public.sessions (id) ON DELETE SET NULL;
CREATE INDEX chat_messages_session_idx ON public.chat_messages (session_id, id);

-- Mensagens e rolagens entram automaticamente na sessão ao vivo (se houver).
CREATE OR REPLACE FUNCTION app_private.attach_live_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.session_id IS NULL THEN
    SELECT s.id INTO NEW.session_id FROM public.sessions s WHERE s.campaign_id = NEW.campaign_id AND s.status = 'live';
  END IF;
  RETURN NEW;
END $$;
-- Os triggers de imutabilidade bloqueiam UPDATE; este roda só em INSERT.
CREATE TRIGGER chat_messages_session BEFORE INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION app_private.attach_live_session();
CREATE TRIGGER dice_rolls_session BEFORE INSERT ON public.dice_rolls FOR EACH ROW EXECUTE FUNCTION app_private.attach_live_session();

-- Iniciar sessão: só mestre/dono; número sequencial; falha se já houver uma ao vivo.
CREATE OR REPLACE FUNCTION app_private.start_session(p_campaign uuid, p_title text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_n int;
BEGIN
  IF NOT app_private.is_campaign_manager(p_campaign) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.campaigns WHERE id = p_campaign FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.sessions WHERE campaign_id = p_campaign AND status = 'live') THEN
    RAISE EXCEPTION 'session already live' USING ERRCODE = '23505';
  END IF;
  SELECT coalesce(max(number), 0) + 1 INTO v_n FROM public.sessions WHERE campaign_id = p_campaign;
  INSERT INTO public.sessions (campaign_id, number, title, started_by)
    VALUES (p_campaign, v_n, coalesce(p_title, ''), auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Define a cena (mapa mostrado a todos). Mostrar um mapa na cena também o compartilha.
CREATE OR REPLACE FUNCTION app_private.set_scene(p_session uuid, p_map uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_campaign uuid;
BEGIN
  SELECT campaign_id INTO v_campaign FROM public.sessions WHERE id = p_session AND status = 'live';
  IF v_campaign IS NULL OR NOT app_private.is_campaign_manager(v_campaign) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_map IS NOT NULL THEN
    UPDATE public.maps SET shared = true WHERE id = p_map AND campaign_id = v_campaign AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'map not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  UPDATE public.sessions SET active_map_id = p_map WHERE id = p_session;
END $$;

CREATE OR REPLACE FUNCTION app_private.end_session(p_session uuid, p_summary text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_campaign uuid;
BEGIN
  SELECT campaign_id INTO v_campaign FROM public.sessions WHERE id = p_session AND status = 'live';
  IF v_campaign IS NULL OR NOT app_private.is_campaign_manager(v_campaign) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sessions SET status = 'ended', ended_at = now(), summary = coalesce(p_summary, '') WHERE id = p_session;
  RETURN v_campaign;
END $$;

REVOKE ALL ON FUNCTION app_private.start_session(uuid, text), app_private.set_scene(uuid, uuid),
  app_private.end_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.start_session(uuid, text), app_private.set_scene(uuid, uuid),
  app_private.end_session(uuid, text) TO authenticated;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sessions FROM anon;
-- Sessões só mudam pelas funções acima; o resumo pode ser editado depois pelo mestre.
REVOKE INSERT, UPDATE, DELETE ON public.sessions FROM authenticated;
GRANT UPDATE (title, summary) ON public.sessions TO authenticated;

CREATE POLICY sessions_select ON public.sessions FOR SELECT TO authenticated
  USING (app_private.is_campaign_member(campaign_id));
CREATE POLICY sessions_update ON public.sessions FOR UPDATE TO authenticated
  USING (app_private.is_campaign_manager(campaign_id)) WITH CHECK (app_private.is_campaign_manager(campaign_id));
