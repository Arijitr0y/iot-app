# Next-Generation IoT Platform - Deployment Guide

This guide provides step-by-step instructions for deploying the new canonical backend to the GCP production environment.

**IMPORTANT:** Before proceeding, ensure you have ssh access to the GCP production VM.

## 1. Backup the Existing Environment

SSH into the GCP VM and create a snapshot of the current environment.

```bash
# SSH into your GCP VM
ssh user@your-gcp-ip

# Navigate to the project directory
cd /path/to/iot-app

# Backup the database (Required)
docker exec iot-postgres pg_dump -U postgres postgres > backup_pre_migration.sql

# Backup the mosquitto config
cp -r ./mosquitto ./mosquitto_backup
```

## 2. Deploy Repository Updates

Pull the latest repository changes containing the new Node.js workers and canonical APIs.

```bash
git pull origin main
```

## 3. Verify Environment Variables

Update the `.env` file for the backend components. The API relies on the `MQTT_MANAGER_TOKEN` to communicate securely with the internal MQTT Manager container.

```bash
# Add missing variables to your .env
echo "MQTT_MANAGER_TOKEN=your_secure_manager_token_here" >> .env
```

## 4. Run Supabase Database Migrations

If your Supabase instance is remotely hosted (or local), run the new migration.
You can execute it via the Supabase CLI if configured:

```bash
supabase db push
# OR apply the generated migration file '20261001000000_iot_platform_core.sql' manually via the Supabase Dashboard
```

## 5. Restart Backend Services

Since you are using PM2 to manage the Node processes:

```bash
# Install new dependencies (if any)
npm ci

# Restart PM2 using the ecosystem config
npm run stop:prod
npm run start:prod
```

## 6. Verification Steps

### Check MQTT Manager API
Ensure the Manager container is running and responsive.
```bash
curl -I http://localhost:3100/health
```

### Check PM2 Worker Logs
Verify that all 4 workers (`iot-mqtt-sync`, `iot-command-worker`, `iot-ota-worker`, `iot-state-worker`) are running without crashing.
```bash
pm2 logs
```

### Check Mosquitto Activity
Ensure Mosquitto hasn't lost connection with physical devices.
```bash
docker logs -f iot-mosquitto
```
