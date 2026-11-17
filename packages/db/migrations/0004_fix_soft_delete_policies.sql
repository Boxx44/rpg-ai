-- ════════════════════════════════════════════════════════════════════
-- 0004 — Correção: exclusão lógica (deleted_at) era bloqueada pelo RLS.
-- No Postgres, a linha atualizada também precisa passar na política de
-- leitura. Agora quem pode apagar continua "vendo" a linha apagada
-- (a API sempre filtra apagados); os demais nunca veem.
-- ════════════════════════════════════════════════════════════════════

ALTER POLICY npcs_select ON public.npcs
  USING (app_private.is_campaign_manager(campaign_id)
         OR (deleted_at IS NULL AND revealed AND app_private.is_campaign_member(campaign_id)));
ALTER POLICY npcs_update ON public.npcs
  USING (deleted_at IS NULL AND app_private.is_campaign_manager(campaign_id))
  WITH CHECK (app_private.is_campaign_manager(campaign_id));

ALTER POLICY maps_select ON public.maps
  USING (app_private.is_campaign_manager(campaign_id)
         OR (deleted_at IS NULL AND shared AND app_private.is_campaign_member(campaign_id)));
ALTER POLICY maps_update ON public.maps
  USING (deleted_at IS NULL AND app_private.is_campaign_manager(campaign_id))
  WITH CHECK (app_private.is_campaign_manager(campaign_id));

ALTER POLICY characters_select ON public.characters
  USING (app_private.is_campaign_member(campaign_id)
         AND (deleted_at IS NULL OR owner_id = auth.uid() OR app_private.is_campaign_manager(campaign_id)));
ALTER POLICY characters_update ON public.characters
  USING (deleted_at IS NULL AND (owner_id = auth.uid() OR app_private.is_campaign_manager(campaign_id))
         AND app_private.is_campaign_member(campaign_id))
  WITH CHECK ((owner_id = auth.uid() OR app_private.is_campaign_manager(campaign_id)) AND app_private.is_campaign_member(campaign_id));
