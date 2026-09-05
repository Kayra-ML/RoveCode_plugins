# Browser QA

## QA is Not an Afterthought

Browser QA discovered after launch means rework. Build QA into the development process:
- Test on real devices, not just browser emulation
- Test at every PR for critical paths
- Automate what can be automated
- Manual test what can't be automated

---

## Browser Support Matrix

Define support before building. Never assume.

### How to Define Your Support Matrix

1. Check your analytics — what browsers do YOUR users actually use?
2. Check project requirements — are there enterprise IE11 users?
3. Define support tiers:

| Tier | Definition | Response |
|------|-----------|----------|
| **Supported** | Must work perfectly | Fix all bugs |
| **Degraded** | Must be usable | Progressive enhancement acceptable |
| **Unsupported** | Not tested | May not work |

### Modern Baseline (2025)

For most consumer products targeting 2025:
- Chrome 120+ ✓ Supported
- Safari 17+ ✓ Supported
- Firefox 121+ ✓ Supported
- Edge 120+ ✓ Supported
- iOS Safari 16+ ✓ Supported
- Samsung Internet 23+ ✓ Supported
- Chrome Android 120+ ✓ Supported

This baseline supports: container queries, :has(), cascade layers, subgrid, view transitions, color-mix().

---

## Common Cross-Browser Issues

### Safari Specific

| Issue | Safari version | Fix |
|-------|---------------|-----|
| `gap` in flexbox | Fixed in 14.1 | Add `margin` fallback for 14.0- |
| `aspect-ratio` | Fixed in 15 | Use padding-top % hack for 14- |
| `:has()` selector | Fixed in 15.4 | Don't use in critical paths without fallback |
| Scroll behavior smooth | Fixed in 15.4 | JS polyfill for older |
| `dvh` units | Fixed in 15.4 | Use `100vh` fallback |
| Subgrid | Fixed in 16 | Flexbox fallback |
| `color-mix()` | Fixed in 16.2 | Hardcode fallback colors |
| Container queries | Fixed in 16 | Media query fallback |
| View Transitions | Not supported (as of 2024) | Polyfill or skip gracefully |

```css
/* iOS Safari height fix — dvh vs vh */
.full-height {
  height: 100vh;           /* fallback */
  height: 100dvh;          /* dynamic viewport height — correct on mobile */
}
```

### Firefox Specific

| Issue | Notes |
|-------|-------|
| Custom scrollbars | Only `scrollbar-width` + `scrollbar-color` (not `::-webkit-scrollbar`) |
| `-webkit-` prefixes | Don't use for non-webkit. Use standard properties. |
| SVG filter effects | Minor differences in blur radius rendering |
| `backdrop-filter` | Supported, but may require `isolation: isolate` on parent |

```css
/* Custom scrollbar — cross-browser */
/* Firefox */
.scrollable {
  scrollbar-width: thin;
  scrollbar-color: hsl(215, 16%, 70%) transparent;
}

/* Chrome, Safari, Edge */
.scrollable::-webkit-scrollbar { width: 6px; }
.scrollable::-webkit-scrollbar-track { background: transparent; }
.scrollable::-webkit-scrollbar-thumb {
  background: hsl(215, 16%, 70%);
  border-radius: 3px;
}
```

---

## Progressive Enhancement

Build for the baseline. Enhance for capable browsers.

```css
/* Base layout — works everywhere */
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

/* Enhanced — container queries */
@supports (container-type: inline-size) {
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .grid-item {
    container-type: inline-size;
  }
}
```

```javascript
// Feature detection before using
if ('startViewTransition' in document) {
  document.startViewTransition(() => navigate());
} else {
  navigate(); // fallback: instant navigation
}
```

---

## Visual Regression Testing

Catch unintended visual changes automatically.

### Playwright Screenshot Testing

```typescript
import { test, expect } from '@playwright/test';

test.describe('Visual regression', () => {
  test('homepage matches snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Full page screenshot
    await expect(page).toHaveScreenshot('homepage.png', {
      fullPage: true,
      threshold: 0.02, // 2% pixel difference allowed
    });
  });
  
  test('card component states', async ({ page }) => {
    await page.goto('/components/card');
    
    // Hover state
    await page.hover('.card');
    await expect(page.locator('.card')).toHaveScreenshot('card-hover.png');
    
    // Focus state
    await page.focus('.card-link');
    await expect(page.locator('.card')).toHaveScreenshot('card-focus.png');
  });
});
```

### Breakpoint Testing

```typescript
const BREAKPOINTS = [320, 375, 768, 1024, 1280, 1440, 1920];

for (const width of BREAKPOINTS) {
  test(`homepage at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page).toHaveScreenshot(`homepage-${width}.png`);
  });
}
```

---

## Manual QA Checklist

Run before every release. Not optional.

### Layout & Visual

- [ ] No horizontal overflow at 320px, 375px, 768px, 1280px, 1440px
- [ ] No text truncation that loses meaning
- [ ] Images load at correct aspect ratio
- [ ] Custom fonts load without FOUT in production (check with slow 3G throttle)
- [ ] Dark/light mode — no flash of wrong mode on load
- [ ] Dark/light mode — all text passes contrast in both modes
- [ ] Print stylesheet — if applicable, content is printable

### Interaction

- [ ] All buttons and links have visible hover state
- [ ] All interactive elements have visible focus state
- [ ] Tab order matches visual order
- [ ] Keyboard navigation through primary user flow works end-to-end
- [ ] Modal focus trap works (tab stays inside modal)
- [ ] Escape closes modal/drawer/dropdown

### Forms

- [ ] All inputs have visible labels
- [ ] Required fields marked and explained
- [ ] Error messages appear on blur (not on every keystroke)
- [ ] Error messages are specific ("Enter your email" not "Invalid")
- [ ] Form submits on Enter in single-field forms
- [ ] Successful submission confirmed clearly
- [ ] Form does NOT reset on validation error

### Performance

- [ ] Lighthouse score: Performance ≥ 80, Accessibility ≥ 90, Best Practices ≥ 90
- [ ] LCP < 2.5s on throttled connection (Lighthouse mobile)
- [ ] No console errors in production build
- [ ] Images have alt attributes
- [ ] No render-blocking resources

### Cross-Browser

- [ ] Chrome (latest)
- [ ] Safari (latest — test on real iOS device, not emulator)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] iOS Safari 16+ (real device)
- [ ] Android Chrome (emulated at minimum)

---

## Device Testing

Browser emulation in DevTools is not sufficient for:
- Touch events and gesture behavior
- iOS Safari rendering (it has its own WebKit quirks)
- Real network conditions
- GPU rendering differences
- Input method behavior (virtual keyboard, autocomplete)

### Minimum Real Device Testing

| Device | Why |
|--------|-----|
| iPhone (recent, iOS Safari) | iOS Safari = unique WebKit, different from desktop Safari |
| Android phone (Chrome) | Real touch targets, viewport behavior |
| iPad (Safari) | Pointer + touch hybrid |

If real devices aren't available: BrowserStack or Sauce Labs for remote real-device testing.