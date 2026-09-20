-- ==========================================
-- COMPLETE SYSTEM INITIALIZATION SCRIPT (V2 - Granular Permissions)
-- ==========================================

-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);


-- 2. Create Dynamic Roles Table with Granular Permissions
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    access_level TEXT CHECK (access_level IN ('admin_panel', 'web_dashboard')) NOT NULL,
    description TEXT,
    
    -- Granular Module Permissions
    manage_categories BOOLEAN DEFAULT false,
    manage_device_types BOOLEAN DEFAULT false,
    manage_inventory BOOLEAN DEFAULT false,
    manage_mqtt BOOLEAN DEFAULT false,
    manage_users BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- If the table already existed from before, add the new columns
DO $$
BEGIN
    ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS manage_categories BOOLEAN DEFAULT false;
    ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS manage_device_types BOOLEAN DEFAULT false;
    ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS manage_inventory BOOLEAN DEFAULT false;
    ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS manage_mqtt BOOLEAN DEFAULT false;
    ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS manage_users BOOLEAN DEFAULT false;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;


-- 3. Drop old tables/views if they exist
DROP VIEW IF EXISTS public.admin_user_roles CASCADE;


-- 4. Create new user_roles mapping table
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;


-- 5. Insert Default Roles
INSERT INTO public.roles (name, access_level, description, manage_categories, manage_device_types, manage_inventory, manage_mqtt, manage_users) VALUES 
('Super Admin', 'admin_panel', 'Full access to the admin dashboard and system settings.', true, true, true, true, true),
('Customer', 'web_dashboard', 'Standard access to the web dashboard and user devices.', false, false, false, false, false)
ON CONFLICT (name) DO UPDATE SET 
  manage_categories = EXCLUDED.manage_categories,
  manage_device_types = EXCLUDED.manage_device_types,
  manage_inventory = EXCLUDED.manage_inventory,
  manage_mqtt = EXCLUDED.manage_mqtt,
  manage_users = EXCLUDED.manage_users
  WHERE public.roles.name = 'Super Admin';


-- 6. Trigger to automatically handle new signups
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  default_role_id UUID;
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (new.id, new.email);
  SELECT id INTO default_role_id FROM public.roles WHERE name = 'Customer' LIMIT 1;
  IF default_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id) VALUES (new.id, default_role_id);
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 7. Backfill any existing users who don't have profiles or roles
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  customer_role_id UUID;
BEGIN
  SELECT id INTO customer_role_id FROM public.roles WHERE name = 'Customer' LIMIT 1;
  IF customer_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT id, customer_role_id FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;


-- 8. MAKE arijit1roy@gmail.com A SUPER ADMIN
DO $$
DECLARE
  admin_user_id UUID;
  super_admin_role_id UUID;
BEGIN
  SELECT id INTO admin_user_id FROM public.profiles WHERE email = 'arijit1roy@gmail.com' LIMIT 1;
  SELECT id INTO super_admin_role_id FROM public.roles WHERE name = 'Super Admin' LIMIT 1;
  
  IF admin_user_id IS NOT NULL AND super_admin_role_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = admin_user_id;
    INSERT INTO public.user_roles (user_id, role_id) VALUES (admin_user_id, super_admin_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;
END $$;


-- 9. Create Helper Functions (for Row Level Security)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid() AND r.access_level = 'admin_panel'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_permission(perm_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  has_perm BOOLEAN;
BEGIN
  -- Dynamically check if the specific permission column is true for the user's role
  EXECUTE format(
    'SELECT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND r.%I = true
     )', perm_name
  ) INTO has_perm USING auth.uid();
  RETURN has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 10. Create view for the frontend to read roles and permissions easily
CREATE OR REPLACE VIEW public.admin_user_roles WITH (security_invoker = true) AS
SELECT 
    p.id as user_id, 
    p.email,
    r.id as role_id,
    r.name as role_name,
    r.access_level,
    r.manage_categories,
    r.manage_device_types,
    r.manage_inventory,
    r.manage_mqtt,
    r.manage_users
FROM public.profiles p
LEFT JOIN public.user_roles ur ON p.id = ur.user_id
LEFT JOIN public.roles r ON ur.role_id = r.id;

GRANT SELECT ON public.admin_user_roles TO authenticated;
GRANT SELECT ON public.admin_user_roles TO anon;


-- ==========================================
-- STRICT SECURITY POLICIES
-- ==========================================

-- Roles & User Roles Protection
DROP POLICY IF EXISTS "Allow authenticated read on roles" ON public.roles;
CREATE POLICY "Allow authenticated read on roles" ON public.roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert roles" ON public.roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.roles;
CREATE POLICY "Admins can insert roles" ON public.roles FOR INSERT TO authenticated WITH CHECK (public.has_permission('manage_users'));
CREATE POLICY "Admins can update roles" ON public.roles FOR UPDATE TO authenticated USING (public.has_permission('manage_users')) WITH CHECK (public.has_permission('manage_users'));
CREATE POLICY "Admins can delete roles" ON public.roles FOR DELETE TO authenticated USING (public.has_permission('manage_users'));

DROP POLICY IF EXISTS "Allow authenticated read on user_roles" ON public.user_roles;
CREATE POLICY "Allow authenticated read on user_roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user_roles" ON public.user_roles;
CREATE POLICY "Admins can insert user_roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_permission('manage_users'));
CREATE POLICY "Admins can update user_roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_permission('manage_users')) WITH CHECK (public.has_permission('manage_users'));
CREATE POLICY "Admins can delete user_roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_permission('manage_users'));

-- Categories Protection
DROP POLICY IF EXISTS "Allow authenticated insert on categories" ON public.device_categories;
DROP POLICY IF EXISTS "Allow authenticated update on categories" ON public.device_categories;
DROP POLICY IF EXISTS "Allow authenticated delete on categories" ON public.device_categories;
DROP POLICY IF EXISTS "Admins can insert categories" ON public.device_categories;
DROP POLICY IF EXISTS "Admins can update categories" ON public.device_categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON public.device_categories;

CREATE POLICY "Admins can insert categories" ON public.device_categories FOR INSERT TO authenticated WITH CHECK (public.has_permission('manage_categories'));
CREATE POLICY "Admins can update categories" ON public.device_categories FOR UPDATE TO authenticated USING (public.has_permission('manage_categories')) WITH CHECK (public.has_permission('manage_categories'));
CREATE POLICY "Admins can delete categories" ON public.device_categories FOR DELETE TO authenticated USING (public.has_permission('manage_categories'));

-- Device Types Protection
DROP POLICY IF EXISTS "Allow authenticated insert on device types" ON public.device_types;
DROP POLICY IF EXISTS "Allow authenticated update on device types" ON public.device_types;
DROP POLICY IF EXISTS "Allow authenticated delete on device types" ON public.device_types;
DROP POLICY IF EXISTS "Admins can insert device types" ON public.device_types;
DROP POLICY IF EXISTS "Admins can update device types" ON public.device_types;
DROP POLICY IF EXISTS "Admins can delete device types" ON public.device_types;

CREATE POLICY "Admins can insert device types" ON public.device_types FOR INSERT TO authenticated WITH CHECK (public.has_permission('manage_device_types'));
CREATE POLICY "Admins can update device types" ON public.device_types FOR UPDATE TO authenticated USING (public.has_permission('manage_device_types')) WITH CHECK (public.has_permission('manage_device_types'));
CREATE POLICY "Admins can delete device types" ON public.device_types FOR DELETE TO authenticated USING (public.has_permission('manage_device_types'));
