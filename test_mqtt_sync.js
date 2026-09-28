import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';

global.WebSocket = WebSocket;

// We will test the logic by mocking the global fetch and running the endpoint.
// Since mqtt_sync_api starts an Express server automatically, we can interact with it on PORT 3001.

let fetchLog = [];
let managerStatus = 200;
let userRole = 'admin_panel';
let validToken = 'valid-jwt';
let dbUsers = [{ id: 'u1', username: 'device1', password_hash: 'pass1' }];
let dbAcls = [{ user_id: 'u1', topic_pattern: 'iot/devices/device1/#', access_level: 'readwrite' }];

// Mock global fetch to intercept Supabase and MQTT Manager calls
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  const urlStr = url.toString();
  fetchLog.push({ url: urlStr, method: options?.method || 'GET', body: options?.body });

  if (urlStr.includes('/auth/v1/user')) {
    const token = options.headers?.Authorization?.split(' ')[1];
    if (token === validToken) {
      return new Response(JSON.stringify({ user: { id: 'u1', email: 'admin@test.com' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('/rest/v1/admin_user_roles')) {
    // .single() expects a single object from PostgREST
    return new Response(JSON.stringify({ access_level: userRole }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('/rest/v1/mqtt_users')) {
    return new Response(JSON.stringify(dbUsers), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('/rest/v1/mqtt_acls')) {
    return new Response(JSON.stringify(dbAcls), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (urlStr.includes('iot-mqtt-manager:3100/internal/sync')) {
    return new Response(JSON.stringify({ success: managerStatus === 200 }), { status: managerStatus });
  }

  // Fallback to original
  return originalFetch(url, options);
};

// Set env variable
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.MQTT_HOST = 'mqtt://localhost:1883';
process.env.MQTT_USERNAME = 'user';
process.env.MQTT_PASSWORD = 'password';
process.env.MQTT_MANAGER_TOKEN = 'secret-manager-token-123';
process.env.PORT = '3005'; // Use isolated port

// Dynamically import the API server (it will listen on process.env.PORT)
await import('./backend/mqtt_sync_api.js');

// Helper to make API requests
const makeRequest = async (token) => {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3005,
      path: '/api/mqtt/sync',
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    });
    req.end();
  });
};

// Wait a bit for server to start
await new Promise(r => setTimeout(r, 1000));

describe('MQTT Sync API', async () => {
  
  it('Missing/invalid user authentication still returns 401', async () => {
    fetchLog = [];
    const res = await makeRequest();
    assert.strictEqual(res.status, 401);
    
    const res2 = await makeRequest('invalid-token');
    assert.strictEqual(res2.status, 401);
  });

  it('Insufficient admin role still returns 403', async () => {
    fetchLog = [];
    userRole = 'customer';
    const res = await makeRequest(validToken);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'Forbidden: Insufficient privileges to trigger MQTT sync');
  });

  it('Successful manager call', async () => {
    fetchLog = [];
    userRole = 'admin_panel';
    managerStatus = 200;
    const res = await makeRequest(validToken);
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    
    // Verify MQTT_MANAGER_TOKEN is read from environment
    const managerCall = fetchLog.find(f => f.url.includes('iot-mqtt-manager'));
    assert(managerCall, 'Should have called MQTT manager');
    
    // Verify the manager receives username/password/ACL data in the expected shape
    const payload = JSON.parse(managerCall.body);
    assert.deepStrictEqual(payload, {
      users: [ { username: 'device1', password: 'pass1' } ],
      acls: [ { username: 'device1', topic_pattern: 'iot/devices/device1/#', access_level: 'readwrite' } ]
    });
    
    // Verify token is not returned
    assert(!JSON.stringify(res.body).includes('secret-manager-token-123'));
  });

  it('Manager returns failure', async () => {
    fetchLog = [];
    managerStatus = 500;
    const res = await makeRequest(validToken);
    
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'Failed to synchronize MQTT configuration');
    // Verify token is not returned or logged in response
    assert(!JSON.stringify(res.body).includes('secret-manager-token-123'));
  });

});

setTimeout(() => process.exit(0), 100);
