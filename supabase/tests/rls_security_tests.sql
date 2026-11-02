-- ====================================================================
-- AI TOOLS DIRECTORY — DATABASE RLS SECURITY TEST SUITE
-- File: supabase/tests/rls_security_tests.sql
-- ====================================================================
-- INSTRUCTIONS FOR TESTING:
-- 1. Open the Supabase Dashboard -> SQL Editor.
-- 2. Paste the full contents of this script and click "Run".
-- 3. Verify that all tests output "TEST X PASSED".
--
-- GUARANTEES:
-- - Runs completely inside a single transaction ending with ROLLBACK.
-- - ZERO test artifacts, dummy users, or test data are persisted.
-- - Uses `SET CONSTRAINTS ALL DEFERRED;` so test fixtures do not require
--   polluting or directly writing into `auth.users`.
-- - No swallowed exceptions or false positives.
-- ====================================================================

BEGIN;

-- Defer foreign key constraints so mock user IDs can be placed in admin_users
-- without requiring direct writes to the protected auth.users table.
SET CONSTRAINTS ALL DEFERRED;

-- --------------------------------------------------------------------
-- 0. TEST FIXTURES SETUP (Scoped strictly to this transaction)
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_super_admin_id  UUID := '11111111-1111-1111-1111-111111111111'::UUID;
    v_editor_id       UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    v_inactive_id     UUID := '33333333-3333-3333-3333-333333333333'::UUID;

    v_pub_tool_1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    v_pub_tool_2_id   UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;
    v_draft_tool_id   UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;
BEGIN
    -- Provision mock admin records for test simulation
    INSERT INTO public.admin_users (id, email, full_name, role, is_active)
    VALUES
        (v_super_admin_id, 'superadmin@test.local', 'Test Super Admin', 'super_admin', TRUE),
        (v_editor_id, 'editor@test.local', 'Test Editor', 'editor', TRUE),
        (v_inactive_id, 'inactive@test.local', 'Test Inactive Editor', 'editor', FALSE);

    -- Provision published test tools
    INSERT INTO public.tools (id, name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
    VALUES
        (v_pub_tool_1_id, 'Published Tool Alpha', 'pub-tool-alpha', 'https://alpha.test', 'alpha.test', 'Alpha description', 'Full content', 'published'),
        (v_pub_tool_2_id, 'Published Tool Beta', 'pub-tool-beta', 'https://beta.test', 'beta.test', 'Beta description', 'Full content', 'published');

    -- Provision draft test tool (must NEVER be accessible to public/anon)
    INSERT INTO public.tools (id, name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
    VALUES
        (v_draft_tool_id, 'Secret Draft Tool', 'secret-draft', 'https://secret.test', 'secret.test', 'Draft description', 'Full draft content', 'draft');

    -- Provision test alternatives:
    -- 1. Published to Published (Allowed for public)
    INSERT INTO public.tool_alternatives (tool_id, alternative_tool_id, similarity_score)
    VALUES (v_pub_tool_1_id, v_pub_tool_2_id, 0.90);

    -- 2. Published to Draft (Must NOT be exposed to public)
    INSERT INTO public.tool_alternatives (tool_id, alternative_tool_id, similarity_score)
    VALUES (v_pub_tool_1_id, v_draft_tool_id, 0.85);

    -- Provision confidential affiliate program
    INSERT INTO public.affiliate_programs (tool_id, affiliate_network, commission_details)
    VALUES (v_pub_tool_1_id, 'Impact Radius', 'Exclusive 40% recurring affiliate contract');

    -- Provision initial audit log
    INSERT INTO public.audit_logs (administrator_id, administrator_email, action, entity_type, entity_id, metadata)
    VALUES (v_super_admin_id, 'superadmin@test.local', 'fixture_init', 'system', '0', '{}'::jsonb);
END $$;


-- --------------------------------------------------------------------
-- TEST 1: Anonymous users can view published tools, but CANNOT view draft tools
-- --------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';
SET LOCAL "request.jwt.claims" TO '{}';

DO $$
DECLARE
    v_published_count INT;
    v_draft_count     INT;
BEGIN
    SELECT COUNT(*) INTO v_published_count FROM public.tools WHERE publication_status = 'published';
    IF v_published_count < 2 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anonymous user cannot read published tools (found: %)!', v_published_count;
    END IF;

    SELECT COUNT(*) INTO v_draft_count FROM public.tools WHERE publication_status = 'draft';
    IF v_draft_count > 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anonymous user was able to read % draft tools!', v_draft_count;
    END IF;

    RAISE NOTICE 'TEST 1 PASSED: Anonymous user can read published tools and cannot view draft tools.';
END $$;


-- --------------------------------------------------------------------
-- TEST 2: Anonymous users CANNOT read administrator accounts
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_admin_count INT;
BEGIN
    SELECT COUNT(*) INTO v_admin_count FROM public.admin_users;
    IF v_admin_count > 0 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Anonymous user was able to read % admin_users records!', v_admin_count;
    END IF;

    RAISE NOTICE 'TEST 2 PASSED: Anonymous user cannot read admin_users records.';
END $$;


-- --------------------------------------------------------------------
-- TEST 3: Anonymous users CANNOT read confidential affiliate program data
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_aff_count INT;
BEGIN
    SELECT COUNT(*) INTO v_aff_count FROM public.affiliate_programs;
    IF v_aff_count > 0 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Anonymous user was able to read % affiliate_programs records!', v_aff_count;
    END IF;

    RAISE NOTICE 'TEST 3 PASSED: Anonymous user cannot read affiliate_programs records.';
END $$;


-- --------------------------------------------------------------------
-- TEST 4: Anonymous user can INSERT community submissions, but CANNOT read, edit, or delete them
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_sub_count INT;
    v_del_count INT;
BEGIN
    -- 1. Insert should succeed
    INSERT INTO public.submissions (tool_name, website_url, submitter_email, description)
    VALUES ('Anonymous AI Suggestion', 'https://suggested.test', 'anon@test.local', 'Community suggested tool');

    -- 2. Select should return 0 rows (RLS forbids SELECT for anon)
    SELECT COUNT(*) INTO v_sub_count FROM public.submissions;
    IF v_sub_count > 0 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Anonymous user was able to read % submission records!', v_sub_count;
    END IF;

    -- 3. Delete should affect 0 rows
    DELETE FROM public.submissions;
    GET DIAGNOSTICS v_del_count = ROW_COUNT;
    IF v_del_count > 0 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Anonymous user was able to delete % submission records!', v_del_count;
    END IF;

    RAISE NOTICE 'TEST 4 PASSED: Anonymous user can submit suggestions but cannot read or mutate submissions.';
END $$;


-- --------------------------------------------------------------------
-- TEST 5: Ordinary authenticated user (non-admin) CANNOT insert or update tools
-- --------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '44444444-4444-4444-4444-444444444444';
SET LOCAL "request.jwt.claims" TO '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

DO $$
DECLARE
    v_insert_succeeded BOOLEAN := FALSE;
    v_update_affected  INT := 0;
BEGIN
    -- Attempt insert
    BEGIN
        INSERT INTO public.tools (name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
        VALUES ('Hacker AI Tool', 'hacker-tool', 'https://hack.test', 'hack.test', 'Short desc', 'Full desc', 'published');
        v_insert_succeeded := TRUE;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_insert_succeeded := FALSE;
    END;

    IF v_insert_succeeded THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Ordinary authenticated user was able to insert a new tool!';
    END IF;

    -- Attempt update
    UPDATE public.tools
    SET name = 'Defaced Name'
    WHERE slug = 'pub-tool-alpha';

    GET DIAGNOSTICS v_update_affected = ROW_COUNT;
    IF v_update_affected > 0 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Ordinary authenticated user was able to update a tool (rows: %)!', v_update_affected;
    END IF;

    RAISE NOTICE 'TEST 5 PASSED: Ordinary authenticated user cannot insert or update tools.';
END $$;


-- --------------------------------------------------------------------
-- TEST 6: Editor CANNOT escalate their role to super_admin or create administrators
-- (Zero swallowed exceptions; precise ROW_COUNT & assertion verification)
-- --------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '22222222-2222-2222-2222-222222222222'; -- editor_id
SET LOCAL "request.jwt.claims" TO '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

DO $$
DECLARE
    v_update_count   INT := 0;
    v_current_role   VARCHAR(50);
    v_created_admin  BOOLEAN := FALSE;
BEGIN
    -- 1. Attempt self-escalation via UPDATE
    UPDATE public.admin_users
    SET role = 'super_admin'
    WHERE id = '22222222-2222-2222-2222-222222222222'::UUID;

    GET DIAGNOSTICS v_update_count = ROW_COUNT;
    IF v_update_count > 0 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Editor was able to update admin_users role (rows affected: %)!', v_update_count;
    END IF;

    -- Verify stored role is still 'editor'
    SELECT role INTO v_current_role
    FROM public.admin_users
    WHERE id = '22222222-2222-2222-2222-222222222222'::UUID;

    IF v_current_role <> 'editor' THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Role integrity violated! Current role is %', v_current_role;
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
        RAISE EXCEPTION 'TEST 6 FAILED: Editor was able to create a new administrator account!';
    END IF;

    RAISE NOTICE 'TEST 6 PASSED: Editor cannot escalate permissions or create admin accounts (0 rows updated).';
END $$;


-- --------------------------------------------------------------------
-- TEST 7: Active Super Admin CAN manage tools and view admin accounts
-- --------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111'; -- super_admin_id
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

DO $$
DECLARE
    v_updated_rows INT := 0;
    v_admin_count  INT := 0;
BEGIN
    UPDATE public.tools
    SET featured = TRUE
    WHERE slug = 'pub-tool-alpha';

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Super admin was unable to update tools record (rows: %)!', v_updated_rows;
    END IF;

    SELECT COUNT(*) INTO v_admin_count FROM public.admin_users;
    IF v_admin_count < 3 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Super admin cannot view all admin_users (found: %)!', v_admin_count;
    END IF;

    RAISE NOTICE 'TEST 7 PASSED: Super admin has full verified management permissions.';
END $$;


-- --------------------------------------------------------------------
-- TEST 8: Inactive Administrator CANNOT access draft tools or restricted admin data
-- --------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333'; -- inactive_id
SET LOCAL "request.jwt.claims" TO '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

DO $$
DECLARE
    v_draft_count INT;
    v_aff_count   INT;
BEGIN
    SELECT COUNT(*) INTO v_draft_count FROM public.tools WHERE publication_status = 'draft';
    IF v_draft_count > 0 THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Inactive admin was able to view % draft tools!', v_draft_count;
    END IF;

    SELECT COUNT(*) INTO v_aff_count FROM public.affiliate_programs;
    IF v_aff_count > 0 THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Inactive admin was able to read % affiliate records!', v_aff_count;
    END IF;

    RAISE NOTICE 'TEST 8 PASSED: Inactive administrator cannot access draft or restricted data.';
END $$;


-- --------------------------------------------------------------------
-- TEST 9: Dual-publication verification on tool alternatives
-- (Draft alternative MUST NOT be exposed to public)
-- --------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';
SET LOCAL "request.jwt.claims" TO '{}';

DO $$
DECLARE
    v_alt_count INT;
BEGIN
    -- We inserted 2 alternatives: one between 2 published tools, one linking to a draft tool.
    -- Public SELECT should return EXACTLY 1 row (the pair of published tools).
    SELECT COUNT(*) INTO v_alt_count FROM public.tool_alternatives;

    IF v_alt_count <> 1 THEN
        RAISE EXCEPTION 'TEST 9 FAILED: Dual-publication check failed! Expected 1 public alternative, found %!', v_alt_count;
    END IF;

    RAISE NOTICE 'TEST 9 PASSED: Tool alternatives properly require both tools to be published.';
END $$;


-- --------------------------------------------------------------------
-- TEST 10: Audit logs immutability (NO UPDATE, NO DELETE for authenticated users)
-- --------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111'; -- super_admin_id
SET LOCAL "request.jwt.claims" TO '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

DO $$
DECLARE
    v_deleted_count INT := 0;
    v_updated_count INT := 0;
    v_delete_threw  BOOLEAN := FALSE;
    v_update_threw  BOOLEAN := FALSE;
BEGIN
    -- Try to delete audit logs
    BEGIN
        DELETE FROM public.audit_logs;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_delete_threw := TRUE;
    END;

    IF v_delete_threw = FALSE AND v_deleted_count > 0 THEN
        RAISE EXCEPTION 'TEST 10 FAILED: Authenticated user was able to delete audit logs (rows: %)!', v_deleted_count;
    END IF;

    -- Try to update audit logs
    BEGIN
        UPDATE public.audit_logs SET action = 'tampered_action';
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_update_threw := TRUE;
    END;

    IF v_update_threw = FALSE AND v_updated_count > 0 THEN
        RAISE EXCEPTION 'TEST 10 FAILED: Authenticated user was able to modify audit logs (rows: %)!', v_updated_count;
    END IF;

    RAISE NOTICE 'TEST 10 PASSED: Audit logs are strictly immutable and protected against tampering.';
END $$;

-- --------------------------------------------------------------------
-- Roll back the entire transaction to leave ZERO residues in the database
-- --------------------------------------------------------------------
ROLLBACK;
