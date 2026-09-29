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
