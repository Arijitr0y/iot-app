-- RLS Fixes for Canonical Tables

-- 1. devices
CREATE POLICY "Users can view devices in their tenant" ON public.devices FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.device_models dm
        JOIN public.products p ON p.id = dm.product_id
        WHERE dm.id = devices.device_model_id AND public.is_tenant_member(p.tenant_id)
    )
);

-- 2. device_assignments
CREATE POLICY "Users can view assignments in their tenant" ON public.device_assignments FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.devices d
        JOIN public.device_models dm ON dm.id = d.device_model_id
        JOIN public.products p ON p.id = dm.product_id
        WHERE d.id = device_assignments.device_id AND public.is_tenant_member(p.tenant_id)
    )
);

-- 3. device_commands
CREATE POLICY "Users can manage commands for devices in their tenant" ON public.device_commands FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.devices d
        JOIN public.device_models dm ON dm.id = d.device_model_id
        JOIN public.products p ON p.id = dm.product_id
        WHERE d.id = device_commands.device_id AND public.is_tenant_member(p.tenant_id)
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.devices d
        JOIN public.device_models dm ON dm.id = d.device_model_id
        JOIN public.products p ON p.id = dm.product_id
        WHERE d.id = device_commands.device_id AND public.is_tenant_member(p.tenant_id)
    )
);

-- 4. device_twin
CREATE POLICY "Users can view twin for devices in their tenant" ON public.device_twin FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.devices d
        JOIN public.device_models dm ON dm.id = d.device_model_id
        JOIN public.products p ON p.id = dm.product_id
        WHERE d.id = device_twin.device_id AND public.is_tenant_member(p.tenant_id)
    )
);

-- 5. ota_rollouts
CREATE POLICY "Users can manage ota_rollouts in their tenant" ON public.ota_rollouts FOR ALL TO authenticated USING (
    public.is_tenant_member(tenant_id)
) WITH CHECK (
    public.is_tenant_member(tenant_id)
);

-- 6. ota_rollout_devices
CREATE POLICY "Users can view ota_rollout_devices in their tenant" ON public.ota_rollout_devices FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.ota_rollouts o
        WHERE o.id = ota_rollout_devices.rollout_id AND public.is_tenant_member(o.tenant_id)
    )
);

-- 7. audit_logs
CREATE POLICY "Users can view audit_logs in their tenant" ON public.audit_logs FOR SELECT TO authenticated USING (
    public.is_tenant_member(tenant_id)
);
