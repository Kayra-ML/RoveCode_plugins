# Rate Limiting

## Algorithm Comparison

**Fixed Window** — count requests per time window (e.g., 100 req/min). Simple but allows burst at window boundaries (200 requests in 2 seconds straddling two windows).

**Sliding Window** — tracks individual request timestamps in the window. More accurate, higher memory cost. Prevents boundary bursts.

**Token Bucket** — a bucket fills with tokens at a fixed rate; each request consumes a token. Allows short bursts up to bucket capacity while enforcing a long-term average rate. Most natural for APIs.

**Leaky Bucket** — requests queue and drain at a fixed rate. Smooths traffic but adds latency for legitimate users during bursts.

Recommendation: **token bucket** for user-facing APIs (allows reasonable bursts), **sliding window** for strict enforcement like login attempts.

## Per-IP vs Per-User Limits

Apply both layers:

```typescript
// Layer 1: per-IP (unauthenticated protection)
app.use(rateLimit({
  windowMs: 60_000,
  max: 200,              // 200 req/min per IP
  keyGenerator: (req) => req.ip,
}));

// Layer 2: per-user (after auth middleware)
app.use("/api", requireAuth, rateLimit({
  windowMs: 60_000,
  max: 1000,             // authenticated users get higher limit
  keyGenerator: (req) => req.user!.id,
}));

// Layer 3: per-endpoint for sensitive routes
app.post("/auth/login", rateLimit({
  windowMs: 15 * 60_000,
  max: 10,               // 10 login attempts per 15 min per IP
  keyGenerator: (req) => req.ip,
}));
```

## Redis-Backed Rate Limiting

In-memory rate limiting doesn't work across multiple server instances. Use Redis:

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  analytics: true,
});

async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const identifier = req.user?.id ?? req.ip;
  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", reset);

  if (!success) {
    const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000);
    res.setHeader("Retry-After", retryAfterSeconds);
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please slow down",
        retryAfterSeconds,
      },
    });
  }
  next();
}
```

## Rate Limit Headers

Always include these headers so clients can adapt:

```
X-RateLimit-Limit: 100          — total allowed in window
X-RateLimit-Remaining: 43       — remaining in current window
X-RateLimit-Reset: 1700003600   — Unix timestamp when window resets
Retry-After: 30                 — seconds until client may retry (on 429 only)
```

These are standardized in the IETF Rate Limit Headers draft. Well-behaved clients (and SDKs) use them to back off automatically.

## 429 Response Format

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "You have exceeded the rate limit. Please wait before retrying.",
    "retryAfterSeconds": 47,
    "requestId": "req_01hx7k2m"
  }
}
```

## Rate Limiting at Different Layers

Apply limits at the correct layer:

| Layer | Tool | Use For |
|-------|------|---------|
| CDN/Edge | Cloudflare, Fastly | DDoS, global protection before traffic hits your servers |
| Reverse proxy | nginx `limit_req` | Per-IP burst protection, simple rules |
| API gateway | Kong, AWS API GW | Service-level quotas, plan tiers |
| Application | express-rate-limit | Per-user, per-endpoint business rules |

Prefer handling volumetric attacks at the edge/nginx layer so your application servers never see the traffic.

## Bypass Prevention

Common bypass attempts and mitigations:

- **IP rotation** — also rate limit by user ID post-auth; use device fingerprinting for anonymous
- **Header spoofing** — never trust `X-Forwarded-For` blindly; configure trusted proxy count with `app.set("trust proxy", 1)` in Express
- **Distributed accounts** — rate limit by payment method, phone number, or email domain on signup
- **Endpoint hopping** — apply global per-user limits across all endpoints, not just per-endpoint limits