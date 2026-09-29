import { createClient } from '@supabase/supabase-js';
import mqtt from 'mqtt';
import { config } from './config.js';

// --- Initialize Clients ---
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const mqttClient = mqtt.connect(config.MQTT_HOST, {
  username: config.MQTT_USERNAME,
  password: config.MQTT_PASSWORD,
  clientId: `backend_cmd_center_${Math.random().toString(16).substring(2, 8)}`,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker for Command Center');
  // Subscribe to all device ack topics
  mqttClient.subscribe('iot/devices/+/ack');
});

// Map of active command tracking timeouts
const activeCommands = new Map();
const COMMAND_TIMEOUT_MS = 15000; // 15 seconds

mqttClient.on('message', async (topic, message) => {
  // Listen for acks
  if (topic.startsWith('iot/devices/') && topic.endsWith('/ack')) {
    const mac = topic.split('/')[2];
    try {
      const payload = JSON.parse(message.toString());
      const cmd_id = payload.cmd_id; // Frontend/Device uses this
      const status = payload.status; // 'success' or 'failed'
      
      console.log(`📡 ACK from ${mac} for cmd ${cmd_id}: ${status}`);

      if (cmd_id) {
        if (activeCommands.has(cmd_id)) {
          clearTimeout(activeCommands.get(cmd_id));
          activeCommands.delete(cmd_id);
        }

        // Update DB using canonical correlation_id
        const finalStatus = status === 'success' ? 'COMPLETED' : 'FAILED';
        const updatePayload = { 
            status: finalStatus,
            acknowledged_at: new Date().toISOString()
        };
        if (finalStatus === 'COMPLETED') updatePayload.completed_at = new Date().toISOString();
        if (finalStatus === 'FAILED') updatePayload.failed_at = new Date().toISOString();
        
        await supabase.from('device_commands')
          .update(updatePayload)
          .eq('correlation_id', cmd_id);
      }
    } catch (e) {
      console.error('Error parsing MQTT ack message', e);
    }
  }
});

async function processCommands() {
  // 1. Process pending commands
  const { data: pendingCmds } = await supabase
    .from('device_commands')
    .select('*, devices(mac_address)')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });

  for (const cmd of pendingCmds || []) {
    const mac = cmd.devices?.mac_address;

    if (!mac) {
        console.error(`🚨 Command ${cmd.id} has no valid MAC address mapped. Failing.`);
        await supabase.from('device_commands').update({ status: 'FAILED', last_error: 'No MAC Address' }).eq('id', cmd.id);
        continue;
    }

    console.log(`📤 Sending ${cmd.command_type} to ${mac} (Cmd ID: ${cmd.correlation_id})`);
    
    // Set status to SENT
    const sentAt = new Date().toISOString();
    await supabase.from('device_commands')
      .update({ status: 'SENT', sent_at: sentAt })
      .eq('id', cmd.id);

    // Send MQTT
    const topic = `iot/devices/${mac}/command`;
    const payload = JSON.stringify({
      ...cmd.payload,
      action: cmd.command_type,
      cmd_id: cmd.correlation_id
    });
    
    mqttClient.publish(topic, payload, { qos: 1 });

    // Track for timeout
    const timeout = setTimeout(async () => {
      console.log(`❌ Timeout for cmd ${cmd.correlation_id}`);
      activeCommands.delete(cmd.correlation_id);
      
      if (cmd.attempt_count < 3) {
        console.log(`🔄 Retrying cmd ${cmd.correlation_id} (${cmd.attempt_count + 1}/3)`);
        await supabase.from('device_commands')
          .update({ 
            status: 'PENDING', 
            attempt_count: cmd.attempt_count + 1,
            last_error: 'Timeout, retrying...'
          })
          .eq('id', cmd.id);
      } else {
        console.log(`💀 Cmd ${cmd.correlation_id} failed after max retries.`);
        await supabase.from('device_commands')
          .update({ 
            status: 'FAILED',
            last_error: 'Timeout, max retries reached'
          })
          .eq('id', cmd.id);
      }
    }, COMMAND_TIMEOUT_MS);

    activeCommands.set(cmd.correlation_id, timeout);
  }
}

// Poll every 3 seconds for new commands
setInterval(processCommands, 3000);
console.log('👷 Command Center Worker Started.');
