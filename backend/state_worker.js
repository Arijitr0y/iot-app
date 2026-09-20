import { createClient } from '@supabase/supabase-js';
import mqtt from 'mqtt';
import { config } from './config.js';

// --- Initialize Clients ---
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const mqttClient = mqtt.connect(config.MQTT_HOST, {
  username: config.MQTT_USERNAME,
  password: config.MQTT_PASSWORD,
  clientId: `backend_state_worker_${Math.random().toString(16).substring(2, 8)}`,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker for State Monitoring');
  // Subscribe to all device state and error topics
  mqttClient.subscribe('iot/devices/+/state');
  mqttClient.subscribe('iot/devices/+/error');
});

mqttClient.on('message', async (topic, message) => {
  try {
    const topicParts = topic.split('/');
    if (topicParts.length !== 4 || topicParts[0] !== 'iot' || topicParts[1] !== 'devices') return;
    
    const mac = topicParts[2];
    
    // 1. Strict MAC Address validation
    if (!/^[0-9A-Fa-f]{12}$/.test(mac)) {
      console.warn(`[SECURITY] Invalid MAC address format in topic: ${topic}`);
      return;
    }

    const type = topicParts[3];
    
    // 2. Reject oversized payloads (limit to 1024 bytes)
    if (message.length > 1024) {
      console.warn(`[SECURITY] Oversized payload from ${mac}: ${message.length} bytes. Rejecting.`);
      return;
    }

    const payload = JSON.parse(message.toString());
    
    if (type === 'state') {
      const updates = {
        last_seen: new Date().toISOString()
      };
      
      // 3. Strict schema validation
      if (payload.status !== undefined) {
        if (typeof payload.status === 'string' && ['online', 'offline'].includes(payload.status.toLowerCase())) {
          updates.status = payload.status.toLowerCase();
        }
      }
      
      if (payload.state !== undefined) {
        if (typeof payload.state === 'string' && ['on', 'off'].includes(payload.state.toLowerCase())) {
          updates.relay_state = (payload.state.toLowerCase() === 'on');
        } else if (typeof payload.state === 'boolean') {
          updates.relay_state = payload.state;
        }
      }
      
      if (payload.water_level !== undefined) {
        const level = parseInt(payload.water_level, 10);
        if (!isNaN(level) && level >= 0 && level <= 100) {
          updates.water_level = level;
        }
      }
      
      // Clear error state if device is reporting normal online state without explicit errors
      updates.error_state = null;

      const { error } = await supabase
        .from('user_devices')
        .update(updates)
        .eq('mac_address', mac);
        
      if (error) {
        console.error(`Failed to update state for device ${mac}:`, error);
      } else {
        console.log(`📡 State updated for ${mac}:`, updates);
      }
      
    } else if (type === 'error') {
      if (payload.error && typeof payload.error === 'string') {
        // Sanitize and truncate to 255 chars
        const safeError = payload.error.substring(0, 255);
        const { error } = await supabase
          .from('user_devices')
          .update({ 
            error_state: safeError,
            last_seen: new Date().toISOString() 
          })
          .eq('mac_address', mac);
          
        if (error) {
          console.error(`Failed to update error for device ${mac}:`, error);
        } else {
          console.error(`🚨 Error recorded for ${mac}: ${safeError}`);
        }
      }
    }
  } catch (e) {
    console.error('Error processing MQTT state message', e);
  }
});

console.log('👷 State Worker Started.');
