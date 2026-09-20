-- ==============================================================================
-- CANONICAL CLEANUP MIGRATION
-- This script cleans up obsolete tables, duplicate triggers, and conflicting RLS policies.
-- WARNING: DESTRUCTIVE OPERATIONS INCLUDED
-- ==============================================================================

-- 1. DESTRUCTIVE: Drop obsolete tables
DROP TABLE IF EXISTS public.devices CASCADE;
DROP TABLE IF EXISTS public.firmware_releases CASCADE;

-- Note: We do not drop public.user_roles here because make_admin.sql already 
-- migrated it to the new UUID architecture. If you still had the old (admin/user)
-- string architecture, you would need to drop and recreate it.

-- 2. CLEANUP: Drop conflicting handle_new_user triggers from earlier architectures
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- make_admin.sql contains the canonical handle_new_user function which we assume is already loaded

-- 3. CLEANUP: Fix Telemetry Policies (Point to user_devices instead of devices)
DROP POLICY IF EXISTS "Users can view telemetry for their devices" ON public.telemetry;
CREATE POLICY "Users can view telemetry for their devices" ON public.telemetry
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.user_devices ud 
            WHERE ud.id = telemetry.device_id 
            AND ud.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert telemetry for their devices" ON public.telemetry;
CREATE POLICY "Users can insert telemetry for their devices" ON public.telemetry
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_devices ud
            WHERE ud.id = device_id 
            AND ud.owner_id = auth.uid()
        )
    );

-- 4. CLEANUP: Drop overly permissive / redundant RLS policies from obsolete supabase_rls_policies.sql
-- We rely on the policies defined directly in make_admin.sql, supabase_schema.sql, and supabase_admin_rls.sql
DROP POLICY IF EXISTS "Users can view their own user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can insert their own user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can update their own user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can delete their own user_devices" ON public.user_devices;

-- Make sure the canonical user_devices policy exists:
DROP POLICY IF EXISTS "Users can manage their own devices or Admins all" ON public.user_devices;
CREATE POLICY "Users can manage their own devices or Admins all" ON public.user_devices
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

-- 5. CLEANUP: Remove duplicate category/type read policies
DROP POLICY IF EXISTS "Allow read access to categories" ON public.device_categories;
DROP POLICY IF EXISTS "Allow read access to device types" ON public.device_types;

-- The canonical policies from supabase_schema.sql remain:
-- "Allow authenticated read on categories"
-- "Allow authenticated read on device types"

-- ==============================================================================
-- DONE! The database is now aligned to the Canonical Architecture.
-- ==============================================================================
