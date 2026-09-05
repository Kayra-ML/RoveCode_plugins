# Reliability & Retries

## Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitter?: boolean;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30000, jitter = true } = options;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const exponential = baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(exponential, maxDelayMs);
      const delay = jitter ? capped * (0.5 + Math.random() * 0.5) : capped;
      
      await sleep(delay);
    }
  }
  throw new Error('unreachable');
}
```

## Circuit Breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private nextRetry = 0;
  
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open' && Date.now() < this.nextRetry) {
      throw new Error('Circuit breaker open');
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() { this.failures = 0; this.state = 'closed'; }
  private onFailure() {
    this.failures++;
    if (this.failures >= 5) {
      this.state = 'open';
      this.nextRetry = Date.now() + 60000;
    }
  }
}
```

## Idempotency Keys

For operations that must not duplicate:
```typescript
async function processPayment(id: string, amount: number) {
  const key = `payment-${id}`;
  if (await redis.exists(key)) return; // Already processed
  
  await doPayment(id, amount);
  await redis.set(key, '1', 'EX', 86400);
}
```