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
