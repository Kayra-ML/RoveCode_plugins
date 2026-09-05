# Web Performance

## Why Performance is a Design Decision

Performance is not the developer's problem after design is done. Every design decision has a performance cost:
- Full-page hero video: 10-50MB autoplay = 15+ second load on mobile
- 12 custom font weights loaded: 2MB extra = 3 second LCP delay
- 47 third-party scripts: 6MB JS = 8 second TTI
- 1600px images served to 375px screens: 10× wasted bytes

Performance is designed first, implemented second.

---

## Core Web Vitals

Google's user-experience metrics. They affect search rankings.

| Metric | Measures | Good | Needs Work | Poor |
|--------|---------|------|-----------|------|
| **LCP** — Largest Contentful Paint | Load speed of main content | < 2.5s | 2.5-4s | > 4s |
| **INP** — Interaction to Next Paint | Response to user input | < 200ms | 200-500ms | > 500ms |
| **CLS** — Cumulative Layout Shift | Visual stability | < 0.1 | 0.1-0.25 | > 0.25 |

### Diagnosing CLS

CLS happens when content moves after initial render. Common causes:
1. Images without width/height attributes
2. Ads or embeds with no reserved space
3. Web fonts causing text reflow (FOUT)
4. Dynamically injected content above existing content

```html
<!-- WRONG: no dimensions — browser doesn't know size until image loads -->
<img src="hero.jpg" alt="...">

<!-- RIGHT: dimensions reserved — no layout shift -->
<img src="hero.jpg" alt="..." width="1200" height="600">
<!-- Or with CSS: -->
<style>
img { aspect-ratio: 16/9; width: 100%; height: auto; }
</style>
```

---

## Image Optimization

Images are typically 50-80% of page weight. Optimize aggressively.

### Format Selection

| Content | Format | Why |
|---------|--------|-----|
| Photos | AVIF > WebP > JPEG | AVIF: 50% smaller than JPEG; WebP: 30% smaller |
| Icons, logos | SVG | Resolution-independent, tiny |
| Transparency | WebP (with alpha) > PNG | WebP alpha is smaller than PNG |
| Animations | WebP / AVIF (animated) > GIF | GIF is 10-20× larger than alternatives |

```html
<!-- Progressive enhancement with <picture> -->
<picture>
  <source type="image/avif" srcset="hero.avif">
  <source type="image/webp" srcset="hero.webp">
  <img src="hero.jpg" alt="..." width="1200" height="600" 
       loading="lazy" decoding="async">
</picture>
```

### Responsive Images with srcset

```html
<img
  srcset="
    image-480.webp   480w,
    image-800.webp   800w,
    image-1200.webp 1200w,
    image-1600.webp 1600w
  "
  sizes="
    (max-width: 480px)  480px,
    (max-width: 768px)  800px,
    (max-width: 1280px) 1200px,
    1600px
  "
  src="image-800.webp"
  alt="..."
  width="1600"
  height="900"
>
```

### Loading Priority

```html
<!-- Hero image: preload, no lazy -->
<link rel="preload" as="image" href="hero.webp" fetchpriority="high">
<img src="hero.webp" alt="..." fetchpriority="high">

<!-- Below-fold images: lazy load -->
<img src="feature.webp" alt="..." loading="lazy" decoding="async">

<!-- LCP candidate: never lazy load -->
<!-- If an image is the likely LCP element, do NOT add loading="lazy" -->
```

---

## Font Loading Strategy

Fonts block rendering. Get them out of the critical path.

### Preload Critical Fonts

```html
<head>
  <!-- Preload only the font variants used in critical text -->
  <link rel="preload" href="/fonts/Inter-Regular.woff2"
        as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/Inter-SemiBold.woff2"
        as="font" type="font/woff2" crossorigin>
</head>
```

### font-display Strategies

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;      /* Show fallback immediately, swap when loaded */
}

/* font-display values:
   auto     — browser decides (usually block)
   block    — hide text for ~3s, then show (causes FOIT)
   swap     — show fallback immediately, swap (causes FOUT)
   fallback — hide for ~100ms, swap within 3s, keep fallback after
   optional — no swap if not cached (best for performance, slight FOUT risk)
*/
```

### Size-Adjust for Fallback Fonts

Reduce FOUT impact by making fallback font match custom font metrics:

```css
@font-face {
  font-family: 'Inter-fallback';
  src: local('Arial');
  size-adjust: 107%;       /* scale to match Inter's metrics */
  ascent-override: 90%;
  descent-override: 22%;
}

body {
  font-family: 'Inter', 'Inter-fallback', sans-serif;
}
```

---

## JavaScript Performance

### Loading Strategy

```html
<!-- Critical JS: defer (doesn't block parsing) -->
<script defer src="/js/app.js"></script>

<!-- Non-critical JS: lazy load when needed -->
<!-- Don't include analytics, chat widgets, etc. in initial load -->

<!-- Third-party: async + preconnect -->
<link rel="preconnect" href="https://analytics.example.com">
<script async src="https://analytics.example.com/script.js"></script>
```

### Interaction to Next Paint (INP)

INP fails when the main thread is blocked during a user interaction. Causes:
- Heavy JS executing during click/key handlers
- Long tasks (> 50ms) blocking the main thread
- Unoptimized event handlers

```javascript
// Breaking up long tasks
function processLargeArray(items) {
  const CHUNK_SIZE = 100;
  let index = 0;
  
  function processChunk() {
    const end = Math.min(index + CHUNK_SIZE, items.length);
    for (; index < end; index++) {
      process(items[index]);
    }
    if (index < items.length) {
      // Yield to browser between chunks
      setTimeout(processChunk, 0);
      // Or use scheduler API (modern):
      // scheduler.postTask(processChunk, { priority: 'background' });
    }
  }
  
  processChunk();
}
```

---

## CSS Performance

```css
/* Avoid deep selectors — specificity and performance */
/* Bad */
.page > .container > .section > .card > .card-header > h2 { }

/* Good */
.card-title { }

/* Use @layer to manage cascade without specificity wars */
@layer base, components, utilities;

@layer base {
  h2 { font-size: var(--text-2xl); }
}

@layer components {
  .card-title { font-size: var(--text-xl); } /* overrides without !important */
}

/* Critical CSS inline, rest deferred */
/* Only styles needed for above-the-fold content in <style> tag */
```

---

## Perceived Performance

Perceived performance ≠ actual performance. Make it feel fast:

### Skeleton Screens

Replace blank loading states with content-shaped placeholders. Users perceive skeleton screens as faster than spinners even if actual load time is identical.

### Optimistic UI

Update the UI before server confirms. For mutations that are unlikely to fail:
```typescript
// User clicks "Save" → UI updates immediately → server call in background
```

### Prefetching

```html
<!-- Prefetch: fetch resource in background for likely next navigation -->
<link rel="prefetch" href="/dashboard" as="document">

<!-- Prerender: render the likely next page in background -->
<script type="speculationrules">
{
  "prerender": [
    { "urls": ["/dashboard"] }
  ]
}
</script>
```

### View Transitions API

Makes page navigations feel instant with smooth visual transitions — no framework required:

```css
/* Define transition elements by name */
.product-image {
  view-transition-name: product-hero;
}
```

```javascript
document.startViewTransition(() => {
  // DOM update here — browser handles the transition animation
  renderNewPage();
});
```

---

## Performance Budget

Define a budget before building. Enforce it in CI.

| Resource | Recommended Budget |
|----------|-------------------|
| Total page weight (initial) | < 500KB |
| JavaScript (compressed) | < 150KB |
| CSS (compressed) | < 50KB |
| Images (per page) | < 300KB |
| Custom fonts (total) | < 100KB |
| Time to Interactive | < 3.5s on 3G |
| LCP | < 2.5s |

```json
// package.json — enforce with bundlesize or size-limit
{
  "size-limit": [
    { "path": "dist/js/app.js", "limit": "150 kB" },
    { "path": "dist/css/app.css", "limit": "50 kB" }
  ]
}
```