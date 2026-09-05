# Transactions & Concurrency

## ACID Properties

**Atomicity** — all operations in a transaction succeed or all are rolled back. No partial writes.

**Consistency** — the database moves from one valid state to another. Constraints (FK, NOT NULL, CHECK) are enforced at commit.

**Isolation** — concurrent transactions don't interfere with each other (to the degree the isolation level allows).

**Durability** — committed data survives crashes (written to WAL, flushed to disk).

## Isolation Levels

Postgres supports four levels. Higher isolation = fewer anomalies = more contention:

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Serialization Anomaly |
|-------|-----------|--------------------|--------------|-----------------------|
| READ UNCOMMITTED | Possible* | Possible | Possible | Possible |
| READ COMMITTED | Safe | Possible | Possible | Possible |
| REPEATABLE READ | Safe | Safe | Safe* | Possible |
| SERIALIZABLE | Safe | Safe | Safe | Safe |

*Postgres never allows dirty reads even at READ UNCOMMITTED. Postgres REPEATABLE READ also prevents phantom reads.

**READ COMMITTED** (default) — each statement sees only committed data at the moment the statement begins. Safe for most OLTP workloads.

**REPEATABLE READ** — the entire transaction sees a consistent snapshot from its start time. Use for reports and analytics that must be internally consistent.

**SERIALIZABLE** — transactions behave as if executed serially. Use for financial operations (account balances, inventory), voting systems, anything with "check-then-act" logic.

```typescript
// Setting isolation level in application code
await db.transaction(async (tx) => {
  await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
  const balance = await tx.select().from(accounts).where(eq(accounts.id, userId));
  // ... update
});
```

## Deadlock Detection and Prevention

A deadlock occurs when transaction A waits for a lock held by transaction B, and B waits for a lock held by A. Postgres detects and resolves deadlocks by aborting one transaction (error code `40P01`).

**Prevention strategies**:

1. Always acquire locks in the same order across all transactions
2. Keep transactions short — acquire all locks early, release quickly
3. Use `SELECT FOR UPDATE SKIP LOCKED` for job queue patterns instead of competing for the same rows

```sql
-- Job queue pattern: skip rows locked by other workers
SELECT id, payload FROM jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

## Optimistic vs Pessimistic Locking

**Pessimistic locking** — lock the row when you read it, preventing others from modifying it until you commit. Higher contention, but no conflict at write time.

```sql
-- Lock the row immediately
SELECT * FROM accounts WHERE id = 42 FOR UPDATE;
-- Now update it — no other transaction can modify this row until we commit
UPDATE accounts SET balance = balance - 100 WHERE id = 42;
```

**Optimistic locking** — read without locking, include a version number in the update. If the row was modified since you read it, the update affects 0 rows — detect and retry.

```sql
ALTER TABLE accounts ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- Read
SELECT id, balance, version FROM accounts WHERE id = 42;
-- → { id: 42, balance: 1000, version: 5 }

-- Update — only succeeds if version hasn't changed
UPDATE accounts
SET balance = 900, version = 6
WHERE id = 42 AND version = 5;
-- If rowsAffected = 0 → conflict, retry
```

Optimistic locking is better for low-contention scenarios. Pessimistic is better for high-contention or when the cost of retry is high.

## SELECT FOR UPDATE

Locks selected rows for the duration of the transaction:

```sql
BEGIN;
SELECT * FROM inventory WHERE product_id = 99 FOR UPDATE;
-- Other transactions block here if they also try FOR UPDATE on product 99
UPDATE inventory SET quantity = quantity - 1 WHERE product_id = 99;
COMMIT;
```

Variants:
- `FOR UPDATE` — exclusive lock, blocks all concurrent writers and `FOR UPDATE` readers
- `FOR SHARE` — shared lock, allows other `FOR SHARE` but blocks writers
- `FOR UPDATE SKIP LOCKED` — skip rows locked by others (job queues)
- `FOR UPDATE NOWAIT` — fail immediately instead of waiting (error `55P03`)

## Transaction Scope in Application Code

Keep transactions as short as possible:

```typescript
// BAD: long transaction with external calls
await db.transaction(async (tx) => {
  const user = await tx.select().from(users).where(eq(users.id, id));
  await sendEmail(user.email);     // external call inside transaction
  await tx.update(users).set({ emailSent: true }).where(eq(users.id, id));
});

// GOOD: external calls outside transaction
const user = await db.select().from(users).where(eq(users.id, id));
await sendEmail(user.email);
await db.update(users).set({ emailSent: true }).where(eq(users.id, id));

// If atomicity is critical, use the outbox pattern instead
```

## Long Transactions Are Harmful

Long-running transactions prevent Postgres from vacuuming dead tuples. They hold locks. They keep WAL segments alive. Monitor with:

```sql
SELECT pid, now() - xact_start AS duration, query, state
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY duration DESC;
```

Kill long-running transactions that exceed your threshold (e.g., > 5 minutes in OLTP):

```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE now() - xact_start > INTERVAL '5 minutes' AND state != 'idle';
```

## Savepoints

Partial rollbacks within a transaction:

```sql
BEGIN;
INSERT INTO orders (user_id, total) VALUES (1, 100);
SAVEPOINT after_order;

INSERT INTO order_items (order_id, product_id) VALUES (1, 999); -- may fail
-- If it fails:
ROLLBACK TO SAVEPOINT after_order;
-- Continue with partial work, commit what succeeded
COMMIT;
```

## Distributed Transaction Problems

Two-Phase Commit (2PC) coordinates transactions across multiple databases but is slow, operationally complex, and leaves the system in doubt if a coordinator crashes. Avoid 2PC.

Prefer: **Saga pattern** (sequence of local transactions with compensating rollbacks) or **outbox pattern** (write event to outbox table in same transaction, relay asynchronously).