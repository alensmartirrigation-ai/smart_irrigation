#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$SCRIPT_DIR/.env"
DEFAULT_ENV_FILE="$SCRIPT_DIR/config/db.env"

load_env() {
  local file="$1"
  echo "Loading environment from $file"
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

if [ -f "$ENV_FILE" ]; then
  load_env "$ENV_FILE"
elif [ -f "$DEFAULT_ENV_FILE" ]; then
  load_env "$DEFAULT_ENV_FILE"
else
  echo "No .env or config/db.env found; unable to continue." >&2
  exit 1
fi

NODE_ENV=${NODE_ENV:-production}
export NODE_ENV

ensure_docker_influx() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker CLI not available; please run InfluxDB manually and provide INFLUX_* env vars." >&2
    return
  fi

  local container_name="smart-irrigation-influx"
  local existing_container
  existing_container=$(docker ps -a -q --filter "name=$container_name")

  if [ -z "$existing_container" ]; then
    echo "Creating InfluxDB container $container_name"
    docker run -d \
      --name "$container_name" \
      -p 8086:8086 \
      -e DOCKER_INFLUXDB_INIT_MODE=setup \
      -e DOCKER_INFLUXDB_INIT_USERNAME="${INFLUXDB_INIT_USERNAME:-admin}" \
      -e DOCKER_INFLUXDB_INIT_PASSWORD="${INFLUXDB_INIT_PASSWORD:-adminpass}" \
      -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN="${INFLUXDB_INIT_ADMIN_TOKEN:-$INFLUX_TOKEN}" \
      -e DOCKER_INFLUXDB_INIT_ORG="${INFLUXDB_INIT_ORG:-$INFLUX_ORG}" \
      -e DOCKER_INFLUXDB_INIT_BUCKET="${INFLUXDB_INIT_BUCKET:-$INFLUX_BUCKET}" \
      -e DOCKER_INFLUXDB_INIT_RETENTION="${INFLUXDB_INIT_RETENTION:-30d}" \
      -e INFLUXDB_REPORTING_DISABLED="${INFLUXDB_REPORTING_DISABLED:-true}" \
      influxdb:2.8 >/dev/null
  else
    local container_status
    container_status=$(docker inspect -f '{{.State.Status}}' "$existing_container")
    if [ "$container_status" != "running" ]; then
      echo "Starting existing InfluxDB container"
      docker start "$existing_container" >/dev/null
    else
      echo "InfluxDB container already running"
    fi
  fi

  echo "Waiting for InfluxDB to become healthy..."
  until curl -fs "$INFLUX_URL/health" >/dev/null 2>&1; do
    printf '.'
    sleep 1
  done
  echo " done"
}

get_org_id() {
  curl -s -H "Authorization: Token $INFLUX_TOKEN" \
    "$INFLUX_URL/api/v2/orgs?org=$INFLUX_ORG" | \
    python3 - <<'PY'
import json,sys
text=sys.stdin.read()
data=json.loads(text or '{}')
orgs=data.get('orgs', [])
print(orgs[0]['id'] if orgs else '')
PY
}

ensure_bucket() {
  local org_id
  org_id=$(get_org_id)
  if [ -z "$org_id" ]; then
    echo "Unable to resolve Influx org id for $INFLUX_ORG" >&2
    exit 1
  fi

  local bucket_exists
  bucket_exists=$(curl -s -H "Authorization: Token $INFLUX_TOKEN" \
    "$INFLUX_URL/api/v2/buckets?name=$INFLUX_BUCKET" | \
    python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
buckets=data.get('buckets', [])
print('1' if buckets else '0')
PY
  )

  if [ "$bucket_exists" = "0" ]; then
    echo "Creating bucket $INFLUX_BUCKET"
    curl -s -X POST "$INFLUX_URL/api/v2/buckets" \
      -H "Authorization: Token $INFLUX_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"$INFLUX_BUCKET\", \"orgID\": \"$org_id\"}" >/dev/null
  else
    echo "Bucket $INFLUX_BUCKET already exists"
  fi
}

seed_marker="$SCRIPT_DIR/.influx-seeded"
seed_data() {
  if [ -f "$seed_marker" ]; then
    echo "Seed data already inserted; skipping."
    return
  fi

  echo "Seeding InfluxDB with sample sensor data"
  local payload
  payload="sensor_readings,farm_id=farm-01,sensor_id=sensor-01 temperature=33.2,humidity=44.1,soil_moisture=28.5\n"
  payload+="sensor_readings,farm_id=farm-01,sensor_id=sensor-02 temperature=31.0,humidity=47.0,soil_moisture=34.5\n"
  payload+="sensor_readings,farm_id=farm-01,sensor_id=sensor-03 temperature=35.8,humidity=28.3,soil_moisture=30.2"

  curl -s -X POST "${INFLUX_URL}/api/v2/write?org=${INFLUX_ORG}&bucket=${INFLUX_BUCKET}&precision=s" \
    -H "Authorization: Token $INFLUX_TOKEN" \
    --data-binary "$payload" >/dev/null

  touch "$seed_marker"
  echo "Seed payload posted"
}

ensure_docker_influx

if [ -n "${INFLUX_URL:-}" ] && [ -n "${INFLUX_TOKEN:-}" ] && [ -n "${INFLUX_ORG:-}" ] && [ -n "${INFLUX_BUCKET:-}" ]; then
  ensure_bucket
  seed_data
else
  echo "Influx env vars missing; skipping bucket creation/seed." >&2
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies before starting..."
  npm install
fi

# ─── Start the Node server in the background ───
APP_PORT=${PORT:-4000}
echo "Starting server on port $APP_PORT ..."
npm run start &
SERVER_PID=$!

# Wait for the server to become reachable
echo "Waiting for server to become reachable on port $APP_PORT ..."
until curl -fs "http://localhost:$APP_PORT/" >/dev/null 2>&1; do
  printf '.'
  sleep 1
done
echo " server is up (PID $SERVER_PID)"

# ─── Create a localtunnel to expose the server publicly ───
echo ""
echo "Opening localtunnel on port $APP_PORT ..."
TUNNEL_LOG=$(mktemp)

npx -y localtunnel --port "$APP_PORT" > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Wait for localtunnel to print the URL (up to 30 s)
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -oE 'https?://[^ ]+' "$TUNNEL_LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -n "$TUNNEL_URL" ]; then
  echo ""
  echo "========================================"
  echo "  🌐  PUBLIC TUNNEL URL"
  echo "  $TUNNEL_URL"
  echo "========================================"
  echo ""
else
  echo "⚠️  Could not detect tunnel URL within 30 s. Check $TUNNEL_LOG for details." >&2
fi

# ─── Cleanup on exit ───
cleanup() {
  echo "Shutting down..."
  kill "$TUNNEL_PID" 2>/dev/null
  kill "$SERVER_PID" 2>/dev/null
  rm -f "$TUNNEL_LOG"
  wait "$SERVER_PID" 2>/dev/null
  wait "$TUNNEL_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# Keep the script alive until both processes exit
wait "$SERVER_PID"
