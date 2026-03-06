# Stage 1: Build Vue UI
FROM node:24-slim AS ui-builder
WORKDIR /ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build
# Output: /ui/dist/

# Stage 2: Build backend
FROM node:24-slim AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
# Output: /app/dist/

# Stage 3: Runtime
FROM node:24-slim

RUN apt-get update && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Backend build output
COPY --from=backend-builder /app/dist ./dist

# Vue UI — Fastify serves this as static files
COPY --from=ui-builder /ui/dist ./ui/dist

# Docker socket is bind-mounted at runtime: -v /var/run/docker.sock:/var/run/docker.sock

ENV API_PORT=3200
ENV DRY_RUN=false

EXPOSE 3200

CMD ["node", "dist/main.js"]
