module.exports = {
  apps: [
    {
      name: 'iot-mqtt-sync',
      script: './backend/mqtt_sync_api.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_file: '.env'
    },
    {
      name: 'iot-command-worker',
      script: './backend/command_worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_file: '.env'
    },
    {
      name: 'iot-ota-worker',
      script: './backend/ota_rollout_worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_file: '.env'
    },
    {
      name: 'iot-state-worker',
      script: './backend/state_worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_file: '.env'
    }
  ]
};
