#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Docker services...${NC}"
yarn docker:up

# Wait for containers to be ready
echo -e "${YELLOW}Waiting for services to start up...${NC}"
sleep 10

# Check if containers are running
echo -e "${YELLOW}Checking container status...${NC}"
MQTT_STATUS=$(docker inspect -f {{.State.Status}} lattice_mqtt)
APP_STATUS=$(docker inspect -f {{.State.Status}} lattice_app)

if [ "$MQTT_STATUS" == "running" ] && [ "$APP_STATUS" == "running" ]; then
  echo -e "${GREEN}Both containers are running${NC}"
else
  echo -e "${RED}One or more containers are not running${NC}"
  echo -e "MQTT status: $MQTT_STATUS"
  echo -e "App status: $APP_STATUS"
  exit 1
fi

# Check MQTT broker health
echo -e "${YELLOW}Checking MQTT broker health...${NC}"
MQTT_HEALTH=$(docker inspect -f {{.State.Health.Status}} lattice_mqtt)
if [ "$MQTT_HEALTH" == "healthy" ]; then
  echo -e "${GREEN}MQTT broker is healthy${NC}"
else
  echo -e "${RED}MQTT broker is not healthy: $MQTT_HEALTH${NC}"
  exit 1
fi

# Test the connection between services
echo -e "${YELLOW}Testing API endpoint...${NC}"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/status || echo "failed")

if [ "$RESPONSE" == "200" ]; then
  echo -e "${GREEN}API connection successful${NC}"
else
  echo -e "${RED}API connection failed: $RESPONSE${NC}"
fi

echo -e "${YELLOW}All tests completed.${NC}"
echo -e "${YELLOW}Docker logs are available with: yarn docker:logs${NC}"
echo -e "${YELLOW}To stop containers run: yarn docker:down${NC}" 