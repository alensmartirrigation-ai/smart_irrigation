# Smart Irrigation Monorepo

This repository is split into independent layers:

- `backend/`: Node.js API, business logic, integrations, and backend runtime config.
- `frontend/`: Vite + React web application.

## Backend
- Location: `/Users/jebin.koshy/Desktop/smart_irrigation/backend`
- Run:
  ```bash
  cd backend
  npm ci
  npm run dev
  ```
- Verify:
  ```bash
  cd backend
  npm run verify
  ```

## Frontend
- Location: `/Users/jebin.koshy/Desktop/smart_irrigation/frontend`
- Run:
  ```bash
  cd frontend
  npm ci
  npm run dev
  ```
- Build:
  ```bash
  cd frontend
  npm run build
  ```

## Firmware
- Location: `/Users/jebin.koshy/Desktop/smart_irrigation/firmware/main`
- Device: ESP32
- Libraries required:
  - `DHT sensor library` by Adafruit
  - `ArduinoJson` by Benoit Blanchon
- Description: Reads temperature, humidity, and soil moisture, controls a relay based on soil levels, and pushes data to the backend API every 5 seconds.
