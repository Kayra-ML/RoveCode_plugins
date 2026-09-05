# Middleware Design

## Middleware Execution Order

Middleware runs in registration order. Order matters — get it wrong and you'll log errors before they exist, or apply CORS after the preflight fails.

Recommended order:
```
1. Security headers (helmet)
2. CORS
3. Request ID injection
4. Body parser / JSON parser
5. Compression
6. Rate limiting
7. Logging (after body is parsed so you can log it)
8. Authentication
9. Authorization
10. Route handlers
11. 404 handler
12. Error handler (must be last)
```

## Error Middleware (4-Parameter Signature)

In Express, an error middleware must have exactly four parameters. Omit any one and Express won't treat it as an error handler:

```typescript
// CORRECT — 4 params
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
});

// WRONG — Express ignores this as error handler
app.use((err: Error, req: Request, res: Response) => { ... });
```

Always register error middleware last, after all routes.

## Async Middleware Patterns

Express does not catch async errors by default. Wrap async handlers:

```typescript
// Wrapper utility
const asyncHandler = (fn: RequestHandler): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Usage
router.get("/users/:id", asyncHandler(async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) throw new NotFoundError("User not found");
  res.json({ data: user });
}));
```

Alternatively, install `express-async-errors` which monkey-patches Express globally.

## Request Validation Middleware

Validate at the boundary before your business logic runs:

```typescript
import { z } from "zod";

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
  }),
});

function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
      return res.status(422).json({
        error: { code: "VALIDATION_FAILED", details: result.error.flatten().fieldErrors }
      });
    }
    req.validated = result.data;
    next();
  };
}
```

## Logging Middleware

Log after routing so you have method, path, status, and duration:

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    }));
  });
  next();
});
```

## CORS Middleware Configuration

```typescript
import cors from "cors";

app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? ["https://app.example.com"]
    : true, // allow all in dev
  credentials: true,           // required for cookies
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,               // cache preflight for 24h
}));
```

Never use `origin: "*"` with `credentials: true` — browsers will reject it.

## Body Parsing & Size Limits

Always set a size limit on request bodies to prevent DoS:

```typescript
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
```

For file uploads, handle with `multer` and set separate limits per field.

## Compression Middleware

```typescript
import compression from "compression";

app.use(compression({
  threshold: 1024,    // only compress responses > 1KB
  level: 6,           // zlib level 1-9, 6 is balanced
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) return false;
    return compression.filter(req, res);
  },
}));
```

Register compression before static file serving and route handlers.

## Middleware vs Route Handler Separation

Middleware = cross-cutting concerns (auth, logging, validation, rate limiting).
Route handlers = business logic only.

```typescript
// BAD — auth logic inside route handler
router.get("/profile", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const user = jwt.verify(token, SECRET); // auth mixed with business logic
  res.json(user);
});

// GOOD — separation of concerns
router.get("/profile", requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: req.user }); // handler only does its job
}));
```