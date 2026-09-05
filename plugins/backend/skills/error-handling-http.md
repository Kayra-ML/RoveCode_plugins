# HTTP Error Handling

## Error Response Structure

Every error response must be consistent. Clients should never have to guess the shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request data is invalid",
    "details": [
      { "field": "email", "message": "Invalid email format" },
      { "field": "name", "message": "Name is required" }
    ],
    "requestId": "req_01hx7k2m3n4p5q6r"
  }
}
```

- `code` — machine-readable string constant, screaming_snake_case
- `message` — human-readable, safe to display
- `details` — optional array for field-level validation errors
- `requestId` — always include; enables log correlation

Never include stack traces, internal error messages, or database errors in responses.

## Operational vs Programmer Errors

**Operational errors** — expected failures: 404 not found, 422 validation failure, 401 unauthorized, 429 rate limited. These are part of the API contract. Log at WARN or INFO.

**Programmer errors** — bugs: TypeError, ReferenceError, unhandled promise rejections. These should crash the process (or be caught by a global handler) and log at ERROR with full stack trace.

```typescript
class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
  }
}

class ValidationError extends AppError {
  constructor(details: unknown) {
    super("VALIDATION_FAILED", "Validation failed", 422, details);
  }
}
```

## Global Error Handler Pattern

```typescript
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  // Known operational error
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.id,
      },
    });
  }

  // Zod validation error
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid request data",
        details: err.flatten().fieldErrors,
        requestId: req.id,
      },
    });
  }

  // Unknown/programmer error — log full details, respond safely
  logger.error({ err, requestId: req.id }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      requestId: req.id,
    },
  });
});
```

## Async Error Catching

In Express, unhandled async errors silently hang the request. Use one of:

```typescript
// Option A: explicit try/catch
router.get("/users/:id", async (req, res, next) => {
  try {
    const user = await userService.findById(req.params.id);
    res.json({ data: user });
  } catch (err) {
    next(err); // passes to global error handler
  }
});

// Option B: wrapper (preferred, less boilerplate)
const wrap = (fn: RequestHandler): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/users/:id", wrap(async (req, res) => {
  const user = await userService.findById(req.params.id);
  res.json({ data: user });
}));

// Option C: install express-async-errors once at app entry
import "express-async-errors";
```

## Error Logging vs Error Response

These are two different concerns:

```typescript
// Log: full context for engineers
logger.error({
  err: { message: err.message, stack: err.stack, code: (err as any).code },
  requestId: req.id,
  userId: req.user?.id,
  path: req.path,
  method: req.method,
});

// Respond: safe, minimal information for clients
res.status(500).json({
  error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId: req.id }
});
```

## HTTP Status Code Selection Guide

```
2xx — Success
  200 OK             — standard success with body
  201 Created        — resource created (include Location header)
  202 Accepted       — async work queued
  204 No Content     — success with no body (DELETE, some PATCHes)

4xx — Client Error
  400 Bad Request    — malformed JSON, missing required field, can't parse
  401 Unauthorized   — not authenticated (confusingly named)
  403 Forbidden      — authenticated but not authorized
  404 Not Found      — resource doesn't exist
  409 Conflict       — duplicate, version conflict
  410 Gone           — permanently deleted (stronger than 404)
  422 Unprocessable  — valid JSON but failed business validation
  429 Too Many       — rate limited (include Retry-After)

5xx — Server Error
  500 Internal       — unexpected server error
  502 Bad Gateway    — upstream service failed
  503 Unavailable    — deliberately unavailable (maintenance, overload)
  504 Gateway Timeout — upstream timed out
```