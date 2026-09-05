# Unit Testing

## What Makes a Good Unit Test

A good unit test is **fast**, **isolated**, **deterministic**, and **readable**. It tests one
logical concept, runs in milliseconds, has no external dependencies, and fails for exactly one
reason. If a test needs a database or HTTP call, it is not a unit test.

The value of a unit test is not line coverage — it is the confidence that a single unit of
logic behaves correctly in isolation. Tests that take 10 seconds, flake due to timing, or require
a running server are expensive to maintain and erode trust.

## AAA Pattern (Arrange-Act-Assert)

Structure every test with three clear phases:

```ts
it("calculates discounted price for premium users", () => {
  // Arrange
  const user = { tier: "premium" };
  const price = 100;

  // Act
  const result = applyDiscount(price, user);

  // Assert
  expect(result).toBe(80);
});
```

Never mix setup, execution, and assertions. When a test fails, the structure tells you immediately
where the failure lives.

## Naming Conventions

Good test names document behavior, not implementation:

```ts
// Good — describes observable behavior
it("returns 0 when the cart is empty")
it("throws when userId is missing")
it("trims whitespace from email before saving")

// Bad — describes implementation
it("calls validateEmail")
it("runs the discount function")
```

Given-When-Then is a readable alternative for complex scenarios:
```ts
it("given a locked account, when login is attempted, then throws AccountLocked")
```

## What to Test vs What Not to Test

**Test:**
- Business logic and domain rules
- Edge cases (empty input, null, boundary values)
- Error paths (what happens on invalid input)
- Pure transformation functions

**Do not test:**
- Implementation details (private methods, internal state)
- Framework behavior (don't test that React re-renders)
- Third-party libraries
- Trivial getters/setters with no logic

## File Co-location vs `__tests__` Folder

Co-locate test files next to the source they test:
```
src/
  pricing/
    discount.ts
    discount.test.ts   ← preferred
```

The `__tests__` folder pattern is an older convention that makes it harder to find the test
for a given file. Co-location keeps tests discoverable and encourages developers to write them.

## Vitest vs Jest

Vitest is the right choice for modern TypeScript projects using Vite, Bun, or Node 18+:
- Native ESM support without transform hacks
- Dramatically faster cold start (no Babel pipeline)
- Compatible with Jest's API — `describe`, `it`, `expect`, `vi.*`
- Built-in TypeScript support via esbuild

Use Jest only if you are on an existing Jest codebase with complex custom transforms or if
your project requires Jest-specific plugins with no Vitest equivalent.

## Coverage Targets

80% line coverage is not the goal. Coverage is a tool for finding **untested paths**, not a
metric to maximize. 100% coverage on trivial code is noise; 60% coverage on well-chosen paths
is more valuable.

Meaningful coverage means:
- Every branch in business logic is exercised
- Every error path is tested
- Happy paths and at least two edge cases per function

## Test Doubles: Stub vs Mock vs Spy

**Stub** — returns a predetermined value, no interaction verification:
```ts
const getUser = vi.fn().mockResolvedValue({ id: 1, name: "Alice" });
```

**Mock** — pre-programmed with expectations, verifies calls:
```ts
expect(emailService.send).toHaveBeenCalledWith("alice@example.com", expect.any(String));
```

**Spy** — wraps real implementation and records calls:
```ts
const spy = vi.spyOn(logger, "warn");
doThing();
expect(spy).toHaveBeenCalledOnce();
```

## Testing Async Code

Always return or await async assertions:

```ts
it("fetches user by id", async () => {
  const user = await fetchUser(42);
  expect(user.name).toBe("Alice");
});

it("rejects on missing id", async () => {
  await expect(fetchUser(null)).rejects.toThrow("userId required");
});
```

## Snapshot Testing

Snapshots are useful for large stable outputs (serialized ASTs, CLI output, email templates).
They are harmful when used for UI component trees — they break on every cosmetic change and
reviewers approve diffs blindly. For UI, prefer targeted assertions on specific properties.

Update snapshots intentionally (`--updateSnapshot`) after a deliberate change, never as a
reflex to make tests pass.