# Scheduling

## Cron Expression Reference

```
* * * * *
│ │ │ │ └── Day of week (0-7, 0=Sun)
│ │ │ └──── Month (1-12)
│ │ └────── Day of month (1-31)
│ └──────── Hour (0-23)
└────────── Minute (0-59)

Examples:
0 9 * * 1-5    # 9am Mon-Fri
*/15 * * * *   # Every 15 minutes
0 0 1 * *      # Monthly, 1st at midnight
```

## Scheduling Best Practices

**Avoid thundering herds**: Add jitter when many jobs run at the same time:
```typescript
const jitter = Math.random() * 5000; // 0-5 seconds
await sleep(jitter);
await runJob();
```

**Track last success**: Detect missed runs:
```typescript
const lastRun = await getLastRunTimestamp(jobId);
if (Date.now() - lastRun > expectedIntervalMs * 1.5) {
  await alertMissedRun(jobId);
}
```

**Timeouts**: Every scheduled job needs a maximum execution time.

## Distributed Scheduling

For multiple workers: use a distributed lock (Redis SET NX, database advisory lock) to prevent duplicate execution.