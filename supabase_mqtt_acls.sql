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
