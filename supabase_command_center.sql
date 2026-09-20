-- Command Center Schema Migration

-- 1. Create Device Commands Table
CREATE TABLE IF NOT EXISTS public.device_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES public.user_devices(id) ON DELETE CASCADE NOT NULL,
    command_type TEXT NOT NULL CHECK (
        command_type IN (
            'restart', 'factory_reset', 'restart_mqtt', 'restart_wifi', 
            'sync_time', 'sync_config', 'relay_test', 'sensor_test', 
            'led_blink', 'enable_debug', 'disable_debug', 'enter_recovery'
        )
    ),
    payload JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'failed')),
    execution_time_ms INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    created_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update timestamp trigger for device_commands
CREATE OR REPLACE FUNCTION update_device_commands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_device_commands_updated_at ON public.device_commands;
CREATE TRIGGER tr_device_commands_updated_at
BEFORE UPDATE ON public.device_commands
FOR EACH ROW
EXECUTE FUNCTION update_device_commands_updated_at();

-- Enable RLS
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/manage commands for simplicity
CREATE POLICY "Authenticated users can manage device_commands" 
ON public.device_commands FOR ALL 
TO authenticated USING (true) WITH CHECK (true);
