-- Least-Privilege MQTT ACLs Migration
-- Restructures Mosquitto permissions to completely isolate devices and tighten backend access.

DO $$ 
DECLARE
    esp_id UUID;
    worker_id UUID;
BEGIN
    -- 1. Delete the deprecated web_client user
    -- (This guarantees the frontend cannot connect anonymously or via shared creds)
    DELETE FROM public.mqtt_users WHERE username = 'web_client';

    -- 2. Fetch the remaining system users
    SELECT id INTO esp_id FROM public.mqtt_users WHERE username = 'esp8266_node';
    SELECT id INTO worker_id FROM public.mqtt_users WHERE username = 'ingestion_worker';

    -- 3. Clear ALL existing ACLs for these users to wipe the dangerous '+' and '#' wildcards
    DELETE FROM public.mqtt_acls WHERE user_id = esp_id;
    DELETE FROM public.mqtt_acls WHERE user_id = worker_id;

    -- 4. Rebuild ESP8266 node permissions using dynamic %c (Client ID)
    -- This strictly locks each physical device to topics matching its exact MAC address.
    IF esp_id IS NOT NULL THEN
        INSERT INTO public.mqtt_acls (user_id, topic_pattern, access_level) VALUES 
            (esp_id, 'iot/devices/%c/state', 'write'),
            (esp_id, 'iot/devices/%c/ack', 'write'),
            (esp_id, 'iot/devices/%c/error', 'write'),
            (esp_id, 'iot/devices/%c/command', 'read'),
            (esp_id, 'iot/devices/%c/schedules', 'read')
        ON CONFLICT DO NOTHING;
    END IF;

    -- 5. Rebuild Ingestion Worker permissions
    -- Grants strict + wildcard access to specific topic namespaces rather than the entire '#' tree.
    IF worker_id IS NOT NULL THEN
        INSERT INTO public.mqtt_acls (user_id, topic_pattern, access_level) VALUES 
            (worker_id, 'iot/devices/+/state', 'read'),
            (worker_id, 'iot/devices/+/ack', 'read'),
            (worker_id, 'iot/devices/+/error', 'read'),
            (worker_id, 'iot/devices/+/command', 'write'),
            (worker_id, 'iot/devices/+/schedules', 'write')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
