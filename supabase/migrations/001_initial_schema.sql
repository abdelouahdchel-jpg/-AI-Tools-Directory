-- ====================================================================
-- AI TOOLS DIRECTORY — PRODUCTION POSTGRESQL SCHEMA (SUPABASE)
-- Initial Migration: 001_initial_schema.sql
-- Supports 50,000+ records with full-text search, indexes, and RLS
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

-- 3. CATEGORIES TABLE (Hierarchical)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    description TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    icon_name VARCHAR(50) DEFAULT 'Sparkles',
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- 4. TOOLS TABLE (Primary Entity)
CREATE TABLE IF NOT EXISTS tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    website_url TEXT NOT NULL,
    normalized_domain VARCHAR(255) NOT NULL,
    short_description VARCHAR(280) NOT NULL,
    full_description TEXT NOT NULL,
    logo_url TEXT,
    pricing_type pricing_type_enum NOT NULL DEFAULT 'unknown',
    starting_price NUMERIC(10, 2) DEFAULT 0.00,
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
CREATE INDEX IF NOT EXISTS idx_tools_slug ON tools(slug);
CREATE INDEX IF NOT EXISTS idx_tools_domain ON tools(normalized_domain);
CREATE INDEX IF NOT EXISTS idx_tools_publication_status ON tools(publication_status);
CREATE INDEX IF NOT EXISTS idx_tools_featured ON tools(featured) WHERE publication_status = 'published';
CREATE INDEX IF NOT EXISTS idx_tools_pricing_type ON tools(pricing_type);
CREATE INDEX IF NOT EXISTS idx_tools_created_at ON tools(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tools_search ON tools USING GIN(search_vector);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION update_tool_search_vector() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.short_description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.full_description, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tool_search_vector ON tools;
CREATE TRIGGER trg_tool_search_vector
    BEFORE INSERT OR UPDATE ON tools
    FOR EACH ROW EXECUTE FUNCTION update_tool_search_vector();

-- 5. TOOL_CATEGORIES (Many-to-Many)
CREATE TABLE IF NOT EXISTS tool_categories (
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (tool_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_categories_cat ON tool_categories(category_id);

-- 6. PRICING PLANS
CREATE TABLE IF NOT EXISTS pricing_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    plan_name VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) DEFAULT 0.00,
    billing_period VARCHAR(30) DEFAULT 'monthly', -- 'monthly', 'annually', 'one_time', 'usage_based'
    currency VARCHAR(10) DEFAULT 'USD',
    description TEXT,
    features JSONB DEFAULT '[]'::jsonb,
    source_url TEXT,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_plans_tool_id ON pricing_plans(tool_id);

-- 7. TOOL FEATURES
CREATE TABLE IF NOT EXISTS tool_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    feature_name VARCHAR(120) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_features_tool_id ON tool_features(tool_id);

-- 8. TOOL ALTERNATIVES
CREATE TABLE IF NOT EXISTS tool_alternatives (
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    alternative_tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    similarity_score NUMERIC(3, 2) DEFAULT 0.80,
    PRIMARY KEY (tool_id, alternative_tool_id)
);

-- 9. AFFILIATE PROGRAMS
CREATE TABLE IF NOT EXISTS affiliate_programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    affiliate_network VARCHAR(100),
    application_url TEXT,
    commission_details TEXT,
    approval_status VARCHAR(50) DEFAULT 'pending',
    tracking_url TEXT,
    notes TEXT,
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. IMPORT BATCHES
CREATE TABLE IF NOT EXISTS import_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- 11. IMPORT ERRORS
CREATE TABLE IF NOT EXISTS import_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    error_code VARCHAR(80) NOT NULL,
    error_message TEXT NOT NULL,
    original_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_errors_batch ON import_errors(batch_id);

-- 12. ADMIN USERS (Identity bridge to Supabase Auth)
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY, -- matches auth.users.id
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(120),
    role VARCHAR(50) NOT NULL DEFAULT 'editor', -- 'super_admin', 'editor', 'moderator'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 13. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    administrator_id UUID,
    administrator_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- 14. SUBMISSIONS (Community submissions)
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);



-- 15. ROW LEVEL SECURITY (RLS) POLICIES

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

-- Admin verification functions
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE SQL
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
LANGUAGE SQL
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

-- Remove old policies before creating the new ones
DROP POLICY IF EXISTS "Public read access to published tools" ON public.tools;
DROP POLICY IF EXISTS "Public read access to categories" ON public.categories;
DROP POLICY IF EXISTS "Public read access to tool_categories" ON public.tool_categories;
DROP POLICY IF EXISTS "Public read access to pricing_plans" ON public.pricing_plans;
DROP POLICY IF EXISTS "Public read access to tool_features" ON public.tool_features;
DROP POLICY IF EXISTS "Public can submit tools" ON public.submissions;
DROP POLICY IF EXISTS "Admin full access to tools" ON public.tools;

-- Public can only read published tools
CREATE POLICY "Public read published tools"
ON public.tools FOR SELECT TO anon, authenticated
USING (publication_status = 'published');

-- Public can read categories
CREATE POLICY "Public read categories"
ON public.categories FOR SELECT TO anon, authenticated
USING (true);

-- Public can read categories linked to published tools
CREATE POLICY "Public read published tool categories"
ON public.tool_categories FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tools t
        WHERE t.id = tool_categories.tool_id
          AND t.publication_status = 'published'
    )
);

-- Public can read pricing plans for published tools
CREATE POLICY "Public read published pricing plans"
ON public.pricing_plans FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tools t
        WHERE t.id = pricing_plans.tool_id
          AND t.publication_status = 'published'
    )
);

-- Public can read features for published tools
CREATE POLICY "Public read published tool features"
ON public.tool_features FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tools t
        WHERE t.id = tool_features.tool_id
          AND t.publication_status = 'published'
    )
);

-- Public can read alternatives only for published tools
CREATE POLICY "Public read published tool alternatives"
ON public.tool_alternatives FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tools t
        WHERE t.id = tool_alternatives.tool_id
          AND t.publication_status = 'published'
    )
);

-- Public submissions: INSERT only
CREATE POLICY "Public submit tools"
ON public.submissions FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Admin management policies
CREATE POLICY "Admins manage tools"
ON public.tools FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage categories"
ON public.categories FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage tool categories"
ON public.tool_categories FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage pricing plans"
ON public.pricing_plans FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage tool features"
ON public.tool_features FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage tool alternatives"
ON public.tool_alternatives FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage affiliate programs"
ON public.affiliate_programs FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage submissions"
ON public.submissions FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage import batches"
ON public.import_batches FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

CREATE POLICY "Admins manage import errors"
ON public.import_errors FOR ALL TO authenticated
USING ((SELECT public.is_active_admin()))
WITH CHECK ((SELECT public.is_active_admin()));

-- Admin users can read their own record
CREATE POLICY "Admins read own account"
ON public.admin_users FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));

-- Only super admins can manage admin accounts
CREATE POLICY "Super admins manage admin accounts"
ON public.admin_users FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()))
WITH CHECK ((SELECT public.is_super_admin()));

-- Admins can read audit logs
CREATE POLICY "Admins read audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING ((SELECT public.is_active_admin()));

-- Admins can insert their own audit log entries
CREATE POLICY "Admins insert own audit logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (
    administrator_id = (SELECT auth.uid())
    AND (SELECT public.is_active_admin())
);

-- Restrict function execution to authenticated users
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
