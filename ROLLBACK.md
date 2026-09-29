# Next-Generation IoT Platform - Rollback Guide

If the deployment causes instability with physical devices or the legacy frontend, follow this immediate rollback procedure.

**IMPORTANT:** The database rollback drops the canonical tables. Only do this if strictly necessary, as any newly ingested telemetry mapped uniquely to canonical devices will be lost.

## 1. Stop Current Backend Services

Halt the new backend workers to prevent them from reading/writing to the queue and interfering with Mosquitto.

```bash
# SSH into your GCP VM
ssh user@your-gcp-ip
cd /path/to/iot-app

# Stop all PM2 instances
pm2 stop ecosystem.config.cjs
```

## 2. Restore Mosquitto Configuration

Restore the Mosquitto ACLs and password files from the pre-deployment backup.

```bash
# Restore backup folder
rm -rf ./mosquitto/config
cp -r ./mosquitto_backup/config ./mosquitto/config

# Restart Mosquitto via Docker
docker restart iot-mosquitto
```

## 3. Rollback the Database

If you took a pg_dump backup prior to deployment, you can restore it completely. 
Alternatively, if you merely applied the additive schema (which doesn't drop legacy tables), you can drop the new canonical tables.

**Option A (Full Database Restore):**
```bash
# Caution: Destructive to all changes since backup
docker exec -i iot-postgres psql -U postgres postgres < backup_pre_migration.sql
```

**Option B (Soft Rollback via SQL):**
If you wish to retain the database but ignore the new architecture:
```sql
-- Execute via Supabase SQL Editor
DROP TABLE IF EXISTS public.device_commands CASCADE;
DROP TABLE IF EXISTS public.device_twin CASCADE;
DROP TABLE IF EXISTS public.device_provisioning_claims CASCADE;
DROP TABLE IF EXISTS public.ota_rollout_devices CASCADE;
DROP TABLE IF EXISTS public.ota_rollouts CASCADE;
```

## 4. Revert the Codebase

Check out the previous working commit and restart PM2.

```bash
# Revert to last stable commit
git checkout HEAD^

# Reinstall dependencies
npm ci

# Start the legacy backend
npm run start:prod
```

## 5. Verify Rollback

Check the PM2 logs to ensure the legacy API is functioning.
```bash
pm2 logs
```

Verify Mosquitto is receiving telemetry from devices.
```bash
docker logs -f iot-mosquitto
```
