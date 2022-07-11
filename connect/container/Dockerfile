FROM ubuntu:22.04 AS base

RUN apt update && \
    apt install -y curl

RUN curl -sL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs

FROM base AS builder
WORKDIR /build/connect
ADD src /build/connect/src
ADD package.json /build/connect
ADD tsconfig.json /build/connect

WORKDIR /build/connect
RUN npm i && npx tsc --build tsconfig.json && npm prune --production
RUN rm -rf node_modules/typescript

FROM node:16-alpine AS app
COPY --from=builder /build/connect/dist /app/dist
COPY --from=builder /build/connect/node_modules /app/node_modules
CMD NODE_ENV=production node /app/dist/index.js
