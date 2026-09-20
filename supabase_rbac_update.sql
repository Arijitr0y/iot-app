-- Run this in your Supabase SQL Editor to enforce strict RBAC for the admin panel

-- 1. Restrict categories modification to admins only
DROP POLICY IF EXISTS "Allow authenticated insert on categories" ON public.device_categories;
DROP POLICY IF EXISTS "Allow authenticated update on categories" ON public.device_categories;
DROP POLICY IF EXISTS "Allow authenticated delete on categories" ON public.device_categories;

CREATE POLICY "Admins can insert categories" ON public.device_categories
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update categories" ON public.device_categories
    FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete categories" ON public.device_categories
    FOR DELETE TO authenticated USING (public.is_admin());


-- 2. Restrict device types modification to admins only
DROP POLICY IF EXISTS "Allow authenticated insert on device types" ON public.device_types;
DROP POLICY IF EXISTS "Allow authenticated update on device types" ON public.device_types;
DROP POLICY IF EXISTS "Allow authenticated delete on device types" ON public.device_types;

CREATE POLICY "Admins can insert device types" ON public.device_types
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update device types" ON public.device_types
    FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete device types" ON public.device_types
    FOR DELETE TO authenticated USING (public.is_admin());


-- 3. Allow admins to manage roles
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

CREATE POLICY "Admins can update roles" ON public.user_roles
    FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


-- 4. Create a security invoker view for the admin dashboard to easily fetch profiles and their roles
CREATE OR REPLACE VIEW public.admin_user_roles WITH (security_invoker = true) AS
SELECT 
    p.id as user_id, 
    p.email, 
    COALESCE(r.role, 'user') as role
FROM public.profiles p
LEFT JOIN public.user_roles r ON p.id = r.user_id;

-- Grant access to the view
GRANT SELECT ON public.admin_user_roles TO authenticated;
GRANT SELECT ON public.admin_user_roles TO anon;
