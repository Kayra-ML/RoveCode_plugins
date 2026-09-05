# E2E Testing

## Playwright Architecture

Playwright operates through three layers: **BrowserType** (Chromium/Firefox/WebKit),
**BrowserContext** (isolated session with its own cookies, localStorage, and auth state),
and **Page** (a single browser tab). Understanding this hierarchy is essential.

Each test should use a fresh context unless you are deliberately sharing auth state:

```ts
test.beforeEach(async ({ page }) => {
  // page is a fresh context by default in Playwright Test
  await page.goto("/dashboard");
});
```

## Page Object Model

Page objects encapsulate selectors and actions for a page or component. They make tests
readable and reduce duplication:

```ts
// pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
  }

  async getErrorMessage() {
    return this.page.getByRole("alert").textContent();
  }
}

// tests/auth.spec.ts
test("shows error for wrong password", async ({ page }) => {
  const login = new LoginPage(page);
  await page.goto("/login");
  await login.login("user@example.com", "wrong");
  expect(await login.getErrorMessage()).toContain("Invalid credentials");
});
```

## Stable Selectors

Selector choice determines test stability. Priority order:

1. **`getByRole`** — semantic, accessible, resilient to visual changes
2. **`getByLabel`** — for form fields
3. **`getByTestId`** — for complex components with no good role
4. **`getByText`** — for visible text that is stable
5. CSS selectors — last resort, brittle

```ts
// Preferred
await page.getByRole("button", { name: "Submit" }).click();
await page.getByLabel("Email address").fill("user@example.com");

// Acceptable for complex components
await page.getByTestId("price-calculator").getByRole("spinbutton").fill("50");

// Avoid — breaks on class renames
await page.locator(".btn-primary.submit-form").click();
```

## Waiting Strategies

Never use `page.waitForTimeout(2000)`. Fixed timeouts make tests slow and still flaky.
Playwright's auto-waiting handles most cases, but when you need explicit waits:

```ts
// Wait for network idle after navigation
await page.goto("/dashboard", { waitUntil: "networkidle" });

// Wait for a specific element state
await page.getByRole("status").waitFor({ state: "visible" });

// Wait for a response
const [response] = await Promise.all([
  page.waitForResponse(r => r.url().includes("/api/users")),
  page.getByRole("button", { name: "Load" }).click(),
]);
expect(response.status()).toBe(200);
```

## Network Interception for API Stubbing

Intercept API calls to test loading states, errors, and edge cases without a real backend:

```ts
await page.route("**/api/users", async route => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ id: 1, name: "Alice" }]),
  });
});

// Test error state
await page.route("**/api/data", route => route.fulfill({ status: 500 }));
```

## Auth State Reuse Between Tests

Re-running login for every test is slow. Save auth state once and reuse it:

```ts
// playwright/.auth/user.json is created by a setup project
// playwright.config.ts
export default defineConfig({
  projects: [
    {
      name: "setup",
      testMatch: /auth.setup.ts/,
    },
    {
      name: "authenticated",
      use: { storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});

// auth.setup.ts
const authFile = "playwright/.auth/user.json";
test("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.TEST_USER!);
  await page.getByLabel("Password").fill(process.env.TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
  await page.context().storageState({ path: authFile });
});
```

## CI Optimization

Parallel shards cut E2E suite time proportionally:
```yaml
# GitHub Actions matrix
strategy:
  matrix:
    shardIndex: [1, 2, 3, 4]
    shardTotal: [4]
steps:
  - run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
```

Enable retries only for CI, never locally — flaky tests on retry are bugs that need fixing:
```ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
});
```

## Visual Comparison Testing

Playwright's `toHaveScreenshot()` catches unintended visual regressions:
```ts
test("dashboard matches snapshot", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveScreenshot("dashboard.png", { maxDiffPixels: 50 });
});
```

Update baselines intentionally: `npx playwright test --update-snapshots`

## Debugging

```bash
# Opens browser with Playwright Inspector
npx playwright test --debug

# Record a new test by interacting with the browser
npx playwright codegen https://yourapp.com

# Headed mode to watch execution
npx playwright test --headed

# Show trace viewer after a failed run
npx playwright show-trace test-results/trace.zip
```