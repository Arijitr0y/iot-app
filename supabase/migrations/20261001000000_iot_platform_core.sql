-- ==========================================
-- IOT PLATFORM CORE MIGRATION
-- ==========================================

-- PHASE 1: Multi-Tenant Data Model
CREATE TYPE tenant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE product_status AS ENUM ('DEVELOPMENT', 'ACTIVE', 'DEPRECATED', 'END_OF_LIFE');
CREATE TYPE device_model_status AS ENUM ('PROTOTYPE', 'ACTIVE', 'DEPRECATED', 'END_OF_LIFE');
CREATE TYPE device_status AS ENUM ('PROVISIONING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REVOKED', 'RETIRED');

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    status tenant_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
DROP TRIGGER IF EXISTS tr_tenants_updated_at ON public.tenants;
CREATE TRIGGER tr_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'TENANT_VIEWER' CHECK (role IN ('PLATFORM_ADMIN', 'TENANT_ADMIN', 'TENANT_OPERATOR', 'TENANT_VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    status product_status NOT NULL DEFAULT 'DEVELOPMENT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON public.products(tenant_id);
DROP TRIGGER IF EXISTS tr_products_updated_at ON public.products;
CREATE TRIGGER tr_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.device_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    model_code TEXT NOT NULL,
    description TEXT,
    hardware_revision TEXT,
    firmware_family TEXT,
    status device_model_status NOT NULL DEFAULT 'PROTOTYPE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(product_id, model_code)
);

CREATE INDEX IF NOT EXISTS idx_device_models_product_id ON public.device_models(product_id);
DROP TRIGGER IF EXISTS tr_device_models_updated_at ON public.device_models;
CREATE TRIGGER tr_device_models_updated_at BEFORE UPDATE ON public.device_models FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_uid TEXT UNIQUE NOT NULL,
    device_model_id UUID NOT NULL REFERENCES public.device_models(id) ON DELETE RESTRICT,
    serial_number TEXT UNIQUE,
    mac_address TEXT UNIQUE,
    hardware_id TEXT,
    status device_status NOT NULL DEFAULT 'PROVISIONING',
    firmware_version TEXT,
    first_seen_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_device_uid ON public.devices(device_uid);
CREATE INDEX IF NOT EXISTS idx_devices_serial_number ON public.devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_mac_address ON public.devices(mac_address);
CREATE INDEX IF NOT EXISTS idx_devices_device_model_id ON public.devices(device_model_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
DROP TRIGGER IF EXISTS tr_devices_updated_at ON public.devices;
CREATE TRIGGER tr_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.device_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_assignment 
ON public.device_assignments(device_id) 
WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_assignments_device_id ON public.device_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_device_assignments_user_id ON public.device_assignments(user_id);

CREATE TABLE IF NOT EXISTS public.legacy_device_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_user_device_id UUID UNIQUE NOT NULL REFERENCES public.user_devices(id) ON DELETE CASCADE,
    device_id UUID UNIQUE NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PHASE 3: Database-backed Provisioning Claims
CREATE TABLE IF NOT EXISTS public.device_provisioning_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_token_hash TEXT NOT NULL,
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
    mac_address TEXT NOT NULL,
    requested_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PHASE 5: MQTT Credentials
CREATE TABLE IF NOT EXISTS public.mqtt_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mqtt_acls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.mqtt_users(id) ON DELETE CASCADE,
    topic_pattern TEXT NOT NULL,
    access_level TEXT CHECK (access_level IN ('read', 'write', 'readwrite')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.mqtt_users (username, description)
VALUES 
    ('esp8266_node', 'Hardware devices'),
    ('web_client', 'React Web Frontend'),
    ('ingestion_worker', 'Backend Node.js Service')
ON CONFLICT (username) DO NOTHING;

DO $$ 
DECLARE
    esp_id UUID;
    web_id UUID;
    worker_id UUID;
BEGIN
    SELECT id INTO esp_id FROM public.mqtt_users WHERE username = 'esp8266_node';
    SELECT id INTO web_id FROM public.mqtt_users WHERE username = 'web_client';
    SELECT id INTO worker_id FROM public.mqtt_users WHERE username = 'ingestion_worker';

    IF esp_id IS NOT NULL THEN
        INSERT INTO public.mqtt_acls (user_id, topic_pattern, access_level) VALUES 
            (esp_id, 'iot/devices/+/state', 'write'),
            (esp_id, 'iot/devices/+/ack', 'write'),
            (esp_id, 'iot/devices/+/error', 'write'),
            (esp_id, 'iot/devices/+/command', 'read'),
            (esp_id, 'iot/devices/+/schedules', 'read')
        ON CONFLICT DO NOTHING;
    END IF;

    IF web_id IS NOT NULL THEN
        INSERT INTO public.mqtt_acls (user_id, topic_pattern, access_level) VALUES 
            (web_id, 'iot/devices/+/state', 'read'),
            (web_id, 'iot/devices/+/command', 'write')
        ON CONFLICT DO NOTHING;
    END IF;
    
    IF worker_id IS NOT NULL THEN
        INSERT INTO public.mqtt_acls (user_id, topic_pattern, access_level) VALUES 
            (worker_id, 'iot/devices/#', 'readwrite')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- PHASE 6: Command Queue
CREATE TABLE IF NOT EXISTS public.device_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
    command_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPATCHING', 'SENT', 'ACKNOWLEDGED', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    correlation_id TEXT UNIQUE
);

-- PHASE 7: Device Twin
CREATE TABLE IF NOT EXISTS public.device_twin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL UNIQUE REFERENCES public.devices(id) ON DELETE CASCADE,
    desired_state JSONB DEFAULT '{}'::jsonb,
    reported_state JSONB DEFAULT '{}'::jsonb,
    desired_version INTEGER DEFAULT 0,
    reported_version INTEGER DEFAULT 0,
    last_desired_update TIMESTAMPTZ,
    last_reported_update TIMESTAMPTZ,
    sync_status TEXT DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED', 'PENDING', 'DRIFTED', 'OFFLINE', 'ERROR')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS tr_device_twin_updated_at ON public.device_twin;
CREATE TRIGGER tr_device_twin_updated_at BEFORE UPDATE ON public.device_twin FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- PHASE 8: OTA Security
CREATE TABLE IF NOT EXISTS public.ota_rollouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    firmware_id UUID REFERENCES public.firmware_releases(id) ON DELETE RESTRICT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('single_device', 'group', 'model', 'product')),
    target_id UUID NOT NULL, 
    percentage INTEGER NOT NULL DEFAULT 100 CHECK (percentage >= 1 AND percentage <= 100),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'paused', 'stopped', 'completed', 'rolled_back')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ota_rollout_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rollout_id UUID REFERENCES public.ota_rollouts(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'rolled_back')),
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(rollout_id, device_id)
);

-- PHASE 10: Audit Log
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    metadata JSONB,
    tenant_id UUID REFERENCES public.tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PHASE 9: Tenant-Aware RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_twin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_rollouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_rollout_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check tenant membership
CREATE OR REPLACE FUNCTION public.is_tenant_member(check_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_users 
    WHERE tenant_users.tenant_id = check_tenant_id 
    AND tenant_users.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simple policies for development, to allow backend Service Role access
-- In a real production system these would be more strict, 
-- but we allow users to view their own tenants/products.

CREATE POLICY "Users can view their tenants" ON public.tenants FOR SELECT TO authenticated USING (
    public.is_tenant_member(id)
);

CREATE POLICY "Users can view products in their tenants" ON public.products FOR SELECT TO authenticated USING (
    public.is_tenant_member(tenant_id)
);

CREATE POLICY "Users can view models in their tenants" ON public.device_models FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.products WHERE id = device_models.product_id AND public.is_tenant_member(tenant_id))
);

-- Admins can manage all, others read-only based on assignments for now.
-- We rely heavily on the backend Service Role for provisioning/command dispatch.

