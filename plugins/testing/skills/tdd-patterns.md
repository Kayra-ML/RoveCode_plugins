# TDD Patterns

## The Red-Green-Refactor Cycle

TDD is a discipline with three strict phases:

1. **Red** — write a failing test for the next small piece of behavior. Do not write any
   production code yet. Run the test and confirm it fails for the right reason.
2. **Green** — write the simplest possible production code that makes the test pass. Do not
   optimize or generalize yet. Ugly code is acceptable here.
3. **Refactor** — clean up both the production code and the test without changing behavior.
   Run the tests again to confirm they still pass.

The cycle should complete in minutes, not hours. If a red-green-refactor cycle takes more
than 10–15 minutes, the step is too large — break it down further.

## When TDD Pays Off

TDD is most valuable for:
- Complex business logic with many branching conditions
- Algorithms where correctness is hard to verify visually
- Public APIs and library code (tests become the contract)
- Bug fixes (test proves the bug, fix makes it green)

TDD adds overhead for:
- Exploratory prototyping (throw it away and write tests after)
- UI layout and visual work
- Glue code that delegates entirely to well-tested libraries

The decision is pragmatic. TDD is a tool, not a moral obligation.

## Outside-In TDD (Acceptance Test First)

Start with a failing high-level test that describes a user-observable behavior, then drive
the implementation from the outside in:

```ts
// Step 1: Write failing acceptance test
it("user can register with email and password", async () => {
  const res = await request(app).post("/register").send({ email: "a@b.com", password: "secret" });
  expect(res.status).toBe(201);
  expect(res.body.token).toBeDefined();
});

// Step 2: Write failing unit tests for each component as you implement it
// Step 3: Make each unit test green, which drives the acceptance test green
```

Outside-in TDD (also called London-school TDD) uses mocks extensively to isolate each layer.

## Inside-Out TDD (Unit Test First)

Start with the lowest-level components and build upward:

```ts
// Step 1: Test the hash utility
it("hashes password with bcrypt", async () => {
  const hash = await hashPassword("secret");
  expect(await verify("secret", hash)).toBe(true);
});

// Step 2: Test the user repository
// Step 3: Test the registration service
// Step 4: Test the HTTP handler
```

Inside-out TDD (also called Chicago-school or classicist TDD) prefers real collaborators over
mocks. The system emerges from tested components. Fewer mocks mean more integration confidence.

## TDD for Bug Fixes

Always write a failing test that reproduces the bug before touching production code:

```ts
// The bug: discount was applied twice for premium monthly users
it("applies discount only once for premium monthly subscription", () => {
  const order = { price: 100, user: { tier: "premium" }, billing: "monthly" };
  expect(calculateTotal(order)).toBe(80); // was returning 64 (double discount)
});
```

This gives you:
- A regression test that prevents the bug from returning
- Confidence that your fix is correct
- Documentation of what was wrong

## Triangulation

When the correct general solution is not obvious, write multiple tests to triangulate toward
it rather than guessing:

```ts
it("returns 0 for empty list", () => expect(sum([])).toBe(0));
it("returns the single value for a one-element list", () => expect(sum([5])).toBe(5));
it("sums all elements for a multi-element list", () => expect(sum([1, 2, 3])).toBe(6));
```

Each test forces the implementation to become more general. After the first test, `return 0`
passes. After the second, `return arr[0] ?? 0` passes. Only after the third does the real
implementation emerge.

## Tests as Documentation

A TDD test suite is the most accurate documentation in the codebase because it is always
in sync with reality. Write test names that a non-technical stakeholder could understand:

```ts
describe("Subscription billing", () => {
  it("charges immediately on first subscription")
  it("charges on renewal date, not signup date")
  it("does not charge during trial period")
  it("sends invoice email within 5 minutes of charge")
  it("retries failed charge up to 3 times before cancelling")
});
```

## TDD and Mocking Tradeoffs

Heavy use of mocks in TDD (outside-in style) has a cost: tests pass even when components
are wired together incorrectly. The mock defines an interface that may not match reality.

Balance by combining:
- Unit tests with mocks for isolated logic
- Integration tests without mocks to verify that components compose correctly

## Practical TDD Workflow for a REST Endpoint

```
1. Write failing integration test: POST /orders returns 201 with order id
2. Create the route handler — minimal, no logic
3. Write failing unit test: OrderService.create validates stock availability
4. Implement OrderService.create
5. Write failing unit test: OrderService.create deducts inventory
6. Implement inventory deduction
7. Integration test goes green
8. Refactor handler and service for clarity
```

Each test is the smallest increment that adds value. Never write two failing tests at once.