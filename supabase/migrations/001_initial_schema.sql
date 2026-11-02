-- ====================================================================
-- AI TOOLS DIRECTORY — PRODUCTION POSTGRESQL SCHEMA (SUPABASE)
-- Initial Migration: 001_initial_schema.sql
-- Supports 50,000+ records with full-text search, indexes, and hardened RLS
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE pricing_type_enum AS ENUM ('free', 'freemium', 'paid', 'free_trial', 'open_source', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE publication_status_enum AS ENUM ('draft', 'pending', 'published', 'rejected', 'needs_update');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status_enum AS ENUM ('unverified', 'pending_review', 'verified', 'flagged');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE submission_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 4. CATEGORIES TABLE (Hierarchical)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    description TEXT,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    icon_name VARCHAR(50) DEFAULT 'Sparkles',
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON public.categories(display_order);

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. TOOLS TABLE (Primary Entity)
CREATE TABLE IF NOT EXISTS public.tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    website_url TEXT NOT NULL,
    normalized_domain VARCHAR(255) NOT NULL,
    short_description VARCHAR(280) NOT NULL,
    full_description TEXT NOT NULL,
    logo_url TEXT,
    pricing_type pricing_type_enum NOT NULL DEFAULT 'unknown',
    starting_price NUMERIC(10, 2) DEFAULT NULL CHECK (starting_price IS NULL OR starting_price >= 0.00),
    currency VARCHAR(10) DEFAULT 'USD',
    affiliate_url TEXT,
    official_source_url TEXT,
    data_source VARCHAR(100) DEFAULT 'manual_entry',
    source_license VARCHAR(100),
    source_attribution TEXT,
    verification_status verification_status_enum NOT NULL DEFAULT 'unverified',
    publication_status publication_status_enum NOT NULL DEFAULT 'draft',
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    sponsored BOOLEAN NOT NULL DEFAULT FALSE,
    sponsored_until TIMESTAMPTZ,
    upvotes INT DEFAULT 0,
    views_count INT DEFAULT 0,
    search_vector TSVECTOR,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance & scaling
CREATE INDEX IF NOT EXISTS idx_tools_slug ON public.tools(slug);
CREATE INDEX IF NOT EXISTS idx_tools_domain ON public.tools(normalized_domain);
CREATE INDEX IF NOT EXISTS idx_tools_publication_status ON public.tools(publication_status);
CREATE INDEX IF NOT EXISTS idx_tools_featured ON public.tools(featured) WHERE publication_status = 'published';
CREATE INDEX IF NOT EXISTS idx_tools_pricing_type ON public.tools(pricing_type);
CREATE INDEX IF NOT EXISTS idx_tools_created_at ON public.tools(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tools_search ON public.tools USING GIN(search_vector);

DROP TRIGGER IF EXISTS trg_tools_updated_at ON public.tools;
CREATE TRIGGER trg_tools_updated_at
    BEFORE UPDATE ON public.tools
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Full-text search trigger
CREATE OR REPLACE FUNCTION public.update_tool_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.short_description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.full_description, '')), 'C');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tool_search_vector ON public.tools;
CREATE TRIGGER trg_tool_search_vector
    BEFORE INSERT OR UPDATE ON public.tools
    FOR EACH ROW EXECUTE FUNCTION public.update_tool_search_vector();

-- 6. TOOL_CATEGORIES (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.tool_categories (
    tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (tool_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_categories_cat ON public.tool_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_tool_categories_tool ON public.tool_categories(tool_id);

-- 7. PRICING PLANS
CREATE TABLE IF NOT EXISTS public.pricing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
    plan_name VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) DEFAULT 0.00 CHECK (price >= 0.00),
    billing_period VARCHAR(30) DEFAULT 'monthly', -- 'monthly', 'annually', 'one_time', 'usage_based'
    currency VARCHAR(10) DEFAULT 'USD',
    description TEXT,
    features JSONB DEFAULT '[]'::jsonb,
    source_url TEXT,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_plans_tool_id ON public.pricing_plans(tool_id);

-- 8. TOOL FEATURES
CREATE TABLE IF NOT EXISTS public.tool_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
    feature_name VARCHAR(120) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_features_tool_id ON public.tool_features(tool_id);

-- 9. TOOL ALTERNATIVES
CREATE TABLE IF NOT EXISTS public.tool_alternatives (
    tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
    alternative_tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
    similarity_score NUMERIC(3, 2) DEFAULT 0.80 CHECK (similarity_score >= 0.00 AND similarity_score <= 1.00),
    PRIMARY KEY (tool_id, alternative_tool_id),
    CONSTRAINT chk_tool_not_self_alternative CHECK (tool_id <> alternative_tool_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_alternatives_tool_id ON public.tool_alternatives(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_alternatives_alt_id ON public.tool_alternatives(alternative_tool_id);

-- 10. AFFILIATE PROGRAMS (Private commercial data)
CREATE TABLE IF NOT EXISTS public.affiliate_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
    affiliate_network VARCHAR(100),
    application_url TEXT,
    commission_details TEXT,
    approval_status VARCHAR(50) DEFAULT 'pending',
    tracking_url TEXT,
    notes TEXT,
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_programs_tool_id ON public.affiliate_programs(tool_id);

-- 11. IMPORT BATCHES
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    source_name VARCHAR(120) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'csv', 'json', 'api', 'manual'
    total_rows INT NOT NULL DEFAULT 0,
    valid_rows INT NOT NULL DEFAULT 0,
    inserted_rows INT NOT NULL DEFAULT 0,
    updated_rows INT NOT NULL DEFAULT 0,
    duplicate_rows INT NOT NULL DEFAULT 0,
    rejected_rows INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'partial'
    error_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- 12. IMPORT ERRORS
CREATE TABLE IF NOT EXISTS public.import_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    error_code VARCHAR(80) NOT NULL,
    error_message TEXT NOT NULL,
    original_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_errors_batch ON public.import_errors(batch_id);

-- 13. ADMIN USERS (Identity bridge to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(120),
    role VARCHAR(50) NOT NULL DEFAULT 'editor' CHECK (role IN ('super_admin', 'editor', 'moderator')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role_active ON public.admin_users(role, is_active);

-- 14. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    administrator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE,
    administrator_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs(administrator_id);

-- 15. SUBMISSIONS (Community suggestions)
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name VARCHAR(150) NOT NULL,
    website_url TEXT NOT NULL,
    submitter_email VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    pricing_type VARCHAR(50) DEFAULT 'unknown',
    source_information TEXT,
    status submission_status_enum NOT NULL DEFAULT 'pending',
    admin_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON public.submissions(created_at DESC);

-- ====================================================================
-- 16. ROW LEVEL SECURITY (RLS) POLICIES
-- Preserves GitHub Section 15 architecture and adds security hardening
-- ====================================================================

-- Enable RLS on all protected tables
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_alternatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;

-- Admin verification functions (GitHub Section 15 implementation with search_path safety)
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE id = (SELECT auth.uid())
          AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE id = (SELECT auth.uid())
          AND is_active = true
          AND role = 'super_admin'
    );
$$;

-- Remove old policies safely before creating verified policies
DROP POLICY IF EXISTS "Public read access to published tools" ON public.tools;
DROP POLICY IF EXISTS "Public read published tools" ON public.tools;
DROP POLICY IF EXISTS "Admins manage tools" ON public.tools;
DROP POLICY IF EXISTS "Admin full access to tools" ON public.tools;

DROP POLICY IF EXISTS "Public read access to categories" ON public.categories;
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
DROP POLICY IF EXISTS "Admin manage categories" ON public.categories;

DROP POLICY IF EXISTS "Public read access to tool_categories" ON public.tool_categories;
DROP POLICY IF EXISTS "Public read published tool categories" ON public.tool_categories;
DROP POLICY IF EXISTS "Admins manage tool categories" ON public.tool_categories;
DROP POLICY IF EXISTS "Admin manage tool_categories" ON public.tool_categories;

DROP POLICY IF EXISTS "Public read access to pricing_plans" ON public.pricing_plans;
DROP POLICY IF EXISTS "Public read published pricing plans" ON public.pricing_plans;
DROP POLICY IF EXISTS "Admins manage pricing plans" ON public.pricing_plans;
DROP POLICY IF EXISTS "Admin manage pricing_plans" ON public.pricing_plans;

DROP POLICY IF EXISTS "Public read access to tool_features" ON public.tool_features;
DROP POLICY IF EXISTS "Public read published tool features" ON public.tool_features;
DROP POLICY IF EXISTS "Admins manage tool features" ON public.tool_features;
DROP POLICY IF EXISTS "Admin manage tool_features" ON public.tool_features;

DROP POLICY IF EXISTS "Public read access to tool_alternatives" ON public.tool_alternatives;
DROP POLICY IF EXISTS "Public read published tool alternatives" ON public.tool_alternatives;
DROP POLICY IF EXISTS "Admins manage tool alternatives" ON public.tool_alternatives;
DROP POLICY IF EXISTS "Admin manage tool_alternatives" ON public.tool_alternatives;

DROP POLICY IF EXISTS "Admins manage affiliate programs" ON public.affiliate_programs;
DROP POLICY IF EXISTS "Admin manage affiliate_programs" ON public.affiliate_programs;

DROP POLICY IF EXISTS "Public can submit tools" ON public.submissions;
DROP POLICY IF EXISTS "Public submit tools" ON public.submissions;
DROP POLICY IF EXISTS "Admins manage submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admin manage submissions" ON public.submissions;

DROP POLICY IF EXISTS "Admins read own account" ON public.admin_users;
DROP POLICY IF EXISTS "Super admins manage admin accounts" ON public.admin_users;
DROP POLICY IF EXISTS "Super admins view all admin accounts" ON public.admin_users;

DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins insert own audit logs" ON public.audit_logs;

DROP POLICY IF EXISTS "Admins manage import batches" ON public.import_batches;
DROP POLICY IF EXISTS "Admin manage import_batches" ON public.import_batches;

DROP POLICY IF EXISTS "Admins manage import errors" ON public.import_errors;
DROP POLICY IF EXISTS "Admin manage import_errors" ON public.import_errors;

-- --------------------------------------------------------------------
-- A. TOOLS POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "Public read published tools"
ON public.tools FOR SELECT TO anon, authenticated
USING (publication_status = 'published');

CREATE POLICY "Admins manage tools"
ON public.tools FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- B. CATEGORIES POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "Public read categories"
ON public.categories FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Admins manage categories"
ON public.categories FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- C. TOOL_CATEGORIES POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "Public read published tool categories"
ON public.tool_categories FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tools t
        WHERE t.id = tool_categories.tool_id
          AND t.publication_status = 'published'
    )
);

CREATE POLICY "Admins manage tool categories"
ON public.tool_categories FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- D. PRICING_PLANS POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "Public read published pricing plans"
ON public.pricing_plans FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tools t
        WHERE t.id = pricing_plans.tool_id
          AND t.publication_status = 'published'
    )
);

CREATE POLICY "Admins manage pricing plans"
ON public.pricing_plans FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- E. TOOL_FEATURES POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "Public read published tool features"
ON public.tool_features FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tools t
        WHERE t.id = tool_features.tool_id
          AND t.publication_status = 'published'
    )
);

CREATE POLICY "Admins manage tool features"
ON public.tool_features FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- F. TOOL_ALTERNATIVES POLICIES
-- Both primary tool AND alternative tool must be published
-- --------------------------------------------------------------------
CREATE POLICY "Public read published tool alternatives"
ON public.tool_alternatives FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tools t1
        WHERE t1.id = tool_alternatives.tool_id
          AND t1.publication_status = 'published'
    )
    AND EXISTS (
        SELECT 1 FROM public.tools t2
        WHERE t2.id = tool_alternatives.alternative_tool_id
          AND t2.publication_status = 'published'
    )
);

CREATE POLICY "Admins manage tool alternatives"
ON public.tool_alternatives FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- G. AFFILIATE_PROGRAMS POLICIES
-- Private commercial data: Zero public access
-- --------------------------------------------------------------------
CREATE POLICY "Admins manage affiliate programs"
ON public.affiliate_programs FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- H. SUBMISSIONS POLICIES
-- Public: INSERT only (cannot read, edit, or delete)
-- --------------------------------------------------------------------
CREATE POLICY "Public submit tools"
ON public.submissions FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins manage submissions"
ON public.submissions FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- I. AUDIT_LOGS POLICIES
-- Append-only for active admins; readable only by active admins
-- --------------------------------------------------------------------
CREATE POLICY "Admins read audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING ((SELECT public.is_active_admin()));

CREATE POLICY "Admins insert own audit logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (
    administrator_id = (SELECT auth.uid())
    AND (SELECT public.is_active_admin())
);

-- --------------------------------------------------------------------
-- J. IMPORT_BATCHES & IMPORT_ERRORS POLICIES
-- --------------------------------------------------------------------
CREATE POLICY "Admins manage import batches"
ON public.import_batches FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage import errors"
ON public.import_errors FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- --------------------------------------------------------------------
-- K. ADMIN_USERS POLICIES
-- Non-recursive: Admins read own record, super_admins manage all
-- --------------------------------------------------------------------
CREATE POLICY "Admins read own account"
ON public.admin_users FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));

CREATE POLICY "Super admins manage admin accounts"
ON public.admin_users FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()))
WITH CHECK ((SELECT public.is_super_admin()));

-- ====================================================================
-- 17. POSTGRESQL ROLE GRANTS & PERMISSIONS (LEAST PRIVILEGE)
-- Defense in depth: Grants control SQL command access; RLS filters rows
-- ====================================================================

-- 1. Revoke default public schema privileges from public and anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;

-- 2. Restrict helper function execution strictly to authenticated callers and service_role
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- 3. Anonymous role (anon): Read-only on public directory content, insert-only on submissions
GRANT SELECT ON public.tools, public.categories, public.tool_categories, public.pricing_plans, public.tool_features, public.tool_alternatives TO anon;
GRANT INSERT ON public.submissions TO anon;

-- 4. Authenticated role:
-- A. Public directory tables (read access)
GRANT SELECT ON public.tools, public.categories, public.tool_categories, public.pricing_plans, public.tool_features, public.tool_alternatives TO authenticated;

-- B. Submissions: Any authenticated user can submit (INSERT)
GRANT INSERT ON public.submissions TO authenticated;

-- C. Content management tables: DML granted to authenticated (RLS restricts execution to is_active_admin())
GRANT INSERT, UPDATE, DELETE ON public.tools, public.categories, public.tool_categories, public.pricing_plans, public.tool_features, public.tool_alternatives TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_programs, public.import_batches, public.import_errors TO authenticated;

-- D. Administrator accounts table: RLS permits admins to read own record and super_admin to manage
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;

-- E. Audit logs table: Strictly append-only! NO UPDATE, NO DELETE granted to authenticated
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- 5. Service role: Full administrative access for trusted server-side background workers
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
