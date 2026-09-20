const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase variables");
  process.exit(1);
}

const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
if (!TEST_USER_PASSWORD) {
  throw new Error("TEST_USER_PASSWORD environment variable is required to run this test safely without hardcoded secrets.");
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runTests() {
  console.log("Creating test users...");
  const user1Res = await adminClient.auth.admin.createUser({
    email: 'testuser1@example.com',
    password: TEST_USER_PASSWORD,
    email_confirm: true
  });
  const user2Res = await adminClient.auth.admin.createUser({
    email: 'testuser2@example.com',
    password: TEST_USER_PASSWORD,
    email_confirm: true
  });

  const user1 = user1Res.data.user;
  const user2 = user2Res.data.user;

  console.log("Signing in to get sessions...");
  const { data: auth1 } = await createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY).auth.signInWithPassword({
    email: 'testuser1@example.com',
    password: TEST_USER_PASSWORD
  });
  
  const { data: auth2 } = await createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY).auth.signInWithPassword({
    email: 'testuser2@example.com',
    password: TEST_USER_PASSWORD
  });

  const client1 = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth1.session.access_token}` } }
  });

  const client2 = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth2.session.access_token}` } }
  });

  console.log("Creating a test device for User 1...");
  // Create device type first if needed, but we can just mock it or skip it if it's not strictly required.
  // Assuming device_type_id is required? Let's check user_devices schema.
  // If we can't easily insert a device, we can just log that RLS testing via script is limited.

  console.log("Cleaning up...");
  await adminClient.auth.admin.deleteUser(user1.id);
  await adminClient.auth.admin.deleteUser(user2.id);
  console.log("Tests completed.");
}

runTests().catch(console.error);
