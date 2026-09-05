# Database Migrations

## Zero-Downtime Migration Strategies

The golden rule: migrations must be backward-compatible with the currently running code. Deploy migrations before code, not simultaneously.

**Adding a column (safe)**:
```sql
-- Step 1: add column nullable (no lock, instant)
ALTER TABLE users ADD COLUMN phone TEXT;

-- Step 2 (later, after code handles NULL): backfill
UPDATE users SET phone = '' WHERE phone IS NULL;

-- Step 3 (later, after backfill complete): add NOT NULL constraint
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
-- Or safer on large tables:
ALTER TABLE users ADD CONSTRAINT users_phone_not_null CHECK (phone IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_phone_not_null; -- validates without full lock
```

**Never rename a column** — it breaks running code instantly. Instead: add new column → copy data → update code → drop old column across multiple deploys.

## The Expand/Contract Pattern

Safe schema changes follow three phases:

```
Phase 1 — EXPAND: add new column/table while keeping old one
  ALTER TABLE users ADD COLUMN username TEXT;

Phase 2 — MIGRATE: backfill data, update code to write to both
  UPDATE users SET username = email WHERE username IS NULL;
  -- code now reads from username, writes to both email + username

Phase 3 — CONTRACT: remove old column after all code uses new one
  ALTER TABLE users DROP COLUMN email; -- only after all readers migrated
```

Each phase is a separate deployment. This allows rollback at any phase.

## Migration Tools

**Drizzle Kit** (`drizzle-kit push` / `drizzle-kit generate`):
```typescript
// drizzle.config.ts
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  driver: "pg",
  dbCredentials: { connectionString: process.env.DATABASE_URL! },
};
```

**Prisma Migrate**:
```bash
prisma migrate dev --name add_phone_to_users   # dev: auto-generates + applies
prisma migrate deploy                            # prod: applies pending migrations
```

**Flyway / Liquibase**: file-based, framework-agnostic, strong for teams with DBAs. Files are never modified after creation.

**Rule**: migration files are immutable once committed. Never edit an applied migration — create a new one.

## Up/Down Migrations

Always write a `down` migration:
```sql
-- up: 0023_add_phone_to_users.sql
ALTER TABLE users ADD COLUMN phone TEXT;

-- down: 0023_add_phone_to_users.down.sql
ALTER TABLE users DROP COLUMN phone;
```

Test down migrations in CI — they're useless if broken when you need them.

## Migration Testing in CI

```yaml
# GitHub Actions
- name: Run migrations
  run: drizzle-kit push --config drizzle.config.ts
  env:
    DATABASE_URL: postgresql://test:test@localhost:5432/testdb

- name: Run tests
  run: bun test

- name: Test rollback
  run: drizzle-kit drop --config drizzle.config.ts
```

## Deployment Order

Correct order prevents downtime:
```
1. Deploy database migration (backward-compatible with current code)
2. Verify migration succeeded (check logs, row counts)
3. Deploy new application code (now uses new schema)
4. Verify application health checks pass
5. (later) Deploy cleanup migration to remove old columns
```

Never deploy code and migration simultaneously. Never migrate after code in production.

## Large Table Alterations

`ALTER TABLE` on a table with millions of rows acquires a lock and can take minutes. Avoid:

```sql
-- DANGEROUS on large tables (full table lock)
ALTER TABLE events ADD COLUMN processed BOOLEAN NOT NULL DEFAULT false;

-- SAFE: separate steps
ALTER TABLE events ADD COLUMN processed BOOLEAN;    -- instant
UPDATE events SET processed = false WHERE processed IS NULL;  -- batched
ALTER TABLE events ALTER COLUMN processed SET DEFAULT false;
ALTER TABLE events ALTER COLUMN processed SET NOT NULL;
```

For very large tables, use `pg_repack` or `ALTER TABLE ... CONCURRENTLY` where available.

## Lock-Free Index Creation in Postgres

```sql
-- BLOCKS writes (avoid in production)
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- CONCURRENT — builds without blocking writes (takes longer)
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);

-- Also for dropping:
DROP INDEX CONCURRENTLY idx_orders_user_id;
```

Always use `CONCURRENTLY` when adding indexes to production tables. Cannot run inside a transaction.