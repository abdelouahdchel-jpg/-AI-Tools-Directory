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
--    - Set your real, secure password.
--
-- 2. Obtain your Authenticated User UUID:
--    - In Authentication -> Users, find your newly created user row.
--    - Copy the value in the "User UID" column (e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890").
--
-- 3. Run this script in the Supabase SQL Editor:
--    - Replace 'PASTE_YOUR_AUTH_USER_UUID_HERE' with your real User UID.
--    - Replace 'owner@yourdomain.com' with your registered email.
--    - Replace 'Primary Administrator' with your real name.
--    - Execute the script.
--
-- SECURITY NOTES:
-- - This script should ONLY be executed directly by the database owner.
-- - It cannot be executed by public or anonymous API clients.
-- - The `admin_users.id` foreign key enforces that the user must already
--   exist in `auth.users`.
-- ====================================================================

DO $$
DECLARE
    target_user_id UUID := 'PASTE_YOUR_AUTH_USER_UUID_HERE'::UUID;
    target_email VARCHAR(255) := 'owner@yourdomain.com';
    target_name VARCHAR(120) := 'Primary Administrator';
BEGIN
    -- Verify placeholder was replaced
    IF target_user_id = '00000000-0000-0000-0000-000000000000'::UUID OR target_user_id IS NULL THEN
        RAISE EXCEPTION 'Safety check failed: You must provide a valid UUID from Supabase Authentication -> Users.';
    END IF;

    -- Verify user exists in auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'User UID % was not found in auth.users. Please create the user account in Authentication -> Users first.', target_user_id;
    END IF;

    -- Insert or update the super administrator record safely
    INSERT INTO public.admin_users (
        id,
        email,
        full_name,
        role,
        is_active,
        created_at
    )
    VALUES (
        target_user_id,
        target_email,
        target_name,
        'super_admin',
        TRUE,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'super_admin',
        is_active = TRUE,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;

    -- Record initial audit log
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
        target_user_id,
        target_email,
        'bootstrap_super_admin',
        'admin_users',
        target_user_id::TEXT,
        jsonb_build_object('role', 'super_admin', 'initialized_via', 'supabase_sql_editor'),
        NOW()
    );

    RAISE NOTICE 'Successfully provisioned super_admin: % (%)', target_email, target_user_id;
END $$;
