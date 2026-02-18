#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting deployment..."

# 1. Build Frontend
echo "📦 Building Frontend..."
cd frontend
npm install
npm run build
cd ..

# 2. Update Public Directory
echo "📂 Updating public assets..."
mkdir -p public
rm -rf public/*
cp -r frontend/dist/* public/

# 3. Start Backend
echo "🔙 Starting Backend..."
cd backend
npm install

# Check if pm2 is installed
if command -v pm2 &> /dev/null; then
    echo "Using PM2 to start application..."
    # Check if process already exists
    if pm2 list | grep -q "smart-irrigation"; then
        pm2 restart smart-irrigation
    else
        pm2 start index.js --name "smart-irrigation"
    fi
    pm2 save
    echo "✅ Application started with PM2"
else
    echo "PM2 not found. Starting with node (process will be attached)..."
    echo "To run in background, install pm2: npm install -g pm2"
    npm start
fi
