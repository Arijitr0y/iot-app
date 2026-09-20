-- OTA Rollout Engine Schema Migration

-- 1. Create Rollouts Table
CREATE TABLE IF NOT EXISTS public.ota_rollouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    firmware_id UUID REFERENCES public.firmwares(id) ON DELETE RESTRICT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('single_device', 'group', 'customer', 'product')),
    target_id UUID NOT NULL, -- The ID corresponding to the target_type (user_devices.id, device_groups.id, auth.users.id, device_types.id)
    percentage INTEGER NOT NULL DEFAULT 100 CHECK (percentage >= 1 AND percentage <= 100),
    schedule_type TEXT NOT NULL DEFAULT 'immediate' CHECK (schedule_type IN ('immediate', 'delayed', 'night_only')),
    schedule_time TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'paused', 'stopped', 'completed', 'rolled_back')),
    max_retries INTEGER NOT NULL DEFAULT 3,
    failure_threshold_percent INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update timestamp trigger for ota_rollouts
CREATE OR REPLACE FUNCTION update_ota_rollouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ota_rollouts_updated_at ON public.ota_rollouts;
CREATE TRIGGER tr_ota_rollouts_updated_at
BEFORE UPDATE ON public.ota_rollouts
FOR EACH ROW
EXECUTE FUNCTION update_ota_rollouts_updated_at();


-- 2. Create Rollout Devices (Jobs) Table
CREATE TABLE IF NOT EXISTS public.ota_rollout_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rollout_id UUID REFERENCES public.ota_rollouts(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES public.user_devices(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'rolled_back')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    download_started_at TIMESTAMP WITH TIME ZONE,
    install_completed_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(rollout_id, device_id)
);

-- Update timestamp trigger for ota_rollout_devices
CREATE OR REPLACE FUNCTION update_ota_rollout_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ota_rollout_devices_updated_at ON public.ota_rollout_devices;
CREATE TRIGGER tr_ota_rollout_devices_updated_at
BEFORE UPDATE ON public.ota_rollout_devices
FOR EACH ROW
EXECUTE FUNCTION update_ota_rollout_devices_updated_at();

-- Enable RLS
ALTER TABLE public.ota_rollouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_rollout_devices ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/manage rollouts for simplicity 
-- (Restrict to admins via roles for production)
CREATE POLICY "Authenticated users can manage ota_rollouts" 
ON public.ota_rollouts FOR ALL 
TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage ota_rollout_devices" 
ON public.ota_rollout_devices FOR ALL 
TO authenticated USING (true) WITH CHECK (true);
