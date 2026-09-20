-- Dynamic UI Settings Migration

-- Add ui_component to device_types
ALTER TABLE public.device_types 
ADD COLUMN IF NOT EXISTS ui_component TEXT DEFAULT 'default';
