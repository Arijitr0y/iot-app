/**
 * MQTT Configuration Sync API
 * 
 * This Express server acts as a control plane for Mosquitto, enabling EMQX-style
 * dynamic configuration via the React dashboard.
 * 
 * It listens for requests on /api/mqtt/sync, fetches the latest credentials from Supabase,
 * generates the Mosquitto password and ACL files, and triggers a dynamic reload.
 * 
 * Prerequisites on the host VM:
 * - Docker installed and the Mosquitto container named "iot-mosquitto"
 * - The Mosquitto container must have the `mosquitto_passwd` utility available
 * - A shared volume for `/mosquitto/config` between this script (if dockerized) and Mosquitto, 
 *   OR just use `docker exec` for everything.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mqtt from 'mqtt';
import crypto from 'crypto';
import { config } from './config.js';

const execPromise = util.promisify(exec);
const app = express();

// Enable CORS for all origins (safe because endpoints require JWT authentication)
app.use(cors());
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', apiLimiter);

const mqttClient = mqtt.connect(config.MQTT_HOST, {
  username: config.MQTT_USERNAME,
  password: config.MQTT_PASSWORD,
  clientId: `backend_api_${Math.random().toString(16).substring(2, 8)}`,
});

mqttClient.on('connect', () => {
  console.log('✅ Backend API Connected to MQTT Broker');
});

mqttClient.on('error', (err) => {
  console.error('MQTT Client Error in API:', err);
});

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

// In-memory cache for device provisioning claims
// Map of MAC Address -> { token, userId, expiresAt }
const pendingProvisioningClaims = new Map();


const MOSQUITTO_CONFIG_DIR = config.MOSQUITTO_CONFIG_DIR;
const ACL_FILE_PATH = path.join(MOSQUITTO_CONFIG_DIR, 'acl');
const PASSWORDS_FILE_PATH = path.join(MOSQUITTO_CONFIG_DIR, 'passwords');


const commandIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many commands from this IP' }
});

const commandDeviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // Increased from 10 to allow rapid testing/toggling
  keyGenerator: (req) => req.params.deviceId || 'unknown',
  message: { success: false, error: 'Too many commands sent to this device' }
});

const ALLOWED_COMMANDS = ['on', 'off', 'restart', 'factory_reset', 'restart_mqtt', 'restart_wifi', 'sync_time', 'sync_config', 'relay_test', 'sensor_test', 'led_blink', 'enable_debug', 'disable_debug', 'enter_recovery'];

// --- Ultra-Fast Auth Caching ---
// To achieve 10-50ms command latency, we cache Supabase lookups for 30 seconds.
const authCache = new Map(); // token -> { user, expiresAt }
const deviceAuthCache = new Map(); // token+deviceId -> { device, expiresAt }

// Garbage collection for caches to prevent memory leaks in production (Scalability fix)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authCache.entries()) {
    if (value.expiresAt <= now) authCache.delete(key);
  }
  for (const [key, value] of deviceAuthCache.entries()) {
    if (value.expiresAt <= now) deviceAuthCache.delete(key);
  }
}, 60000); // Run cleanup every 60 seconds

// Helper to authenticate user from Bearer token
async function authenticateUser(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ success: false, error: 'Unauthorized: Missing Bearer token' });
    return null;
  }
  const token = authHeader.split(' ')[1];
  
  // Check fast cache
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    console.error('[AUTH ERROR] Invalid token verification failed:', authError);
    res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid token',
      details: authError ? authError.message : 'User not found'
    });
    return null;
  }
  
  // Cache for 30 seconds
  authCache.set(token, { user, expiresAt: Date.now() + 30000 });
  return user;
}

// Helper to check device ownership or admin permission
async function authorizeDeviceAccess(user, deviceId, res) {
  const cacheKey = `${user.id}_${deviceId}`;
  const cached = deviceAuthCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.device === null) {
      res.status(403).json({ success: false, error: 'Forbidden: Access denied' });
      return null;
    }
    return cached.device;
  }

  const { data: device, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('id', deviceId)
    .single();

  if (error || !device) {
    deviceAuthCache.set(cacheKey, { device: null, expiresAt: Date.now() + 30000 });
    res.status(404).json({ success: false, error: 'Device not found or access denied' });
    return null;
  }

  if (device.owner_id === user.id) {
    deviceAuthCache.set(cacheKey, { device, expiresAt: Date.now() + 30000 });
    return device; // User owns the device
  }

  // Check if admin via current granular RBAC system
  const { data: roleData } = await supabase
    .from('admin_user_roles')
    .select('role_id')
    .eq('user_id', user.id)
    .single();
    
  if (roleData) {
    const { data: roleDef } = await supabase
      .from('roles')
      .select('manage_inventory')
      .eq('id', roleData.role_id)
      .single();
      
    if (roleDef && roleDef.manage_inventory) {
      deviceAuthCache.set(cacheKey, { device, expiresAt: Date.now() + 30000 });
      return device; // Admin with inventory access
    }
  }

  // Not owner, not admin
  deviceAuthCache.set(cacheKey, { device: null, expiresAt: Date.now() + 30000 });
  res.status(403).json({ success: false, error: 'Forbidden: Access denied to this device' });
  return null;
}

// Secure Device Command Endpoint
app.post('/api/devices/:deviceId/command', commandIpLimiter, commandDeviceLimiter, async (req, res) => {
  try {
    const user = await authenticateUser(req, res);
    if (!user) return;

    const deviceId = req.params.deviceId;
    const device = await authorizeDeviceAccess(user, deviceId, res);
    if (!device) return;

    const { action, ...frontendPayload } = req.body;

    if (!ALLOWED_COMMANDS.includes(action)) {
      console.warn(`[AUDIT] User ${user.id} attempted unknown/forbidden command '${action}' on device ${deviceId}`);
      return res.status(400).json({ success: false, error: 'Invalid or unsupported command' });
    }

    if (action === 'factory_reset' && frontendPayload.confirm_factory_reset !== true) {
      return res.status(400).json({ success: false, error: 'Factory reset requires explicit confirmation flag' });
    }

    // Construct topic securely server-side
    const topic = `iot/devices/${device.mac_address}/command`;
    
    // Construct payload strictly overriding frontend injection attempts
    const cmd_id = crypto.randomUUID();
    const finalPayload = {
      ...(frontendPayload || {}), // Spread frontend provided params first (if any)
      action,                     // Explicitly override action
      cmd_id,                     // Server-generated idempotency token
      device_id: device.id,       // Explicitly override device_id
      mac_address: device.mac_address // Explicitly override mac_address
    };

    console.log(`[AUDIT] User ${user.id} executed '${action}' on device ${device.id} (MAC: ${device.mac_address})`);

    mqttClient.publish(topic, JSON.stringify(finalPayload), { qos: 1 }, (err) => {
      if (err) {
        console.error(`MQTT publish failed for ${device.mac_address}:`, err.message);
        return res.status(500).json({ success: false, error: 'Failed to dispatch command to broker' });
      }
      res.json({ success: true, message: 'Command dispatched successfully', cmd_id });
    });
  } catch (err) {
    console.error('Command endpoint error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Secure Device Schedules Endpoint
app.post('/api/devices/:deviceId/schedules', commandIpLimiter, commandDeviceLimiter, async (req, res) => {
  try {
    const user = await authenticateUser(req, res);
    if (!user) return;

    const deviceId = req.params.deviceId;
    const device = await authorizeDeviceAccess(user, deviceId, res);
    if (!device) return;

    const schedules = req.body;
    
    if (!Array.isArray(schedules) || schedules.length > 10) {
      return res.status(400).json({ success: false, error: 'Schedules must be an array (max 10)' });
    }

    // Strict structure validation
    for (const s of schedules) {
      if (!['on', 'off'].includes(s.action)) return res.status(400).json({ success: false, error: 'Invalid schedule action' });
      if (!/^([01]\d|2[0-3]):?([0-5]\d)$/.test(s.time)) return res.status(400).json({ success: false, error: 'Invalid time format' });
      if (!Array.isArray(s.days)) return res.status(400).json({ success: false, error: 'Days must be an array' });
      if (typeof s.active !== 'boolean') return res.status(400).json({ success: false, error: 'Active must be boolean' });
      
      const validDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      if (!s.days.every(d => validDays.includes(d))) {
        return res.status(400).json({ success: false, error: 'Invalid days provided' });
      }
    }

    const topic = `iot/devices/${device.mac_address}/schedules`;
    
    console.log(`[AUDIT] User ${user.id} synced ${schedules.length} schedules on device ${device.id}`);

    mqttClient.publish(topic, JSON.stringify(schedules), { qos: 1, retain: true }, (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Failed to publish schedules' });
      }
      res.json({ success: true, message: 'Schedules synced successfully' });
    });
  } catch (err) {
    console.error('Schedules endpoint error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


app.post('/api/mqtt/sync', async (req, res) => {
  try {
    // Ensure docker CLI is available in the environment running this script
    try {
      await execPromise('docker --version');
    } catch (err) {
      throw new Error('Docker CLI is not available in this environment. If running inside a container, you must mount /var/run/docker.sock and install the docker CLI, or run this script directly on the host VM using PM2.');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing Bearer token' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }

    // Strict RBAC Admin Check
    const { data: roleData, error: roleErr } = await supabase
      .from('admin_user_roles')
      .select('access_level')
      .eq('user_id', user.id)
      .single();

    if (roleErr || !roleData || roleData.access_level !== 'admin_panel') {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges to trigger MQTT sync' });
    }

    console.log(`🔄 Initiating Mosquitto Sync (triggered by ${user.email})...`);

    // 1. Fetch Users and Passwords
    const { data: users, error: usersErr } = await supabase.from('mqtt_users').select('*');
    if (usersErr) throw usersErr;

    // 2. Fetch ACLs
    const { data: acls, error: aclsErr } = await supabase.from('mqtt_acls').select('*');
    if (aclsErr) throw aclsErr;

    // 3. Rebuild the Passwords file
    // We recreate the file from scratch to handle deletions properly
    try {
      await fs.writeFile(PASSWORDS_FILE_PATH, ''); // Clear file
    } catch (e) {
      // If file doesn't exist, it will be created. Ensure dir exists.
      await fs.mkdir(MOSQUITTO_CONFIG_DIR, { recursive: true });
      await fs.writeFile(PASSWORDS_FILE_PATH, '');
    }

    for (const user of users) {
      if (!user.password_hash) continue; // Skip users without a password set

      // Use docker exec to run mosquitto_passwd inside the container
      // -b means batch mode (username password)
      try {
        const { execFile } = await import('child_process');
        const execFilePromise = util.promisify(execFile);
        
        await execFilePromise('docker', [
          'exec', 
          config.MOSQUITTO_CONTAINER_NAME, 
          'mosquitto_passwd', 
          '-b', 
          '/mosquitto/config/passwords', 
          user.username, 
          user.password_hash
        ]);
        console.log(`🔑 Generated credentials for: ${user.username}`);
      } catch (execErr) {
        console.error(`Failed to generate password for ${user.username}:`, execErr.message);
      }
    }

    // 4. Rebuild the ACL file
    let aclContent = '';

    // Group ACLs by user
    const aclsByUser = users.reduce((acc, user) => {
      acc[user.id] = { username: user.username, rules: [] };
      return acc;
    }, {});

    for (const acl of acls) {
      if (aclsByUser[acl.user_id]) {
        aclsByUser[acl.user_id].rules.push(acl);
      }
    }

    for (const userId in aclsByUser) {
      const userAcls = aclsByUser[userId];
      if (userAcls.rules.length > 0) {
        aclContent += `user ${userAcls.username}\n`;
        for (const rule of userAcls.rules) {
          if (rule.access_level === 'readwrite') {
            aclContent += `topic readwrite ${rule.topic_pattern}\n`;
          } else {
            aclContent += `topic ${rule.access_level} ${rule.topic_pattern}\n`;
          }
        }
        aclContent += '\n';
      }
    }

    // Write ACL file
    await fs.writeFile(ACL_FILE_PATH, aclContent);
    console.log(`🛡️ Generated ACL file with ${acls.length} rules.`);

    // 5. Trigger Dynamic Reload (SIGHUP)
    // SIGHUP tells mosquitto to reload configuration, passwords, and ACL files without dropping active connections.
    console.log(`📡 Reloading Mosquitto container (${config.MOSQUITTO_CONTAINER_NAME})...`);
    await execPromise(`docker exec ${config.MOSQUITTO_CONTAINER_NAME} kill -SIGHUP 1`);

    console.log('✅ Sync complete.');
    res.json({ success: true, message: 'Mosquitto synced and reloaded successfully' });

  } catch (err) {
    console.error('❌ Sync failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = config.PORT || process.env.PORT || 3001;

// NEW ENDPOINT: Create users directly
app.post('/api/admin/users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing Bearer token' });
    }

    const token = authHeader.split(' ')[1];

    // First verify the request is coming from a logged-in user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }

    // Then strictly check if they are an admin with manage_users permission
    const { data: roleData, error: roleErr } = await supabase
      .from('admin_user_roles')
      .select('manage_users')
      .eq('user_id', user.id)
      .single();

    if (roleErr || !roleData || !roleData.manage_users) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges' });
    }

    const { email, password, role_id } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Missing email or password' });
    }

    console.log(`👤 Admin ${user.email} is creating new user: ${email}`);

    // Create user with Service Role privileges
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true // bypass email confirmation
    });

    if (createError) throw createError;

    // If a role was provided, assign it immediately
    if (role_id) {
      // The trigger automatically gives 'Customer', so we might need to upsert/update
      // Let's just wait a moment for the trigger to finish, or manually update
      await new Promise(resolve => setTimeout(resolve, 500));

      const { error: roleAssignError } = await supabase
        .from('user_roles')
        .update({ role_id })
        .eq('user_id', newUser.user.id);

      // If the trigger hadn't fired yet (or we missed the update), try upsert
      if (roleAssignError) {
        await supabase.from('user_roles').upsert({ user_id: newUser.user.id, role_id });
      }
    }

    res.json({ success: true, user: newUser.user });
  } catch (err) {
    console.error('❌ Failed to create user:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// NEW ENDPOINT: Delete user
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing Bearer token' });
    }

    const token = authHeader.split(' ')[1];

    // Verify admin calling the API
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }

    const { data: roleData, error: roleErr } = await supabase
      .from('admin_user_roles')
      .select('manage_users')
      .eq('user_id', user.id)
      .single();

    if (roleErr || !roleData || !roleData.manage_users) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges' });
    }

    const targetUserId = req.params.id;
    if (targetUserId === user.id) {
      return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
    }

    console.log(`👤 Admin ${user.email} is deleting user: ${targetUserId}`);

    // Delete from auth.users using service role key
    const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUserId);

    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to delete user:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// PROVISIONING: Step 1 - Authorized user sets up the claim
app.post('/api/devices/provision_setup', async (req, res) => {
  try {
    const user = await authenticateUser(req, res);
    if (!user) return;

    const { mac_address, session_token } = req.body;
    if (!mac_address || !session_token) {
      return res.status(400).json({ success: false, error: 'Missing mac_address or session_token' });
    }

    // Verify the user owns this device
    const { data: device, error } = await supabase
      .from('user_devices')
      .select('id')
      .eq('mac_address', mac_address)
      .eq('owner_id', user.id)
      .single();

    if (error || !device) {
      return res.status(403).json({ success: false, error: 'Forbidden: Device not found or not owned by you' });
    }

    // Store claim (expires in 10 minutes)
    pendingProvisioningClaims.set(mac_address, {
      token: session_token,
      userId: user.id,
      expiresAt: Date.now() + 10 * 60000
    });

    console.log(`[PROVISION] Authorized claim setup for ${mac_address} by user ${user.id}`);
    res.json({ success: true, message: 'Provisioning claim setup successfully' });
  } catch (err) {
    console.error('Provision setup error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PROVISIONING: Step 2 - ESP claims its credentials
app.post('/api/devices/claim', async (req, res) => {
  try {
    const { mac_address, token } = req.body;
    if (!mac_address || !token) {
      return res.status(400).json({ success: false, error: 'Missing mac_address or token' });
    }

    // Check pending claims
    const claim = pendingProvisioningClaims.get(mac_address);
    if (!claim) {
      return res.status(404).json({ success: false, error: 'No pending provisioning claim for this device' });
    }

    if (claim.expiresAt < Date.now()) {
      pendingProvisioningClaims.delete(mac_address);
      return res.status(400).json({ success: false, error: 'Provisioning claim expired' });
    }

    if (claim.token !== token) {
      return res.status(401).json({ success: false, error: `Invalid provisioning token: expected [${claim.token}], got [${token}]` });
    }

    console.log(`[PROVISION] Valid claim from ${mac_address}. Generating MQTT credentials...`);

    // 1. Generate credentials
    const username = mac_address;
    // Generate 32 char hex password (high entropy)
    const password = crypto.randomBytes(16).toString('hex');

    // 2. Save to mqtt_users
    const { data: mqttUser, error: userErr } = await supabase
      .from('mqtt_users')
      .upsert({ 
        username, 
        password_hash: password, // Mosquitto will hash this via the sync script
        description: `Auto-provisioned device ${mac_address}` 
      }, { onConflict: 'username' })
      .select()
      .single();

    if (userErr) throw userErr;

    // 3. Setup exact ACLs for this device
    const topics = [
      { topic_pattern: `iot/devices/${mac_address}/state`, access_level: 'write' },
      { topic_pattern: `iot/devices/${mac_address}/ack`, access_level: 'write' },
      { topic_pattern: `iot/devices/${mac_address}/error`, access_level: 'write' },
      { topic_pattern: `iot/devices/${mac_address}/command`, access_level: 'read' },
      { topic_pattern: `iot/devices/${mac_address}/schedules`, access_level: 'read' }
    ];

    // Clear old ACLs if any
    await supabase.from('mqtt_acls').delete().eq('user_id', mqttUser.id);
    
    // Insert new ACLs
    const { error: aclErr } = await supabase.from('mqtt_acls').insert(
      topics.map(t => ({ user_id: mqttUser.id, ...t }))
    );

    if (aclErr) throw aclErr;

    // 4. Trigger Mosquitto Sync to reload credentials
    // We execute the sync logic internally to avoid making an HTTP call to ourselves
    // We'll just call a helper or execute a local fetch
    try {
      const { execFile } = await import('child_process');
      const execFilePromise = util.promisify(execFile);
      
      // Update password file
      await execFilePromise('docker', [
        'exec', 
        config.MOSQUITTO_CONTAINER_NAME, 
        'mosquitto_passwd', 
        '-b', 
        '/mosquitto/config/passwords', 
        username, 
        password
      ]);
      
      // We also need to reload ACLs, easiest is to trigger our own sync endpoint locally
      // but without the JWT check. Let's just do a quick docker restart or trigger it.
      // Wait, we can just trigger it using the service role key!
      // But the sync endpoint requires admin.
      // Let's just do the ACL reload manually here to guarantee atomicity for the device.
      
      // Fetch all ACLs again
      const { data: users } = await supabase.from('mqtt_users').select('*');
      const { data: acls } = await supabase.from('mqtt_acls').select('*');
      
      let aclContent = '';
      const aclsByUser = users.reduce((acc, u) => {
        acc[u.id] = { username: u.username, rules: [] };
        return acc;
      }, {});
      for (const acl of acls) if (aclsByUser[acl.user_id]) aclsByUser[acl.user_id].rules.push(acl);
      
      for (const userId in aclsByUser) {
        const userAcls = aclsByUser[userId];
        if (userAcls.rules.length > 0) {
          aclContent += `user ${userAcls.username}\n`;
          for (const rule of userAcls.rules) {
            if (rule.access_level === 'readwrite') {
              aclContent += `topic readwrite ${rule.topic_pattern}\n`;
            } else {
              aclContent += `topic ${rule.access_level} ${rule.topic_pattern}\n`;
            }
          }
          aclContent += '\n';
        }
      }
      
      await fs.writeFile(ACL_FILE_PATH, aclContent);
      await execPromise(`docker exec ${config.MOSQUITTO_CONTAINER_NAME} kill -SIGHUP 1`);
      
    } catch (syncErr) {
      console.error('Failed to immediately sync mosquitto for device:', syncErr);
      // It might still work on next scheduled sync, but we should fail the provisioning to be safe
      throw new Error('Failed to synchronize broker');
    }

    // 5. Return plaintext credentials to ESP
    res.json({
      success: true,
      mqtt_username: username,
      mqtt_password: password
    });
    
    // Cleanup pending claim ONLY after fully successful operation
    pendingProvisioningClaims.delete(mac_address);
    console.log(`[PROVISION] Successfully provisioned MQTT credentials for ${mac_address}`);

  } catch (err) {
    console.error('Claim endpoint error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MQTT Config Sync API running on port ${PORT}`);
});
