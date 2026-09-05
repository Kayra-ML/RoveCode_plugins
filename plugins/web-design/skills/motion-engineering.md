# Motion Engineering

## Motion Has One Job

Motion communicates. It is not decoration, not personality, not flair — it is information. Every animation should answer a question the user is implicitly asking:

- Where did that come from?
- Where did it go?
- What just changed?
- What can I do next?

If an animation doesn't answer a user's implicit question, remove it.

---

## The Physics of Easing

Easing functions determine how an animation accelerates and decelerates. Choose based on what the motion is communicating:

### ease-out (starts fast, ends slow)
**Use for**: Elements entering the screen, appearing, dropping in.
**Why**: Mimics real objects decelerating as they arrive. Feels natural for things coming toward you.
```css
transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
```

### ease-in (starts slow, ends fast)
**Use for**: Elements leaving the screen, disappearing, exiting.
**Why**: Mimics real objects accelerating as they leave.
```css
transition: transform 200ms cubic-bezier(0.4, 0, 1, 1);
```

### ease-in-out (slow start, fast middle, slow end)
**Use for**: Elements moving from one position to another. Tab switches. Carousel slides.
**Why**: Has a natural arc — objects need to accelerate then decelerate.
```css
transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Spring (overshoots, then settles)
**Use for**: Panels opening, drawers, interactive elements that need life.
**Why**: Springs are organic. Overshoot communicates physicality.
```css
/* CSS approximation of spring */
transition: transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
/* The 1.56 is the overshoot — values > 1 create spring effect */
```

### Linear
**Use for**: Spinners, progress bars, color/opacity crossfades.
**Why**: Consistent rate communicates steady progress.

---

## Timing Reference

### By Element Size and Distance

| Motion | Duration | Easing |
|--------|----------|--------|
| Button press | 50-100ms | ease-out |
| Tooltip | 120ms | ease-out |
| Checkbox check | 150ms | ease-in-out |
| Dropdown open | 150-200ms | ease-out |
| Toggle/switch | 200ms | ease-in-out |
| Sidebar open | 250-300ms | ease-out |
| Modal open | 250-350ms | ease-out |
| Modal close | 150-200ms | ease-in |
| Page transition | 300-400ms | ease-in-out |
| Skeleton → content | 200ms | ease |
| Success state | 300ms | spring |

### Rule: Exits are faster than entrances
Enter: 250ms. Exit: 150ms. Objects leave faster than they arrive.

---

## Animation Choreography

When multiple elements animate together, they need a conductor.

### Stagger Pattern

```css
/* Each child starts 50ms after the previous */
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 50ms; }
.list-item:nth-child(3) { animation-delay: 100ms; }
.list-item:nth-child(4) { animation-delay: 150ms; }
```

```javascript
// Dynamic stagger with JS
items.forEach((item, i) => {
  item.style.animationDelay = `${i * 40}ms`;
});
```

**Stagger rule**: Maximum total stagger duration = 400ms. If you have 20 items at 50ms stagger = 1000ms wait. Too long. Reduce stagger for large lists: `Math.min(i * 30, 300)ms`.

### Choreography Principles

1. **Related elements move together** — a card and its shadow animate as one
2. **Parent before child** — container enters, then content fades in
3. **No more than 3 things moving simultaneously** — more = chaos
4. **Shared axis** — elements entering from the same direction feel coherent

---

## Scroll-Driven Animation

### IntersectionObserver (preferred)

```javascript
// Reveal on scroll — performant, no scroll listener
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle('is-visible', entry.isIntersecting);
    });
  },
  {
    threshold: 0.15,    // 15% visible before triggering
    rootMargin: '0px 0px -50px 0px', // trigger slightly before edge
  }
);

document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
```

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 400ms ease, transform 400ms ease;
}
[data-reveal].is-visible {
  opacity: 1;
  transform: translateY(0);
}
```

### CSS Scroll-Driven Animations (modern, no JS)

```css
@keyframes reveal {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.reveal-on-scroll {
  animation: reveal linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 30%;
}
```

### View Transitions API (page transitions)

```javascript
// Instant, smooth page transitions
async function navigate(url: string) {
  if (!document.startViewTransition) {
    // Fallback for unsupported browsers
    window.location.href = url;
    return;
  }
  
  await document.startViewTransition(async () => {
    const response = await fetch(url);
    const html = await response.text();
    document.body.innerHTML = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.innerHTML;
  });
}
```

```css
/* Customize the transition */
::view-transition-old(root) {
  animation: fade-out 150ms ease-in;
}
::view-transition-new(root) {
  animation: fade-in 250ms ease-out;
}
```

---

## Performance Rules

### Only Animate These Properties

| Property | Why it's safe | Notes |
|----------|--------------|-------|
| `transform` | GPU composited | translate, scale, rotate, skew |
| `opacity` | GPU composited | No layout impact |
| `filter` | GPU composited (usually) | blur, brightness, etc. |
| `clip-path` | GPU composited | Shape transitions |

### Never Animate These (triggers layout)

`width`, `height`, `top`, `left`, `right`, `bottom`, `margin`, `padding`, `border-width`, `font-size`

Animating layout properties causes the browser to recalculate the entire page layout every frame. At 60fps, this is 60 recalculations per second. Causes jank.

**Instead**: Use `transform: scale()` instead of width/height, `transform: translate()` instead of top/left.

### will-change

```css
/* Use sparingly — only for animations that are definitely happening */
.panel {
  will-change: transform; /* tells browser to prepare GPU layer */
}
/* Remove after animation completes */
panel.addEventListener('transitionend', () => {
  panel.style.willChange = 'auto';
});
```

### prefers-reduced-motion — Non-Negotiable

```css
/* ALWAYS include this */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This is not optional. Some users experience nausea or seizures from motion. It is a legal accessibility requirement in many jurisdictions.

---

## Common Motion Anti-Patterns

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Animating layout properties | Causes jank | Use transform + opacity only |
| Long entrance animations (> 500ms) | Delays task completion | Keep UI animations ≤ 300ms |
| Decorative loops | Distract, cause fatigue | Remove if it doesn't communicate something |
| All elements animate simultaneously | Chaos, no reading order | Stagger, or animate only the key element |
| No exit animation | Objects pop out of existence | Add fast exit (150ms ease-in) |
| Ignoring prefers-reduced-motion | Accessibility failure + legal risk | Always implement the @media query |
| Spring overshoot on large elements | Looks broken | Reserve spring for small/medium elements |
| Hover animations on mobile | Never triggered | Use touch/tap alternatives |