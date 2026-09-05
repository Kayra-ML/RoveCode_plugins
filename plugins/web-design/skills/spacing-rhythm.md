# Spacing & Rhythm System

## Why Spacing Is Not Arbitrary

Random pixel values are the single most common reason a design looks "off" without the designer being able to explain why. Consistent spacing creates visual rhythm — the feeling that elements belong to the same system. Inconsistent spacing creates cognitive friction: the eye registers the difference even when the brain can't name it.

The goal is a spacing system where every value is a deliberate choice from a defined scale, not a gut-feel number.

---

## The 4px Base Unit

The 4px base unit is not arbitrary. It derives from:

1. **Pixel density**: Most modern displays render at 2× or 3× pixel density. 4px at 1× = 8 physical pixels on a retina display — visually crisp, never blurry.
2. **Subpixel rendering**: Values divisible by 4 avoid subpixel anti-aliasing artifacts on older screens.
3. **Divisibility**: 4 divides evenly into 8, 12, 16, 24, 32 — all natural UI sizes.
4. **Type alignment**: Most font sizes (14, 16, 18, 20, 24) produce line heights that are multiples of 4 when set correctly.

The **8-point grid** builds on this: all spacing is a multiple of 8, with 4px reserved for micro-spacing (icon gaps, inline elements, tight badges).

---

## The 8-Point Grid: Which Values to Use

| Token | Value | Use case |
|-------|-------|----------|
| `--space-1` | 4px | Icon-to-label gap, tight inline spacing, badge padding |
| `--space-2` | 8px | Element internal padding (small), between related items |
| `--space-3` | 12px | Compact component padding, list item vertical padding |
| `--space-4` | 16px | Default component padding, card body, form field padding |
| `--space-6` | 24px | Between distinct elements in a group, section sub-spacing |
| `--space-8` | 32px | Card gap, between component groups |
| `--space-12` | 48px | Section internal spacing, content column padding |
| `--space-16` | 64px | Between major sections on desktop |
| `--space-24` | 96px | Hero padding, max section breathing room |

**Never use**: 5px, 7px, 9px, 11px, 13px, 15px, 17px, 18px, 19px, 21px — these break the rhythm and signal a design made without a system.

---

## CSS Custom Properties for the Spacing Scale

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;
}
```

Reference these exclusively. If a designer says "I want 20px here," respond: "Is 16px too tight and 24px too loose? If so, we have an exception — document it."

---

## When to Break the Grid Intentionally

The grid is a tool, not a prison. Valid reasons to deviate:

**Optical correction**: A 16px top padding on a button with text that sits optically low may need 14px top / 18px bottom to look centered. The eye is the authority, not the ruler.

**Icon sizing**: Icons at 20px or 18px are optical sizes, not grid sizes. The surrounding padding compensates.

**Border-box edge cases**: A 1px or 2px border eats into padding. A card with `--space-4` padding and a 1px border has 15px of visual padding. Sometimes you compensate with `calc(var(--space-4) + 1px)`.

**Rule**: When you break the grid, the deviation must be invisible — it corrects perception, it does not create a new arbitrary value.

---

## Baseline Grid Alignment

A baseline grid ensures text in adjacent columns aligns horizontally, creating order across complex layouts.

**The rule**: `line-height` must be a multiple of the base unit.

For a 4px base:
- Body text at 16px → line-height: 24px (1.5) ✓ — 24 is a multiple of 4
- Body text at 16px → line-height: 22px ✗ — 22 is not a multiple of 4
- Heading at 32px → line-height: 40px (1.25) ✓
- Caption at 12px → line-height: 16px (1.333) ✓

**Practical test**: Set `background: repeating-linear-gradient(transparent, transparent 3px, rgba(255,0,0,0.1) 3px, rgba(255,0,0,0.1) 4px)` on your layout during development. Text baselines should land on red lines.

---

## Fluid Spacing with clamp()

Static spacing breaks at breakpoints — the jump from mobile padding to desktop padding creates a hard edge. Fluid spacing grows smoothly.

**Syntax:**
```css
padding: clamp(min, preferred, max);
```

**Strategy:**
- `min` = the mobile value (never go below this)
- `preferred` = a viewport-relative value (vw)
- `max` = the desktop cap (never exceed this)

**Examples:**
```css
/* Section vertical padding: 48px mobile → 96px desktop */
padding-block: clamp(48px, 8vw, 96px);

/* Card padding: 16px mobile → 32px desktop */
padding: clamp(16px, 3vw, 32px);

/* Gap between hero content and first section */
margin-block-end: clamp(32px, 6vw, 80px);
```

**Viewport anchoring**: The `vw` value in the preferred expression determines the inflection point. `8vw` hits 96px at 1200px viewport width (96 / 0.08 = 1200). Work backwards from your target breakpoints.

**When NOT to use clamp() for spacing**: Component internal padding (button padding, form field padding) — these should be fixed. Fluid spacing is for layout-level gaps, section breathing room, and content gutters.

---

## Component Spacing: Internal Padding vs External Margin

**Internal padding** (belongs to the component):
- Defined inside the component's own styles
- Scales with the component's density mode
- Examples: button padding, card padding, input field padding

**External margin** (belongs to the layout):
- Never set on the component itself — set via gap, margin on a wrapper, or the layout context
- This is why CSS Grid and Flexbox gap properties exist
- Components should be **margin-free** — their external spacing is always the layout's responsibility

```css
/* WRONG — component controls its own external margin */
.card {
  margin-bottom: 24px; /* breaks when used in a grid */
}

/* RIGHT — layout controls spacing between components */
.card-grid {
  display: grid;
  gap: var(--space-8);
}
```

---

## Typographic Spacing

### Optimal Measure (Line Length)

The optimal reading measure is **45–75 characters per line** for body text.

```css
/* Enforce optimal measure */
.prose {
  max-width: 65ch; /* ~65 characters */
}
```

- Below 45ch: eye returns too frequently, reading feels choppy
- Above 75ch: eye loses its place on return, reading slows
- For narrow columns (sidebars, captions): 30–45ch is acceptable

### Leading Ratios per Typeface Class

| Typeface class | Context | Recommended line-height |
|---------------|---------|------------------------|
| Geometric sans | Body | 1.5–1.6 |
| Humanist sans | Body | 1.55–1.65 |
| Transitional serif | Body | 1.6–1.7 |
| Contemporary serif | Body | 1.65–1.75 |
| Any typeface | Heading (24px+) | 1.1–1.25 |
| Any typeface | Display (48px+) | 1.0–1.1 |
| Monospace | Code | 1.6–1.8 |
| Any typeface | Caption/small | 1.7–1.9 |

Looser leading for small text, tighter leading for large text. This is not a preference — it is how the eye tracks.

---

## Section Rhythm: Vertical Pacing

Sections are the paragraphs of a page. Their vertical spacing creates pacing — the feeling that a page breathes or suffocates.

**Principle: space signals relationship.**

- Close spacing = these things belong together
- Distant spacing = new thought, new section
- Consistent spacing = same-level importance

**Desktop section rhythm:**
```
Hero → 96px → Feature section → 80px → Social proof → 96px → CTA
```

**Within a section:**
```
Section heading
16px
Section subheading
32px
Content grid / component
```

**Rule**: The space above a heading is always larger than the space below it. The heading belongs to what follows, not what precedes.

```css
/* Correct: heading belongs to the content below it */
.section-heading {
  margin-block-start: var(--space-16); /* large: separates from previous */
  margin-block-end: var(--space-6);    /* small: ties to content below */
}
```

---

## Density Modes

Some UIs need to serve multiple user contexts. Define density as a multiplier on your base spacing scale:

| Mode | Multiplier | Use case |
|------|-----------|---------|
| Compact | 0.75× | Power users, dense dashboards, data tables, CLI tools |
| Default | 1× | Standard web interfaces, marketing sites, docs |
| Comfortable | 1.5× | Accessibility-first, touch-heavy, elderly users, healthcare |

**Implementation via CSS custom property override:**

```css
/* Default (no class needed) */
:root {
  --density: 1;
  --space-4: calc(16px * var(--density));
  --space-6: calc(24px * var(--density));
  --space-8: calc(32px * var(--density));
}

/* Compact mode */
[data-density="compact"] {
  --density: 0.75;
}

/* Comfortable mode */
[data-density="comfortable"] {
  --density: 1.5;
}
```

**When to use compact**: B2B SaaS dashboards, data tables, code editors, admin panels — anywhere users are working, not browsing.

**When to use comfortable**: Consumer health apps, onboarding flows, forms for non-technical users, any context where reading pace matters more than information density.

---

## Common Mistakes

**Mistake 1: Random pixel values**
Using 13px, 17px, 22px, 19px means no system exists. Every value is a decision that must be re-made every time. This creates a design that grows inconsistent over time.

**Mistake 2: Inconsistent rhythm**
A section with 64px top padding and 48px bottom padding, followed by a section with 80px top padding — the eye registers the randomness. Pick a rhythm and hold it.

**Mistake 3: Ignoring type metrics**
Font cap-height and descender depth affect perceived spacing. `padding-block: 16px` on a button with a typeface with a low cap-height will look top-heavy. Always test visually and adjust optically after the system value is applied.

**Mistake 4: Setting margins on components**
Components with hardcoded margins break in any layout context that isn't their original one. Always externalize margin to the layout.

**Mistake 5: Using the same spacing scale for mobile and desktop**
Mobile needs tighter vertical spacing because screen height is limited. Desktop can breathe. Use fluid spacing or deliberate breakpoint overrides for section-level spacing.

**Mistake 6: Forgetting about focus rings and interactive spacing**
Touch targets must be at least 44×44px (Apple HIG) or 48×48dp (Material). If a button is visually smaller, use padding to expand the hit area or use `min-height`/`min-width`.