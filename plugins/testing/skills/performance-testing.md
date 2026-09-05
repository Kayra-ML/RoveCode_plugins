# Performance Testing

## Performance Testing Types

**Load testing** — normal expected load. Answers: does the system meet SLAs under typical traffic?

**Stress testing** — beyond normal load until the system breaks. Answers: where is the breaking
point and how does failure look? Does it degrade gracefully or collapse?

**Spike testing** — sudden large burst then return to normal. Answers: does the system recover?
Does auto-scaling respond in time?

**Soak testing** — sustained load over hours or days. Answers: are there memory leaks, connection
pool exhaustion, or disk fill issues that only appear over time?

Run them in this order. Load testing first — if the system cannot handle normal traffic, the
others are meaningless.

## k6 Script Structure

k6 scripts are JavaScript modules with a default exported function:

```js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },   // ramp up to 20 virtual users
    { duration: "1m",  target: 20 },   // hold at 20 VUs
    { duration: "10s", target: 0  },   // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],  // 95% of requests under 500ms
    http_req_failed:   ["rate<0.01"],  // error rate under 1%
  },
};

export default function () {
  const res = http.get("https://api.example.com/users");
  check(res, {
    "status is 200": (r) => r.status === 200,
    "response time OK": (r) => r.timings.duration < 300,
  });
  sleep(1); // think time between requests
}
```

Run with: `k6 run script.js`

## Throughput vs Latency

**Throughput** — how many requests per second the system can process. A high-throughput system
handles volume. Measured in RPS (requests per second).

**Latency** — how long a single request takes. A low-latency system feels fast to users.
Measured in milliseconds.

These can conflict: a system that batches work has high throughput but higher latency per
request. Know which matters for your use case before optimizing.

## Understanding Percentile Metrics

**p50** (median) — half of requests are faster than this. Represents the typical user experience.

**p95** — 95% of requests are faster than this. Represents the experience of most users under
load.

**p99** — 99% of requests are faster than this. Represents the experience of users during
moderate tail latency.

Never use averages for latency. A p50=50ms with p99=10,000ms looks fine on average but means
1 in 100 users waits 10 seconds. Set SLA thresholds at p95 or p99, not mean.

## Finding Bottlenecks

Work through the stack systematically before tuning anything:

**CPU-bound:** CPU usage near 100% during load. Profile with `clinic flame` (Node.js) or
`perf` (Linux). Look for hot loops, expensive regex, or synchronous crypto.

**Memory-bound:** heap grows continuously during a soak test. Profile with `clinic heapprofile`
or Chrome DevTools. Look for event listener leaks, large caches without eviction, and
closures holding references.

**Database-bound:** CPU and memory are fine but latency is high. Check slow query logs.
Look for N+1 queries, missing indexes, and full table scans. Use `EXPLAIN ANALYZE` in
PostgreSQL.

**Network-bound:** high throughput but latency spikes. Check connection pool saturation,
DNS resolution time, and TLS handshake overhead. Enable connection keep-alive.

## Criterion for Rust Benchmarks

Criterion provides statistically rigorous micro-benchmarks with outlier detection:

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench_sort(c: &mut Criterion) {
    let data: Vec<u64> = (0..1000).rev().collect();
    c.bench_function("sort 1000 elements", |b| {
        b.iter(|| {
            let mut v = black_box(data.clone());
            v.sort_unstable();
            v
        })
    });
}

criterion_group!(benches, bench_sort);
criterion_main!(benches);
```

Use `black_box()` to prevent the compiler from optimizing away benchmark work. Run with
`cargo bench`. Criterion runs enough iterations to produce statistically significant results
and warns when it detects high variance.

## Node.js Benchmarking with clinic.js

Clinic.js provides three profiling modes:

```bash
# Flame graph — CPU profiling
clinic flame -- node server.js

# Bubble chart — event loop lag
clinic bubble -- node server.js

# Heap profiling — memory usage
clinic heapprofile -- node server.js
```

Then apply load with autocannon while clinic records:
```bash
autocannon -c 100 -d 30 http://localhost:3000/api/endpoint
```

## Performance Budgets

Define explicit budgets before writing code and enforce them in CI:

```js
// k6 thresholds as a budget
thresholds: {
  http_req_duration: ["p(95)<200", "p(99)<500"],
  http_req_failed: ["rate<0.005"],
  http_reqs: ["rate>100"], // minimum throughput
}
```

Budgets prevent gradual degradation — the kind where each PR makes things 1% slower until
the system is unusably slow a year later.

## Baseline Before Optimization

Always measure before changing anything. Without a baseline you cannot know if an optimization
helped. Record:
- p50, p95, p99 latency
- Requests per second at target concurrency
- Error rate under load
- Memory and CPU at steady state

Then change one thing, measure again, compare. Never tune multiple variables simultaneously.