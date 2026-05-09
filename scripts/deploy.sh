#!/bin/bash

# Deployment script for lead-management app
# Handles stopping old container, cleaning up, and starting new one

set -e

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying Lead Management App${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create .env file with the following variables:"
    echo "NEXT_PUBLIC_POCKETBASE_URL=https://amazoncrm-db.codix.site"
    echo "POCKETBASE_ADMIN_EMAIL=your-admin-email@example.com"
    echo "POCKETBASE_ADMIN_PASSWORD=your-admin-password"
    echo "APP_PORT=8082"
    echo "DOCKER_IMAGE=afkerahmed/lead-management-app:latest"
    exit 1
fi

echo -e "${BLUE}📋 Checking for existing container...${NC}"

# Stop and remove existing container
CONTAINER_NAME="lead-management-app"
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${BLUE}🛑 Stopping and removing existing container...${NC}"
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
    echo -e "${GREEN}✅ Old container removed${NC}"
else
    echo -e "${BLUE}ℹ️  No existing container found${NC}"
fi

echo -e "${BLUE}📦 Starting new container...${NC}"

# Start the new container
docker compose --env-file .env up -d --no-build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Container started successfully${NC}"
    echo -e "${BLUE}📋 Container status:${NC}"
    docker compose ps
    echo ""
    echo -e "${GREEN}🎉 Deployment complete!${NC}"
    echo -e "Access the app at: http://localhost:8082"
else
    echo -e "${RED}❌ Failed to start container${NC}"
    exit 1
fi
