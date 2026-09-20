-- Secure MQTT Configuration Migration
-- Enhances RLS for mqtt_users and mqtt_acls to strictly require admin privileges

-- 1. Secure mqtt_users
DROP POLICY IF EXISTS "Allow authenticated read/write on mqtt_users" ON public.mqtt_users;

CREATE POLICY "Admins can view mqtt_users"
ON public.mqtt_users FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert mqtt_users"
ON public.mqtt_users FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update mqtt_users"
ON public.mqtt_users FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete mqtt_users"
ON public.mqtt_users FOR DELETE TO authenticated
USING (public.is_admin());

-- 2. Secure mqtt_acls
DROP POLICY IF EXISTS "Allow authenticated read/write on mqtt_acls" ON public.mqtt_acls;

CREATE POLICY "Admins can view mqtt_acls"
ON public.mqtt_acls FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert mqtt_acls"
ON public.mqtt_acls FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update mqtt_acls"
ON public.mqtt_acls FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete mqtt_acls"
ON public.mqtt_acls FOR DELETE TO authenticated
USING (public.is_admin());
