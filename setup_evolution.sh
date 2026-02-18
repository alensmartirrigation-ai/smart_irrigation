#!/bin/bash

# --- Configuration ---
EVO_DIR="$HOME/evolution-api"
API_PORT=8080
API_KEY="8651c188-cf60-4761-9e55-4c911094dcab"
DB_PASS="evolution_secret_pass_123"

# --- Fresh Deployment Logic ---
if [[ "$1" == "--fresh" ]]; then
  echo "🧹 Performing deep cleanup for fresh deployment..."
  if [ -d "$EVO_DIR" ]; then
    cd "$EVO_DIR"
    docker compose down -v 2>/dev/null || true
    rm -rf "$EVO_DIR"
  fi
  echo "✅ Cleanup complete."
fi

echo "🚀 Starting Evolution API v2 Deployment (Stable)..."

# 1. Create directory structure
mkdir -p "$EVO_DIR"
cd "$EVO_DIR"

# 2. Generate docker-compose.yml
echo "📦 Generating docker-compose.yml..."
cat <<EOF > docker-compose.yml
services:
  evolution_db:
    image: postgres:15-alpine
    container_name: evolution_db
    restart: always
    environment:
      POSTGRES_DB: evolution
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - evolution_db_data:/var/lib/postgresql/data
    networks:
      - evolution_net

  evolution_redis:
    image: redis:alpine
    container_name: evolution_redis
    restart: always
    networks:
      - evolution_net

  evolution_api:
    image: atendai/evolution-api:v2.1.1
    container_name: evolution_api
    restart: always
    ports:
      - "${API_PORT}:8080"
    environment:
      - SERVER_URL=http://20.197.17.201:${API_PORT}
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=${API_KEY}
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evolution:${DB_PASS}@evolution_db:5432/evolution?schema=public
      - DATABASE_CONNECTION_CLIENT_NAME=evolution_api
      - RECONNECT_SESSION_ON_CLOSE=false
      - CACHE_REDIS_ENABLED=false
      - CACHE_REDIS_URI=redis://evolution_redis:6379
      - CACHE_REDIS_PREFIX=EVO
      - DELAYS_SEND_MESSAGE=1000
    depends_on:
      - evolution_db
      - evolution_redis
    networks:
      - evolution_net

networks:
  evolution_net:
    driver: bridge

volumes:
  evolution_db_data:
EOF

# 3. Deploy
echo "🚢 Deploying containers..."
if docker compose version >/dev/null 2>&1; then
  docker compose up -d
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d
else
  echo "❌ Error: Docker Compose is not installed." >&2
  exit 1
fi

sleep 10

# 4. Create default instance
echo "🤖 Creating default instance 'smart_irrigation_bot'..."
curl -s -X POST "http://localhost:${API_PORT}/instance/create" \
-H 'Content-Type: application/json' \
-H "apikey: ${API_KEY}" \
-d '{
  "instanceName": "smart_irrigation_bot",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS"
}'

echo ""
echo "===================================================="
echo " ✅ Evolution API v2 Freshly Deployed!"
echo "===================================================="
echo " 🔗 API URL: http://20.197.17.201:${API_PORT}"
echo " 🔑 API Key: ${API_KEY}"
echo "===================================================="
echo " Next steps:"
echo " 1. Access http://20.197.17.201:8080/instance/connect/smart_irrigation_bot"
echo " 2. Scan the QR code to link your phone."
echo " 3. Backend is already pre-configured to use this."
echo "===================================================="
