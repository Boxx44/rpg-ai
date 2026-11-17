-- ════════════════════════════════════════════════════════════════════
-- 0003 — Sistemas de RPG, versões, livros (PDF) e busca de regras.
-- Livros enviados ficam PRIVADOS: só a organização que enviou e os membros
-- de campanhas que usam o sistema podem consultar o texto (ADR-022).
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated; -- (o Supabase já concede; garantido para ambientes locais)

-- unaccent não é IMMUTABLE; este invólucro fixa o dicionário para poder indexar.
CREATE OR REPLACE FUNCTION app_private.unaccent_i(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path = '' AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;
GRANT EXECUTE ON FUNCTION app_private.unaccent_i(text) TO authenticated;

CREATE TABLE public.rpg_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  template_id text CHECK (template_id IS NULL OR template_id ~ '^[a-z0-9_]{1,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX rpg_systems_org_idx ON public.rpg_systems (organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER rpg_systems_updated_at BEFORE UPDATE ON public.rpg_systems FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TABLE public.system_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.rpg_systems (id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object' AND pg_column_size(definition) < 524288),
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (system_id, version)
);
-- Versões publicadas não mudam: campanhas ficam presas a uma versão.
CREATE TRIGGER system_versions_immutable BEFORE UPDATE ON public.system_versions FOR EACH ROW EXECUTE FUNCTION app_private.immutable_row();

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_system_version_fk FOREIGN KEY (system_version_id) REFERENCES public.system_versions (id) ON DELETE SET NULL;
CREATE INDEX campaigns_system_version_idx ON public.campaigns (system_version_id);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.rpg_systems (id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  storage_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  page_count int,
  pages_without_text int,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  progress int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX documents_system_idx ON public.documents (system_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX documents_unique_per_system ON public.documents (system_id, sha256) WHERE deleted_at IS NULL;
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TABLE public.document_pages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
  system_id uuid NOT NULL REFERENCES public.rpg_systems (id) ON DELETE CASCADE,
  page_number int NOT NULL CHECK (page_number > 0),
  text text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', app_private.unaccent_i(text))) STORED,
  UNIQUE (document_id, page_number)
);
CREATE INDEX document_pages_tsv_idx ON public.document_pages USING gin (tsv);
CREATE INDEX document_pages_system_idx ON public.document_pages (system_id);

-- ───────────── permissões ─────────────
CREATE OR REPLACE FUNCTION app_private.can_read_system(p_system uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.rpg_systems s
      JOIN public.organization_members om ON om.organization_id = s.organization_id AND om.user_id = auth.uid()
      WHERE s.id = p_system AND s.deleted_at IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.system_versions v
      JOIN public.campaigns c ON c.system_version_id = v.id AND c.deleted_at IS NULL
      JOIN public.campaign_members m ON m.campaign_id = c.id AND m.user_id = auth.uid()
      WHERE v.system_id = p_system)
$$;

CREATE OR REPLACE FUNCTION app_private.can_edit_system(p_system uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rpg_systems s
    JOIN public.organization_members om ON om.organization_id = s.organization_id AND om.user_id = auth.uid()
    WHERE s.id = p_system AND s.deleted_at IS NULL AND (om.role IN ('owner', 'admin') OR s.created_by = auth.uid()))
$$;

-- Liga a campanha a uma versão de sistema da MESMA organização (só mestre/dono).
CREATE OR REPLACE FUNCTION app_private.set_campaign_system(p_campaign uuid, p_version uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app_private.is_campaign_manager(p_campaign) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_version IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.system_versions v
    JOIN public.rpg_systems s ON s.id = v.system_id AND s.deleted_at IS NULL
    JOIN public.campaigns c ON c.organization_id = s.organization_id
    WHERE v.id = p_version AND c.id = p_campaign) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.campaigns SET system_version_id = p_version WHERE id = p_campaign;
END $$;

REVOKE ALL ON FUNCTION app_private.can_read_system(uuid), app_private.can_edit_system(uuid),
  app_private.set_campaign_system(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_read_system(uuid), app_private.can_edit_system(uuid),
  app_private.set_campaign_system(uuid, uuid) TO authenticated;

ALTER TABLE public.rpg_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rpg_systems, public.system_versions, public.documents, public.document_pages FROM anon;
-- O vínculo campanha↔sistema só muda pela função acima.
REVOKE UPDATE ON public.campaigns FROM authenticated;
GRANT UPDATE (name, description, gm_mode, status) ON public.campaigns TO authenticated;
-- Páginas e status de processamento são gravados apenas pelo processador de documentos (serviço).
REVOKE INSERT, UPDATE, DELETE ON public.document_pages FROM authenticated;
REVOKE UPDATE ON public.documents FROM authenticated;
GRANT UPDATE (deleted_at) ON public.documents TO authenticated;
REVOKE UPDATE ON public.rpg_systems FROM authenticated;
GRANT UPDATE (name, deleted_at) ON public.rpg_systems TO authenticated;
REVOKE UPDATE, DELETE ON public.system_versions FROM authenticated;

-- is_org_member usa a própria linha (necessário para INSERT ... RETURNING enxergar o registro novo).
CREATE POLICY systems_select ON public.rpg_systems FOR SELECT TO authenticated
  USING (app_private.is_org_member(organization_id) OR (deleted_at IS NULL AND app_private.can_read_system(id)));
CREATE POLICY systems_insert ON public.rpg_systems FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND app_private.is_org_member(organization_id) AND deleted_at IS NULL);
CREATE POLICY systems_update ON public.rpg_systems FOR UPDATE TO authenticated USING (app_private.can_edit_system(id));

CREATE POLICY versions_select ON public.system_versions FOR SELECT TO authenticated USING (app_private.can_read_system(system_id));
CREATE POLICY versions_insert ON public.system_versions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND app_private.can_edit_system(system_id));

-- Quem edita o sistema continua vendo documentos apagados (necessário para a exclusão lógica; a API filtra).
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated
  USING (app_private.can_edit_system(system_id) OR (deleted_at IS NULL AND app_private.can_read_system(system_id)));
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND app_private.can_edit_system(system_id) AND status = 'queued');
CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated USING (app_private.can_edit_system(system_id));

CREATE POLICY pages_select ON public.document_pages FOR SELECT TO authenticated USING (app_private.can_read_system(system_id));
