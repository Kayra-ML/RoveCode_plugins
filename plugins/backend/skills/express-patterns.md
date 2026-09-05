# Express / Fastify / Hono Patterns

## Route Organization

Never put all routes in one file. Use a router-per-resource pattern:

```
src/
  routes/
    users.ts       — GET/POST /users, GET/PATCH/DELETE /users/:id
    posts.ts
    auth.ts
  controllers/
    users.ts       — request/response handling only
  services/
    users.ts       — business logic
  repositories/
    users.ts       — database queries
  app.ts           — Express app setup (no routes)
  server.ts        — HTTP server, port binding, graceful shutdown
```

```typescript
// routes/users.ts
import { Router } from "express";
import * as controller from "../controllers/users.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "../schemas/users.js";

export const usersRouter = Router();
usersRouter.get("/", requireAuth, controller.list);
usersRouter.post("/", validate(createUserSchema), controller.create);
usersRouter.get("/:id", requireAuth, controller.getById);
usersRouter.patch("/:id", requireAuth, validate(updateUserSchema), controller.update);
usersRouter.delete("/:id", requireAuth, controller.remove);
```

## Controller / Service / Repository Pattern

```typescript
// controllers/users.ts — only req/res concerns
export const create = asyncHandler(async (req, res) => {
  const user = await userService.create(req.body);
  res.status(201).location(`/users/${user.id}`).json({ data: user });
});

// services/users.ts — business logic, no HTTP knowledge
export async function create(input: CreateUserInput): Promise<User> {
  const existing = await userRepo.findByEmail(input.email);
  if (existing) throw new ConflictError("Email already in use");
  const hashed = await bcrypt.hash(input.password, 12);
  return userRepo.create({ ...input, password: hashed });
}

// repositories/users.ts — DB queries only
export async function create(data: NewUser): Promise<User> {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}
```

## Request Validation with Zod

```typescript
import { z } from "zod";

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: z.string().min(8).max(128),
    role: z.enum(["user", "admin"]).default("user"),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>["body"];
```

## Environment Config Pattern

```typescript
// config/env.ts — validate at startup, fail fast
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
```

## Graceful Shutdown

```typescript
// server.ts
const server = app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await db.destroy();        // close DB connection pool
    await redis.quit();        // close Redis connection
    console.log("Clean shutdown complete");
    process.exit(0);
  });
  // Force exit if cleanup takes too long
  setTimeout(() => { console.error("Forced shutdown"); process.exit(1); }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

## Health Check Endpoint

```typescript
router.get("/health", async (req, res) => {
  const checks = await Promise.allSettled([
    db.query("SELECT 1"),
    redis.ping(),
  ]);
  const healthy = checks.every((c) => c.status === "fulfilled");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks: {
      database: checks[0].status === "fulfilled" ? "ok" : "error",
      redis: checks[1].status === "fulfilled" ? "ok" : "error",
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
```

## Framework Comparison: Express vs Fastify vs Hono

| | Express | Fastify | Hono |
|--|---------|---------|------|
| Speed | Good | Excellent (JSON serialization) | Excellent (edge-optimized) |
| TypeScript | Needs @types | First-class | First-class |
| Ecosystem | Largest | Growing | Small but modern |
| Schema validation | Manual (zod) | Built-in (JSON Schema) | Built-in (zod) |
| Edge/Cloudflare | No | No | Yes (primary target) |
| Middleware | Connect-style | Plugin system | Similar to Express |
| Best for | Legacy, familiarity | Node.js performance APIs | Edge, multi-runtime |

**Express** — use when you need the broadest ecosystem or are adding to existing code.
**Fastify** — use when throughput matters and you're staying on Node.js.
**Hono** — use for Cloudflare Workers, Bun, or any multi-runtime deployment.