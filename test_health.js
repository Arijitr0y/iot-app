import express from 'express';
import { createHealthRouter } from './backend/health.js';
import http from 'http';

const app = express();
app.use(express.json());

// Mock clients
let mqttConnected = true;
const mockMqttClient = {
  get connected() { return mqttConnected; }
};

let dbError = false;
const mockSupabaseClient = {
  from: (table) => ({
    select: (cols) => ({
      limit: (n) => Promise.resolve(dbError ? { error: new Error('DB Error') } : { data: [{ id: '1' }] })
    })
  })
};

app.use('/health', createHealthRouter(mockMqttClient, mockSupabaseClient));

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  
  const runTest = async (name, path, expectedStatus) => {
    try {
      const res = await fetch(`${baseUrl}${path}`);
      const json = await res.json();
      if (res.status === expectedStatus) {
        console.log(`✅ ${name} passed (Status ${res.status}): ${JSON.stringify(json)}`);
      } else {
        console.error(`❌ ${name} failed. Expected ${expectedStatus}, got ${res.status}. Body: ${JSON.stringify(json)}`);
        process.exit(1);
      }
    } catch (e) {
      console.error(`❌ ${name} fetch failed:`, e);
      process.exit(1);
    }
  };

  console.log('Running tests...');
  
  // Test 1: /health
  await runTest('/health', '/health', 200);

  // Test 2: /health/live
  await runTest('/health/live', '/health/live', 200);

  // Test 3: /health/ready (All healthy)
  await runTest('/health/ready (healthy)', '/health/ready', 200);

  // Test 4: /health/ready (MQTT down)
  mqttConnected = false;
  await runTest('/health/ready (mqtt down)', '/health/ready', 503);

  // Test 5: /health/ready (DB down)
  mqttConnected = true;
  dbError = true;
  await runTest('/health/ready (db down)', '/health/ready', 503);

  console.log('✅ All tests passed!');
  server.close();
  process.exit(0);
});
