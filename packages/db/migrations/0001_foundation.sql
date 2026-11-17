-- ════════════════════════════════════════════════════════════════════
-- 0001 — Fundação: usuários, organizações, campanhas, convites, auditoria.
-- Pressupõe ambiente Supabase (schema auth, papéis anon/authenticated).
-- ════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Schema privado: NÃO exposto pela Data API do Supabase.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

-- ───────────── utilitários ─────────────
CREATE OR REPLACE FUNCTION app_private.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ───────────── tabelas ─────────────
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  avatar_url text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 1000),
  locale text NOT NULL DEFAULT 'pt-BR',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  is_personal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX organizations_owner_idx ON public.organizations (owner_id);
CREATE UNIQUE INDEX organizations_one_personal_per_user ON public.organizations (owner_id) WHERE is_personal;

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX organization_members_user_idx ON public.organization_members (user_id);

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  gm_mode text NOT NULL DEFAULT 'human' CHECK (gm_mode IN ('human', 'ai', 'assistant')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  -- Ligada a system_versions na Fase 3 (FK adicionada por migration futura).
  system_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX campaigns_org_idx ON public.campaigns (organization_id);
CREATE INDEX campaigns_created_by_idx ON public.campaigns (created_by);

CREATE TABLE public.campaign_members (
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'gm', 'player', 'spectator')),
  invited_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);
CREATE INDEX campaign_members_user_idx ON public.campaign_members (user_id);
CREATE UNIQUE INDEX campaign_members_one_owner ON public.campaign_members (campaign_id) WHERE role = 'owner';

CREATE TABLE public.campaign_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  email text CHECK (email IS NULL OR email = lower(email)),
  role text NOT NULL CHECK (role IN ('gm', 'player', 'spectator')),
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_invitations_campaign_idx ON public.campaign_invitations (campaign_id);

CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'ai', 'system')),
  actor_id uuid,
  organization_id uuid,
  campaign_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_campaign_idx ON public.audit_logs (campaign_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs (actor_id, created_at DESC);

-- Auditoria é somente-inserção.
CREATE OR REPLACE FUNCTION app_private.audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END $$;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_logs_immutable();

-- updated_at
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();
CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- ───────────── novo usuário (auth.users → public) ─────────────
CREATE OR REPLACE FUNCTION app_private.handle_new_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name text;
  v_org uuid;
BEGIN
  v_name := left(coalesce(
    nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(NEW.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
    'Aventureiro'), 60);

  INSERT INTO public.users (id, email) VALUES (NEW.id, lower(coalesce(NEW.email, '')));
  INSERT INTO public.user_profiles (user_id, display_name, avatar_url)
    VALUES (NEW.id, v_name, nullif(coalesce(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'), ''));
  INSERT INTO public.organizations (name, slug, owner_id, is_personal)
    VALUES (left('Mesa de ' || v_name, 100), 'u-' || replace(NEW.id::text, '-', ''), NEW.id, true)
    RETURNING id INTO v_org;
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (v_org, NEW.id, 'owner');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app_private.handle_new_auth_user();

CREATE OR REPLACE FUNCTION app_private.handle_auth_user_email_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.users SET email = lower(coalesce(NEW.email, '')) WHERE id = NEW.id;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION app_private.handle_auth_user_email_change();

-- ───────────── funções de permissão (usadas pelas políticas RLS) ─────────────
-- SECURITY DEFINER evita recursão de RLS em campaign_members.
CREATE OR REPLACE FUNCTION app_private.campaign_role(p_campaign uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.role FROM public.campaign_members m
  JOIN public.campaigns c ON c.id = m.campaign_id AND c.deleted_at IS NULL
  WHERE m.campaign_id = p_campaign AND m.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION app_private.is_campaign_member(p_campaign uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.campaign_role(p_campaign) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app_private.is_campaign_manager(p_campaign uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(app_private.campaign_role(p_campaign) IN ('owner', 'gm'), false)
$$;

CREATE OR REPLACE FUNCTION app_private.is_org_member(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = p_org AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION app_private.shares_campaign_with(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaign_members a
    JOIN public.campaign_members b ON a.campaign_id = b.campaign_id
    JOIN public.campaigns c ON c.id = a.campaign_id AND c.deleted_at IS NULL
    WHERE a.user_id = auth.uid() AND b.user_id = p_user)
$$;

CREATE OR REPLACE FUNCTION app_private.campaign_has_members(p_campaign uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaign_members WHERE campaign_id = p_campaign)
$$;

CREATE OR REPLACE FUNCTION app_private.soft_delete_campaign(p_campaign uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF app_private.campaign_role(p_campaign) IS DISTINCT FROM 'owner' THEN RETURN false; END IF;
  UPDATE public.campaigns SET deleted_at = now() WHERE id = p_campaign AND deleted_at IS NULL;
  RETURN FOUND;
END $$;

-- Auditoria gravada dentro da mesma transação, com ator = usuário do JWT (não falsificável).
CREATE OR REPLACE FUNCTION app_private.write_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_organization uuid, p_campaign uuid, p_before jsonb, p_after jsonb,
  p_request_id text, p_ip_hash text
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.audit_logs (actor_type, actor_id, organization_id, campaign_id, action, entity_type,
                                 entity_id, before, after, request_id, ip_hash)
  VALUES ('user', auth.uid(), p_organization, p_campaign, p_action, p_entity_type,
          p_entity_id, p_before, p_after, p_request_id, p_ip_hash)
$$;

-- Aceite de convite: validação e inserção atômicas.
CREATE OR REPLACE FUNCTION app_private.accept_invitation(p_token_hash text) RETURNS TABLE (campaign_id uuid, role text, already_member boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_inv public.campaign_invitations%ROWTYPE;
  v_uid uuid := auth.uid();
  v_email text;
  v_existing text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_inv FROM public.campaign_invitations i WHERE i.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_inv.revoked_at IS NOT NULL OR v_inv.accepted_at IS NOT NULL OR v_inv.expires_at < now()
     OR NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = v_inv.campaign_id AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'invitation invalid' USING ERRCODE = 'P0001', HINT = 'INVITATION_INVALID';
  END IF;

  SELECT u.email INTO v_email FROM public.users u WHERE u.id = v_uid;
  IF v_inv.email IS NOT NULL AND v_inv.email <> v_email THEN
    RAISE EXCEPTION 'invitation email mismatch' USING ERRCODE = 'P0001', HINT = 'INVITATION_INVALID';
  END IF;

  SELECT m.role INTO v_existing FROM public.campaign_members m WHERE m.campaign_id = v_inv.campaign_id AND m.user_id = v_uid;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_inv.campaign_id, v_existing, true;
    RETURN;
  END IF;

  INSERT INTO public.campaign_members (campaign_id, user_id, role, invited_by)
    VALUES (v_inv.campaign_id, v_uid, v_inv.role, v_inv.created_by);
  UPDATE public.campaign_invitations SET accepted_at = now(), accepted_by = v_uid WHERE id = v_inv.id;

  INSERT INTO public.audit_logs (actor_type, actor_id, campaign_id, action, entity_type, entity_id, after)
    VALUES ('user', v_uid, v_inv.campaign_id, 'invitation.accepted', 'campaign_member', v_uid::text,
            jsonb_build_object('role', v_inv.role, 'invitation_id', v_inv.id));

  RETURN QUERY SELECT v_inv.campaign_id, v_inv.role, false;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app_private.campaign_role(uuid), app_private.is_campaign_member(uuid), app_private.is_campaign_manager(uuid),
  app_private.is_org_member(uuid), app_private.shares_campaign_with(uuid),
  app_private.campaign_has_members(uuid), app_private.soft_delete_campaign(uuid),
  app_private.write_audit(text, text, text, uuid, uuid, jsonb, jsonb, text, text),
  app_private.accept_invitation(text)
TO authenticated;

-- ───────────── Row Level Security ─────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso anônimo a nada.
REVOKE ALL ON public.users, public.user_profiles, public.organizations, public.organization_members,
  public.campaigns, public.campaign_members, public.campaign_invitations, public.audit_logs FROM anon;
-- Auditoria: escrita apenas via app_private.write_audit.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
-- Usuários: alterações apenas pelo trigger de auth.
REVOKE INSERT, UPDATE, DELETE ON public.users FROM authenticated;

-- users
CREATE POLICY users_select_self ON public.users FOR SELECT TO authenticated USING (id = auth.uid());

-- user_profiles
CREATE POLICY profiles_select ON public.user_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.shares_campaign_with(user_id));
CREATE POLICY profiles_update_self ON public.user_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- organizations
CREATE POLICY orgs_select ON public.organizations FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND app_private.is_org_member(id));
CREATE POLICY orgs_update_owner ON public.organizations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- organization_members
CREATE POLICY org_members_select ON public.organization_members FOR SELECT TO authenticated
  USING (app_private.is_org_member(organization_id));

-- campaigns
CREATE POLICY campaigns_select ON public.campaigns FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (app_private.is_campaign_member(id) OR created_by = auth.uid()));
CREATE POLICY campaigns_insert ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND app_private.is_org_member(organization_id) AND deleted_at IS NULL);
CREATE POLICY campaigns_update ON public.campaigns FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND app_private.is_campaign_manager(id))
  WITH CHECK (deleted_at IS NULL);
-- Sem DELETE físico: exclusão lógica apenas via app_private.soft_delete_campaign (somente o dono).

-- campaign_members
CREATE POLICY members_select ON public.campaign_members FOR SELECT TO authenticated
  USING (app_private.is_campaign_member(campaign_id));
CREATE POLICY members_insert_owner_bootstrap ON public.campaign_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND role = 'owner'
    AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.created_by = auth.uid())
    AND NOT app_private.campaign_has_members(campaign_id));
CREATE POLICY members_update_manager ON public.campaign_members FOR UPDATE TO authenticated
  USING (app_private.is_campaign_manager(campaign_id) AND role <> 'owner')
  WITH CHECK (role <> 'owner');
CREATE POLICY members_delete ON public.campaign_members FOR DELETE TO authenticated
  USING (role <> 'owner' AND (user_id = auth.uid() OR app_private.is_campaign_manager(campaign_id)));

-- campaign_invitations
CREATE POLICY invitations_select ON public.campaign_invitations FOR SELECT TO authenticated
  USING (app_private.is_campaign_manager(campaign_id));
CREATE POLICY invitations_insert ON public.campaign_invitations FOR INSERT TO authenticated
  WITH CHECK (app_private.is_campaign_manager(campaign_id) AND created_by = auth.uid());
CREATE POLICY invitations_update ON public.campaign_invitations FOR UPDATE TO authenticated
  USING (app_private.is_campaign_manager(campaign_id));

-- audit_logs: leitura pelos gestores da campanha ou pelo próprio ator.
CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR (campaign_id IS NOT NULL AND app_private.is_campaign_manager(campaign_id)));
