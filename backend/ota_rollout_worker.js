import { createClient } from '@supabase/supabase-js';
import mqtt from 'mqtt';
import { config } from './config.js';

// --- Initialize Clients ---
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const mqttClient = mqtt.connect(config.MQTT_HOST, {
  username: config.MQTT_USERNAME,
  password: config.MQTT_PASSWORD,
  clientId: `backend_rollout_engine_${Math.random().toString(16).substring(2, 8)}`,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker');
  // We subscribe to all state topics to monitor updates
  mqttClient.subscribe('iot/devices/+/state');
});

// Map of tracking timeouts for health checks
const activeTimeouts = new Map();

mqttClient.on('message', async (topic, message) => {
  // Listen for state updates to verify OTA success
  if (topic.startsWith('iot/devices/') && topic.endsWith('/state')) {
    const mac = topic.split('/')[2];
    try {
      const payload = JSON.parse(message.toString());
      // For health check, we need the device to reconnect and report its version.
      // Currently esp8266.ino doesn't report version in state, but assuming it did:
      // if (payload.version) { check against expected version }
      
      // As a placeholder, if device comes online after 'updating' status, we assume success or check DB version.
      console.log(`📡 State update from ${mac}: ${payload.status}`);
      
      // If we are waiting for this device to finish updating:
      if (activeTimeouts.has(mac)) {
        // In a real system, we would query the actual reported firmware version here.
        console.log(`✅ Device ${mac} completed OTA successfully.`);
        clearTimeout(activeTimeouts.get(mac));
        activeTimeouts.delete(mac);

        // Update device job status to success
        const { data: device } = await supabase.from('user_devices').select('id').eq('mac_address', mac).single();
        if (device) {
           await supabase.from('ota_rollout_devices')
            .update({ status: 'success', install_completed_at: new Date().toISOString() })
            .eq('device_id', device.id)
            .eq('status', 'in_progress');
        }
      }
    } catch (e) {
      console.error('Error parsing MQTT message', e);
    }
  }
});

async function processRollouts() {
  console.log('🔄 Checking for scheduled rollouts...');
  
  // 1. Find scheduled rollouts that are ready to run
  const { data: rollouts, error } = await supabase
    .from('ota_rollouts')
    .select('*, firmwares(version, public_url)')
    .eq('status', 'scheduled')
    .lte('schedule_time', new Date().toISOString());

  if (error) {
    console.error('Error fetching rollouts:', error);
    return;
  }

  for (const rollout of rollouts || []) {
    console.log(`🚀 Starting Rollout: ${rollout.name}`);
    await supabase.from('ota_rollouts').update({ status: 'active' }).eq('id', rollout.id);

    // 2. Resolve Targets to Devices
    let deviceIds = [];
    if (rollout.target_type === 'single_device') {
      deviceIds = [rollout.target_id];
    } else if (rollout.target_type === 'group') {
      // In a real app, you'd have a device_group_members table
      // Here we simulate getting devices in a group
      const { data: gDevs } = await supabase.from('user_devices').select('id').limit(10);
      deviceIds = (gDevs || []).map(d => d.id);
    } else if (rollout.target_type === 'product') {
      const { data: pDevs } = await supabase.from('user_devices').select('id').eq('device_type_id', rollout.target_id);
      deviceIds = (pDevs || []).map(d => d.id);
    }

    // Apply Percentage
    const targetCount = Math.ceil(deviceIds.length * (rollout.percentage / 100));
    const selectedDevices = deviceIds.slice(0, targetCount);

    // 3. Create Rollout Device Jobs
    for (const devId of selectedDevices) {
      await supabase.from('ota_rollout_devices').insert({
        rollout_id: rollout.id,
        device_id: devId,
        status: 'pending'
      });
    }
  }

  // 4. Process Pending Device Jobs
  const { data: pendingJobs } = await supabase
    .from('ota_rollout_devices')
    .select('*, user_devices(mac_address), ota_rollouts(status, firmwares(version, public_url))')
    .eq('status', 'pending');

  for (const job of pendingJobs || []) {
    // Check if rollout was paused or stopped
    if (job.ota_rollouts.status !== 'active') continue;

    const mac = job.user_devices.mac_address;
    const version = job.ota_rollouts.firmwares.version;
    const url = job.ota_rollouts.firmwares.public_url;

    console.log(`📤 Sending OTA command to ${mac} for version ${version}`);
    
    // Update status to in_progress
    await supabase.from('ota_rollout_devices')
      .update({ status: 'in_progress', download_started_at: new Date().toISOString() })
      .eq('id', job.id);

    // Send MQTT Command targeted to device
    const topic = `iot/devices/${mac}/command`;
    const payload = JSON.stringify({
      action: 'ota',
      v: version,
      url: url
    });
    
    mqttClient.publish(topic, payload, { qos: 1 });

    // Set a health check timeout (e.g. 5 minutes)
    const timeout = setTimeout(async () => {
      console.log(`❌ Device ${mac} failed to report OTA success within timeout.`);
      activeTimeouts.delete(mac);
      
      // Update DB
      await supabase.from('ota_rollout_devices')
        .update({ status: 'failed', error_message: 'Update Timeout' })
        .eq('id', job.id);
        
      // Real system would implement Retry Logic here based on max_retries
    }, 5 * 60 * 1000); 

    activeTimeouts.set(mac, timeout);
  }
}

// Polling interval
setInterval(processRollouts, 15000); // Check every 15 seconds
console.log('👷 OTA Rollout Engine Worker Started.');
