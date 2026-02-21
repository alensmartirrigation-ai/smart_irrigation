#!/bin/bash

# Configuration
KEY_FILE="/Users/jebin.koshy/Desktop/dev01.pem"
SERVER="20.197.17.201"
USER="Jebin"
REMOTE_PATH="~/smart_irrigation"

echo "📂 Syncing files to $SERVER..."
rsync -avz -e "ssh -i $KEY_FILE" \
    --exclude "node_modules" \
    --exclude ".git" \
    --exclude "frontend/dist" \
    --exclude "public/*" \
    ./ $USER@$SERVER:$REMOTE_PATH

echo "🚀 Running remote deployment..."
ssh -i $KEY_FILE $USER@$SERVER << 'EOF'
    set -e
    cd ~/smart_irrigation
    
    # 1. Database & Time-Series (Postgres & InfluxDB)
    echo "🐳 Starting Docker services..."
    docker compose up -d
    
    # 2. Frontend Build
    echo "📦 Building Frontend..."
    cd frontend
    npm install
    npm run build
    cd ..
    
    # 3. Backend Setup
    echo "🔙 Setting up Backend..."
    mkdir -p public
    rm -rf public/*
    cp -r frontend/dist/* public/
    
    cd backend
    npm install
    
    # 4. Process Management
    echo "🔄 (Re)Starting PM2 process..."
    if pm2 list | grep -q "smart-irrigation"; then
        pm2 restart smart-irrigation
    else
        pm2 start index.js --name "smart-irrigation"
    fi
    pm2 save
    
    echo "✅ Deployment complete!"
EOF
