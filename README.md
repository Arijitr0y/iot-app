# IoT Application Platform

This repository contains the complete source code for an end-to-end secure IoT Platform. It features a React/Vite Progressive Web App (PWA) frontend, a Node.js/Express backend (PM2 ecosystem), an ESP8266 C++ firmware package, and Supabase integration for Postgres databases, RLS isolation, and Realtime state syncing.

## Architecture

**Frontend**
- **Tech Stack:** React, TypeScript, Vite, Tailwind CSS, React Router, Vite PWA
- **Data Flow:** The browser client NEVER connects directly to MQTT. It interacts strictly with the Backend HTTPS API and Supabase (for authenticated data fetches and Realtime updates).

**Backend**
- **Tech Stack:** Node.js, Express, PM2, MQTT (`mosquitto`)
- **Data Flow:** The backend (`iot-state-worker`, `iot-command-worker`, etc.) acts as the sole bridge between the Mosquitto MQTT broker and the Supabase Postgres database. It validates incoming telemetry, enforces Rate Limits, and manages device Command API queues.

**Firmware (ESP8266)**
- **Tech Stack:** C++ (Arduino Core)
- **Data Flow:** The ESP8266 connects via secure TLS to the Mosquitto broker. It receives provisioning tokens via a localized Access Point (AP) mode that requires a physical 5-second button press to initiate. All MQTT logic is idempotently tracked (duplicate commands are ignored).

## Local Development

### 1. Environment Setup

Do NOT commit `.env` to source control.

Copy the `.env.example` file:
```bash
cp .env.example .env
```
Fill out the variables in `.env` with your secure local or development credentials.

### 2. Frontend Build
```bash
npm install
npm run build
```

### 3. Linting
```bash
npm run lint
```

### 4. Development Server
```bash
npm run dev
```

### 5. Backend
The backend runs via PM2. To start the entire worker ecosystem:
```bash
pm2 start ecosystem.config.cjs
```
This spawns the API server, state worker, command worker, and OTA rollout engine simultaneously.

## Vercel Deployment

The frontend is fully configured for deployment on Vercel. 

- **Framework:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

### Required Vercel Variables:
You must configure the following in the Vercel project settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

**CRITICAL SECURITY NOTICE:** Do NOT add `SUPABASE_SERVICE_ROLE_KEY` or any MQTT passwords (e.g. `MQTT_PASSWORD`) to the Vercel frontend environment variables. The frontend strictly does not require them and exposing them will compromise the entire system.
