# Smart Irrigation Backend

A production-oriented Express API for smart irrigation telemetry, farm context summaries, and alert visibility, backed by InfluxDB.

## What Changed
- Removed outdated startup/deploy/process-manager scripts and stale config artifacts.
- Added structured app bootstrap: `src/app.js` + `src/index.js`.
- Added strict environment validation on startup.
- Added liveness/readiness endpoints and improved graceful shutdown.
- Standardized Docker packaging and CI verification workflow.

## Architecture
- `src/index.js`: process/bootstrap, env loading, shutdown handling.
- `src/app.js`: HTTP app, middleware, routes, error handling.
- `src/config/`: runtime config and Influx client.
- `src/controller/`: transport-layer request/response handling.
- `src/services/`: business logic and Influx queries/writes.
- `src/validators/`: payload contracts (Zod).

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
