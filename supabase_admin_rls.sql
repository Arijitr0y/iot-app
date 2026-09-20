-- Run this in your Supabase SQL Editor to allow Admin operations
-- This allows any authenticated user to create, update, and delete categories and device types.
-- In a production environment, you should restrict this to specific user roles or emails!

CREATE POLICY "Allow authenticated insert on categories" ON public.device_categories
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update on categories" ON public.device_categories
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on categories" ON public.device_categories
    FOR DELETE TO authenticated USING (true);


CREATE POLICY "Allow authenticated insert on device types" ON public.device_types
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update on device types" ON public.device_types
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on device types" ON public.device_types
    FOR DELETE TO authenticated USING (true);
