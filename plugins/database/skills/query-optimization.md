# Query Optimization

## Reading EXPLAIN ANALYZE Output

Always use `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` — not just `EXPLAIN`:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 20;
```

Key things to look for:

- **Seq Scan** — reading the entire table. Fine for small tables; investigate on large ones.
- **Index Scan** — good, uses an index to find rows.
- **Index Only Scan** — best, all needed data is in the index (covering index).
- **Nested Loop / Hash Join / Merge Join** — join strategies. Hash Join is often fastest for large sets.
- **actual rows vs rows estimate** — large discrepancy means stale statistics. Run `ANALYZE table_name`.
- **Buffers: shared hit vs read** — `hit` = served from cache, `read` = disk I/O. High reads = cache miss.

## N+1 Query Problem

N+1 occurs when you fetch a list of N records, then execute one query per record:

```typescript
// BAD — N+1: 1 query for users + N queries for posts
const users = await db.select().from(usersTable); // query 1
for (const user of users) {
  user.posts = await db.select().from(postsTable).where(eq(postsTable.userId, user.id)); // N queries
}

// GOOD — single JOIN
const result = await db
  .select()
  .from(usersTable)
  .leftJoin(postsTable, eq(postsTable.userId, usersTable.id));

// GOOD — batch fetch + group in memory
const userIds = users.map(u => u.id);
const posts = await db.select().from(postsTable).where(inArray(postsTable.userId, userIds));
const postsByUserId = groupBy(posts, p => p.userId);
```

Use `EXPLAIN ANALYZE` output or a query logger to detect N+1 in production.

## Index Usage in Queries

Indexes won't be used in several common situations:

```sql
-- LIKE with leading wildcard — can't use B-tree index
SELECT * FROM users WHERE name LIKE '%alice%';   -- full table scan
SELECT * FROM users WHERE name LIKE 'alice%';    -- CAN use B-tree

-- Function on indexed column — index bypassed
SELECT * FROM users WHERE LOWER(email) = 'alice@example.com';  -- no index
-- Fix: create expression index
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

-- Implicit type cast — index bypassed
SELECT * FROM users WHERE id = '123';  -- id is BIGINT, '123' is text → cast → no index
-- Fix: use correct type: WHERE id = 123
```

## Avoiding SELECT *

Always name your columns:

```sql
-- BAD
SELECT * FROM users JOIN orders ON orders.user_id = users.id;

-- GOOD: only fetch what you need
SELECT u.id, u.email, o.id AS order_id, o.total FROM users u JOIN orders o ON o.user_id = u.id;
```

Benefits: smaller result sets, enables index-only scans, prevents bugs when schema changes.

## LIMIT/OFFSET vs Cursor Pagination Performance

`OFFSET` performance degrades linearly — at `OFFSET 10000`, Postgres must scan and discard 10,000 rows:

```sql
-- BAD for large datasets
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 10000;

-- GOOD: cursor (keyset) pagination
SELECT * FROM posts
WHERE (created_at, id) < ('2024-01-01 12:00:00', 12345)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Cursor pagination requires a compound index: `CREATE INDEX ON posts (created_at DESC, id DESC)`.

## Aggregate Query Optimization

```sql
-- Partial aggregation: filter before grouping
SELECT user_id, COUNT(*) FROM orders
WHERE created_at > NOW() - INTERVAL '30 days'   -- filter first
GROUP BY user_id
HAVING COUNT(*) > 5;

-- Avoid correlated subqueries in SELECT — they run once per row
-- BAD
SELECT id, (SELECT COUNT(*) FROM orders WHERE user_id = users.id) AS order_count FROM users;

-- GOOD: lateral join or subquery aggregation
SELECT u.id, COALESCE(o.order_count, 0) AS order_count
FROM users u
LEFT JOIN (SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id) o
  ON o.user_id = u.id;
```

## Connection Pooling Impact

Each Postgres connection uses ~5-10MB of RAM and a process. Without pooling, spikes in traffic exhaust connections:

```typescript
// PgBouncer (external) or application-level pooling (pg, Drizzle, Prisma)
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,                 // maximum concurrent connections
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});
```

Recommended pool size: `(num_cores * 2) + effective_spindle_count`. For most apps: 10-20 connections. Use PgBouncer in transaction mode for serverless/edge environments where many short-lived connections are common.