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
      const cmd_id = payload.cmd_id;
      const status = payload.status; // 'success' or 'failed'
      
      console.log(`📡 ACK from ${mac} for cmd ${cmd_id}: ${status}`);

      if (cmd_id) {
        if (activeCommands.has(cmd_id)) {
          clearTimeout(activeCommands.get(cmd_id));
          activeCommands.delete(cmd_id);
        }

        // Calculate execution time (difference between now and sent_at)
        const { data: cmdRow } = await supabase.from('device_commands').select('sent_at').eq('id', cmd_id).single();
        let execTime = null;
        if (cmdRow && cmdRow.sent_at) {
          execTime = new Date().getTime() - new Date(cmdRow.sent_at).getTime();
        }

        // Update DB
        await supabase.from('device_commands')
          .update({ 
            status: status === 'success' ? 'acknowledged' : 'failed',
            acknowledged_at: new Date().toISOString(),
            execution_time_ms: execTime
          })
          .eq('id', cmd_id);
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
    .select('*, user_devices(mac_address, owner_id)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  for (const cmd of pendingCmds || []) {
    const mac = cmd.user_devices.mac_address;
    const ownerId = cmd.user_devices.owner_id;
    const createdBy = cmd.created_by;

    if (!mac) continue;

    // Backend authorization validation (Defense-in-depth)
    let isAuthorized = false;
    if (createdBy === ownerId) {
      isAuthorized = true;
    } else if (createdBy) {
      // Check if created_by is an admin
      const { data: roleData } = await supabase
        .from('admin_user_roles')
        .select('access_level')
        .eq('user_id', createdBy)
        .single();
      if (roleData && roleData.access_level === 'admin_panel') {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      console.error(`🚨 Unauthorized command attempt by ${createdBy} on device ${mac}`);
      await supabase.from('device_commands')
        .update({ status: 'failed', error_message: 'Unauthorized: You do not own this device' })
        .eq('id', cmd.id);
      continue;
    }

    console.log(`📤 Sending ${cmd.command_type} to ${mac} (ID: ${cmd.id})`);
    
    // Set status to sent
    const sentAt = new Date().toISOString();
    await supabase.from('device_commands')
      .update({ status: 'sent', sent_at: sentAt })
      .eq('id', cmd.id);

    // Send MQTT
    const topic = `iot/devices/${mac}/command`;
    const payload = JSON.stringify({
      ...cmd.payload,
      action: cmd.command_type,
      cmd_id: cmd.id
    });
    
    mqttClient.publish(topic, payload, { qos: 1 });

    // Track for timeout
    const timeout = setTimeout(async () => {
      console.log(`❌ Timeout for cmd ${cmd.id}`);
      activeCommands.delete(cmd.id);
      
      // Determine if we should retry
      if (cmd.retry_count < cmd.max_retries) {
        console.log(`🔄 Retrying cmd ${cmd.id} (${cmd.retry_count + 1}/${cmd.max_retries})`);
        await supabase.from('device_commands')
          .update({ 
            status: 'pending', 
            retry_count: cmd.retry_count + 1,
            error_message: 'Timeout, retrying...'
          })
          .eq('id', cmd.id);
      } else {
        console.log(`💀 Cmd ${cmd.id} failed after max retries.`);
        await supabase.from('device_commands')
          .update({ 
            status: 'failed',
            error_message: 'Timeout, max retries reached'
          })
          .eq('id', cmd.id);
      }
    }, COMMAND_TIMEOUT_MS);

    activeCommands.set(cmd.id, timeout);
  }
}

// Poll every 3 seconds for new commands
setInterval(processCommands, 3000);
console.log('👷 Command Center Worker Started.');
