#!/bin/bash

docker run \
  --rm -it \
  --init \
  -h lattice-connect \
  --env-file ../.env \
  --env-file ../.direct.env \
  -p 8080:8080 \
  --name "lattice-connect" \
  lattice-connect-v2:latest
