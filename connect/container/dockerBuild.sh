#!/bin/bash
set -e
cd "$(dirname "$0")"

VERSION=$(node -p "require('../package.json').version")

docker build \
-f Dockerfile \
../ \
-t lattice-connect-v2:"$VERSION" \
-t lattice-connect-v2:latest
