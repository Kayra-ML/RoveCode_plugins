# Mocking Patterns

## Definitions: Mock vs Stub vs Spy vs Fake

These terms are often used interchangeably but have distinct meanings:

**Stub** — returns a hardcoded value. Replaces a dependency to control what the unit under
test receives. No interaction verification.

**Mock** — a stub that also records interactions. You assert *how* it was called, not just
*what* it returned. Use when calling the dependency is the observable behavior.

**Spy** — wraps the real implementation and records calls. The real code still runs.
Use when you want to verify a side effect without fully replacing the dependency.

**Fake** — a working implementation that is simpler than the real one. An in-memory database
instead of PostgreSQL. Fakes are expensive to build but provide high confidence.

## vi.mock() Patterns

Auto-mock a module and override specific functions:

```ts
import { vi, it, expect } from "vitest";
import { sendWelcomeEmail } from "../src/email";
import { registerUser } from "../src/auth";

vi.mock("../src/email", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

it("sends welcome email on registration", async () => {
  await registerUser({ email: "a@b.com", password: "secret" });
  expect(sendWelcomeEmail).toHaveBeenCalledWith("a@b.com");
});
```

For partial mocks, use `vi.importActual` to keep the rest of the module intact:

```ts
vi.mock("../src/config", async (importActual) => {
  const actual = await importActual<typeof import("../src/config")>();
  return { ...actual, FEATURE_FLAG_X: true };
});
```

## Mocking Modules vs Injecting Dependencies

`vi.mock()` replaces a module at the import level, which is convenient but couples tests to
the module's file path. Dependency injection is more explicit and testable without any mocking
framework:

```ts
// Testable via injection — no vi.mock() needed
class OrderService {
  constructor(private emailer: { send: (to: string) => Promise<void> }) {}
  async placeOrder(order: Order) {
    await this.emailer.send(order.userEmail);
  }
}

it("emails user on order placement", async () => {
  const emailer = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new OrderService(emailer);
  await service.placeOrder({ userEmail: "u@e.com" });
  expect(emailer.send).toHaveBeenCalledWith("u@e.com");
});
```

Prefer dependency injection for new code. Use `vi.mock()` for third-party modules and legacy
code where constructor injection is not practical.

## Avoiding Over-Mocking

The rule: **mock what you own, stub what you do not**. Mocking your own business logic is a
sign that you are testing implementation details, not behavior.

Over-mocked tests pass even when the real code is broken. If you mock away everything except
one line, you are only testing that one line exists — not that the system works.

Ask: "if I delete this implementation and replace it with gibberish, does my test catch it?"
If not, the test is mocking too much.

## Mocking HTTP with MSW (Mock Service Worker)

MSW intercepts fetch/XHR at the network level, giving realistic HTTP mocking that works in
both browser and Node environments:

```ts
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const server = setupServer(
  http.get("https://api.example.com/users/:id", ({ params }) => {
    return HttpResponse.json({ id: params.id, name: "Alice" });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("displays user profile", async () => {
  const user = await fetchUser(1);
  expect(user.name).toBe("Alice");
});

// Override for a specific test
it("handles 404 gracefully", async () => {
  server.use(
    http.get("https://api.example.com/users/:id", () =>
      HttpResponse.json({ error: "Not found" }, { status: 404 })
    )
  );
  await expect(fetchUser(999)).rejects.toThrow("Not found");
});
```

## Mocking Time

Use `vi.useFakeTimers()` to control `Date.now()`, `setTimeout`, `setInterval`, and `Date`:

```ts
it("expires session after 30 minutes of inactivity", () => {
  vi.useFakeTimers();
  const session = createSession();
  expect(session.isExpired()).toBe(false);

  vi.advanceTimersByTime(31 * 60 * 1000); // advance 31 minutes
  expect(session.isExpired()).toBe(true);

  vi.useRealTimers();
});
```

Always restore real timers in `afterEach` or use `vi.useRealTimers()` in cleanup to prevent
timer leaks across tests.

## Mocking the Filesystem

Use memfs or Vitest's `vi.mock("fs")` for filesystem operations:

```ts
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("file content")),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
```

For more complex filesystem interactions, memfs provides a full in-memory filesystem
implementation that drops in as a replacement for the `fs` module.

## Clearing Mocks Between Tests

Configure Vitest to automatically clear mock state between tests:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    clearMocks: true,    // clears call history
    resetMocks: false,   // does not reset implementation
    restoreMocks: true,  // restores spies to original implementation
  },
});
```

Or clear manually when you need fine-grained control:
```ts
afterEach(() => {
  vi.clearAllMocks();    // clear call counts and arguments
  vi.restoreAllMocks();  // restore spied-on originals
});
```

## When Mocks Make Tests Worse

Mocks are harmful when they:
- Replace so much that the test cannot catch integration bugs
- Make tests tightly coupled to implementation details
- Require constant updates when refactoring internals
- Test that a mock was called rather than that behavior occurred

If you find yourself asserting `expect(mockFn).toHaveBeenCalledWith(...)` on every test,
step back and ask whether an integration test would give better coverage with less work.