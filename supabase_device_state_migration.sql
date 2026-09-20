-- Add status, water_level, error_state to user_devices table
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS water_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_state TEXT;
