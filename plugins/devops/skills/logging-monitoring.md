# Logging & Monitoring

## Structured Logging (JSON Logs)

Plain text logs are hard to query at scale. Emit JSON — log aggregators (Loki, Datadog, CloudWatch) can index and filter structured fields:

```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Pretty-print in development, JSON in production
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

// Usage — always use structured fields, not string interpolation
logger.info({ userId: user.id, orderId: order.id }, "Order created");
logger.error({ err, requestId: req.id, userId: req.user?.id }, "Payment failed");

// BAD — unstructured, hard to query
logger.info(`Order ${orderId} created for user ${userId}`);
```

## Log Levels

Use levels consistently so you can filter signal from noise:

| Level | Use For |
|-------|---------|
| `trace` | Extremely verbose debugging (usually disabled in production) |
| `debug` | Developer-facing detail: query parameters, cache hits, function entry/exit |
| `info` | Business events: user registered, order placed, job completed |
| `warn` | Degraded but continuing: fallback used, retry attempted, deprecated API called |
| `error` | Operation failed: unhandled exception, payment declined, DB unreachable |
| `fatal` | Application cannot continue: startup failure, critical dependency down |

In production, set level to `info`. Enable `debug` temporarily when diagnosing issues.

## Correlation IDs for Request Tracing

Every request should carry a unique ID through all logs, downstream service calls, and error reports:

```typescript
import { randomUUID } from "crypto";

// Middleware: inject or propagate request ID
app.use((req, res, next) => {
  req.id = (req.headers["x-request-id"] as string) ?? randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
});

// Logging middleware: attach requestId to all logs in request scope
app.use((req, res, next) => {
  req.log = logger.child({ requestId: req.id, method: req.method, path: req.path });
  next();
});

// Use in handlers
req.log.info({ userId: req.user?.id }, "Fetching user profile");

// Forward to downstream services
await fetch("https://service-b/api/data", {
  headers: { "x-request-id": req.id }
});
```

## What NOT to Log

Never log sensitive data — it ends up in aggregators, dashboards, and cold storage:

- Passwords, password hashes
- JWT tokens, API keys, session tokens
- Credit card numbers, CVV codes
- PII: full SSN, full DOB combined with name+address
- OAuth codes and refresh tokens

```typescript
// BAD
logger.info({ body: req.body }, "Login attempt");   // body contains password

// GOOD
logger.info({ email: req.body.email }, "Login attempt");  // log only safe fields
```

## Log Aggregation Tools

| Tool | Best For |
|------|---------|
| **Grafana Loki** | Self-hosted, pairs with Prometheus/Grafana |
| **Datadog Logs** | Full-featured SaaS, APM integration |
| **AWS CloudWatch** | If already on AWS, low friction |
| **Axiom** | Developer-friendly, generous free tier |
| **Papertrail** | Simple, affordable for small teams |

Ship logs from containers by writing to stdout/stderr — the platform (Docker, ECS, Kubernetes) collects and forwards them.

## Error Tracking with Sentry

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,    // sample 10% of requests for performance tracing
  integrations: [
    Sentry.httpIntegration(),
    Sentry.expressIntegration(),
  ],
});

// In global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  Sentry.captureException(err, { extra: { requestId: req.id, userId: req.user?.id } });
  // ... send error response
});
```

## Health Check Endpoints

Expose two health endpoints:

**Liveness** (`/health/live`) — is the process running? Returns 200 always (if process is up). Used by orchestrators to restart hung processes.

**Readiness** (`/health/ready`) — is the app ready to serve traffic? Checks DB, Redis, etc. Returns 503 when not ready. Used by load balancers to stop sending traffic.

```typescript
router.get("/health/live", (req, res) => res.status(200).json({ status: "ok" }));

router.get("/health/ready", async (req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    db.execute(sql`SELECT 1`).then(() => true).catch(() => false),
    redis.ping().then(() => true).catch(() => false),
  ]);
  const ready = dbOk && redisOk;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks: { database: dbOk, redis: redisOk },
  });
});
```

## Alerting: Error Rate vs Error Count

Alert on **error rate** (errors per minute / requests per minute), not raw error count. A spike in errors during low traffic is more alarming than the same count during peak traffic.

```
# Alert if error rate > 1% over 5 minutes
error_rate = sum(rate(http_requests_total{status=~"5.."}[5m])) /
             sum(rate(http_requests_total[5m]))
alert if error_rate > 0.01
```

## OpenTelemetry Basics

OpenTelemetry (OTel) is the standard for vendor-neutral observability (traces, metrics, logs):

```typescript
// Instrument early — before other imports
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

// Auto-instruments: HTTP, Express, pg, Redis, fetch — zero manual code
```

Traces let you see the full call chain: HTTP request → DB query → Redis call → downstream API, with timing for each.