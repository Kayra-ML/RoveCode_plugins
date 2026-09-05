# Browser Automation

## Playwright Patterns

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0...',
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();

// Always wait for specific state, never arbitrary delays
await page.goto(url, { waitUntil: 'networkidle' });
await page.locator('[data-testid="submit"]').click();
await page.waitForSelector('.success-message');

await browser.close();
```

## Reliable Selectors (priority order)

1. `data-testid` or `data-cy` attributes (most stable)
2. ARIA roles: `page.getByRole('button', { name: 'Submit' })`
3. Labels: `page.getByLabel('Email')`
4. Text: `page.getByText('Submit')`
5. CSS class (fragile, avoid)
6. XPath (last resort)

## Anti-Detection

```typescript
// Randomize timing to appear human
await page.waitForTimeout(Math.random() * 1000 + 500);

// Respect robots.txt and rate limits
// Never automate what terms of service prohibit
```

## Resource Management

Always close browsers, even on error:
```typescript
try {
  await doWork(page);
} finally {
  await browser.close();
}
```