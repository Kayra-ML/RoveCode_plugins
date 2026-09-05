# Responsive Design

## Mental Model: Content-Out, Not Device-In

Responsive design is not about targeting devices. It is about making content readable and functional at any viewport. The breakpoint is where your content breaks — not where Apple decided to release a screen size.

Start with the content. Make it work on a 320px screen. Add complexity as space allows.

---

## Mobile-First: The Correct Default

Write base styles for the smallest viewport. Layer complexity upward with `min-width` queries. Never write desktop styles and then "fix" mobile — that is a rework, not responsive design.

```css
/* BASE: 320px — smallest supported */
.container {
  width: 100%;
  padding-inline: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

/* SMALL: 480px — slightly larger phones */
@media (min-width: 30em) {
  .container { padding-inline: 1.5rem; }
}

/* MEDIUM: 768px — tablet and up */
@media (min-width: 48em) {
  .grid { grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
  .container { padding-inline: 2rem; }
}

/* LARGE: 1024px — laptop and up */
@media (min-width: 64em) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}

/* XL: 1280px — wide screens */
@media (min-width: 80em) {
  .container { max-width: 1280px; margin-inline: auto; }
}
```

**Why em units for breakpoints**: `em` breakpoints respect browser font size preferences. A user who has set their browser to 20px base font will get the wider layout sooner, which is correct — they need more space.

---

## Breakpoint Strategy

Do not use device-specific breakpoints (768px = iPad, 1024px = iPad Pro). These are wrong because:
1. Device landscape changes every year
2. Users resize browsers
3. Content determines breakpoints, not hardware

### Content-Based Breakpoints

Find where your content breaks. Common natural breakpoints:
- **320-360px**: Smallest phones. Base layout must work here.
- **480px**: Large phones, comfortable single-column.
- **640-768px**: Tablet portrait. Two-column becomes available.
- **1024px**: Tablet landscape / small laptop. Three-column, sidebar patterns.
- **1280px**: Standard desktop. Max-width container often kicks in.
- **1536-1920px**: Wide screens. Content should not stretch indefinitely.

### Max-Width Strategy

Content should not stretch across a 2560px monitor:

```css
.container {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: clamp(1rem, 5vw, 3rem); /* fluid padding */
}

/* Narrow containers for prose */
.prose {
  max-width: 65ch; /* optimal reading measure */
  margin-inline: auto;
}
```

---

## Fluid Typography

Never hard-code font sizes at specific breakpoints. Use `clamp()` for continuous scaling:

```css
:root {
  /* clamp(minimum, preferred, maximum) */
  /* preferred = viewport-relative value that scales between min and max */
  
  --text-sm:   clamp(0.75rem,  0.7rem  + 0.25vw, 0.875rem);
  --text-base: clamp(1rem,     0.9rem  + 0.5vw,  1.125rem);
  --text-lg:   clamp(1.125rem, 1rem    + 0.75vw, 1.25rem);
  --text-xl:   clamp(1.25rem,  1rem    + 1.25vw, 1.75rem);
  --text-2xl:  clamp(1.5rem,   1rem    + 2vw,    2.25rem);
  --text-3xl:  clamp(2rem,     1.25rem + 3vw,    3.5rem);
  --text-4xl:  clamp(2.5rem,   1.5rem  + 5vw,    5rem);
}
```

### Calculating clamp() Values

Formula: `clamp(min, preferred, max)`

Where `preferred = [slope] * 100vw + [intercept]`

To scale from 1rem (16px) at 320px to 1.125rem (18px) at 1280px:
- Slope = (18 - 16) / (1280 - 320) = 2/960 ≈ 0.00208
- At 100vw: 0.00208 * 100 = 0.208vw ≈ 0.2vw
- Intercept = 16 - 0.208 * 320 ≈ 16 - 66.56...

Use a clamp calculator tool for precision. Approximate is fine for body text; use exact values for display headings.

---

## Container Queries

Container queries let components respond to their container's size, not the viewport. This is more useful than media queries for component design.

```css
/* Step 1: Define a container */
.card-wrapper {
  container-type: inline-size;
  container-name: card;
}

/* Step 2: Style the component based on container size */
.card {
  /* Mobile layout by default */
  display: grid;
  grid-template-columns: 1fr;
}

@container card (min-width: 400px) {
  .card {
    /* Horizontal layout when container is wide enough */
    grid-template-columns: 120px 1fr;
    align-items: center;
  }
}

@container card (min-width: 600px) {
  .card {
    grid-template-columns: 200px 1fr auto;
  }
}
```

**Why this beats media queries for components**: The same card component works in a narrow sidebar AND a wide main content area without duplicate CSS. The component responds to its own context.

### Container Query Units

```css
@container (min-width: 400px) {
  .card-title {
    font-size: 1.5cqw; /* 1.5% of container width */
    /* Scales with container, not viewport */
  }
}
```

---

## Responsive Navigation Patterns

Navigation is the hardest responsive problem. Options ranked by quality:

### 1. Persistent Navigation (best for 3-6 items)
All items always visible. Reflows from horizontal (desktop) to stacked/scrollable (mobile).
```css
.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
```

### 2. Priority+ Pattern (best for 5-10 items)
Show as many items as fit. Overflow into "More" dropdown.
```javascript
function priorityNav(nav, moreBtn) {
  const items = [...nav.children];
  const navWidth = nav.offsetWidth;
  let usedWidth = moreBtn.offsetWidth;
  
  items.forEach(item => {
    usedWidth += item.offsetWidth;
    item.hidden = usedWidth > navWidth;
  });
}
```

### 3. Bottom Tab Bar (best for mobile apps, 3-5 items)
Fixed to bottom of viewport. Thumb-reachable. Always visible.
```css
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  padding-bottom: env(safe-area-inset-bottom); /* iPhone notch */
}
```

### 4. Hamburger Menu (last resort, 7+ items or complex structure)
Hides navigation. Use only when necessary. Must be:
- Labeled ("Menu", not just ☰)
- Keyboard accessible
- Focus-trapped when open

---

## Touch and Mobile Specifics

### Touch Target Sizes

WCAG 2.5.5 requires 44×44px minimum touch targets. Apple HIG recommends 44pt. Google Material recommends 48dp.

```css
/* Make small elements tappable without changing visual size */
.icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
}
.icon-btn::before {
  content: '';
  position: absolute;
  inset: -10px; /* extends tap area by 10px in each direction */
}
```

### Preventing Zoom on Input Focus (iOS)

iOS zooms in when an input has font-size < 16px:
```css
input, select, textarea {
  font-size: 16px; /* prevents iOS zoom */
}
```

### Safe Area Insets (iPhone notch / Dynamic Island)

```css
.header {
  padding-top: max(1rem, env(safe-area-inset-top));
}
.bottom-nav {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

### Hover is Not Available on Touch

Any interaction that is only possible on hover is invisible on mobile:
- Hover tooltips → add tap trigger
- Hover menus → add tap trigger  
- Hover-only "reveal" content → always visible or tap-triggered
- CSS `:hover` effects → acceptable for visual polish, not functional

---

## Responsive Images

```html
<!-- Always specify dimensions to prevent CLS -->
<img
  src="hero-800.webp"
  srcset="hero-400.webp 400w, hero-800.webp 800w, hero-1600.webp 1600w"
  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 800px"
  width="800"
  height="450"
  alt="Product dashboard showing analytics"
  loading="lazy"
  decoding="async"
>
```

### Art Direction with `<picture>`

When the image composition needs to change (not just size):

```html
<picture>
  <!-- Portrait crop for mobile -->
  <source
    media="(max-width: 768px)"
    srcset="hero-portrait.webp"
  >
  <!-- Wide landscape for desktop -->
  <source
    media="(min-width: 769px)"
    srcset="hero-landscape.webp"
  >
  <img src="hero-landscape.webp" alt="..." width="1600" height="600">
</picture>
```

---

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| `overflow-x: hidden` on body | Breaks `position: sticky`, hides scroll bugs | Fix the overflow cause instead |
| Fixed px widths on containers | Breaks at small viewports | Use max-width + 100% |
| Desktop-first then "fix" mobile | Cascades fight each other | Start mobile, add complexity up |
| Viewport-only breakpoints | Components break in sidebars | Add container queries |
| Hover-only functionality | Invisible on touch | Provide touch equivalents |
| iOS font-size below 16px | Triggers zoom on focus | 16px minimum on inputs |
| No safe-area-inset padding | UI cut off by notch | Use env() variables |
| Touch targets below 44px | Users miss taps | Extend with ::before padding |