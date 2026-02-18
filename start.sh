#!/bin/bash

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

echo "🚀 Starting Smart Irrigation System..."

# Start the server in the background
npm run dev &
SERVER_PID=$!

# Wait a moment for server to initialize
sleep 2

# Start the Cloudflare tunnel if configured
if command -v cloudflared &> /dev/null; then
    echo "☁️ Starting Cloudflare Tunnel..."
    cloudflared tunnel --url http://localhost:${PORT:-4000}
else
    echo "⚠️ cloudflared not found. Tunnel not started."
    wait $SERVER_PID
fi
