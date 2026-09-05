# Docker Patterns

## Multi-Stage Builds

Use separate builder and runtime stages to keep the final image small and free of build tools:

```dockerfile
# Stage 1: builder — installs all deps and builds
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime — only production artifacts
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

The runtime image does not contain TypeScript, source files, or dev dependencies.

## Layer Caching Strategy

Docker caches each layer. Copy files that change least frequently first:

```dockerfile
# GOOD — package files change rarely, source changes often
COPY package.json package-lock.json ./
RUN npm ci                              # cached until package files change
COPY . .                                # only this layer re-runs on source changes
RUN npm run build

# BAD — any source change busts the npm ci cache
COPY . .
RUN npm ci
RUN npm run build
```

## Non-Root User

Running as root inside a container is a security risk. Create and switch to a non-root user:

```dockerfile
# Using the built-in node user (uid 1000) in node images
USER node

# Or create your own
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser
```

## .dockerignore

Always create `.dockerignore` to exclude unnecessary files from the build context:

```
node_modules
dist
.git
.env
.env.*
*.md
coverage
.nyc_output
logs
*.log
.DS_Store
```

A large build context slows every `docker build` — even with layer cache hits.

## Health Checks in Dockerfile

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

Docker Compose and orchestrators (ECS, Kubernetes) use this to determine container readiness. Your `/health` endpoint must return 200 when the app is ready and 503 when it's not.

## Docker Compose for Local Development

```yaml
# docker-compose.yml
services:
  app:
    build:
      context: .
      target: builder          # use builder stage in dev for hot reload
    volumes:
      - .:/app                 # mount source for live reload
      - /app/node_modules      # anonymous volume to prevent host override
    ports:
      - "3000:3000"
    env_file: .env.local
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: myapp
      POSTGRES_PASSWORD: secret
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U myapp"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
```

## Image Size Optimization

```dockerfile
# Use slim or alpine variants
FROM node:20-slim       # ~200MB vs node:20 ~1GB
FROM node:20-alpine     # ~50MB but musl libc can cause issues with native modules

# Remove package manager cache
RUN npm ci --omit=dev && npm cache clean --force

# Use distroless for minimal attack surface (no shell, no package manager)
FROM gcr.io/distroless/nodejs20-debian12 AS final
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
CMD ["dist/server.js"]
```

## Environment Variables in Docker

```dockerfile
# Declare expected env vars (documents the interface, no values)
ENV NODE_ENV=production \
    PORT=3000

# Never bake secrets into images — pass at runtime
# docker run -e DATABASE_URL=... or use --env-file
```

## Container Resource Limits

Set CPU and memory limits to prevent one container from starving others:

```yaml
# docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 256M
```

Without limits, a memory leak in one service can OOM-kill other services on the same host.