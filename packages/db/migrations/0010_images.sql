-- ════════════════════════════════════════════════════════════════════
-- 0010 — Imagens: fundo de mapa, imagem de token e retrato de personagem/NPC.
-- As imagens ficam no próprio banco (bytea), já reduzidas pelo navegador.
-- Quem pode ver uma imagem é decidido aqui (RLS), não na interface:
--   • o mestre e quem enviou sempre veem;
--   • os demais membros só veem se a imagem estiver em uso em algo que
--     eles já podem ver (mapa compartilhado, token visível, retrato de
--     personagem, NPC revelado).
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('map', 'token', 'portrait')),
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 80),
  mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  width int NOT NULL CHECK (width BETWEEN 1 AND 8192),
  height int NOT NULL CHECK (height BETWEEN 1 AND 8192),
  bytes int NOT NULL CHECK (bytes BETWEEN 1 AND 4194304),
  data bytea NOT NULL CHECK (octet_length(data) = bytes),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_campaign_idx ON public.assets (campaign_id);
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.maps
  ADD COLUMN background_asset uuid REFERENCES public.assets (id) ON DELETE SET NULL,
  ADD COLUMN grid_visible boolean NOT NULL DEFAULT true;
ALTER TABLE public.map_tokens ADD COLUMN image_asset uuid REFERENCES public.assets (id) ON DELETE SET NULL;
ALTER TABLE public.characters ADD COLUMN portrait_asset uuid REFERENCES public.assets (id) ON DELETE SET NULL;
ALTER TABLE public.npcs ADD COLUMN portrait_asset uuid REFERENCES public.assets (id) ON DELETE SET NULL;

GRANT UPDATE (background_asset, grid_visible) ON public.maps TO authenticated;
GRANT UPDATE (image_asset) ON public.map_tokens TO authenticated;
GRANT UPDATE (portrait_asset) ON public.characters TO authenticated;
GRANT UPDATE (portrait_asset) ON public.npcs TO authenticated;

-- Espaço usado pelas imagens de uma campanha (para o limite por campanha).
CREATE OR REPLACE FUNCTION app_private.asset_usage(p_campaign uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(sum(bytes), 0)::bigint FROM public.assets WHERE campaign_id = p_campaign
$$;

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
                 WHERE t.image_asset = p_asset AND t.campaign_id = a.campaign_id AND NOT t.hidden
                   AND m.shared AND m.deleted_at IS NULL);
END $$;

REVOKE ALL ON FUNCTION app_private.asset_usage(uuid), app_private.can_view_asset(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.asset_usage(uuid), app_private.can_view_asset(uuid) TO authenticated;

CREATE POLICY assets_select ON public.assets FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR app_private.can_view_asset(id));
-- Enviar: mestre (qualquer tipo) ou jogador (só retrato), respeitando 60 MB por campanha.
CREATE POLICY assets_insert ON public.assets FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid()
              AND (app_private.is_campaign_manager(campaign_id)
                   OR (kind = 'portrait' AND app_private.can_play(campaign_id)))
              AND app_private.asset_usage(campaign_id) + bytes <= 62914560);
CREATE POLICY assets_delete ON public.assets FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR app_private.is_campaign_manager(campaign_id));
GRANT SELECT, INSERT, DELETE ON public.assets TO authenticated;

-- Só dá para usar uma imagem da mesma campanha, e que você enviou
-- (o mestre pode usar qualquer uma da campanha). Impede, por exemplo, um
-- jogador de "pendurar" no próprio retrato o fundo secreto de um mapa do mestre.
CREATE OR REPLACE FUNCTION app_private.check_asset_ref() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_asset uuid; a record;
BEGIN
  -- TG_ARGV[0] = nome da coluna com a imagem nesta tabela
  v_asset := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  IF v_asset IS NULL THEN RETURN NEW; END IF;
  SELECT campaign_id, owner_id INTO a FROM public.assets WHERE id = v_asset;
  IF NOT FOUND OR a.campaign_id <> NEW.campaign_id THEN
    RAISE EXCEPTION 'imagem inválida' USING ERRCODE = '23503';
  END IF;
  IF auth.uid() IS NOT NULL AND a.owner_id <> auth.uid()
     AND NOT app_private.is_campaign_manager(NEW.campaign_id) THEN
    RAISE EXCEPTION 'imagem de outra pessoa' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER maps_asset_ref BEFORE INSERT OR UPDATE OF background_asset ON public.maps
  FOR EACH ROW EXECUTE FUNCTION app_private.check_asset_ref('background_asset');
CREATE TRIGGER map_tokens_asset_ref BEFORE INSERT OR UPDATE OF image_asset ON public.map_tokens
  FOR EACH ROW EXECUTE FUNCTION app_private.check_asset_ref('image_asset');
CREATE TRIGGER characters_asset_ref BEFORE INSERT OR UPDATE OF portrait_asset ON public.characters
  FOR EACH ROW EXECUTE FUNCTION app_private.check_asset_ref('portrait_asset');
CREATE TRIGGER npcs_asset_ref BEFORE INSERT OR UPDATE OF portrait_asset ON public.npcs
  FOR EACH ROW EXECUTE FUNCTION app_private.check_asset_ref('portrait_asset');
