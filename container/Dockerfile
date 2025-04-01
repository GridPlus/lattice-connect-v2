FROM node:23 AS builder
WORKDIR /build/connect
COPY src ./src
COPY package.json tsconfig.json ./
RUN npm i && npx tsc --build tsconfig.json && npm prune --production
RUN rm -rf node_modules/typescript

FROM node:23-alpine AS app
WORKDIR /app
COPY --from=builder /build/connect/dist ./dist
COPY --from=builder /build/connect/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
