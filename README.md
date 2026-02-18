# Smart Irrigation Backend

Production-ready Node.js API that ingests IoT farm sensor data into InfluxDB, evaluates alerts, and exposes a WhatsApp + OpenAI interface for farm status delivery.

## Stack & Features
- Node.js (latest LTS) with Express.js and Zod validation
- InfluxDB v2 client with `sensor_readings` and `farm_alerts` measurements in bucket `farm_sensors`
- WhatsApp Business Cloud webhook + Axios-based sender with 24-hour rate limiting
- OpenAI `gpt-4o-mini` (configurable) to craft human-friendly replies from pre-formatted sensor context
- Winston + express-winston logging, centralized error handling, and modular services

## Getting Started
1. **Install dependencies** (run locally when online):
   ```bash
   npm install
   ```
2. **Create your `.env`** (see `.env.example`). All secrets (Influx, WhatsApp, OpenAI) must be provided.
3. **Run in development**:
   ```bash
   npm run dev
   ```
4. **Run in production**:
   ```bash
   npm run start
   ```

> The app automatically flushes the InfluxDB write client on shutdown, logs requests/errors, and enforces data validation via Zod.

## API Reference

### POST `/api/sensor/ingest`
- Body: JSON with either a single reading or `{ "readings": [ {...}, ... ] }`.
- Required keys: `farm_id`, `sensor_id`, `temperature`, `humidity`, `soil_moisture`. Optional `timestamp` (ISO string or epoch ms). Example payload:
  ```json
  {
    "farm_id": "farm-01",
    "sensor_id": "sensor-a1",
    "temperature": 31.2,
    "humidity": 48.4,
    "soil_moisture": 29.1,
    "timestamp": "2026-02-17T15:00:00Z"
  }
  ```
- Validated with Zod; invalid payloads return HTTP 400. Batch ingestion is supported and flushed efficiently.

### GET `/api/farm/:farmId/context`
- Returns latest readings, 24h averages, short trend (based on 6h vs prior 6h), and active alerts.
- Depends on Influx query results (last 30d range for latest and averages).

### GET `/api/alerts/active` (optional `farm_id` query)
- Lists active alerts stored in `farm_alerts` measurement. Filters by `farm_id` when provided.

### WhatsApp Webhook `/api/whatsapp/webhook`
- **GET**: WhatsApp verifies the webhook via `hub.mode`, `hub.challenge`, and `hub.verify_token`. The verified token must match `WHATSAPP_VERIFY_TOKEN` in your `.env`.
- **POST**: Receives inbound messages. Keyword check (`status` or `farm status`) triggers context lookup, GPT prompt crafting, and WhatsApp reply. The user is reminded to include the farm identifier (e.g., `status farm-01`).
- Replies are rate-limited to 1 message per phone number per 24 hours to respect the WhatsApp 24-hour rule.

## Postman Import Notes
1. Create an environment with variables: `baseUrl` (e.g., `http://localhost:4000`) and `farmId` (e.g., `farm-01`).
2. Add requests:
   - **POST {{baseUrl}}/api/sensor/ingest** with JSON body like above.
   - **GET {{baseUrl}}/api/farm/{{farmId}}/context** to read summaries.
   - **GET {{baseUrl}}/api/alerts/active?farm_id={{farmId}}** for alerts.
3. Use Postman's collection runner or monitors to simulate periodic ingestion.

## InfluxDB Setup
1. Create bucket named `farm_sensors` (retention can be set to 30 days depending on storage).
2. Configure your Influx organization, token with write/query permissions, and update `.env`:
   - `INFLUX_URL`
   - `INFLUX_TOKEN`
   - `INFLUX_ORG`
   - `INFLUX_BUCKET=farm_sensors`
3. Measurements created automatically: `sensor_readings` (tags `farm_id`, `sensor_id`; fields `temperature`, `humidity`, `soil_moisture`) and `farm_alerts` (records threshold breaches with tags `farm_id`, `sensor_id`, `alert_type`, `status`).

## WhatsApp Webhook Setup
1. Configure WhatsApp Business Cloud using the webhook URL `<your-host>/api/whatsapp/webhook`.
2. Provide `WHATSAPP_VERIFY_TOKEN` in `.env` and enter the same token when WhatsApp requests verification.
3. Use `WHATSAPP_API_URL` in `.env` pointing to `https://graph.facebook.com/v21.0/PAGE_OR_PHONE_ID/messages`.
4. On inbound `status` requests, the handler calls `/api/farm/:farmId/context`, formats the data, runs an OpenAI chat completion (prompt pre-formatted; no raw Influx rows), and sends the result. Active alerts are included in the narrative.
5. Because WhatsApp only allows messaging a user once per 24 hours outside a session, the backend stores the timestamp of the last outbound message per `from` number and skips duplicates within 24h (logged via Winston).

## OpenAI & Messaging
- The OpenAI helper (`src/services/openaiService.js`) pulls the pre-formatted context summary and asks `gpt-4o-mini` (configurable via `OPENAI_MODEL`).
- Responses guide the WhatsApp reply. If OpenAI fails, a fallback narrative is sent.

## Docker (optional)
Build and run:
```bash
docker build -t smart-irrigation .
docker run -p 4000:4000 --env-file .env smart-irrigation
```
The Dockerfile uses Node 24 Alpine, installs production deps, and exposes port 4000.

## Monitoring & Logs
- Winston logs (infos for ingests, alerts, WhatsApp sends; errors for failures).
- Express-winston logs HTTP requests/responses and errors. Adjust `LOG_LEVEL` in `.env` for more/less verbosity.

## Notes
- Thresholds (soil moisture < 32%, temperature > 37°C, humidity < 30% or > 85%) are hard-coded for MVP in `src/services/alertService.js`.
- Inbound WhatsApp commands must provide a farm identifier (e.g., `status farm-01`), unless `DEFAULT_FARM_ID` is defined in `.env`.
- Ensure `OPENAI_API_KEY` and WhatsApp credentials are protected; do not commit secrets.
