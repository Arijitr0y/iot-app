import { createClient } from '@supabase/supabase-js';
import mqtt from 'mqtt';
import { config } from './config.js';
import crypto from 'crypto';

// --- Initialize Clients ---
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const mqttClient = mqtt.connect(config.MQTT_HOST, {
  username: config.MQTT_USERNAME,
  password: config.MQTT_PASSWORD,
  clientId: `backend_rollout_engine_${Math.random().toString(16).substring(2, 8)}`,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker for OTA Rollouts');
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
      if (activeTimeouts.has(mac)) {
        console.log(`✅ Device ${mac} completed OTA successfully.`);
        clearTimeout(activeTimeouts.get(mac));
        activeTimeouts.delete(mac);

        // Update device job status to success
        const { data: device } = await supabase.from('devices').select('id').eq('mac_address', mac).single();
        if (device) {
           await supabase.from('ota_rollout_devices')
            .update({ status: 'success', completed_at: new Date().toISOString() })
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
  // 1. Find scheduled rollouts that are ready to run
  const { data: rollouts, error } = await supabase
    .from('ota_rollouts')
    .select('*, firmware_releases(version, file_url, signature)')
    .eq('status', 'scheduled')
    .lte('created_at', new Date().toISOString()); // should be schedule_time, but keeping simpler here

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
    } else if (rollout.target_type === 'model') {
      const { data: mDevs } = await supabase.from('devices').select('id').eq('device_model_id', rollout.target_id);
      deviceIds = (mDevs || []).map(d => d.id);
    }

    // Apply Percentage
    const targetCount = Math.ceil(deviceIds.length * (rollout.percentage / 100));
    const selectedDevices = deviceIds.slice(0, targetCount);

    // 3. Create Rollout Device Jobs
    for (const devId of selectedDevices) {
      // Check if job exists
      const { data: existing } = await supabase.from('ota_rollout_devices')
        .select('id').eq('rollout_id', rollout.id).eq('device_id', devId).single();
      
      if (!existing) {
          await supabase.from('ota_rollout_devices').insert({
            rollout_id: rollout.id,
            device_id: devId,
            status: 'pending'
          });
      }
    }
  }

  // 4. Process Pending Device Jobs
  const { data: pendingJobs } = await supabase
    .from('ota_rollout_devices')
    .select('*, devices(mac_address), ota_rollouts(status, firmware_releases(version, file_url, signature))')
    .eq('status', 'pending');

  for (const job of pendingJobs || []) {
    if (job.ota_rollouts.status !== 'active') continue;

    const mac = job.devices?.mac_address;
    if (!mac) continue;

    const fw = job.ota_rollouts.firmware_releases;
    
    // Phase 8: Enforce signature checking before issuing OTA updates
    if (!fw.signature) {
        console.error(`🚨 Rollout failed: Firmware ${fw.version} lacks a valid signature!`);
        await supabase.from('ota_rollout_devices')
          .update({ status: 'failed', error_message: 'Missing firmware signature' })
          .eq('id', job.id);
        continue;
    }

    console.log(`📤 Queuing signed OTA command to ${mac} for version ${fw.version}`);
    
    // Update status to in_progress
    await supabase.from('ota_rollout_devices')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', job.id);

    // Using Canonical Command Queue
    const cmdId = crypto.randomUUID();
    const payload = {
      action: 'ota',
      v: fw.version,
      url: fw.file_url,
      signature: fw.signature
    };
    
    const { error: cmdErr } = await supabase.from('device_commands').insert({
        device_id: job.device_id,
        command_type: 'ota',
        payload: payload,
        status: 'PENDING',
        correlation_id: cmdId
    });

    if (cmdErr) {
       console.error('Failed to queue OTA command', cmdErr);
       continue;
    }

    // Set a health check timeout (e.g. 5 minutes)
    const timeout = setTimeout(async () => {
      console.log(`❌ Device ${mac} failed to report OTA success within timeout.`);
      activeTimeouts.delete(mac);
      
      await supabase.from('ota_rollout_devices')
        .update({ status: 'failed', error_message: 'Update Timeout' })
        .eq('id', job.id);
    }, 5 * 60 * 1000); 

    activeTimeouts.set(mac, timeout);
  }
}

// Polling interval
setInterval(processRollouts, 15000); // Check every 15 seconds
console.log('👷 OTA Rollout Engine Worker Started.');
