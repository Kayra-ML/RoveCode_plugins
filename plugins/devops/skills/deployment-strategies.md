# Deployment Strategies

## Blue-Green Deployment

Maintain two identical production environments (blue = current, green = new). Deploy to green, test, then switch traffic:

```
                  ┌─────────────────┐
  users ──▶ LB ──▶│  BLUE (v1.0)    │  ← currently live
                  └─────────────────┘
                  ┌─────────────────┐
                  │  GREEN (v1.1)   │  ← deploying here
                  └─────────────────┘

After verification, flip the load balancer:
  users ──▶ LB ──▶ GREEN (v1.1)    ← now live
              └──▶ BLUE  (v1.0)    ← kept for instant rollback
```

**Pros**: instant rollback (flip LB back), zero-downtime. **Cons**: doubles infrastructure cost, requires stateless app (sessions must be shared, not local).

## Canary Releases

Gradually shift traffic to the new version:

```
Week 1:  5% → v2.0,  95% → v1.0   (monitor error rates)
Week 2: 25% → v2.0,  75% → v1.0
Week 3: 50% → v2.0,  50% → v1.0
Week 4: 100% → v2.0  (full cutover)
```

Use feature flags or load balancer weights. Monitor key metrics at each stage. Roll back automatically if error rate exceeds threshold.

## Rolling Deployments

Replace instances one at a time, keeping most capacity serving the old version throughout:

```
Start:  [v1] [v1] [v1] [v1]
Step 1: [v2] [v1] [v1] [v1]   ← health check v2 before continuing
Step 2: [v2] [v2] [v1] [v1]
Step 3: [v2] [v2] [v2] [v1]
Done:   [v2] [v2] [v2] [v2]
```

**Requires**: backward-compatible database schema (both v1 and v2 run simultaneously during rollout). Rolling back means rolling the other direction — slower than blue-green.

## Zero-Downtime Deployment Checklist

Before deploying:
- [ ] Database migration is backward-compatible with current code (runs before new code)
- [ ] Env vars for new code are already set in production
- [ ] Health check endpoint returns 200 (load balancer uses it to detect ready instances)
- [ ] Graceful shutdown is implemented (SIGTERM handler drains in-flight requests)

During deployment:
- [ ] Monitor error rate in real time — have a threshold to auto-abort
- [ ] Watch health check success rate
- [ ] Check downstream service latency

After deployment:
- [ ] Verify key user journeys (smoke test)
- [ ] Confirm error rate returned to baseline
- [ ] Check memory/CPU are stable (not growing)

## Graceful Shutdown (SIGTERM Handling)

When a container is stopped, the orchestrator sends SIGTERM. Give in-flight requests time to complete:

```typescript
const server = app.listen(env.PORT);

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — starting graceful shutdown");

  // Stop accepting new connections
  server.close(async () => {
    logger.info("HTTP server closed");

    // Close DB pool and other resources
    await db.destroy();
    await redis.quit();

    logger.info("Graceful shutdown complete");
    process.exit(0);
  });

  // Force shutdown if graceful takes too long
  setTimeout(() => {
    logger.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 30_000); // 30s max
});
```

In Docker/Kubernetes, set `terminationGracePeriodSeconds` longer than your shutdown timeout.

## Database Migration Order During Deploy

```
WRONG order (causes errors):
  1. Deploy new code (expects new_column)
  2. Run migration (adds new_column)

CORRECT order:
  1. Run migration (adds new_column — backward-compatible, old code ignores it)
  2. Deploy new code (uses new_column)
  3. Later: cleanup migration to add NOT NULL or drop old column
```

In CI/CD pipelines, run migrations as a separate step before the code deploy step with a `needs:` dependency.

## Feature Flags for Gradual Rollout

Deploy code with a feature flag — ship the feature dark, enable for 1% → 10% → 100%:

```typescript
// Simple env-var flag
if (env.FEATURE_NEW_PAYMENT_FLOW === "true") {
  return newPaymentFlow(req, res);
}
return legacyPaymentFlow(req, res);

// User-percentage rollout
function isInRollout(userId: string, percentage: number): boolean {
  const hash = parseInt(createHash("md5").update(userId).digest("hex").slice(0, 8), 16);
  return (hash % 100) < percentage;
}
```

## Rollback Triggers and Procedures

Define automatic rollback triggers before deploying:

- Error rate > 2% (baseline: 0.1%)
- P99 latency > 2000ms (baseline: 200ms)
- Health check failure rate > 5%
- Any 5xx spike in first 5 minutes

**Rollback procedure**:
```bash
# Blue-green: flip LB back to blue
fly scale count app=my-blue-app --count 4

# Rolling: redeploy previous image tag
fly deploy --image registry.fly.io/myapp:v1.23.0

# Kubernetes
kubectl rollout undo deployment/myapp
kubectl rollout status deployment/myapp  # wait for completion
```

## Deployment Verification Steps

After every production deploy:
1. Health check endpoint returns 200
2. Smoke test: one critical user journey end-to-end
3. Synthetic monitoring alert is green
4. Error tracker shows no new error types
5. Key metrics (conversion, API response time) are within normal range