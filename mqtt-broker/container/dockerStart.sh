#/bin/bash

docker run \
  --ulimit nofile=262144:262144 \
  -m "8G" --memory-swap "-1" \
  --rm -it \
  --init \
  -h mqtt-broker \
  -p 1883:1883 \
  -p 15672:15672 \
  --env-file ../.env \
  --name "mqtt-broker" \
  mqtt-broker
