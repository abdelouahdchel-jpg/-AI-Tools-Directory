-- ============================================================
-- AI TOOLS DIRECTORY - RLS SECURITY TESTS
-- Compatible with the supplied 001_initial_schema.sql
-- Test data is rolled back at the end.
-- ============================================================

BEGIN;

-- 1. Create temporary results table
CREATE TEMP TABLE rls_test_results (
    test_no INTEGER,
    test_name TEXT,
    result TEXT,
    details TEXT
);

-- Temporary fixture IDs shared with the test roles
CREATE TEMP TABLE rls_fixture_ids (
    published_tool_id UUID,
    second_published_tool_id UUID,
    draft_tool_id UUID,
    category_id UUID,
    admin_user_id UUID
);

GRANT SELECT ON rls_fixture_ids TO anon, authenticated;
GRANT INSERT ON rls_test_results TO anon, authenticated;

-- 2. Prepare fixtures
DO $$
DECLARE
    v_admin UUID := '853fd65e-ec06-450c-bb51-856a6fa90305';
    v_published UUID := gen_random_uuid();
    v_second UUID := gen_random_uuid();
    v_draft UUID := gen_random_uuid();
    v_category UUID := gen_random_uuid();
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM auth.users WHERE id = v_admin
    ) THEN
        RAISE EXCEPTION 'The supplied Auth user UUID does not exist.';
    END IF;

    INSERT INTO public.admin_users
        (id, email, full_name, role, is_active)
    SELECT
        v_admin,
        email,
        'RLS Test Administrator',
        'super_admin',
        TRUE
    FROM auth.users
    WHERE id = v_admin
    ON CONFLICT (id) DO UPDATE
    SET role = 'super_admin',
        is_active = TRUE;

    INSERT INTO public.categories (id, name, slug)
    VALUES (v_category, 'RLS Test Category', 'rls-test-category');

    INSERT INTO public.tools (
        id, name, slug, website_url, normalized_domain,
        short_description, full_description, publication_status
    )
    VALUES
    (
        v_published, 'RLS Published Test Tool',
        'rls-published-test-tool',
        'https://published-test.example',
        'published-test.example',
        'Test published tool',
        'Temporary RLS test fixture',
        'published'
    ),
    (
        v_second, 'RLS Second Published Tool',
        'rls-second-published-test-tool',
        'https://second-test.example',
        'second-test.example',
        'Second published test tool',
        'Temporary RLS test fixture',
        'published'
    ),
    (
        v_draft, 'RLS Draft Test Tool',
        'rls-draft-test-tool',
        'https://draft-test.example',
        'draft-test.example',
        'Draft test tool',
        'Temporary RLS test fixture',
        'draft'
    );

    INSERT INTO public.tool_categories (tool_id, category_id)
    VALUES
        (v_published, v_category),
        (v_draft, v_category);

    INSERT INTO public.pricing_plans (tool_id, plan_name, price)
    VALUES (v_published, 'RLS Test Plan', 0);

    INSERT INTO public.tool_features (tool_id, feature_name)
    VALUES (v_published, 'RLS Test Feature');

    INSERT INTO public.tool_alternatives
        (tool_id, alternative_tool_id)
    VALUES
        (v_published, v_second),
        (v_published, v_draft);

    INSERT INTO public.affiliate_programs
        (tool_id, affiliate_network, notes)
    VALUES (v_published, 'RLS Test Network', 'Temporary test fixture');

    INSERT INTO public.import_batches
        (filename, source_name, source_type)
    VALUES ('rls-test.csv', 'RLS Test', 'csv');

    INSERT INTO pg_temp.rls_fixture_ids
    VALUES (v_published, v_second, v_draft, v_category, v_admin);
END;
$$;

-- ============================================================
-- 3. ANONYMOUS VISITOR TESTS
-- ============================================================

SET LOCAL ROLE anon;

SELECT set_config(
    'request.jwt.claims',
    '{"role":"anon"}',
    TRUE
);

SELECT set_config('request.jwt.claim.sub', '', TRUE);

DO $$
DECLARE
    v_count INTEGER;
    v_rows INTEGER;
BEGIN
    -- Test 1: Published tools are publicly readable
    SELECT COUNT(*) INTO v_count
    FROM public.tools
    WHERE id = (
        SELECT published_tool_id FROM pg_temp.rls_fixture_ids
    );

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        1, 'Anonymous can read published tools',
        CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
        'Visible published fixture count: ' || v_count
    );

    -- Test 2: Draft tools are hidden
    SELECT COUNT(*) INTO v_count
    FROM public.tools
    WHERE id = (
        SELECT draft_tool_id FROM pg_temp.rls_fixture_ids
    );

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        2, 'Anonymous cannot read draft tools',
        CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        'Visible draft fixture count: ' || v_count
    );

    -- Test 3: Categories are publicly readable
    SELECT COUNT(*) INTO v_count
    FROM public.categories
    WHERE id = (SELECT category_id FROM pg_temp.rls_fixture_ids);

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        3, 'Anonymous can read categories',
        CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
        'Visible category count: ' || v_count
    );

    -- Test 4: Affiliate data is not accessible
    BEGIN
        PERFORM COUNT(*) FROM public.affiliate_programs;

        INSERT INTO pg_temp.rls_test_results
        VALUES (4, 'Anonymous cannot read affiliate data',
                'FAIL', 'SELECT unexpectedly succeeded');
    EXCEPTION
        WHEN insufficient_privilege THEN
            INSERT INTO pg_temp.rls_test_results
            VALUES (4, 'Anonymous cannot read affiliate data',
                    'PASS', 'Access denied as expected');
    END;

    -- Test 5: Anonymous can submit a tool
    INSERT INTO public.submissions (
        tool_name, website_url, submitter_email, description
    )
    VALUES (
        'RLS Anonymous Submission',
        'https://submission-test.example',
        'rls-test@example.com',
        'Temporary security test submission'
    );

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        5, 'Anonymous can submit tools',
        CASE WHEN v_rows = 1 THEN 'PASS' ELSE 'FAIL' END,
        'Inserted rows: ' || v_rows
    );

    -- Test 6: Anonymous cannot read submissions
    BEGIN
        PERFORM COUNT(*) FROM public.submissions;

        INSERT INTO pg_temp.rls_test_results
        VALUES (6, 'Anonymous cannot read submissions',
                'FAIL', 'SELECT unexpectedly succeeded');
    EXCEPTION
        WHEN insufficient_privilege THEN
            INSERT INTO pg_temp.rls_test_results
            VALUES (6, 'Anonymous cannot read submissions',
                    'PASS', 'Read access denied as expected');
    END;

    -- Test 7: Alternatives require both tools to be published
    SELECT COUNT(*) INTO v_count
    FROM public.tool_alternatives
    WHERE tool_id = (
        SELECT published_tool_id FROM pg_temp.rls_fixture_ids
    );

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        7, 'Alternatives hide unpublished tools',
        CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
        'Visible alternative rows: ' || v_count
    );
END;
$$;

RESET ROLE;

-- ============================================================
-- 4. ORDINARY AUTHENTICATED USER TESTS
-- ============================================================

SET LOCAL ROLE authenticated;

SELECT set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
    TRUE
);

SELECT set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000001',
    TRUE
);

DO $$
DECLARE
    v_rows INTEGER;
    v_count INTEGER;
BEGIN
    -- Test 8: Ordinary user cannot update tools
    UPDATE public.tools
    SET name = 'Unauthorized Change'
    WHERE id = (
        SELECT published_tool_id FROM pg_temp.rls_fixture_ids
    );

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        8, 'Ordinary user cannot update tools',
        CASE WHEN v_rows = 0 THEN 'PASS' ELSE 'FAIL' END,
        'Affected rows: ' || v_rows
    );

    -- Test 9: Ordinary user cannot see draft tools
    SELECT COUNT(*) INTO v_count
    FROM public.tools
    WHERE id = (
        SELECT draft_tool_id FROM pg_temp.rls_fixture_ids
    );

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        9, 'Ordinary user cannot read draft tools',
        CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        'Visible draft count: ' || v_count
    );

    -- Test 10: Ordinary user cannot read audit logs
    SELECT COUNT(*) INTO v_count
    FROM public.audit_logs;

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        10, 'Ordinary user cannot read audit logs',
        CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        'Visible audit log count: ' || v_count
    );

    -- Test 11: Ordinary user cannot read admin accounts
    SELECT COUNT(*) INTO v_count
    FROM public.admin_users;

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        11, 'Ordinary user cannot read admin accounts',
        CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        'Visible admin account count: ' || v_count
    );
END;
$$;

RESET ROLE;

-- ============================================================
-- 5. SUPER ADMIN TESTS
-- ============================================================

SET LOCAL ROLE authenticated;

SELECT set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"853fd65e-ec06-450c-bb51-856a6fa90305"}',
    TRUE
);

SELECT set_config(
    'request.jwt.claim.sub',
    '853fd65e-ec06-450c-bb51-856a6fa90305',
    TRUE
);

DO $$
DECLARE
    v_count INTEGER;
    v_rows INTEGER;
BEGIN
    -- Test 12: Active super admin can read drafts
    SELECT COUNT(*) INTO v_count
    FROM public.tools
    WHERE id = (
        SELECT draft_tool_id FROM pg_temp.rls_fixture_ids
    );

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        12, 'Super admin can read draft tools',
        CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
        'Visible draft count: ' || v_count
    );

    -- Test 13: Active super admin can update tools
    UPDATE public.tools
    SET short_description = 'Updated by RLS test'
    WHERE id = (
        SELECT published_tool_id FROM pg_temp.rls_fixture_ids
    );

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        13, 'Super admin can update tools',
        CASE WHEN v_rows = 1 THEN 'PASS' ELSE 'FAIL' END,
        'Affected rows: ' || v_rows
    );

    -- Test 14: Active super admin can read affiliate data
    SELECT COUNT(*) INTO v_count
    FROM public.affiliate_programs
    WHERE tool_id = (
        SELECT published_tool_id FROM pg_temp.rls_fixture_ids
    );

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        14, 'Super admin can read affiliate data',
        CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
        'Visible affiliate rows: ' || v_count
    );

    -- Test 15: Super admin can read admin accounts
    SELECT COUNT(*) INTO v_count
    FROM public.admin_users
    WHERE id = (
        SELECT admin_user_id FROM pg_temp.rls_fixture_ids
    );

    INSERT INTO pg_temp.rls_test_results
    VALUES (
        15, 'Super admin can read admin accounts',
        CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
        'Visible own admin account count: ' || v_count
    );
END;
$$;

RESET ROLE;

-- ============================================================
-- 6. RESULTS
-- ============================================================

SELECT
    test_no,
    test_name,
    result,
    details
FROM pg_temp.rls_test_results
ORDER BY test_no;

SELECT
    COUNT(*) AS total_tests,
    COUNT(*) FILTER (WHERE result = 'PASS') AS passed,
    COUNT(*) FILTER (WHERE result = 'FAIL') AS failed
FROM pg_temp.rls_test_results;

-- Roll back all test fixtures and changes.
ROLLBACK;
