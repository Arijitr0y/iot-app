-- 1. Create Device Schedules Table
CREATE TABLE IF NOT EXISTS public.device_schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES public.user_devices(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('on', 'off')),
    time TEXT NOT NULL, -- Format: HH:MM
    days TEXT[] NOT NULL, -- Array of days, e.g. ['Mon', 'Tue']
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.device_schedules ENABLE ROW LEVEL SECURITY;

-- 2. Create Policy for Schedules
-- Users can only see and manage schedules for their own devices
DROP POLICY IF EXISTS "Users can manage schedules of their devices" ON public.device_schedules;
CREATE POLICY "Users can manage schedules of their devices" ON public.device_schedules
    FOR ALL TO authenticated
    USING (
        device_id IN (
            SELECT id FROM public.user_devices WHERE owner_id = auth.uid()
        )
    )
    WITH CHECK (
        device_id IN (
            SELECT id FROM public.user_devices WHERE owner_id = auth.uid()
        )
    );
