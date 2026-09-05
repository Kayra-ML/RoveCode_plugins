# ORM Patterns

## ORM vs Query Builder vs Raw SQL Decision Tree

**Use an ORM (Prisma, TypeORM)** when:
- You want schema-as-code with auto-generated migrations
- You need a high-level abstraction for CRUD operations
- TypeScript types from your schema are valuable

**Use a query builder (Drizzle, Kysely)** when:
- You want type-safe SQL without the magic of a full ORM
- You need fine-grained control over queries
- You want to avoid ORM overhead for performance-sensitive code

**Use raw SQL** when:
- Complex window functions, CTEs, recursive queries
- Bulk operations (`INSERT ... ON CONFLICT DO UPDATE`)
- Query the ORM can't express efficiently
- Migration scripts

```typescript
// Drizzle — query builder, full type safety
const users = await db.select({ id: usersTable.id, email: usersTable.email })
  .from(usersTable)
  .where(eq(usersTable.isActive, true))
  .orderBy(desc(usersTable.createdAt))
  .limit(20);

// Raw SQL when needed (Drizzle)
const result = await db.execute(sql`
  SELECT user_id, COUNT(*) as order_count, SUM(total) as revenue
  FROM orders
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY user_id
  HAVING COUNT(*) > 5
`);
```

## Prisma Schema and Migration Workflow

```prisma
// schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  orders    Order[]

  @@map("users")
}

model Order {
  id     String @id @default(cuid())
  userId String
  total  Decimal @db.Decimal(10, 2)
  user   User   @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("orders")
}
```

```bash
prisma migrate dev --name add_orders_table   # dev: generate + apply
prisma generate                               # regenerate Prisma Client
prisma migrate deploy                         # production: apply pending
prisma studio                                 # GUI for data inspection
```

## Drizzle Type-Safe Patterns

```typescript
// schema.ts
import { pgTable, text, timestamp, bigserial } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id:        bigserial("id", { mode: "number" }).primaryKey(),
  email:     text("email").notNull().unique(),
  name:      text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

```typescript
// repository/users.ts
import { eq, isNull } from "drizzle-orm";
import { db } from "../db.js";
import { users, type NewUser } from "../schema.js";

export async function findActiveById(id: number) {
  const [user] = await db.select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)));
  return user ?? null;
}

export async function create(data: NewUser) {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}
```

## N+1 with ORMs

ORMs can silently produce N+1 queries. Prevent with eager loading:

```typescript
// Prisma — N+1 (1 query for users + N for orders)
const users = await prisma.user.findMany();
for (const user of users) {
  const orders = await prisma.order.findMany({ where: { userId: user.id } }); // N queries
}

// Prisma — eager loading (2 queries total via IN clause)
const users = await prisma.user.findMany({
  include: { orders: true },
});

// Drizzle — explicit JOIN
const result = await db.select({
  user: users,
  order: orders,
}).from(users).leftJoin(orders, eq(orders.userId, users.id));
```

## ORM Transaction Patterns

```typescript
// Prisma
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { email, name } });
  const profile = await tx.profile.create({ data: { userId: user.id } });
  return { user, profile };
});

// Drizzle
const result = await db.transaction(async (tx) => {
  const [user] = await tx.insert(users).values({ email, name }).returning();
  const [profile] = await tx.insert(profiles).values({ userId: user.id }).returning();
  return { user, profile };
});
```

## Connection Pool Configuration

```typescript
// Prisma — datasource in schema.prisma
// datasource db { url = env("DATABASE_URL") }
// Connection pool config via URL params:
// DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=10"

// Drizzle with pg driver
import { Pool } from "pg";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 3_000,
});
export const db = drizzle(pool);
```

For serverless/edge (Cloudflare Workers, Vercel Edge), use a serverless-compatible driver:
- Prisma: `@prisma/adapter-neon` or `@prisma/adapter-pg`
- Drizzle: `drizzle-orm/neon-http` or `drizzle-orm/postgres-js`

## Repository Pattern with ORM

Wrap ORM access in repository functions to keep business logic decoupled from the ORM:

```typescript
// repositories/users.ts
export const userRepository = {
  async findById(id: number): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  },
  async findByEmail(email: string): Promise<User | null> {
    const [user] = await db.select().from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));
    return user ?? null;
  },
  async create(data: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  },
  async softDelete(id: number): Promise<void> {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
  },
};
```

Benefits: easy to mock in tests, swap ORM without changing service layer, one place to add caching.