#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
EVO_DIR="$HOME/evolution-api"
API_PORT=8080
API_KEY="8651c188-cf60-4761-9e55-4c911094dcab"
DB_PASS="evolution_secret_pass_123"

echo "🚀 Starting Evolution API v2 Deployment..."

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
      - SERVER_URL=http://localhost:${API_PORT}
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=${API_KEY}
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evolution:${DB_PASS}@evolution_db:5432/evolution?schema=public
      - DATABASE_CONNECTION_CLIENT_NAME=evolution_api
      - CACHE_REDIS_ENABLED=true
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

echo ""
echo "===================================================="
echo " ✅ Evolution API v2 is deploying!"
echo "===================================================="
echo " 🔗 API URL: http://$(curl -s ifconfig.me):${API_PORT}"
echo " 🔑 API Key: ${API_KEY}"
echo "===================================================="
echo " Next steps:"
echo " 1. Access the URL above to verify the API is up."
echo " 2. Use the API Key to create your first instance."
echo " 3. Update your smart_irrigation .env with these values."
echo "===================================================="
