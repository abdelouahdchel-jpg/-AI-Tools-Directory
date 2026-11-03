-- ====================================================================
-- AI TOOLS DIRECTORY — PRODUCTION RLS & PERMISSIONS TEST SUITE
-- File: supabase/tests/rls_security_tests.sql
-- ====================================================================
-- PURPOSE & INSTRUCTIONS:
-- 1. Open Supabase Dashboard -> SQL Editor.
-- 2. Paste this entire script into the editor and click "Run".
-- 3. Verify all 13 tests print "PASSED" notices.
--
-- CORE PRINCIPLES & ARCHITECTURE:
-- - PUBLIC DIRECTORY MODEL: Visitors (anon) MUST be able to freely browse
--   published tools, categories, pricing plans, and tool features for search
--   and comparison without being forced to sign in.
-- - PUBLIC SUBMISSIONS: Visitors can submit new tool proposals (INSERT only).
--   They cannot view, edit, or delete submitted proposals or published tools.
-- - DEFENSE IN DEPTH: Handles both PostgreSQL Table Privileges (DAC / 42501)
--   and Row-Level Security (RLS row filtering) without unhandled aborts.
-- - TARGETED TEST ISOLATION: Tests query specific fixture UUIDs rather than
--   global table counts, making the test suite 100% resilient even when
--   pre-existing real data exists in the database.
-- - ATOMIC TRANSACTION: Begins with `BEGIN;` and ends with `ROLLBACK;`.
--   Zero mock users, fixtures, or residues persist in the database.
-- ====================================================================

BEGIN;

-- Defer foreign key constraints so test fixtures can populate `public.admin_users`
-- and `public.audit_logs` without requiring writes to the protected `auth.users` table.
SET CONSTRAINTS ALL DEFERRED;

-- --------------------------------------------------------------------
-- 0. TEST FIXTURES SETUP (Executed as session owner / postgres)
-- --------------------------------------------------------------------
DO $$
DECLARE
    -- Admin roles fixtures
    v_super_admin_id  UUID := '11111111-1111-1111-1111-111111111111'::UUID;
    v_editor_id       UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    v_inactive_id     UUID := '33333333-3333-3333-3333-333333333333'::UUID;

    -- Directory content fixtures
    v_pub_tool_1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_pub_tool_2_id   UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;
    v_draft_tool_id   UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;
    v_category_id     UUID := '12121212-1212-1212-1212-121212121212'::UUID;
    v_pricing_id      UUID := '13131313-1313-1313-1313-131313131313'::UUID;
    v_feature_id      UUID := '14141414-1414-1414-1414-141414141414'::UUID;

    -- Commercial & system fixtures
    v_affiliate_id    UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd'::UUID;
    v_log_id          UUID := 'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID;
    v_batch_id        UUID := '99999999-9999-9999-9999-999999999999'::UUID;
BEGIN
    -- 1. Admin users (Table: public.admin_users)
    INSERT INTO public.admin_users (id, email, full_name, role, is_active)
    VALUES
        (v_super_admin_id, 'superadmin@test.local', 'Test Super Admin', 'super_admin', TRUE),
        (v_editor_id, 'editor@test.local', 'Test Editor', 'editor', TRUE),
        (v_inactive_id, 'inactive@test.local', 'Test Inactive Editor', 'editor', FALSE)
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active;

    -- 2. Category fixture (Table: public.categories)
    INSERT INTO public.categories (id, name, slug, description)
    VALUES (v_category_id, 'Testing AI Category', 'testing-ai-category', 'Public category for AI directory testing')
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug;

    -- 3. Published tools (Table: public.tools)
    INSERT INTO public.tools (id, name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
    VALUES
        (v_pub_tool_1_id, 'Published Tool Alpha', 'pub-tool-alpha', 'https://alpha.test', 'alpha.test', 'Alpha description', 'Full content for alpha', 'published'),
        (v_pub_tool_2_id, 'Published Tool Beta', 'pub-tool-beta', 'https://beta.test', 'beta.test', 'Beta description', 'Full content for beta', 'published')
    ON CONFLICT (id) DO UPDATE SET
        publication_status = EXCLUDED.publication_status,
        name = EXCLUDED.name;

    -- 4. Draft tool (Table: public.tools - MUST NOT be exposed to public/anon)
    INSERT INTO public.tools (id, name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
    VALUES
        (v_draft_tool_id, 'Secret Draft Tool', 'secret-draft', 'https://secret.test', 'secret.test', 'Draft description', 'Full draft content', 'draft')
    ON CONFLICT (id) DO UPDATE SET
        publication_status = EXCLUDED.publication_status,
        name = EXCLUDED.name;

    -- 5. Tool categories linkage (Table: public.tool_categories)
    INSERT INTO public.tool_categories (tool_id, category_id)
    VALUES (v_pub_tool_1_id, v_category_id)
    ON CONFLICT (tool_id, category_id) DO NOTHING;

    -- 6. Pricing plans (Table: public.pricing_plans)
    INSERT INTO public.pricing_plans (id, tool_id, plan_name, price, billing_period, currency)
    VALUES (v_pricing_id, v_pub_tool_1_id, 'Alpha Pro Plan', 29.00, 'monthly', 'USD')
    ON CONFLICT (id) DO UPDATE SET
        plan_name = EXCLUDED.plan_name,
        price = EXCLUDED.price;

    -- 7. Tool features (Table: public.tool_features)
    INSERT INTO public.tool_features (id, tool_id, feature_name, description)
    VALUES (v_feature_id, v_pub_tool_1_id, 'Real-time Vector Search', 'High-performance AI search')
    ON CONFLICT (id) DO UPDATE SET
        feature_name = EXCLUDED.feature_name;

    -- 8. Tool alternatives (Table: public.tool_alternatives)
    -- Pair A: Published Alpha <-> Published Beta (Allowed for public)
    -- Pair B: Published Alpha <-> Secret Draft (Hidden from public)
    INSERT INTO public.tool_alternatives (tool_id, alternative_tool_id, similarity_score)
    VALUES
        (v_pub_tool_1_id, v_pub_tool_2_id, 0.90),
        (v_pub_tool_1_id, v_draft_tool_id, 0.85)
    ON CONFLICT (tool_id, alternative_tool_id) DO UPDATE SET
        similarity_score = EXCLUDED.similarity_score;

    -- 9. Affiliate program (Table: public.affiliate_programs - Commercial confidential)
    INSERT INTO public.affiliate_programs (id, tool_id, affiliate_network, commission_details)
    VALUES (v_affiliate_id, v_pub_tool_1_id, 'Private Network', 'Exclusive 40% recurring contract')
    ON CONFLICT (id) DO UPDATE SET
        affiliate_network = EXCLUDED.affiliate_network,
        commission_details = EXCLUDED.commission_details;

    -- 10. Audit log (Table: public.audit_logs - Append-only system log)
    INSERT INTO public.audit_logs (id, administrator_id, administrator_email, action, entity_type, entity_id, metadata)
    VALUES (v_log_id, v_super_admin_id, 'superadmin@test.local', 'fixture_init', 'system', '0', '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    -- 11. Import batch (Table: public.import_batches - Admin management infrastructure)
    INSERT INTO public.import_batches (id, filename, source_name, source_type)
    VALUES (v_batch_id, 'test_batch.csv', 'Initial Test', 'csv')
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'FIXTURES INITIALIZED: Test dataset prepared successfully.';
END $$;


-- --------------------------------------------------------------------
-- TEST 1: Public Directory Access: Anonymous users can browse published
-- tools, categories, pricing plans, and features, but CANNOT view draft tools
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';
SET LOCAL "request.jwt.claim.role" TO 'anon';
SET LOCAL "request.jwt.claims" TO '{"role": "anon"}';

DO $$
DECLARE
    v_pub_tool_1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_draft_tool_id   UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;
    v_category_id     UUID := '12121212-1212-1212-1212-121212121212'::UUID;
    v_pricing_id      UUID := '13131313-1313-1313-1313-131313131313'::UUID;
    v_feature_id      UUID := '14141414-1414-1414-1414-141414141414'::UUID;

    v_has_pub_tool    BOOLEAN := FALSE;
    v_has_category    BOOLEAN := FALSE;
    v_has_pricing     BOOLEAN := FALSE;
    v_has_feature     BOOLEAN := FALSE;
    v_has_draft_tool  BOOLEAN := FALSE;
BEGIN
    -- 1. Check anonymous visitor can view published tools
    SELECT EXISTS (SELECT 1 FROM public.tools WHERE id = v_pub_tool_1_id AND publication_status = 'published')
    INTO v_has_pub_tool;

    IF NOT v_has_pub_tool THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anonymous visitor cannot read published tools!';
    END IF;

    -- 2. Check anonymous visitor can view categories
    SELECT EXISTS (SELECT 1 FROM public.categories WHERE id = v_category_id)
    INTO v_has_category;

    IF NOT v_has_category THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anonymous visitor cannot read directory categories!';
    END IF;

    -- 3. Check anonymous visitor can view pricing plans (for tool comparison)
    SELECT EXISTS (SELECT 1 FROM public.pricing_plans WHERE id = v_pricing_id)
    INTO v_has_pricing;

    IF NOT v_has_pricing THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anonymous visitor cannot read pricing plans for comparison!';
    END IF;

    -- 4. Check anonymous visitor can view tool features
    SELECT EXISTS (SELECT 1 FROM public.tool_features WHERE id = v_feature_id)
    INTO v_has_feature;

    IF NOT v_has_feature THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anonymous visitor cannot read tool features for comparison!';
    END IF;

    -- 5. Check anonymous visitor CANNOT view secret draft tools
    SELECT EXISTS (SELECT 1 FROM public.tools WHERE id = v_draft_tool_id)
    INTO v_has_draft_tool;

    IF v_has_draft_tool THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Data leak! Anonymous visitor was able to read a draft tool!';
    END IF;

    RAISE NOTICE 'TEST 1 PASSED: Anonymous visitors can browse tools, categories, pricing, and features (Public directory browsing and comparison fully operational).';
END $$;


-- --------------------------------------------------------------------
-- TEST 2: Anonymous users CANNOT read administrator accounts (admin_users)
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_admin_count     INT := 0;
    v_denied_by_dac   BOOLEAN := FALSE;
BEGIN
    BEGIN
        SELECT COUNT(*) INTO v_admin_count FROM public.admin_users;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_denied_by_dac := TRUE;
            v_admin_count := 0;
    END;

    IF v_admin_count > 0 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Security breach! Anonymous user was able to read % admin records!', v_admin_count;
    END IF;

    IF v_denied_by_dac THEN
        RAISE NOTICE 'TEST 2 PASSED: Anonymous access to admin_users blocked by PostgreSQL table privileges (permission denied).';
    ELSE
        RAISE NOTICE 'TEST 2 PASSED: Anonymous access to admin_users blocked by RLS (0 rows returned).';
    END IF;
END $$;


-- --------------------------------------------------------------------
-- TEST 3: Anonymous users CANNOT read confidential affiliate program data
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_aff_count       INT := 0;
    v_denied_by_dac   BOOLEAN := FALSE;
BEGIN
    BEGIN
        SELECT COUNT(*) INTO v_aff_count FROM public.affiliate_programs;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_denied_by_dac := TRUE;
            v_aff_count := 0;
    END;

    IF v_aff_count > 0 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Security breach! Anonymous user read % confidential affiliate records!', v_aff_count;
    END IF;

    IF v_denied_by_dac THEN
        RAISE NOTICE 'TEST 3 PASSED: Anonymous access to affiliate_programs blocked by PostgreSQL table privileges (permission denied).';
    ELSE
        RAISE NOTICE 'TEST 3 PASSED: Anonymous access to affiliate_programs blocked by RLS (0 rows returned).';
    END IF;
END $$;


-- --------------------------------------------------------------------
-- TEST 4: Anonymous visitors can submit new tool proposals (INSERT allowed),
-- but CANNOT read, edit, or delete any submissions
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_sub_count       INT := 0;
    v_upd_count       INT := 0;
    v_del_count       INT := 0;
    v_sel_denied      BOOLEAN := FALSE;
    v_upd_denied      BOOLEAN := FALSE;
    v_del_denied      BOOLEAN := FALSE;
BEGIN
    -- 1. Plain INSERT must succeed (no RETURNING clause to avoid requiring SELECT privilege)
    -- If INSERT fails, we report the exact SQLERRM and SQLSTATE without hiding the cause.
    BEGIN
        INSERT INTO public.submissions (tool_name, website_url, submitter_email, description)
        VALUES ('Community AI Suggestion', 'https://suggested.test', 'anon@test.local', 'Testing submission');
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE EXCEPTION 'TEST 4 FAILED: Permission denied for anonymous submissions INSERT. Check GRANT INSERT ON submissions TO anon. (SQLSTATE: %, SQLERRM: %)', SQLSTATE, SQLERRM;
        WHEN check_violation THEN
            RAISE EXCEPTION 'TEST 4 FAILED: Check constraint or RLS WITH CHECK violation on anonymous submissions INSERT. (SQLSTATE: %, SQLERRM: %)', SQLSTATE, SQLERRM;
        WHEN not_null_violation THEN
            RAISE EXCEPTION 'TEST 4 FAILED: NOT NULL constraint violation on anonymous submissions INSERT. (SQLSTATE: %, SQLERRM: %)', SQLSTATE, SQLERRM;
        WHEN OTHERS THEN
            RAISE EXCEPTION 'TEST 4 FAILED: Unexpected error on anonymous submissions INSERT: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END;

    -- 2. SELECT must be blocked (either permission denied or 0 rows returned)
    BEGIN
        SELECT COUNT(*) INTO v_sub_count FROM public.submissions;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_sel_denied := TRUE;
            v_sub_count := 0;
    END;

    IF v_sub_count > 0 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Privacy breach! Anonymous user read % submission records!', v_sub_count;
    END IF;

    -- 3. UPDATE must be blocked
    BEGIN
        UPDATE public.submissions SET description = 'Tampered submission';
        GET DIAGNOSTICS v_upd_count = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_upd_denied := TRUE;
            v_upd_count := 0;
    END;

    IF v_upd_count > 0 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Tampering breach! Anonymous user updated % submissions!', v_upd_count;
    END IF;

    -- 4. DELETE must be blocked
    BEGIN
        DELETE FROM public.submissions;
        GET DIAGNOSTICS v_del_count = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_del_denied := TRUE;
            v_del_count := 0;
    END;

    IF v_del_count > 0 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Deletion breach! Anonymous user deleted % submissions!', v_del_count;
    END IF;

    RAISE NOTICE 'TEST 4 PASSED: Anonymous user can insert submissions, but SELECT/UPDATE/DELETE are strictly blocked (Protected: SELECT=%, UPDATE=%, DELETE=%).',
        CASE WHEN v_sel_denied THEN 'PrivilegeDenied' ELSE 'RLS-0' END,
        CASE WHEN v_upd_denied THEN 'PrivilegeDenied' ELSE 'RLS-0' END,
        CASE WHEN v_del_denied THEN 'PrivilegeDenied' ELSE 'RLS-0' END;
END $$;


-- --------------------------------------------------------------------
-- TEST 5: Ordinary authenticated user (non-admin) CANNOT insert, update, or delete tools
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '44444444-4444-4444-4444-444444444444';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

DO $$
DECLARE
    v_pub_tool_1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_insert_allowed  BOOLEAN := FALSE;
    v_update_affected INT := 0;
    v_delete_affected INT := 0;
BEGIN
    -- 1. Attempt INSERT
    BEGIN
        INSERT INTO public.tools (name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
        VALUES ('Hacker Tool', 'hacker-tool', 'https://hack.test', 'hack.test', 'Desc', 'Full', 'published');
        v_insert_allowed := TRUE;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_insert_allowed := FALSE;
    END;

    IF v_insert_allowed THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Ordinary authenticated user was able to insert a new tool!';
    END IF;

    -- 2. Attempt UPDATE on published tool
    BEGIN
        UPDATE public.tools
        SET name = 'Defaced Tool Name'
        WHERE id = v_pub_tool_1_id;
        GET DIAGNOSTICS v_update_affected = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_update_affected := 0;
    END;

    IF v_update_affected > 0 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Ordinary authenticated user updated % tools!', v_update_affected;
    END IF;

    -- 3. Attempt DELETE on published tool
    BEGIN
        DELETE FROM public.tools
        WHERE id = v_pub_tool_1_id;
        GET DIAGNOSTICS v_delete_affected = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_delete_affected := 0;
    END;

    IF v_delete_affected > 0 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Ordinary authenticated user deleted % tools!', v_delete_affected;
    END IF;

    RAISE NOTICE 'TEST 5 PASSED: Ordinary authenticated non-admin cannot insert, update, or delete tools (0 rows affected).';
END $$;


-- --------------------------------------------------------------------
-- TEST 6: Editor CANNOT escalate their role to super_admin,
-- CANNOT create admins, and CANNOT view other admin records
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '22222222-2222-2222-2222-222222222222'; -- editor_id
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

DO $$
DECLARE
    v_editor_id       UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    v_update_count    INT := 0;
    v_current_role    VARCHAR(50);
    v_created_admin   BOOLEAN := FALSE;
    v_visible_admins  INT := 0;
BEGIN
    -- 1. Attempt privilege self-escalation via UPDATE
    BEGIN
        UPDATE public.admin_users
        SET role = 'super_admin'
        WHERE id = v_editor_id;
        GET DIAGNOSTICS v_update_count = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_update_count := 0;
    END;

    IF v_update_count > 0 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Privilege escalation! Editor updated admin_users role (rows: %)!', v_update_count;
    END IF;

    -- Verify current stored role is still 'editor'
    SELECT role INTO v_current_role
    FROM public.admin_users
    WHERE id = v_editor_id;

    IF v_current_role <> 'editor' THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Role integrity corrupted! Expected editor, got: %', v_current_role;
    END IF;

    -- 2. Attempt unauthorized admin creation via INSERT
    BEGIN
        INSERT INTO public.admin_users (id, email, full_name, role, is_active)
        VALUES ('55555555-5555-5555-5555-555555555555'::UUID, 'rogue@test.local', 'Rogue Admin', 'super_admin', TRUE);
        v_created_admin := TRUE;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_created_admin := FALSE;
    END;

    IF v_created_admin THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Editor was able to insert a new admin_users record!';
    END IF;

    -- 3. Verify account isolation: Editor should only see their own account (count = 1)
    SELECT COUNT(*) INTO v_visible_admins FROM public.admin_users;
    IF v_visible_admins <> 1 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Account isolation breach! Editor can view % admin records (expected 1)!', v_visible_admins;
    END IF;

    RAISE NOTICE 'TEST 6 PASSED: Editor cannot escalate privileges, cannot create admins, and sees only their own account.';
END $$;


-- --------------------------------------------------------------------
-- TEST 7: Active Super Admin CAN manage tools and view all admin accounts
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111'; -- super_admin_id
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

DO $$
DECLARE
    v_pub_tool_1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_draft_tool_id   UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;
    v_updated_rows    INT := 0;
    v_admin_count     INT := 0;
    v_draft_count     INT := 0;
BEGIN
    -- Super admin can update tools
    UPDATE public.tools
    SET featured = TRUE
    WHERE id = v_pub_tool_1_id;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Super admin was unable to update tools record (rows affected: %)!', v_updated_rows;
    END IF;

    -- Super admin can view all admin accounts
    SELECT COUNT(*) INTO v_admin_count FROM public.admin_users;
    IF v_admin_count < 3 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Super admin cannot view all admin_users (found: %)!', v_admin_count;
    END IF;

    -- Super admin can view draft tools
    SELECT COUNT(*) INTO v_draft_count FROM public.tools WHERE id = v_draft_tool_id;
    IF v_draft_count < 1 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Super admin cannot view draft tools (found: %)!', v_draft_count;
    END IF;

    RAISE NOTICE 'TEST 7 PASSED: Super admin has full verified management permissions across all entities.';
END $$;


-- --------------------------------------------------------------------
-- TEST 8: Inactive Administrator CANNOT access draft tools,
-- CANNOT access affiliate data, and CANNOT update tools
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333'; -- inactive_id
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

DO $$
DECLARE
    v_pub_tool_1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_draft_tool_id   UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;
    v_affiliate_id    UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd'::UUID;

    v_draft_count     INT := 0;
    v_aff_count       INT := 0;
    v_upd_count       INT := 0;
BEGIN
    SELECT COUNT(*) INTO v_draft_count FROM public.tools WHERE id = v_draft_tool_id;
    IF v_draft_count > 0 THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Inactive admin was able to view draft tool!';
    END IF;

    SELECT COUNT(*) INTO v_aff_count FROM public.affiliate_programs WHERE id = v_affiliate_id;
    IF v_aff_count > 0 THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Inactive admin was able to read affiliate record!';
    END IF;

    UPDATE public.tools
    SET featured = TRUE
    WHERE id = v_pub_tool_1_id;
    GET DIAGNOSTICS v_upd_count = ROW_COUNT;

    IF v_upd_count > 0 THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Inactive admin was able to update tools (rows: %)!', v_upd_count;
    END IF;

    RAISE NOTICE 'TEST 8 PASSED: Inactive administrator cannot access draft or restricted data, and cannot mutate tools.';
END $$;


-- --------------------------------------------------------------------
-- TEST 9: Dual-publication verification on tool alternatives
-- (Checks specific pair relationships; immune to pre-existing database records)
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';
SET LOCAL "request.jwt.claim.role" TO 'anon';
SET LOCAL "request.jwt.claims" TO '{"role": "anon"}';

DO $$
DECLARE
    v_pub_tool_1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_pub_tool_2_id   UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;
    v_draft_tool_id   UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;

    v_has_pub_pair    BOOLEAN := FALSE;
    v_has_draft_pair  BOOLEAN := FALSE;
BEGIN
    -- 1. Check that the specific relationship between Published Alpha and Published Beta IS visible to anon
    SELECT EXISTS (
        SELECT 1
        FROM public.tool_alternatives
        WHERE tool_id = v_pub_tool_1_id
          AND alternative_tool_id = v_pub_tool_2_id
    ) INTO v_has_pub_pair;

    IF NOT v_has_pub_pair THEN
        RAISE EXCEPTION 'TEST 9 FAILED: Anonymous user cannot view the alternative between Published Alpha and Published Beta!';
    END IF;

    -- 2. Check that the specific relationship between Published Alpha and Secret Draft is NOT visible to anon
    SELECT EXISTS (
        SELECT 1
        FROM public.tool_alternatives
        WHERE tool_id = v_pub_tool_1_id
          AND alternative_tool_id = v_draft_tool_id
    ) INTO v_has_draft_pair;

    IF v_has_draft_pair THEN
        RAISE EXCEPTION 'TEST 9 FAILED: Dual-publication breach! Anonymous user was able to view an alternative linking to a draft tool!';
    END IF;

    RAISE NOTICE 'TEST 9 PASSED: Specific tool alternatives properly enforce dual-publication requirements (Published visible: true, Draft-linked visible: false).';
END $$;


-- --------------------------------------------------------------------
-- TEST 10: Audit logs immutability (NO UPDATE, NO DELETE for authenticated users)
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111'; -- super_admin_id
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

DO $$
DECLARE
    v_del_count   INT := 0;
    v_upd_count   INT := 0;
    v_del_denied  BOOLEAN := FALSE;
    v_upd_denied  BOOLEAN := FALSE;
BEGIN
    -- 1. Try to DELETE audit logs
    BEGIN
        DELETE FROM public.audit_logs;
        GET DIAGNOSTICS v_del_count = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_del_denied := TRUE;
            v_del_count := 0;
    END;

    IF v_del_count > 0 THEN
        RAISE EXCEPTION 'TEST 10 FAILED: Tampering breach! Authenticated user deleted % audit logs!', v_del_count;
    END IF;

    -- 2. Try to UPDATE audit logs
    BEGIN
        UPDATE public.audit_logs SET action = 'tampered_action';
        GET DIAGNOSTICS v_upd_count = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_upd_denied := TRUE;
            v_upd_count := 0;
    END;

    IF v_upd_count > 0 THEN
        RAISE EXCEPTION 'TEST 10 FAILED: Tampering breach! Authenticated user updated % audit logs!', v_upd_count;
    END IF;

    RAISE NOTICE 'TEST 10 PASSED: Audit logs are strictly immutable and protected against tampering (DELETE: %, UPDATE: %).',
        CASE WHEN v_del_denied THEN 'DeniedByDAC' ELSE 'RLS-0' END,
        CASE WHEN v_upd_denied THEN 'DeniedByDAC' ELSE 'RLS-0' END;
END $$;


-- --------------------------------------------------------------------
-- TEST 11 (ADDITIONAL): Editor CANNOT forge audit logs impersonating another admin
-- (Enforces administrator_id = auth.uid() in RLS WITH CHECK)
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '22222222-2222-2222-2222-222222222222'; -- editor_id
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

DO $$
DECLARE
    v_forgery_allowed BOOLEAN := FALSE;
    v_own_log_allowed BOOLEAN := FALSE;
BEGIN
    -- 1. Attempt to log an action claiming it was performed by the Super Admin
    BEGIN
        INSERT INTO public.audit_logs (administrator_id, administrator_email, action, entity_type, entity_id)
        VALUES ('11111111-1111-1111-1111-111111111111'::UUID, 'superadmin@test.local', 'forged_action', 'tools', '0');
        v_forgery_allowed := TRUE;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_forgery_allowed := FALSE;
    END;

    IF v_forgery_allowed THEN
        RAISE EXCEPTION 'TEST 11 FAILED: Impersonation breach! Editor was able to forge an audit log under another admin ID!';
    END IF;

    -- 2. Legitimate log under editor's own ID must succeed
    BEGIN
        INSERT INTO public.audit_logs (administrator_id, administrator_email, action, entity_type, entity_id)
        VALUES ('22222222-2222-2222-2222-222222222222'::UUID, 'editor@test.local', 'legitimate_edit', 'tools', '1');
        v_own_log_allowed := TRUE;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_own_log_allowed := FALSE;
    END;

    IF NOT v_own_log_allowed THEN
        RAISE EXCEPTION 'TEST 11 FAILED: Editor was prevented from logging their own legitimate action!';
    END IF;

    RAISE NOTICE 'TEST 11 PASSED: Audit log impersonation strictly prevented; legitimate admin logging verified.';
END $$;


-- --------------------------------------------------------------------
-- TEST 12 (ADDITIONAL): Ordinary authenticated non-admin CANNOT read
-- community submissions or audit logs
-- (Handles both PostgreSQL DAC insufficient_privilege and RLS 0-row filtering)
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '44444444-4444-4444-4444-444444444444';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

DO $$
DECLARE
    v_sub_count    INT := 0;
    v_log_count    INT := 0;
    v_sub_denied   BOOLEAN := FALSE;
    v_log_denied   BOOLEAN := FALSE;
BEGIN
    -- 1. Check submissions read restriction
    BEGIN
        SELECT COUNT(*) INTO v_sub_count FROM public.submissions;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_sub_denied := TRUE;
            v_sub_count := 0;
    END;

    IF v_sub_count > 0 THEN
        RAISE EXCEPTION 'TEST 12 FAILED: Privacy breach! Non-admin read % submissions!', v_sub_count;
    END IF;

    -- 2. Check audit_logs read restriction
    BEGIN
        SELECT COUNT(*) INTO v_log_count FROM public.audit_logs;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_log_denied := TRUE;
            v_log_count := 0;
    END;

    IF v_log_count > 0 THEN
        RAISE EXCEPTION 'TEST 12 FAILED: Privacy breach! Non-admin read % audit logs!', v_log_count;
    END IF;

    RAISE NOTICE 'TEST 12 PASSED: Ordinary authenticated user cannot read submissions (Protected: %) or audit logs (Protected: %).',
        CASE WHEN v_sub_denied THEN 'DeniedByDAC' ELSE 'RLS-0' END,
        CASE WHEN v_log_denied THEN 'DeniedByDAC' ELSE 'RLS-0' END;
END $$;


-- --------------------------------------------------------------------
-- TEST 13 (ADDITIONAL): Anonymous user CANNOT read or manipulate
-- import batches or import errors
-- --------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';
SET LOCAL "request.jwt.claim.role" TO 'anon';
SET LOCAL "request.jwt.claims" TO '{"role": "anon"}';

DO $$
DECLARE
    v_batch_count    INT := 0;
    v_error_count    INT := 0;
    v_batch_denied   BOOLEAN := FALSE;
    v_error_denied   BOOLEAN := FALSE;
BEGIN
    BEGIN
        SELECT COUNT(*) INTO v_batch_count FROM public.import_batches;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_batch_denied := TRUE;
            v_batch_count := 0;
    END;

    IF v_batch_count > 0 THEN
        RAISE EXCEPTION 'TEST 13 FAILED: Security breach! Anonymous user read % import batches!', v_batch_count;
    END IF;

    BEGIN
        SELECT COUNT(*) INTO v_error_count FROM public.import_errors;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_error_denied := TRUE;
            v_error_count := 0;
    END;

    IF v_error_count > 0 THEN
        RAISE EXCEPTION 'TEST 13 FAILED: Security breach! Anonymous user read % import errors!', v_error_count;
    END IF;

    RAISE NOTICE 'TEST 13 PASSED: Anonymous access to import infrastructure strictly blocked (Batches: %, Errors: %).',
        CASE WHEN v_batch_denied THEN 'DeniedByDAC' ELSE 'RLS-0' END,
        CASE WHEN v_error_denied THEN 'DeniedByDAC' ELSE 'RLS-0' END;
END $$;


-- --------------------------------------------------------------------
-- TEARDOWN: Revert role and roll back entire transaction
-- Guarantees ZERO test artifacts or mock data persist in the database
-- --------------------------------------------------------------------
RESET ROLE;
ROLLBACK;

-- End of test suite
