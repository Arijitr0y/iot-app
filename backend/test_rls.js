import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Set up WebSocket polyfill for Node.js 20
globalThis.WebSocket = WebSocket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');

const envContent = fs.readFileSync(envPath, 'utf-8');
let env = {};
envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
    }
  }
});

const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const TEST_USER_PASSWORD = env.TEST_USER_PASSWORD || process.env.TEST_USER_PASSWORD;
if (!TEST_USER_PASSWORD) {
  throw new Error("TEST_USER_PASSWORD environment variable is required to run this test safely without hardcoded secrets.");
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("=== Realtime & Database Security Isolation Test ===");
  try {
    // 1. Create two users via public signup
    console.log("1. Creating test users...");
    const emailA = 'test_a_' + Date.now() + '@example.com';
    const emailB = 'test_b_' + Date.now() + '@example.com';
    
    const { data: authA, error: errA } = await clientA.auth.signUp({
      email: emailA,
      password: TEST_USER_PASSWORD
    });
    if (errA) throw errA;
    const userA = authA.user;

    const { data: authB, error: errB } = await clientB.auth.signUp({
      email: emailB,
      password: TEST_USER_PASSWORD
    });
    if (errB) throw errB;
    const userB = authB.user;

    // 2. Create two devices
    console.log("2. Fetching device type...");
    const { data: dt } = await clientA.from('device_types').select('id').limit(1).single();
    const typeId = dt ? dt.id : null;
    if (!typeId) throw new Error("No device types found in database to link devices to.");

    console.log("2. Creating test devices...");
    const { data: deviceA, error: errDevA } = await clientA.from('user_devices').insert({
      owner_id: userA.id,
      mac_address: '0011223344A' + Math.floor(Math.random()*10),
      name: 'Device A',
      status: 'offline',
      device_type_id: typeId
    }).select().single();
    if (errDevA) throw errDevA;

    const { data: deviceB, error: errDevB } = await clientB.from('user_devices').insert({
      owner_id: userB.id,
      mac_address: '0011223344B' + Math.floor(Math.random()*10),
      name: 'Device B',
      status: 'offline',
      device_type_id: typeId
    }).select().single();
    if (errDevB) throw errDevB;

    // 3. Login users
    console.log("3. Logging in clients...");
    await clientA.auth.signInWithPassword({ email: userA.email, password: TEST_USER_PASSWORD });
    await clientB.auth.signInWithPassword({ email: userB.email, password: TEST_USER_PASSWORD });

    // 4. Test SELECT RLS
    console.log("4. Testing SELECT RLS...");
    const { data: fetchA } = await clientA.from('user_devices').select('id');
    const { data: fetchB } = await clientB.from('user_devices').select('id');
    
    if (fetchA.some(d => d.id === deviceB.id)) throw new Error("User A can see Device B!");
    if (fetchB.some(d => d.id === deviceA.id)) throw new Error("User B can see Device A!");
    console.log("✅ SELECT RLS PASS: Users can only see their own devices.");

    // 5. Test UPDATE RLS
    console.log("5. Testing UPDATE RLS...");
    await clientA.from('user_devices').update({ status: 'online' }).eq('id', deviceB.id);
    await clientB.from('user_devices').update({ status: 'online' }).eq('id', deviceA.id);
    
    // 5. Test UPDATE RLS
    console.log("5. Testing cross-user UPDATE...");
    await clientA.from('user_devices').update({ status: 'online' }).eq('id', deviceB.id);
    await clientB.from('user_devices').update({ status: 'online' }).eq('id', deviceA.id);
    
    // Verify they didn't actually update
    const { data: checkUpdateA } = await clientA.from('user_devices').select('status').eq('id', deviceA.id).single();
    const { data: checkUpdateB } = await clientB.from('user_devices').select('status').eq('id', deviceB.id).single();
    
    if (checkUpdateA.status === 'online' || checkUpdateB.status === 'online') {
      throw new Error("Cross-user UPDATE succeeded! RLS failed to prevent modification.");
    }
    console.log("✅ UPDATE RLS PASS: Users cannot update each other's devices.");

    // 6. Test Realtime Subscriptions
    console.log("6. Testing Realtime Subscriptions...");
    let aReceived = [];
    let bReceived = [];

    const subscribePromise = (channel) => new Promise(resolve => channel.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve();
    }));

    const subA = clientA.channel('test_a')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_devices' }, payload => {
        aReceived.push(payload.new.id);
      });

    const subB = clientB.channel('test_b')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_devices' }, payload => {
        bReceived.push(payload.new.id);
      });

    console.log("Waiting for subscriptions to establish...");
    await Promise.all([subscribePromise(subA), subscribePromise(subB)]);

    console.log("Triggering updates to self (simulating backend)...");
    await clientA.from('user_devices').update({ status: 'online' }).eq('id', deviceA.id);
    await clientB.from('user_devices').update({ status: 'online' }).eq('id', deviceB.id);

    console.log("Waiting for realtime events to propagate...");
    await new Promise(r => setTimeout(r, 3000));

    console.log(`User A received updates for: ${aReceived.join(', ')}`);
    console.log(`User B received updates for: ${bReceived.join(', ')}`);

    if (aReceived.includes(deviceB.id)) throw new Error("User A received Realtime update for Device B!");
    if (bReceived.includes(deviceA.id)) throw new Error("User B received Realtime update for Device A!");
    if (!aReceived.includes(deviceA.id)) throw new Error("User A did NOT receive Realtime update for Device A!");
    if (!bReceived.includes(deviceB.id)) throw new Error("User B did NOT receive Realtime update for Device B!");
    
    console.log("✅ REALTIME RLS PASS: Subscriptions correctly filtered by ownership.");

    // Cannot cleanup users without admin key, but we can delete the devices
    console.log("Cleaning up test data...");
    await clientA.from('user_devices').delete().eq('id', deviceA.id);
    await clientB.from('user_devices').delete().eq('id', deviceB.id);
    
    await clientA.removeChannel(subA);
    await clientB.removeChannel(subB);
    
    console.log("Test successfully completed.");
    process.exit(0);

  } catch (e) {
    console.error("❌ Test Failed:", e.message);
    process.exit(1);
  }
}

run();
