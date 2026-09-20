-- Secure Command Center Migration
-- Enhances RLS for device_commands to prevent unauthorized command insertion/manipulation

-- 1. Ensure created_by has a default value of the authenticated user's ID
ALTER TABLE public.device_commands 
ALTER COLUMN created_by SET DEFAULT auth.uid();

-- 2. Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage device_commands" ON public.device_commands;

-- 3. Create strict SELECT policy
-- Users can view commands if they created them, if they own the target device, or if they are admins.
CREATE POLICY "Users can view commands for their devices or if admin"
ON public.device_commands FOR SELECT TO authenticated
USING (
    public.is_admin() OR 
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_devices ud WHERE ud.id = device_commands.device_id AND ud.owner_id = auth.uid())
);

-- 4. Create strict INSERT policy
-- Users can insert commands only if they own the device or if they are admins.
-- It also forces the created_by field to exactly match their auth.uid().
CREATE POLICY "Users can insert commands for their devices or if admin"
ON public.device_commands FOR INSERT TO authenticated
WITH CHECK (
    created_by = auth.uid() 
    AND (
        public.is_admin() OR 
        EXISTS (SELECT 1 FROM public.user_devices ud WHERE ud.id = device_commands.device_id AND ud.owner_id = auth.uid())
    )
);

-- 5. Restrict UPDATE and DELETE operations completely for standard authenticated users.
-- The backend uses a Service Role key which bypasses RLS to update command status.
-- If an admin needs to delete/update manually, they can use the backend/service role, 
-- or we can grant explicit admin UPDATE/DELETE if required by the frontend in the future.
DROP POLICY IF EXISTS "Users can update their own commands" ON public.device_commands;
DROP POLICY IF EXISTS "Users can delete their own commands" ON public.device_commands;

CREATE POLICY "Admins can update commands"
ON public.device_commands FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete commands"
ON public.device_commands FOR DELETE TO authenticated
USING (public.is_admin());
