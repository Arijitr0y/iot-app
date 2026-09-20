-- Run this script in the Supabase SQL Editor

-- 1. Create Device Categories Table
CREATE TABLE IF NOT EXISTS public.device_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Device Types Table
CREATE TABLE IF NOT EXISTS public.device_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES public.device_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT NOT NULL,
    setup_wifi_prefix TEXT DEFAULT 'IoT-Setup-',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create User Devices Table
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_type_id UUID REFERENCES public.device_types(id) ON DELETE RESTRICT NOT NULL,
    name TEXT NOT NULL,
    firmware TEXT,
    mac_address TEXT UNIQUE,
    room TEXT DEFAULT 'Unassigned',
    relay_state BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.device_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Create Policies

-- device_categories: anyone can read, only super admins can write (handled via app or you can strict it here. For simplicity, we allow reads for all authenticated users)
DROP POLICY IF EXISTS "Allow authenticated read on categories" ON public.device_categories;
CREATE POLICY "Allow authenticated read on categories" ON public.device_categories
    FOR SELECT TO authenticated USING (true);

-- device_types: anyone can read
DROP POLICY IF EXISTS "Allow authenticated read on device types" ON public.device_types;
CREATE POLICY "Allow authenticated read on device types" ON public.device_types
    FOR SELECT TO authenticated USING (true);

-- user_devices: users can only see and manage their own devices
DROP POLICY IF EXISTS "Users can manage their own devices" ON public.user_devices;
CREATE POLICY "Users can manage their own devices" ON public.user_devices
    FOR ALL TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Note: We are allowing all CRUD operations for categories/types via the Supabase Service Key in the backend or bypassing RLS for admins. 
-- For a pure client-side app, you might want a policy like:
-- CREATE POLICY "Admin all categories" ON public.device_categories FOR ALL TO authenticated USING (auth.jwt() ->> 'email' = 'your-admin@email.com');
