# Scraping Strategy

## Architecture Decision

| Scenario | Approach |
|----------|----------|
| Static HTML | HTTP + cheerio/parse5 |
| JS-rendered content | Playwright/Puppeteer |
| Official data | Use the API if available |
| Large scale | Distributed + queue |

## Ethical Scraping

- Check robots.txt before scraping
- Respect rate limits (1 req/sec minimum gap for unknown sites)
- Identify your bot in User-Agent
- Don't scrape what terms of service prohibit
- Prefer official APIs

## Selector Strategy

```typescript
// Prefer structural selectors over fragile class names
const price = $('[data-price]').text();          // stable
const price = $('.price-display-v3-new').text(); // fragile

// Multiple fallback selectors
const text = $('[data-content]').text() 
  || $('article p:first-child').text()
  || '';
```

## Rate Limiting

```typescript
class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  
  constructor(
    private maxConcurrent: number,
    private minDelayMs: number
  ) {}
  
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitSlot();
    try {
      return await fn();
    } finally {
      await sleep(this.minDelayMs);
      this.release();
    }
  }
}
```