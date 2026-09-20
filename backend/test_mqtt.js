import mqtt from 'mqtt';
import fs from 'fs';
const envContent = fs.readFileSync('../.env', 'utf-8');
let env = {};
envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
    }
  }
});

const MQTT_HOST = env.MQTT_HOST;
const MQTT_USERNAME = env.MQTT_USERNAME;
const MQTT_PASSWORD = env.MQTT_PASSWORD;

console.log("=== MQTT STATE WORKER SECURITY TEST ===");

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  clientId: 'test_client_' + Date.now()
});

client.on('connect', () => {
  console.log("Connected to MQTT broker as backend user.");

  const MAC_A = "0011223344AA";

  console.log("Test 1: Valid State Payload");
  client.publish(`iot/devices/${MAC_A}/state`, JSON.stringify({
    status: "online",
    state: "on",
    water_level: 50
  }));

  console.log("Test 2: Invalid MAC in Topic");
  client.publish(`iot/devices/INVALID_MAC_!!/state`, JSON.stringify({ status: "online" }));

  console.log("Test 3: Invalid JSON");
  client.publish(`iot/devices/${MAC_A}/state`, "not_json_at_all");

  console.log("Test 4: Oversized Payload");
  client.publish(`iot/devices/${MAC_A}/state`, "x".repeat(2000));

  console.log("Test 5: Type Injection (water_level as object)");
  client.publish(`iot/devices/${MAC_A}/state`, JSON.stringify({
    water_level: { "$gt": 0 }
  }));

  console.log("Test 6: DB Field Injection");
  client.publish(`iot/devices/${MAC_A}/state`, JSON.stringify({
    status: "online",
    role: "admin",
    owner_id: "override_uuid"
  }));

  console.log("Test 7: Oversized Error String");
  client.publish(`iot/devices/${MAC_A}/error`, JSON.stringify({
    error: "A".repeat(500)
  }));

  setTimeout(() => {
    console.log("Tests dispatched.");
    process.exit(0);
  }, 2000);
});

client.on('error', (err) => {
  console.error("MQTT Error:", err);
  process.exit(1);
});
