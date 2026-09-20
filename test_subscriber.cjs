const mqtt = require('mqtt');

const MQTT_TEST_USERNAME = process.env.MQTT_TEST_USERNAME;
const MQTT_TEST_PASSWORD = process.env.MQTT_TEST_PASSWORD;
const MQTT_TEST_URL = process.env.MQTT_TEST_URL || 'wss://mqtt.arijitroy.dpdns.org/mqtt';

if (!MQTT_TEST_USERNAME || !MQTT_TEST_PASSWORD) {
  throw new Error("MQTT_TEST_USERNAME and MQTT_TEST_PASSWORD are required");
}

const client = mqtt.connect(MQTT_TEST_URL, {
  username: MQTT_TEST_USERNAME,
  password: MQTT_TEST_PASSWORD
});

client.on('connect', () => {
  console.log('Test Subscriber Connected! Subscribing...');
  client.subscribe('iot/devices/+/state', (err) => {
    if (!err) console.log('Successfully subscribed');
    else console.error('Subscription error:', err);
  });
});

client.on('message', (topic, message) => {
  console.log(`RECEIVED MESSAGE on ${topic}:`, message.toString());
  client.end();
  process.exit(0);
});

// timeout after 5 seconds if no retained message is received
setTimeout(() => {
  console.log('TIMEOUT: No retained message received within 5 seconds.');
  client.end();
  process.exit(1);
}, 5000);
