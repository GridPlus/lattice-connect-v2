#!/bin/bash
set -e
cd "$(dirname "$0")"

VERSION=$(grep -m1 '"version"' ../package.json | cut -d'"' -f4)

docker build \
-f Dockerfile \
../ \
-t lattice-connect-v2:"$VERSION" \
-t lattice-connect-v2:latest
