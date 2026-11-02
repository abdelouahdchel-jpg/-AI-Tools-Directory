-- ====================================================================
-- AI TOOLS DIRECTORY — INITIAL SUPER ADMINISTRATOR BOOTSTRAP
-- File: supabase/bootstrap_super_admin.sql
-- ====================================================================
--
-- INSTRUCTIONS FOR THE PROJECT OWNER:
--
-- 1. Sign up your personal administrator account in Supabase:
--    - Go to your Supabase Dashboard: https://supabase.com/dashboard/project/_/auth/users
--    - Navigate to Authentication -> Users.
--    - Click "Add User" -> "Create User" (or invite yourself via email).
--    - Set your real, secure password and confirm your email.
--
-- 2. Obtain your Authenticated User UUID:
--    - In Authentication -> Users, find your newly created user row.
--    - Copy the value in the "User UID" column (e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890").
--
-- 3. Run this script in the Supabase SQL Editor:
--    - Replace 'PASTE_YOUR_AUTH_USER_UUID_HERE' with your real User UID string.
--    - Replace 'owner@yourdomain.com' with your registered user email.
--    - Replace 'Primary Administrator' with your real name.
--    - Click "Run" in the SQL Editor.
--
-- SECURITY NOTES:
-- - This script is meant strictly for manual execution by the database owner.
-- - Input variables are declared as TEXT to ensure clear, descriptive error
--   messages if placeholders are accidentally submitted without replacement.
-- - Foreign key constraints ensure the user must already exist in `auth.users`.
-- ====================================================================

DO $$
DECLARE
    -- INPUT VARIABLES (Owner must update these values before running):
    raw_user_id     TEXT := 'PASTE_YOUR_AUTH_USER_UUID_HERE';
    raw_email       TEXT := 'owner@yourdomain.com';
    raw_name        TEXT := 'Primary Administrator';

    -- PARSED / VALIDATED VARIABLES:
    v_user_id       UUID;
    v_auth_email    VARCHAR(255);
    v_clean_email   VARCHAR(255);
    v_clean_name    VARCHAR(120);
BEGIN
    -- 1. Validate UUID placeholder is replaced and not empty
    IF raw_user_id IS NULL OR TRIM(raw_user_id) = '' OR TRIM(raw_user_id) = 'PASTE_YOUR_AUTH_USER_UUID_HERE' THEN
        RAISE EXCEPTION 'Safety check failed: You must replace "PASTE_YOUR_AUTH_USER_UUID_HERE" with your actual user UUID from Supabase Authentication -> Users.';
    END IF;

    -- 2. Validate UUID format
    BEGIN
        v_user_id := TRIM(raw_user_id)::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Format error: "%" is not a valid UUID string. Please copy the exact UID from Supabase Authentication -> Users.', raw_user_id;
    END;

    IF v_user_id = '00000000-0000-0000-0000-000000000000'::UUID THEN
        RAISE EXCEPTION 'Safety check failed: All-zero UUID is not an acceptable administrator ID.';
    END IF;

    -- 3. Validate Email placeholder
    v_clean_email := LOWER(TRIM(COALESCE(raw_email, '')));
    IF v_clean_email = '' OR v_clean_email = 'owner@yourdomain.com' OR v_clean_email NOT LIKE '%@%.%' THEN
        RAISE EXCEPTION 'Safety check failed: You must replace "owner@yourdomain.com" with the real email address registered in Supabase Authentication.';
    END IF;

    v_clean_name := TRIM(COALESCE(raw_name, 'Primary Administrator'));

    -- 4. Verify user exists in auth.users and fetch registered email
    SELECT email INTO v_auth_email
    FROM auth.users
    WHERE id = v_user_id;

    IF v_auth_email IS NULL THEN
        RAISE EXCEPTION 'Verification error: No user with UID "%" was found in auth.users. Please create or invite the user account in Supabase Authentication -> Users first.', v_user_id;
    END IF;

    -- 5. Cross-check email match between input and auth.users record
    IF LOWER(TRIM(v_auth_email)) <> v_clean_email THEN
        RAISE EXCEPTION 'Email mismatch: The provided email "%" does not match the email registered in auth.users ("%"). Verification aborted.', v_clean_email, v_auth_email;
    END IF;

    -- 6. Upsert the initial super_admin into public.admin_users
    INSERT INTO public.admin_users (
        id,
        email,
        full_name,
        role,
        is_active,
        created_at
    )
    VALUES (
        v_user_id,
        v_clean_email,
        v_clean_name,
        'super_admin',
        TRUE,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'super_admin',
        is_active = TRUE,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;

    -- 7. Record an immutable audit log entry
    INSERT INTO public.audit_logs (
        administrator_id,
        administrator_email,
        action,
        entity_type,
        entity_id,
        metadata,
        timestamp
    )
    VALUES (
        v_user_id,
        v_clean_email,
        'bootstrap_super_admin',
        'admin_users',
        v_user_id::TEXT,
        jsonb_build_object(
            'role', 'super_admin',
            'action_type', 'initial_bootstrap',
            'client_executor', 'supabase_sql_editor',
            'bootstrap_at', NOW()
        ),
        NOW()
    );

    RAISE NOTICE 'SUCCESS: Initial super_admin successfully provisioned: % (UID: %)', v_clean_email, v_user_id;
END $$;
