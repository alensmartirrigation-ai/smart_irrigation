# Smart Irrigation Backend

A production-oriented Express API for smart irrigation telemetry, farm context summaries, and alert visibility, backed by InfluxDB.

## What Changed
- Removed outdated startup/deploy/process-manager scripts and stale config artifacts.
- Added explicit layered structure with `app` and `web` modules.
- Added strict environment validation on startup.
- Added liveness/readiness endpoints and improved graceful shutdown.
- Standardized Docker packaging and CI verification workflow.

## Architecture
- `src/index.js`: root entrypoint.
- `src/web/index.js`: web runtime bootstrap and shutdown handling.
- `src/web/app.js`: Express app wiring.
- `src/web/controllers|routes|middleware`: HTTP transport layer.
- `src/app/services|validators|utils`: application layer (business logic + contracts).
- `src/config/`: runtime config and infrastructure clients.

## API Endpoints
- `GET /health/live`
- `GET /health/ready`
- `POST /api/sensor/ingest`
- `GET /api/sensor/farm/:farmId`
- `GET /api/farm/:farmId/context`
- `GET /api/alerts/active?farm_id=<id>`
- `POST /api/irrigation`
- `GET /api/irrigation/:farmId`

## Local Development
1. Install dependencies:
   ```bash
   npm ci
   ```
2. Configure environment:
   ```bash
   cp .env.example .env
   ```
3. Start the service:
   ```bash
   npm run dev
   ```

## Quality Checks
- Smoke syntax checks:
  ```bash
  npm run test:smoke
  ```
- Full verification:
  ```bash
  npm run verify
  ```

## Docker
```bash
docker build -t smart-irrigation .
docker run --env-file .env -p 4000:4000 smart-irrigation
```

## Security Notes
- Do not commit `.env` or secrets.
- Restrict Influx token scope to required bucket/org operations.
- Use `NODE_ENV=production` in deployed environments.
