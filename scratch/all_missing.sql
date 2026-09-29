-- Migration: Canonical Device Architecture (Domain Foundation)
-- Purpose: Adds the tenant, product, device model, and specific device tracking tables
--          while preserving the legacy user_devices implementation.

-- 1. Create Status Enums
CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE product_status AS ENUM ('development', 'active', 'deprecated', 'end_of_life');
CREATE TYPE device_model_status AS ENUM ('prototype', 'active', 'deprecated', 'end_of_life');
CREATE TYPE device_status AS ENUM ('provisioning', 'registered', 'active', 'disabled', 'decommissioned');

-- 2. Create handle_updated_at Function (if not exists)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. Tenants Table
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    status tenant_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE TRIGGER tr_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. Products Table
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    status product_status NOT NULL DEFAULT 'development',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_products_tenant_id ON public.products(tenant_id);
CREATE TRIGGER tr_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. Device Models Table
CREATE TABLE public.device_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    model_code TEXT NOT NULL,
    description TEXT,
    hardware_revision TEXT,
    firmware_family TEXT,
    status device_model_status NOT NULL DEFAULT 'prototype',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(product_id, model_code)
);

CREATE INDEX idx_device_models_product_id ON public.device_models(product_id);
CREATE TRIGGER tr_device_models_updated_at BEFORE UPDATE ON public.device_models FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. Devices Table
CREATE TABLE public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_uid TEXT UNIQUE NOT NULL,
    device_model_id UUID NOT NULL REFERENCES public.device_models(id) ON DELETE RESTRICT,
    serial_number TEXT UNIQUE,
    mac_address TEXT UNIQUE,
    hardware_id TEXT,
    status device_status NOT NULL DEFAULT 'provisioning',
    firmware_version TEXT,
    first_seen_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_device_uid ON public.devices(device_uid);
CREATE INDEX idx_devices_serial_number ON public.devices(serial_number);
CREATE INDEX idx_devices_mac_address ON public.devices(mac_address);
CREATE INDEX idx_devices_device_model_id ON public.devices(device_model_id);
CREATE INDEX idx_devices_status ON public.devices(status);
CREATE TRIGGER tr_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7. Device Assignments Table
CREATE TABLE public.device_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE active assignment per device constraint
CREATE UNIQUE INDEX idx_unique_active_assignment 
ON public.device_assignments(device_id) 
WHERE unassigned_at IS NULL;

CREATE INDEX idx_device_assignments_device_id ON public.device_assignments(device_id);
CREATE INDEX idx_device_assignments_user_id ON public.device_assignments(user_id);

-- 8. Legacy Device Map
CREATE TABLE public.legacy_device_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_user_device_id UUID UNIQUE NOT NULL REFERENCES public.user_devices(id) ON DELETE CASCADE,
    device_id UUID UNIQUE NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add schema compatibility comments
COMMENT ON TABLE public.user_devices IS 'Legacy compatibility layer. Do not modify schema until final migration.';
COMMENT ON TABLE public.legacy_device_map IS 'Mapping table bridging legacy user_devices to canonical device architecture. Used for progressive migration.';

-- 9. Row Level Security (RLS)

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_device_map ENABLE ROW LEVEL SECURITY;

-- Admins can manage everything
CREATE POLICY "Admins can manage tenants" ON public.tenants FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can manage products" ON public.products FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can manage device models" ON public.device_models FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can manage devices" ON public.devices FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can manage device assignments" ON public.device_assignments FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can manage legacy map" ON public.legacy_device_map FOR ALL TO authenticated USING (public.is_admin());

-- Ordinary users can only see devices assigned to them
CREATE POLICY "Users can view devices assigned to them" ON public.devices FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.device_assignments 
        WHERE device_assignments.device_id = devices.id 
        AND device_assignments.user_id = auth.uid() 
        AND device_assignments.unassigned_at IS NULL
    )
);

CREATE POLICY "Users can view their assignments" ON public.device_assignments FOR SELECT TO authenticated USING (
    user_id = auth.uid()
);

-- Note: No permissive public policies are provided. Ordinary users can only read their devices and assignments.


-- 1. Create MQTT Users Table
CREATE TABLE IF NOT EXISTS public.mqtt_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create MQTT ACLs Table
CREATE TABLE IF NOT EXISTS public.mqtt_acls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.mqtt_users(id) ON DELETE CASCADE,
    topic_pattern TEXT NOT NULL,
    access_level TEXT CHECK (access_level IN ('read', 'write', 'readwrite')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.mqtt_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mqtt_acls ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Admins only)
-- For this prototype, we'll allow all authenticated users to view/edit ACLs so the admin dashboard works smoothly.
-- In production, you would restrict this to users with a specific admin role.
DROP POLICY IF EXISTS "Allow authenticated read/write on mqtt_users" ON public.mqtt_users;
CREATE POLICY "Allow authenticated read/write on mqtt_users" ON public.mqtt_users
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read/write on mqtt_acls" ON public.mqtt_acls;
CREATE POLICY "Allow authenticated read/write on mqtt_acls" ON public.mqtt_acls
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Insert initial seed data (The default service accounts)
INSERT INTO public.mqtt_users (username, description)
VALUES 
    ('esp8266_node', 'Hardware devices'),
    ('web_client', 'React Web Frontend'),
    ('ingestion_worker', 'Backend Node.js Service')
ON CONFLICT (username) DO NOTHING;

-- Map the initial ACLs to the seeded users
DO $$ 
DECLARE
    esp_id UUID;
    web_id UUID;
    worker_id UUID;
BEGIN
    SELECT id INTO esp_id FROM public.mqtt_users WHERE username = 'esp8266_node';
    SELECT id INTO web_id FROM public.mqtt_users WHERE username = 'web_client';
    SELECT id INTO worker_id FROM public.mqtt_users WHERE username = 'ingestion_worker';

    -- ESP8266 node permissions
    IF esp_id IS NOT NULL THEN
        INSERT INTO public.mqtt_acls (user_id, topic_pattern, access_level) VALUES 
            (esp_id, 'iot/devices/+/state', 'write'),
            (esp_id, 'iot/devices/+/command', 'read')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Web client permissions
    IF web_id IS NOT NULL THEN
        INSERT INTO public.mqtt_acls (user_id, topic_pattern, access_level) VALUES 
            (web_id, 'iot/devices/+/state', 'read'),
            (web_id, 'iot/devices/+/command', 'write')
        ON CONFLICT DO NOTHING;
    END IF;
    
    -- Ingestion worker permissions
    IF worker_id IS NOT NULL THEN
        INSERT INTO public.mqtt_acls (user_id, topic_pattern, access_level) VALUES 
            (worker_id, 'iot/devices/#', 'readwrite')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;


-- 1. Create a function to clean up MQTT credentials when a device is deleted
CREATE OR REPLACE FUNCTION public.cleanup_device_mqtt_credentials()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.mqtt_users WHERE username = OLD.mac_address;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach the trigger to user_devices
DROP TRIGGER IF EXISTS trg_cleanup_device_mqtt_credentials ON public.user_devices;
CREATE TRIGGER trg_cleanup_device_mqtt_credentials
AFTER DELETE ON public.user_devices
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_device_mqtt_credentials();


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
