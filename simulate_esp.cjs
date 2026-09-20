const mqtt = require('mqtt');

const MQTT_TEST_USERNAME = process.env.MQTT_TEST_USERNAME;
const MQTT_TEST_PASSWORD = process.env.MQTT_TEST_PASSWORD;
const MQTT_TEST_URL = process.env.MQTT_TEST_URL || 'wss://mqtt.arijitroy.dpdns.org/mqtt';

if (!MQTT_TEST_USERNAME || !MQTT_TEST_PASSWORD) {
  throw new Error("MQTT_TEST_USERNAME and MQTT_TEST_PASSWORD are required");
}

// Connect to the broker directly over WebSockets, just like the frontend
const client = mqtt.connect(MQTT_TEST_URL, {
  username: MQTT_TEST_USERNAME,
  password: MQTT_TEST_PASSWORD
});

client.on('connect', () => {
  console.log('Connected to broker! Publishing simulated ESP8266 message...');
  
  const topic = 'iot/devices/B6E62D44D6A5/state';
  const payload = JSON.stringify({
    id: "B6E62D44D6A5",
    status: "online",
    state: "on",
    water_level: 50
  });

  // Publish with retain=true so the browser gets it immediately even if it connects later
  client.publish(topic, payload, { retain: true }, (err) => {
    if (err) {
      console.error('Failed to publish:', err);
    } else {
      console.log('Successfully published simulated state to', topic);
    }
    client.end();
  });
});

client.on('error', (err) => {
  console.error('MQTT error:', err);
  client.end();
});
