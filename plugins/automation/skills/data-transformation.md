# Data Transformation

## Pipeline Pattern

```typescript
type Transform<In, Out> = (input: In) => Out | Promise<Out>;

async function pipeline<T>(input: T, transforms: Transform<any, any>[]): Promise<any> {
  return transforms.reduce(async (acc, transform) => {
    const value = await acc;
    return transform(value);
  }, Promise.resolve(input));
}
```

## Schema Validation

Always validate at boundaries (input and output):
```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

const parsed = UserSchema.safeParse(rawData);
if (!parsed.success) {
  throw new ValidationError(parsed.error.format());
}
```

## Common Transformations

```typescript
// Normalize dates
const normalized = records.map(r => ({
  ...r,
  date: new Date(r.date).toISOString(),
}));

// Flatten nested
const flat = nested.flatMap(group => group.items.map(item => ({
  groupId: group.id,
  ...item,
})));

// Group by
const grouped = records.reduce((acc, r) => {
  (acc[r.category] ??= []).push(r);
  return acc;
}, {} as Record<string, typeof records>);
```