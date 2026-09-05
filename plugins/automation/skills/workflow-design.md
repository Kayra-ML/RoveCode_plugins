# Workflow Design

## Core Principles

**Idempotency**: Every step should be safe to run twice. Use unique IDs, check before writing.

**Atomicity**: Group operations that must succeed together. Roll back if any step fails.

**Explicit state**: Don't infer state from side effects. Track state explicitly.

## Workflow Structure

```typescript
interface WorkflowStep {
  id: string;
  name: string;
  run: (ctx: WorkflowContext) => Promise<StepResult>;
  rollback?: (ctx: WorkflowContext) => Promise<void>;
  retryable: boolean;
  maxRetries?: number;
}
```

## Error Boundaries

Classify errors before deciding recovery:
- **Transient**: Network timeout, rate limit → retry with backoff
- **Permanent**: Invalid credentials, schema mismatch → fail fast, alert
- **Partial**: Some items succeeded → continue, track failures

## Branching Patterns

```typescript
async function runWorkflow(ctx: Context) {
  const input = await fetchInput(ctx);
  
  if (input.type === 'batch') {
    await processBatch(ctx, input);
  } else if (input.type === 'stream') {
    await processStream(ctx, input);
  } else {
    throw new WorkflowError(`Unknown input type: ${input.type}`);
  }
  
  await notifyComplete(ctx);
}
```