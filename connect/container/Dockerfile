FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS base

FROM base AS builder
WORKDIR /build
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npx tsc && npm prune --omit=dev

FROM base AS app
# The app never runs a package manager, and the bundled ones carry their own CVEs.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
COPY --from=builder /build/package.json ./
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
ENV NODE_ENV=production
USER node
CMD ["node", "dist/direct.js"]
