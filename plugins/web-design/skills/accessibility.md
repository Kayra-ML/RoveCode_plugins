# Accessibility

## Accessibility is Not a Feature

Accessibility is not a checklist item added at the end of a project. It is how you build interfaces. Inaccessible interfaces:

- Exclude users with disabilities (estimated 15-20% of the global population)
- Fail legal requirements in many jurisdictions (ADA, WCAG, EN 301 549)
- Have worse SEO (semantic HTML = better machine readability)
- Have worse code quality (semantic HTML is simpler HTML)

The good news: accessible-by-default requires less code, not more. `<button>` does more than `<div role="button" tabindex="0" onkeydown="...">`.

---

## WCAG Standards

| Level | Requirement | When to use |
|-------|-------------|-------------|
| A | Minimum — critical barriers removed | Never ship below this |
| AA | Standard — broad accessibility | Target for all products |
| AAA | Enhanced — maximum accessibility | Target for critical flows |

Most legal requirements reference WCAG 2.1 AA.

---

## Contrast Ratios

| Text type | Minimum (AA) | Enhanced (AAA) |
|-----------|-------------|----------------|
| Normal text (< 18pt / < 14pt bold) | 4.5:1 | 7:1 |
| Large text (≥ 18pt / ≥ 14pt bold) | 3:1 | 4.5:1 |
| UI components, icons | 3:1 | — |
| Decorative content | No requirement | — |

### Checking Contrast

Tools: WebAIM Contrast Checker, browser DevTools (Chrome has built-in), Figma plugins (Contrast, Able).

```css
/* These are NOT just about accessibility — low contrast text is hard to read for everyone */

/* Good: 15.1:1 — excellent contrast */
color: hsl(215, 25%, 15%);    /* near-black text */
background: hsl(0, 0%, 100%); /* white */

/* Risky: 4.6:1 — barely passes AA */
color: hsl(215, 16%, 45%);
background: hsl(0, 0%, 100%);

/* Fails: 2.8:1 — common mistake: gray on white */
color: hsl(215, 16%, 65%);
background: hsl(0, 0%, 100%);
```

---

## Semantic HTML: The Foundation

Use the correct element. ARIA supplements semantics — it does not replace them.

### The Right Element for Every Job

```html
<!-- Navigation -->
<nav aria-label="Main">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>

<!-- Page structure -->
<header><!-- site header --></header>
<main><!-- primary content, one per page --></main>
<aside aria-label="Related articles"><!-- secondary --></aside>
<footer><!-- site footer --></footer>

<!-- Headings: one h1 per page, hierarchical -->
<h1>Page Title</h1>
  <h2>Section</h2>
    <h3>Subsection</h3>

<!-- Actions: button for actions, a for navigation -->
<button type="button">Open modal</button>     <!-- triggers action -->
<button type="submit">Submit form</button>    <!-- submits form -->
<a href="/products">Browse products</a>       <!-- navigates -->
<a href="/doc.pdf" download>Download PDF</a>  <!-- download -->

<!-- Never -->
<div onclick="doSomething()">Click me</div>  <!-- missing keyboard, role, semantics -->
```

### When ARIA IS Appropriate

```html
<!-- Labeling when visible label isn't present -->
<button aria-label="Close dialog">
  <svg aria-hidden="true" focusable="false">...</svg>
</button>

<!-- Describing relationships -->
<input id="email" aria-describedby="email-hint email-error">
<p id="email-hint">We'll never share your email.</p>
<p id="email-error" role="alert" hidden>Enter a valid email address.</p>

<!-- Dynamic content announcements -->
<div role="status" aria-live="polite">
  <!-- Changes here announced to screen readers -->
  3 results found
</div>
<div role="alert" aria-live="assertive">
  <!-- Urgent — interrupts current reading -->
  Error: Connection failed
</div>

<!-- Expanded/collapsed state -->
<button aria-expanded="false" aria-controls="menu">Menu</button>
<ul id="menu" hidden>...</ul>
```

---

## Keyboard Navigation

Every task completable with a mouse must be completable with a keyboard alone.

### Tab Order

Tab key moves focus through interactive elements in DOM order. Ensure:
1. DOM order matches visual order
2. No focus traps outside of intentional modals
3. Skip links for users who don't want to tab through navigation

```html
<!-- Skip link: appears on Tab, skips to main content -->
<a href="#main" class="skip-link">Skip to content</a>
<style>
.skip-link {
  position: absolute;
  top: -100%;
  left: 1rem;
  z-index: 9999;
}
.skip-link:focus {
  top: 1rem; /* appears when focused */
}
</style>

<main id="main" tabindex="-1">...</main>
```

### Focus Styles — Never Remove

```css
/* WRONG: removes focus for everyone, including keyboard users */
* { outline: none; }
button:focus { outline: none; }

/* RIGHT: custom focus style that's visible */
:focus-visible {
  outline: 2px solid hsl(217, 91%, 50%);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Remove focus ring for mouse clicks only */
:focus:not(:focus-visible) {
  outline: none;
}
```

### Custom Component Keyboard Patterns

| Component | Keys required |
|-----------|--------------|
| Button | Enter, Space |
| Link | Enter |
| Checkbox | Space |
| Radio group | Arrow keys to move, Space to select |
| Select/Listbox | Arrow keys, Home, End, Enter |
| Tab panel | Arrow keys between tabs, Tab into panel |
| Dialog/Modal | Escape to close, focus trapped inside |
| Autocomplete | Arrow keys, Enter to select, Escape to close |

```javascript
// Dialog focus trap
function trapFocus(dialog) {
  const focusable = dialog.querySelectorAll(
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  
  first.focus();
}
```

---

## Screen Reader Compatibility

### Testing Without Screen Reader

Use the accessibility tree in browser DevTools (Chrome: DevTools → Elements → Accessibility tab). It shows what screen readers see.

### Image Alt Text

```html
<!-- Informative image: describe the content and function -->
<img src="chart.png" alt="Bar chart showing 40% increase in Q3 revenue">

<!-- Decorative image: empty alt, not aria-hidden -->
<img src="divider.svg" alt="">

<!-- Functional image (button/link): describe the action -->
<a href="/home"><img src="logo.png" alt="Acme Corp — home"></a>

<!-- Complex image: brief alt + longer description -->
<img src="complex-diagram.png" 
     alt="System architecture diagram" 
     aria-describedby="diagram-desc">
<p id="diagram-desc" class="sr-only">
  The diagram shows three layers: client, API gateway, and microservices...
</p>
```

### Screen Reader Only Content

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

```html
<!-- Additional context for screen reader users -->
<button>
  Delete
  <span class="sr-only">project "Website Redesign"</span>
</button>
<!-- Screen reader: "Delete project Website Redesign, button" -->
<!-- Visual: "Delete" -->
```

---

## Forms and Accessibility

```html
<!-- Every input needs a visible label — never use placeholder as label -->
<div class="field">
  <label for="email">Email address</label>
  <input
    id="email"
    type="email"
    name="email"
    autocomplete="email"
    aria-required="true"
    aria-describedby="email-hint"
  >
  <p id="email-hint" class="hint">We'll send your receipt here</p>
</div>

<!-- Error state -->
<div class="field">
  <label for="email">Email address</label>
  <input
    id="email"
    type="email"
    aria-invalid="true"
    aria-describedby="email-error"
  >
  <p id="email-error" role="alert" class="error">
    Enter a valid email address (example@domain.com)
  </p>
</div>
```

---

## Color and Accessibility

### Don't Use Color Alone

Never use color as the only indicator of state or meaning. Always add a second signal:

```html
<!-- Bad: red text only to show error -->
<p style="color: red">Invalid email</p>

<!-- Good: icon + color + text -->
<p class="error">
  <svg aria-hidden="true"><!-- error icon --></svg>
  Invalid email address
</p>
```

### Dark Mode Accessibility

Dark mode requires its own contrast check — colors that pass on white may fail on dark backgrounds.

```css
@media (prefers-color-scheme: dark) {
  /* Re-check ALL text contrast against dark backgrounds */
  --text-primary: hsl(215, 25%, 92%);  /* light text on dark */
  --text-secondary: hsl(215, 16%, 65%); /* check: must pass 4.5:1 on bg */
  --bg-primary: hsl(215, 25%, 10%);
}
```

---

## Accessibility Testing Checklist

### Automated (catches ~30-40% of issues)
- [ ] axe DevTools browser extension — zero violations
- [ ] Lighthouse accessibility score ≥ 90
- [ ] HTML validator — no errors

### Manual (catches the rest)
- [ ] Tab through entire page — focus always visible
- [ ] Complete primary user flow keyboard-only
- [ ] Test with screen reader (VoiceOver on Mac, NVDA on Windows)
- [ ] Check all images have meaningful alt text
- [ ] All form inputs have visible labels
- [ ] Color contrast passes for all text
- [ ] No content relies on color alone
- [ ] Zoom to 200% — layout still usable
- [ ] Test with prefers-reduced-motion: reduce