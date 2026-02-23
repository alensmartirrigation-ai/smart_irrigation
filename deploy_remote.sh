#!/bin/bash

# Exit on error
set -e

# Configuration
KEY_FILE="/Users/jebin.koshy/Desktop/dev01.pem"
SERVER="ec2-3-108-190-207.ap-south-1.compute.amazonaws.com"
USER="ec2-user"
REMOTE_PATH="~/smart_irrigation"

echo "📂 Syncing files to $SERVER..."
rsync -avz -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no" \
    --exclude "node_modules" \
    --exclude "public/*" \
    --exclude "auth_info_baileys" \
    --exclude ".DS_Store" \
    ./ $USER@$SERVER:$REMOTE_PATH

echo "🚀 Running remote deployment..."
ssh -i $KEY_FILE -o StrictHostKeyChecking=no $USER@$SERVER << 'EOF'
    set -e
    cd ~/smart_irrigation
    # Git
    if ! command -v git &> /dev/null; then
        echo "📦 Installing Git..."
        sudo yum install -y git
    fi
    echo "  ✅ Git $(git --version)"

    echo "� Fetching latest changes from git..."
    git pull

    # Node.js 20+
    if ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
        echo "📦 Installing Node.js 20..."
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
        sudo yum install -y nodejs
    fi
    echo "  ✅ Node.js $(node -v)"

    # Docker
    if ! command -v docker &> /dev/null; then
        echo "🐳 Installing Docker..."
        sudo yum install -y docker
        sudo systemctl enable docker
        sudo systemctl start docker
        sudo usermod -aG docker $USER
        echo "  ⚠️  Docker group added. Using sudo for this run."
    fi
    # Ensure Docker is running
    if ! sudo systemctl is-active --quiet docker; then
        sudo systemctl start docker
    fi
    echo "  ✅ Docker $(docker --version 2>/dev/null || echo 'installed')"

    # Docker Compose plugin
    if ! docker compose version &> /dev/null && ! sudo docker compose version &> /dev/null; then
        echo "🐳 Installing Docker Compose plugin..."
        sudo mkdir -p /usr/local/lib/docker/cli-plugins
        COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | head -1 | cut -d'"' -f4)
        sudo curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
            -o /usr/local/lib/docker/cli-plugins/docker-compose
        sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    fi
    echo "  ✅ Docker Compose $(docker compose version 2>/dev/null || sudo docker compose version 2>/dev/null)"

    # PM2
    if ! command -v pm2 &> /dev/null; then
        echo "📦 Installing PM2..."
        sudo npm install -g pm2
    fi
    echo "  ✅ PM2 $(pm2 -v)"

    # ─── Deploy ──────────────────────────────────────────────────────

    # 1. Database & Time-Series (Postgres & InfluxDB)
    echo "🐳 Starting Docker services..."
    sudo docker compose up -d

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

    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  ✅ Deployment complete!"
    echo "  🌐 http://$(curl -s http://169.254.169.254/latest/meta-data/public-hostname):4000"
    echo "═══════════════════════════════════════════════════"
EOF
