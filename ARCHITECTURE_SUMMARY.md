# Smart Irrigation Architecture Summary

## What this system does
Smart Irrigation is an end-to-end platform that monitors farm conditions, automates irrigation, and enables operators to manage farms/devices/users through a web dashboard and WhatsApp.

## Main components
- **Firmware (ESP32)**
  - Reads temperature, humidity, and soil moisture.
  - Controls pump relay locally.
  - Sends telemetry to the backend and polls for irrigation commands.
- **Backend (Node.js/Express + Socket.IO)**
  - Central API and orchestration layer.
  - Manages farms, users, devices, commands, and WhatsApp sessions.
  - Serves real-time updates to the frontend.
- **Frontend (React/Vite)**
  - Operator/admin dashboard for farm, user, device, and WhatsApp management.

## Data architecture
- **PostgreSQL** (relational system-of-record)
  - Users, farms, devices, farm-device mapping
  - Device command queue
  - Irrigation status summary
- **InfluxDB** (time-series/event store)
  - Sensor telemetry history
  - Irrigation event logs
  - Alert events

## Core runtime flows
1. **Telemetry and command polling**
   - Device posts readings to `/api/sensor/ingest`.
   - Backend stores data, evaluates alerts, and returns pending commands.
   - Device executes returned commands (start/stop irrigation).
2. **Operator-triggered irrigation**
   - Frontend calls start/stop irrigation API.
   - Backend enqueues device commands.
   - Device picks commands on next poll cycle.
3. **WhatsApp operations**
   - Backend maintains one WhatsApp session per farm.
   - Session/QR state is pushed to frontend via Socket.IO.
   - Incoming messages can trigger irrigation or AI-assisted responses.

## Operational model
- Health endpoints: `/health/live`, `/health/ready`
- Local infra: `docker-compose.yml` starts Postgres + InfluxDB
- Backend serves compiled frontend assets from `public/`

## Current architecture risks
- Influx measurement naming is inconsistent across writers and queries.
- AI endpoint controller/service contract appears mismatched.
- Frontend references admin endpoints not implemented in backend routes.
- Auth is currently placeholder-grade (base64 token, no signed JWT lifecycle).
- Route authorization is inconsistent across management endpoints.
- No formal migration workflow (runtime `sequelize.sync()` only).

## Recommended next steps
1. Standardize telemetry schema and measurement naming across all services.
2. Align AI API contract between controller and service.
3. Implement proper JWT auth + route-level authorization policy.
4. Introduce Sequelize migrations for controlled schema evolution.
5. Add command acknowledgement lifecycle (`PENDING -> SENT -> EXECUTED/FAILED`).
