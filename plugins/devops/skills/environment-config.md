# Environment Configuration

## The 12-Factor App Config Principle

Factor III of the 12-factor app: store config in the environment, not in code. Config is everything that varies between deployments (dev, staging, prod). Code does not.

This means:
- No hardcoded URLs, ports, credentials, or feature flags in source code
- No config files committed with environment-specific values
- All config injected via environment variables at runtime

## .env vs Environment Variables

`.env` files are a convenience for local development, not a config system:

- In development: use `.env.local` loaded by your framework or `dotenv`
- In CI: inject via CI secrets (GitHub Actions secrets, etc.)
- In production: inject via platform config (fly.io secrets, AWS Parameter Store, Heroku config vars)

Never use `.env` in production containers — it couples config to the image.

```typescript
// Load .env only in development
import { config } from "dotenv";
if (process.env.NODE_ENV !== "production") {
  config({ path: ".env.local" });
}
```

## .env.example Pattern

Commit a `.env.example` with all variable names and safe placeholder values. Never commit `.env`:

```bash
# .env.example — commit this
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://localhost:5432/myapp_dev
JWT_SECRET=change-me-in-production-min-32-chars
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_...
SENTRY_DSN=

# .gitignore — block all .env files
.env
.env.*
!.env.example
```

## Config Validation at Startup (Fail Fast)

Validate all required environment variables before the server starts. A missing `DATABASE_URL` should crash immediately with a clear message, not fail silently on first request:

```typescript
// src/config/env.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV:      z.enum(["development", "test", "production"]).default("development"),
  PORT:          z.coerce.number().int().positive().default(3000),
  DATABASE_URL:  z.string().url("DATABASE_URL must be a valid connection string"),
  JWT_SECRET:    z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  REDIS_URL:     z.string().url().optional(),
  LOG_LEVEL:     z.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGIN:   z.string().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n[CONFIG ERROR] Invalid environment variables:");
  const errors = parsed.error.flatten().fieldErrors;
  for (const [key, messages] of Object.entries(errors)) {
    console.error(`  ${key}: ${messages?.join(", ")}`);
  }
  console.error("\nFix the above errors and restart.\n");
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
```

Import `env` everywhere instead of `process.env` — you get autocomplete and type safety.

## Environment-Specific Config

```typescript
// src/config/index.ts
import { env } from "./env.js";

export const config = {
  isDev:  env.NODE_ENV === "development",
  isProd: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",

  server: {
    port: env.PORT,
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  },

  db: {
    url: env.DATABASE_URL,
    poolSize: env.NODE_ENV === "production" ? 20 : 5,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.NODE_ENV === "production" ? "15m" : "1d",
  },

  logging: {
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV !== "production",
  },
} as const;
```

## Feature Flags

Simple boolean env var feature flags:

```typescript
export const features = {
  newCheckout:     env.FEATURE_NEW_CHECKOUT === "true",
  betaDashboard:   env.FEATURE_BETA_DASHBOARD === "true",
  emailVerification: env.NODE_ENV === "production",  // always on in prod
} as const;

// Usage
if (features.newCheckout) {
  return res.redirect("/checkout/v2");
}
```

For more complex feature flags (percentage rollouts, user targeting), use LaunchDarkly, Unleash, or Flagsmith.

## Config Injection in Docker

```dockerfile
# Declare expected vars — no default values for secrets
ENV NODE_ENV=production \
    PORT=3000
# DATABASE_URL, JWT_SECRET etc. are injected at runtime, not baked in

# docker run
docker run \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -p 3000:3000 \
  myapp:latest

# docker-compose: use env_file for local dev
services:
  app:
    env_file: .env.local
```

## NODE_ENV Usage and Pitfalls

`NODE_ENV` is overloaded — many libraries change behavior based on it. Stick to the three standard values:

- `development` — verbose logging, pretty errors, hot reload
- `test` — disable external calls, use in-memory stores, faster bcrypt rounds
- `production` — optimized, structured logging, real external services

**Pitfall**: don't add custom values like `staging`. Many libraries only check `NODE_ENV === 'production'` and will treat `staging` as development. Instead, use a separate `APP_ENV` variable for deployment-stage logic:

```typescript
// Use NODE_ENV for library behavior
// Use APP_ENV for your own deployment-stage logic
const appEnv = z.enum(["local", "staging", "production"]).parse(process.env.APP_ENV ?? "local");
```