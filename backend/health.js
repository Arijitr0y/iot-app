import express from 'express';

export function createHealthRouter(mqttClient, supabaseClient) {
  const router = express.Router();

  // 1. GET /health
  router.get('/', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'iot-api',
      timestamp: new Date().toISOString()
    });
  });

  // 3. GET /health/live - Lightweight liveness check
  router.get('/live', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'iot-api',
      timestamp: new Date().toISOString()
    });
  });

  // 2. GET /health/ready - Dependency check
  router.get('/ready', async (req, res) => {
    const checks = {
      mqtt: { status: 'unknown' },
      database: { status: 'unknown' }
    };
    let overallStatus = 'ok';
    let statusCode = 200;

    // Check MQTT
    if (mqttClient && mqttClient.connected) {
      checks.mqtt.status = 'ok';
    } else {
      checks.mqtt.status = 'error';
      overallStatus = 'unhealthy';
      statusCode = 503;
    }

    // Check Database (Supabase)
    try {
      // Lightweight query to check connectivity
      const { error } = await supabaseClient
        .from('mqtt_users')
        .select('id')
        .limit(1);
      if (error) {
        checks.database.status = 'error';
        overallStatus = 'unhealthy';
        statusCode = 503;
      } else {
        checks.database.status = 'ok';
      }
    } catch (err) {
      checks.database.status = 'error';
      overallStatus = 'unhealthy';
      statusCode = 503;
    }

    res.status(statusCode).json({
      status: overallStatus,
      service: 'iot-api',
      timestamp: new Date().toISOString(),
      checks
    });
  });

  return router;
}
