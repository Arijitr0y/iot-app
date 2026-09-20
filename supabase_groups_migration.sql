-- 1. Add Geographical and Organizational columns to user_devices
ALTER TABLE public.user_devices 
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS village TEXT,
  ADD COLUMN IF NOT EXISTS project TEXT,
  ADD COLUMN IF NOT EXISTS custom_tags TEXT[] DEFAULT '{}';

-- 2. Create Device Groups Table
CREATE TABLE IF NOT EXISTS public.device_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.device_groups ENABLE ROW LEVEL SECURITY;

-- Allow Admins to manage device groups
CREATE POLICY "Admins can manage device groups" 
ON public.device_groups 
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
