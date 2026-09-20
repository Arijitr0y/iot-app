/**
 * Centralized Backend Configuration
 * Reads, validates, and exports environment variables consistently.
 */

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MQTT_HOST',
  'MQTT_USERNAME',
  'MQTT_PASSWORD'
];

const missing = requiredVars.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('FATAL ERROR: Missing required environment variables:');
  missing.forEach(key => console.error(` - ${key}`));
  console.error('Please update your .env file or environment configuration.');
  process.exit(1);
}

export const config = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  MQTT_HOST: process.env.MQTT_HOST,
  MQTT_PORT: process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT, 10) : 8883,
  MQTT_USERNAME: process.env.MQTT_USERNAME,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3001,
  
  // Specific to sync API
  MOSQUITTO_CONTAINER_NAME: process.env.MOSQUITTO_CONTAINER_NAME || 'iot-mosquitto',
  MOSQUITTO_CONFIG_DIR: process.env.MOSQUITTO_CONFIG_DIR || './mosquitto/config',
};
