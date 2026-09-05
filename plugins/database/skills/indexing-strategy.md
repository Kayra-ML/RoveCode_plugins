# Indexing Strategy

## B-Tree Index Internals

A B-tree index is a balanced tree where leaf nodes contain the indexed values and pointers to heap rows. Lookups are O(log n). Range queries (`BETWEEN`, `>`, `<`) walk the leaf level. Insert/update/delete must update the index — write overhead.

Postgres maintains the index in sorted order. This means:
- Equality lookups: fast
- Range scans: fast
- Pattern prefix (`LIKE 'alice%'`): fast
- Pattern suffix (`LIKE '%alice'`): cannot use B-tree

## When NOT to Index

Adding an index is not free — it costs write performance and disk space:

- **Low-cardinality columns** — boolean, status with 3 values. The planner may prefer a seq scan when a large fraction of rows match.
- **Write-heavy tables** — every INSERT/UPDATE/DELETE must update all indexes. Log/event tables with thousands of inserts per second should have minimal indexes.
- **Small tables** — Postgres will seq scan tables under ~1000 rows regardless of indexes.
- **Rarely queried columns** — index only columns that appear in WHERE, JOIN ON, or ORDER BY of real queries.

## Composite Index Column Order

Order matters. A composite index `(a, b, c)` is useful for:
- Queries filtering on `a`
- Queries filtering on `a, b`
- Queries filtering on `a, b, c`

It is NOT useful for queries filtering only on `b` or `c`.

**Selectivity rule**: put the most selective column first unless your queries have equality on a low-selectivity column (e.g., `status = 'active'`) combined with a range on a high-selectivity column — then put the equality column first.

```sql
-- Query: WHERE user_id = 42 AND created_at > '2024-01-01'
-- Good composite index:
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at);
-- user_id (equality, high selectivity) first, then created_at (range)
```

## Partial Indexes

Index only the rows that matter — smaller index, faster scans:

```sql
-- Index only active users
CREATE INDEX idx_users_active_email ON users (email) WHERE deleted_at IS NULL;

-- Index only unprocessed jobs
CREATE INDEX idx_jobs_pending ON jobs (created_at) WHERE status = 'pending';

-- Unique constraint only for non-deleted rows
CREATE UNIQUE INDEX idx_users_unique_email_active ON users (email) WHERE deleted_at IS NULL;
```

## Expression Indexes

Index the result of a function or expression:

```sql
-- Case-insensitive email lookup
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
-- Query must also use LOWER: WHERE LOWER(email) = 'alice@example.com'

-- Index extracted JSON field
CREATE INDEX idx_events_type ON events ((payload->>'event_type'));

-- Index date part
CREATE INDEX idx_orders_year ON orders (EXTRACT(YEAR FROM created_at));
```

## GIN Indexes for JSONB and Arrays

B-tree indexes don't work for JSONB containment or array membership. Use GIN:

```sql
-- JSONB containment queries: WHERE metadata @> '{"role": "admin"}'
CREATE INDEX idx_users_metadata ON users USING GIN (metadata);

-- Array membership: WHERE tags @> ARRAY['postgres']
CREATE INDEX idx_posts_tags ON posts USING GIN (tags);

-- Full-text search
CREATE INDEX idx_articles_fts ON articles USING GIN (to_tsvector('english', body));
```

GIN indexes are larger and slower to update than B-tree. Only create them if you actually use JSONB operators.

## Covering Indexes (INCLUDE columns in Postgres)

An Index Only Scan avoids heap access entirely when all needed columns are in the index:

```sql
-- Query: SELECT email, name FROM users WHERE id = 42
-- Without INCLUDE: Index Scan on id, then heap fetch for email + name
-- With INCLUDE: Index Only Scan — no heap access
CREATE INDEX idx_users_id_covering ON users (id) INCLUDE (email, name);
```

The `INCLUDE` columns are stored in the leaf nodes but not used for sorting. They don't add to index size as much as key columns.

## Index Bloat and REINDEX

Deleted/updated rows leave dead tuples in indexes. `autovacuum` reclaims heap space but not always index space efficiently:

```sql
-- Check index bloat
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS size
FROM pg_indexes WHERE tablename = 'orders' ORDER BY 2 DESC;

-- Rebuild index without locking (Postgres 12+)
REINDEX INDEX CONCURRENTLY idx_orders_user_id;

-- Rebuild all indexes on table
REINDEX TABLE CONCURRENTLY orders;
```

Schedule periodic `REINDEX CONCURRENTLY` for high-churn tables.

## Index Usage Monitoring

```sql
-- Find unused indexes (wasted write overhead)
SELECT schemaname, tablename, indexname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Find tables doing sequential scans on large tables
SELECT relname, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0 AND n_live_tup > 10000
ORDER BY seq_scan DESC;
```

Drop indexes with 0 scans that have existed long enough for the stats to be meaningful (reset with `SELECT pg_stat_reset()` then wait for a representative traffic period).