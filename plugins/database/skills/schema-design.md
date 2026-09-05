# Schema Design

## Normalization — and When to Break It

**1NF** — each column holds atomic values; no repeating groups. Don't store comma-separated tags in one column.

**2NF** — every non-key column depends on the whole primary key, not just part of it. Applies to composite keys.

**3NF** — no transitive dependencies. If `city` depends on `zip_code` and `zip_code` depends on `user_id`, move `city` to a zip codes table.

**When to intentionally denormalize**: read-heavy reporting tables, pre-aggregated analytics, materialized views for dashboards. Document the denormalization and where the source of truth lives.

## Naming Conventions

- Tables: `snake_case`, plural — `users`, `order_items`, `payment_methods`
- Columns: `snake_case` — `created_at`, `user_id`, `is_active`
- Foreign keys: `{referenced_table_singular}_id` — `user_id`, `order_id`
- Join tables: alphabetical order — `post_tags` not `tag_posts`
- Boolean columns: `is_` or `has_` prefix — `is_active`, `has_verified_email`
- Avoid reserved words: don't name columns `user`, `order`, `name` — use `username`, `order_status`, `display_name`

## Primary Key Choices

**Serial / BIGSERIAL (auto-increment integer)**
- Pros: small (4-8 bytes), sequential (good for B-tree indexes), human-readable in URLs
- Cons: exposes record count, not safe to expose in public APIs, hard to merge distributed data

**UUID (v4 random)**
- Pros: globally unique, safe to expose
- Cons: 16 bytes, random = poor B-tree locality, index fragmentation on inserts

**ULID (Universally Unique Lexicographically Sortable Identifier)**
- Pros: globally unique, lexicographically sortable (insert locality like SERIAL), URL-safe string
- Cons: 26-char string, less ecosystem support than UUID

**UUID v7 (time-ordered)**
- Pros: UUID-compatible, time-ordered (good insert performance), standardized in RFC 9562
- Cons: needs Postgres 17+ or a library

**Recommendation**: use `BIGSERIAL` for internal tables never exposed in APIs, UUID v7 or ULID for resources exposed to clients.

## Foreign Key Constraints and Cascades

Always define foreign keys — they enforce referential integrity at the DB level:

```sql
CREATE TABLE order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity > 0)
);
```

- `ON DELETE CASCADE` — delete child rows when parent is deleted. Use for dependent data (order_items when order is deleted).
- `ON DELETE RESTRICT` — prevent parent deletion if children exist. Use to protect important references (don't delete a product that has orders).
- `ON DELETE SET NULL` — null the FK when parent is deleted. Use for optional references.

## Nullable vs NOT NULL

Default to NOT NULL. Add NULL only when absence of a value is meaningful business data:

```sql
-- Good: explicit about what can be absent
email_verified_at TIMESTAMPTZ,      -- NULL means not verified yet
deleted_at        TIMESTAMPTZ,      -- NULL means not deleted (soft delete)
middle_name       TEXT,             -- genuinely optional

-- Bad: using NULL as a default when NOT NULL is appropriate
user_id           BIGINT,           -- should be NOT NULL if always required
```

## JSONB vs Separate Columns

Use **separate columns** when: you query/filter by the field, you need indexes, data is structured and consistent.

Use **JSONB** when: schema varies per row, you're storing user-defined metadata, the field is write-once and rarely queried.

```sql
-- Good use of JSONB: arbitrary user metadata
ALTER TABLE users ADD COLUMN metadata JSONB DEFAULT '{}';

-- Bad use of JSONB: hiding queryable data
-- Don't put email in JSONB if you filter by it
```

## Enum vs Lookup Table

**Postgres enum**: fast, type-safe, but adding values requires `ALTER TYPE` (takes a lock, can't remove values).

**Lookup table** (e.g., `statuses` table): flexible, FK enforced, add/remove values freely.

**VARCHAR with CHECK constraint**: simple, flexible, but no FK enforcement.

Recommendation: use lookup tables for statuses that evolve. Use Postgres enums only for truly stable, closed sets.

## Soft Delete Pattern

```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- Query active users
SELECT * FROM users WHERE deleted_at IS NULL;

-- Create partial index for performance
CREATE INDEX idx_users_active ON users (id) WHERE deleted_at IS NULL;
```

Always include `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` on every table. Use a trigger or ORM hook to auto-update `updated_at`.

## Audit Tables

For compliance-sensitive data, maintain a separate audit log:

```sql
CREATE TABLE users_audit (
  audit_id    BIGSERIAL PRIMARY KEY,
  operation   CHAR(1) NOT NULL,   -- I, U, D
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by  BIGINT,             -- user who made the change
  old_data    JSONB,
  new_data    JSONB
);
```

Populate via Postgres trigger or application-level logging.