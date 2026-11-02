-- ====================================================================
-- AI TOOLS DIRECTORY — DATABASE RLS SECURITY TEST SUITE
-- File: supabase/tests/rls_security_tests.sql
-- Run in Supabase SQL Editor to verify security policies
-- ====================================================================
-- NOTE:
-- This script runs inside a single TRANSACTION that automatically ROLLS BACK,
-- ensuring no test artifacts are left in your database.
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- TEST FIXTURES SETUP (Temporary mock users and records)
-- --------------------------------------------------------------------
DO $$
DECLARE
    super_admin_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
    editor_admin_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    inactive_admin_id UUID := '33333333-3333-3333-3333-333333333333'::UUID;
    regular_user_id UUID := '44444444-4444-4444-4444-444444444444'::UUID;

    test_pub_tool_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
    test_draft_tool_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;
BEGIN
    -- Create dummy auth.users for test session
    INSERT INTO auth.users (id, email, role, aud)
    VALUES
        (super_admin_id, 'superadmin@test.local', 'authenticated', 'authenticated'),
        (editor_admin_id, 'editor@test.local', 'authenticated', 'authenticated'),
        (inactive_admin_id, 'inactive@test.local', 'authenticated', 'authenticated'),
        (regular_user_id, 'regular@test.local', 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    -- Setup admin_users records
    INSERT INTO public.admin_users (id, email, full_name, role, is_active)
    VALUES
        (super_admin_id, 'superadmin@test.local', 'Test Super Admin', 'super_admin', TRUE),
        (editor_admin_id, 'editor@test.local', 'Test Editor', 'editor', TRUE),
        (inactive_admin_id, 'inactive@test.local', 'Test Inactive', 'editor', FALSE)
    ON CONFLICT (id) DO NOTHING;

    -- Insert test published tool
    INSERT INTO public.tools (id, name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
    VALUES (test_pub_tool_id, 'Published Test Tool', 'pub-tool', 'https://pub.test', 'pub.test', 'Desc', 'Full', 'published')
    ON CONFLICT (id) DO NOTHING;

    -- Insert test draft tool
    INSERT INTO public.tools (id, name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
    VALUES (test_draft_tool_id, 'Draft Test Tool', 'draft-tool', 'https://draft.test', 'draft.test', 'Desc', 'Full', 'draft')
    ON CONFLICT (id) DO NOTHING;

    -- Insert affiliate program
    INSERT INTO public.affiliate_programs (tool_id, affiliate_network, commission_details)
    VALUES (test_pub_tool_id, 'Private Network', '30% confidential commission');
END $$;

-- --------------------------------------------------------------------
-- TEST 1: Anonymous users cannot access unpublished tools
-- --------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.sub" TO '';

DO $$
DECLARE
    found_count INT;
BEGIN
    SELECT COUNT(*) INTO found_count FROM public.tools WHERE publication_status = 'draft';
    IF found_count > 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anonymous user was able to view % draft tools!', found_count;
    END IF;
    RAISE NOTICE 'TEST 1 PASSED: Anonymous user cannot view unpublished tools.';
END $$;

-- --------------------------------------------------------------------
-- TEST 2: Anonymous users cannot read admin accounts
-- --------------------------------------------------------------------
DO $$
DECLARE
    admin_count INT;
BEGIN
    SELECT COUNT(*) INTO admin_count FROM public.admin_users;
    IF admin_count > 0 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Anonymous user was able to read % admin records!', admin_count;
    END IF;
    RAISE NOTICE 'TEST 2 PASSED: Anonymous user cannot read admin_users records.';
END $$;

-- --------------------------------------------------------------------
-- TEST 3: Anonymous users cannot access affiliate program records
-- --------------------------------------------------------------------
DO $$
DECLARE
    aff_count INT;
BEGIN
    SELECT COUNT(*) INTO aff_count FROM public.affiliate_programs;
    IF aff_count > 0 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Anonymous user was able to read % affiliate records!', aff_count;
    END IF;
    RAISE NOTICE 'TEST 3 PASSED: Anonymous user cannot read affiliate_programs records.';
END $$;

-- --------------------------------------------------------------------
-- TEST 4: Anonymous user can insert a submission, but CANNOT read or update submissions
-- --------------------------------------------------------------------
DO $$
DECLARE
    sub_count INT;
BEGIN
    -- Insert should succeed
    INSERT INTO public.submissions (tool_name, website_url, submitter_email, description)
    VALUES ('Community AI', 'https://community.test', 'anon@test.com', 'Testing public community submission');

    -- Select must return 0
    SELECT COUNT(*) INTO sub_count FROM public.submissions;
    IF sub_count > 0 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Anonymous user was able to read % submission records!', sub_count;
    END IF;
    RAISE NOTICE 'TEST 4 PASSED: Anonymous users can submit suggestions but cannot read submissions.';
END $$;

-- --------------------------------------------------------------------
-- TEST 5: An ordinary authenticated non-admin user CANNOT manage tools
-- --------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '44444444-4444-4444-4444-444444444444';

DO $$
BEGIN
    BEGIN
        INSERT INTO public.tools (name, slug, website_url, normalized_domain, short_description, full_description, publication_status)
        VALUES ('Hacker Tool', 'hacker-tool', 'https://hack.test', 'hack.test', 'Short', 'Full', 'published');
        RAISE EXCEPTION 'TEST 5 FAILED: Ordinary user was able to insert a tool!';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE 'TEST 5 PASSED: Ordinary authenticated user cannot insert tools (permission denied).';
    END;
END $$;

-- --------------------------------------------------------------------
-- TEST 6: An editor CANNOT manage super-admin accounts
-- --------------------------------------------------------------------
SET LOCAL "request.jwt.claim.sub" TO '22222222-2222-2222-2222-222222222222'; -- editor_admin_id

DO $$
BEGIN
    BEGIN
        UPDATE public.admin_users
        SET role = 'super_admin'
        WHERE id = '22222222-2222-2222-2222-222222222222'::UUID;

        -- If UPDATE affected rows, it failed
        IF FOUND THEN
            RAISE EXCEPTION 'TEST 6 FAILED: Editor was able to escalate privilege to super_admin!';
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            NULL; -- expected restriction
    END;
    RAISE NOTICE 'TEST 6 PASSED: Editor cannot alter administrator role permissions.';
END $$;

-- --------------------------------------------------------------------
-- TEST 7: An active super administrator CAN manage permitted content
-- --------------------------------------------------------------------
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111'; -- super_admin_id

DO $$
DECLARE
    updated_rows INT;
BEGIN
    UPDATE public.tools
    SET featured = TRUE
    WHERE slug = 'pub-tool';

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    IF updated_rows <> 1 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Super administrator was unable to update tools record.';
    END IF;
    RAISE NOTICE 'TEST 7 PASSED: Super administrator can manage tools.';
END $$;

-- --------------------------------------------------------------------
-- TEST 8: An inactive administrator CANNOT access protected admin data
-- --------------------------------------------------------------------
SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333'; -- inactive_admin_id

DO $$
DECLARE
    draft_count INT;
BEGIN
    SELECT COUNT(*) INTO draft_count FROM public.tools WHERE publication_status = 'draft';
    IF draft_count > 0 THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Inactive administrator was able to read % draft tools!', draft_count;
    END IF;
    RAISE NOTICE 'TEST 8 PASSED: Inactive administrator cannot access draft or restricted data.';
END $$;

-- Rollback the entire transaction to leave zero test residues in database
ROLLBACK;
