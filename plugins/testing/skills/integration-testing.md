# Integration Testing

## What Integration Tests Cover

Integration tests verify that real components work together correctly. Unlike unit tests, they
use a real database, real HTTP stack, and real business logic — no mocks for internal dependencies.
They answer the question: "does the whole slice actually work?"

The scope of an integration test is typically one vertical slice: an HTTP request enters the
router, passes through middleware and handlers, hits the database, and returns a response.

## When Integration Tests Beat Unit Tests

Unit tests cannot catch:
- ORM queries that produce wrong SQL
- Middleware that fires in the wrong order
- Database constraint violations at runtime
- Auth token validation interacting with session state

If a bug would survive full unit test coverage but appear in production, it needs an integration
test.

## Test Database Setup

Never run integration tests against your development or production database. Use a dedicated
test database, either a separate instance or an in-memory option:

```ts
// vitest.setup.ts
import { db } from "./src/db";

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db.destroy();
});
```

For PostgreSQL in CI, spin up a Docker service in your pipeline:
```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_DB: test_db
      POSTGRES_PASSWORD: test
```

## Transaction Rollback for Test Isolation

Wrap each test in a transaction and roll it back afterward. This is faster than truncating
tables and guarantees complete isolation:

```ts
let trx: Knex.Transaction;

beforeEach(async () => {
  trx = await db.transaction();
});

afterEach(async () => {
  await trx.rollback();
});
```

Pass `trx` through your request context so the handler uses the transaction scope. Every test
starts from a clean state without re-seeding.

## Database Seeding Strategies

Seed only what the test needs — not a complete production-like dataset. Two patterns:

**Minimal inline seed:**
```ts
it("returns 404 for unknown user", async () => {
  // no seed needed — absence is the test condition
  const res = await request(app).get("/users/999");
  expect(res.status).toBe(404);
});
```

**Factory functions for reusable fixtures:**
```ts
async function createUser(overrides = {}) {
  return db("users").insert({ name: "Test", email: "t@t.com", ...overrides }).returning("*");
}
```

Avoid a single monolithic seed file shared across all tests — it creates hidden coupling.

## Supertest for HTTP Testing

Supertest binds directly to your Express/Fastify app without starting a real server:

```ts
import request from "supertest";
import { app } from "../src/app";

it("creates a user", async () => {
  const res = await request(app)
    .post("/users")
    .send({ name: "Alice", email: "alice@example.com" })
    .set("Authorization", `Bearer ${token}`);

  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
});
```

## Testing Authentication Flows

Test the full auth flow as an integration test — register, login, token validation, protected
route access, and logout:

```ts
it("rejects requests with expired tokens", async () => {
  const expiredToken = generateToken({ userId: 1, exp: Math.floor(Date.now() / 1000) - 1 });
  const res = await request(app)
    .get("/profile")
    .set("Authorization", `Bearer ${expiredToken}`);
  expect(res.status).toBe(401);
});
```

## Test Environment Configuration

Use a dedicated `.env.test` file and load it in your test setup. Never rely on production
environment variables in tests:

```ts
// vitest.config.ts
export default {
  test: {
    env: loadEnv("test", process.cwd(), ""),
    setupFiles: ["./vitest.setup.ts"],
  },
};
```

## Contract Testing Basics

When your service calls an external API, consumer-driven contract tests (Pact) verify that
the API you expect matches the API the provider actually serves. This catches breaking changes
before they reach production. Use contract tests at service boundaries instead of mocking the
entire HTTP layer — mocks can drift from reality silently.

## Key Principle

Integration tests are slower than unit tests and that is acceptable. Keep them focused on
vertical slices, run them in CI on every pull request, and tolerate a 30–60 second test suite.
The confidence they provide is worth the cost.