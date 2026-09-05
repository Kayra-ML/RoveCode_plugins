# Typography

## The Role of Type in a Design

Typography is not decoration — it is structure. Every typographic decision either clarifies or obscures the hierarchy of information. Before choosing a typeface, answer:

1. What emotional register does this product need? (authoritative / friendly / precise / expressive)
2. What is the primary reading context? (dense UI / editorial / documentation / marketing)
3. What does the typeface say before you read the words?

---

## Typeface Classification and When to Use Each

### Humanist Sans (Inter, Nunito, Gill Sans, Myriad, Source Sans)
- **Character**: Human, warm, approachable, reads well at small sizes
- **Use when**: Consumer apps, health, education, anything needing approachability
- **Avoid when**: Finance, developer tools, luxury — feels too casual
- **Inter specifically**: Overused. If you use Inter, you must differentiate through scale, weight, and spacing — not just the typeface itself.

### Geometric Sans (Futura, Circular, Avenir, DM Sans, Nunito Sans)
- **Character**: Clean, modern, minimal, slightly cold
- **Use when**: Tech companies, startups, design-forward brands
- **Avoid when**: Long-form reading — geometric shapes cause eye fatigue at body sizes
- **Note**: Circular/Futura at large display sizes = strong brand signal. At body size = fatigue.

### Transitional Serif (Times, Georgia, Merriweather, Lora, Charter)
- **Character**: Authoritative, established, trustworthy, editorial
- **Use when**: Finance, law, publishing, anything needing gravitas
- **Avoid when**: Dashboard UIs, developer tools — feels dated in functional contexts

### Old Style Serif (Garamond, Caslon, EB Garamond)
- **Character**: Classical, scholarly, literary
- **Use when**: Publishing, editorial, cultural institutions
- **Avoid when**: Any modern tech product — jarring mismatch

### Contemporary Serif (Fraunces, Playfair Display, Cormorant, Canela)
- **Character**: Expressive, high-contrast, fashion-adjacent
- **Use when**: Display headings for lifestyle, wellness, luxury
- **Avoid when**: Body text — high contrast makes long-form reading hard
- **Pairing**: Always with a clean sans for body text

### Slab Serif (Rockwell, Courier, Zilla Slab, Roboto Slab)
- **Character**: Industrial, sturdy, confident, retro
- **Use when**: Brand-forward marketing, editorial accents
- **Avoid when**: UI elements — too heavy for functional contexts

### Monospace (JetBrains Mono, Fira Code, Source Code Pro, IBM Plex Mono)
- **Character**: Technical, precise, code-adjacent
- **Use when**: Developer tools, data/number display, terminal aesthetics
- **Trick**: Use monospace for numbers in dashboards even if the rest is sans — tabular figures align perfectly

---

## Type Pairing Logic

Never pair two typefaces randomly. Pairing works on contrast + harmony:

**Rule 1: Contrast the classification**
Pair a serif with a sans. Never two serifs or two geometric sans.

**Rule 2: Harmony in weight and width**
A heavy display font pairs with a light body. A condensed heading needs normal-width body.

**Rule 3: Assign roles strictly**
- Display: headings, hero text, pull quotes — expressive
- UI: labels, buttons, navigation, captions — functional
- Body: paragraphs — readable

**Proven Pairings:**
| Display | Body | Character |
|---------|------|-----------|
| Fraunces | Inter | Warm editorial meets functional |
| Playfair Display | Source Sans | Elegant meets readable |
| DM Serif Display | DM Sans | Cohesive family, high/low contrast |
| Canela | Helvetica Neue | Fashion/luxury |
| Editorial New | Inter | Contemporary editorial |

**Avoid:**
- Two sans-serifs from the same classification
- More than 2 typefaces (3 is a special case requiring strong rationale)
- Decorative fonts for body text

---

## Type Scale Systems

### Building a Scale

Always use a mathematical ratio. Don't pick sizes arbitrarily.

**Ratios:**
- 1.125 (Major Second): Very tight, compact UI — dashboards, data tools
- 1.25 (Major Third): Compact, versatile — most SaaS products
- 1.333 (Perfect Fourth): Balanced — general web
- 1.5 (Perfect Fifth): Dramatic — editorial, marketing
- 1.618 (Golden Ratio): Very dramatic — portfolio, luxury

**Example Scale (Perfect Fourth, base 16px):**
```
xs:   10px  (0.625rem)  — labels, captions, legal
sm:   12px  (0.75rem)   — secondary UI text
base: 16px  (1rem)      — body text
lg:   21px  (1.333rem)  — large body, lead text
xl:   28px  (1.777rem)  — small headings, card titles
2xl:  37px  (2.369rem)  — section headings
3xl:  50px  (3.157rem)  — page headings
4xl:  67px  (4.209rem)  — display / hero
```

### Fluid Typography with clamp()

```css
/* Never hard-stop sizes — flow between viewports */
:root {
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-xl:   clamp(1.25rem, 1rem + 1.5vw, 1.75rem);
  --text-2xl:  clamp(1.5rem, 1rem + 2.5vw, 2.25rem);
  --text-3xl:  clamp(2rem, 1rem + 4vw, 3.5rem);
  --text-4xl:  clamp(2.5rem, 1rem + 6vw, 5rem);
}
```

---

## Optical Sizing

Type at different sizes needs different design decisions:

### Large display sizes (48px+)
- **Reduce** letter-spacing (tracking) — type spreads at large sizes
- **Reduce** font weight — heavy weights become overwhelming
- **Increase** contrast between headline and body
- ```css
  .display { font-size: clamp(3rem, 6vw, 5rem); letter-spacing: -0.03em; font-weight: 600; }
  ```

### Body sizes (14-18px)
- **Neutral** tracking — 0 to 0.01em
- **Increase** line-height — 1.5 to 1.75 for comfort
- **Regular** weight — 400 for body, 500-600 for emphasis

### Small UI sizes (10-13px)
- **Increase** tracking — small text needs more air between letters
- **Increase** weight — thin strokes disappear at small sizes
- **Never** use display fonts at small sizes — high contrast strokes become noise
- ```css
  .label { font-size: 0.75rem; letter-spacing: 0.05em; font-weight: 500; }
  ```

---

## Variable Fonts

Variable fonts expose axes you can control. Common axes:

| Axis | CSS Property | What it controls |
|------|-------------|-----------------|
| wght | font-weight | 100–900 continuous |
| wdth | font-stretch | Condensed to expanded |
| ital | font-style | Upright to italic |
| opsz | font-optical-sizing | Optical size optimization |
| GRAD | font-variation-settings | Grade (weight without reflow) |

```css
/* Animate weight on hover without layout shift */
.nav-link {
  font-weight: 400;
  transition: font-weight 150ms ease;
}
.nav-link:hover {
  font-weight: 600;
}

/* Use GRAD axis for dark/light mode weight compensation */
@media (prefers-color-scheme: dark) {
  body { font-variation-settings: 'GRAD' -25; } /* slightly lighter on dark bg */
}
```

---

## Typographic Rhythm

Rhythm = consistent vertical spacing through a type scale.

**Base unit**: Set a baseline unit (e.g., 8px). All spacing must be multiples.

```css
p     { margin-bottom: 1rem; }      /* 16px = 2 units */
h3    { margin-top: 2rem; margin-bottom: 0.5rem; }   /* 32px top, 8px bottom */
h2    { margin-top: 3rem; margin-bottom: 0.75rem; }  /* 48px top */
```

**Line-height and rhythm:**
Body text at 16px with line-height 1.5 = 24px per line = 3 baseline units. All subsequent spacing should be multiples of this.

---

## Common Mistakes

| Mistake | Why it fails | Fix |
|---------|-------------|-----|
| Inter everywhere | No brand differentiation | Choose type for the project's character |
| Body text below 14px | Accessibility + readability failure | 16px minimum for body |
| line-height below 1.4 | Lines crowd together, hard to track | 1.5-1.7 for body |
| Positive letter-spacing on headings | Looks like amateur kerning | Neutral or negative tracking on large type |
| All-caps for long text | Reading speed drops 12-15% | All-caps for labels/tags only (max 4 words) |
| 3+ typefaces | Visual noise, no hierarchy | Max 2, with clear role separation |
| Justified text without hyphenation | Rivers of whitespace | Use text-align: justify only with hyphens: auto |
| System font stack for branded product | Generic appearance | Invest in custom type — it's the cheapest differentiation |

---

## CSS Implementation

### Fluid Typography with clamp()

Scale type fluidly between viewport sizes without hard breakpoint jumps:

```css
/* Pattern: clamp(min-size, preferred-viewport-expression, max-size) */
font-size: clamp(1rem, 2.5vw, 1.5rem);
```

The preferred expression anchors to the viewport: `2.5vw` hits `1.5rem` (24px) at a 960px viewport. Work backwards: `max-px / vw-coefficient = target-viewport-width`.

### Type Scale as CSS Custom Properties

```css
:root {
  --text-xs:   clamp(0.625rem, 0.55rem + 0.375vw,  0.75rem);   /* 10–12px */
  --text-sm:   clamp(0.75rem,  0.7rem  + 0.25vw,   0.875rem);  /* 12–14px */
  --text-base: clamp(1rem,     0.9rem  + 0.5vw,    1.125rem);  /* 16–18px */
  --text-lg:   clamp(1.125rem, 1rem    + 0.625vw,  1.333rem);  /* 18–21px */
  --text-xl:   clamp(1.333rem, 1rem    + 1.665vw,  1.777rem);  /* 21–28px */
  --text-2xl:  clamp(1.777rem, 1rem    + 2.5vw,    2.369rem);  /* 28–38px */
  --text-3xl:  clamp(2.369rem, 1rem    + 4vw,      3.157rem);  /* 38–50px */
  --text-4xl:  clamp(3.157rem, 1rem    + 6vw,      4.209rem);  /* 50–67px */
  --text-5xl:  clamp(4rem,     2rem    + 8vw,      5.5rem);    /* 64–88px */
  --text-6xl:  clamp(5rem,     2.5rem  + 10vw,     7rem);      /* 80–112px */
}
```

### font-feature-settings per Typeface Class

OpenType features unlock typographic refinements. Each typeface class benefits from different features:

```css
/* Humanist & Geometric Sans (Inter, DM Sans, etc.) */
.prose-sans {
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
  /* kern: kerning, liga: common ligatures (fi, fl), calt: contextual alternates */
}

/* Transitional & Old Style Serif (Georgia, Merriweather, EB Garamond) */
.prose-serif {
  font-feature-settings: "kern" 1, "liga" 1, "onum" 1, "pnum" 1;
  /* onum: old-style numerals (blend with lowercase), pnum: proportional numerals */
}

/* Display / Contemporary Serif (Playfair Display, Fraunces) */
.display-serif {
  font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "swsh" 1;
  /* dlig: discretionary ligatures, swsh: swashes on capitals */
}

/* Monospace (JetBrains Mono, Fira Code) */
.mono {
  font-feature-settings: "kern" 0, "liga" 1, "calt" 1, "ss01" 1;
  /* No kerning (monospace), but keep coding ligatures (=>, !=, <=) */
}

/* Tabular figures — for numbers in tables and dashboards */
.tabular-nums {
  font-feature-settings: "tnum" 1, "lnum" 1;
  /* tnum: tabular (fixed-width) numerals, lnum: lining numerals */
  font-variant-numeric: tabular-nums lining-nums; /* modern equivalent */
}
```

### Fallback Stack Construction

System fonts that match each typeface class for use before web fonts load:

```css
/* Humanist Sans — matches Inter, Nunito */
--font-sans: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;

/* Geometric Sans — matches DM Sans, Circular */
--font-geometric: 'DM Sans', 'Helvetica Neue', Arial, sans-serif;

/* Transitional Serif — matches Merriweather, Charter */
--font-serif: 'Merriweather', 'Georgia', 'Times New Roman', serif;

/* Contemporary Serif — matches Playfair Display */
--font-display: 'Playfair Display', 'Didot', 'Bodoni MT', serif;

/* Monospace — matches JetBrains Mono, Fira Code */
--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
```

### font-display: swap with size-adjust to Minimize CLS

Web fonts cause Cumulative Layout Shift when they load and differ in metric from the fallback. Use `size-adjust` and metric overrides to make the fallback match the web font dimensions:

```css
/* @font-face for web font */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-display: swap;
  font-weight: 100 900;
}

/* Override system-ui to match Inter's metrics */
@font-face {
  font-family: 'Inter-fallback';
  src: local('Segoe UI'), local('system-ui');
  size-adjust: 107%;          /* scale fallback to match Inter's advance widths */
  ascent-override: 90%;       /* adjust ascender to reduce line height diff */
  descent-override: 22%;
  line-gap-override: 0%;
}

:root {
  --font-sans: 'Inter', 'Inter-fallback', sans-serif;
}
```

Tools like `fontaine` (Nuxt) and `next/font` automate this metric calculation.

### Variable Font Axes

```css
/* wght axis — continuous weight without loading multiple files */
h1 { font-weight: 750; }   /* between Bold (700) and ExtraBold (800) */
p  { font-weight: 380; }   /* between Regular (400) and Light (300) */

/* ital axis — true italic vs faux italic */
em {
  font-style: italic;
  font-synthesis: none; /* prevent browser from faking italics */
}

/* opsz (optical sizing) axis — when to use it */
.display {
  /* At large sizes, letterforms should be tighter, more tightly spaced */
  font-optical-sizing: auto; /* modern property — uses opsz axis automatically */
  /* Or explicitly: */
  font-variation-settings: 'opsz' 72; /* 72pt optical size */
}

.body-text {
  font-optical-sizing: auto;
  /* font-variation-settings: 'opsz' 16; — auto handles this */
}

/* GRAD axis — adjust apparent weight without reflow (dark mode) */
@media (prefers-color-scheme: dark) {
  body {
    font-variation-settings: 'GRAD' -25;
    /* Dark backgrounds make text look heavier — reduce grade to compensate */
  }
}
```

**When to use `opsz`**: Any variable font that includes the optical size axis (Fraunces, Recursive, Roboto Flex, and others). Set `font-optical-sizing: auto` by default. Override with explicit `font-variation-settings: 'opsz' N` only when you need precise control at a specific size.

### line-height Recommendations

```css
:root {
  /* Headings: tight — display type is scanned, not read line-by-line */
  --lh-heading:  1.2;   /* h1, h2, h3 */
  --lh-subhead:  1.3;   /* h4, h5, h6 */

  /* Body: comfortable — long-form reading requires return-line tracking */
  --lh-body:     1.6;   /* paragraphs, default body */
  --lh-relaxed:  1.7;   /* editorial, long-form articles */

  /* Small text: loose — letterforms are compressed, need more air */
  --lh-small:    1.8;   /* captions, footnotes, labels at 12px */
  --lh-xs:       1.9;   /* 10–11px text */

  /* Code: generous — monospace needs extra vertical air */
  --lh-code:     1.7;   /* code blocks */
}
```

### Complete Type System CSS Custom Properties

A production-ready type system in one block:

```css
:root {
  /* Typeface stacks */
  --font-sans:    'Inter', 'Inter-fallback', system-ui, sans-serif;
  --font-serif:   'Merriweather', Georgia, serif;
  --font-display: 'Fraunces', 'Playfair Display', serif;
  --font-mono:    'JetBrains Mono', 'Fira Code', Consolas, monospace;

  /* Type scale (fluid) */
  --text-xs:   clamp(0.625rem, 0.55rem  + 0.375vw, 0.75rem);
  --text-sm:   clamp(0.75rem,  0.7rem   + 0.25vw,  0.875rem);
  --text-base: clamp(1rem,     0.9rem   + 0.5vw,   1.125rem);
  --text-lg:   clamp(1.125rem, 1rem     + 0.625vw, 1.333rem);
  --text-xl:   clamp(1.333rem, 1rem     + 1.665vw, 1.777rem);
  --text-2xl:  clamp(1.777rem, 1rem     + 2.5vw,   2.369rem);
  --text-3xl:  clamp(2.369rem, 1rem     + 4vw,     3.157rem);
  --text-4xl:  clamp(3.157rem, 1rem     + 6vw,     4.209rem);
  --text-5xl:  clamp(4rem,     2rem     + 8vw,     5.5rem);
  --text-6xl:  clamp(5rem,     2.5rem   + 10vw,    7rem);

  /* Line heights */
  --lh-tight:   1.1;
  --lh-heading: 1.2;
  --lh-snug:    1.35;
  --lh-body:    1.6;
  --lh-relaxed: 1.7;
  --lh-loose:   1.8;

  /* Letter spacing */
  --tracking-tighter: -0.04em;  /* large display */
  --tracking-tight:   -0.02em;  /* headings */
  --tracking-normal:   0em;     /* body */
  --tracking-wide:     0.03em;  /* small caps, labels */
  --tracking-wider:    0.06em;  /* all-caps labels */
  --tracking-widest:   0.1em;   /* spaced small caps */

  /* Font weights */
  --weight-light:    300;
  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;
  --weight-extrabold: 800;
}

/* Base typographic styles */
body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--lh-body);
  font-weight: var(--weight-regular);
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

h1, h2, h3 {
  line-height: var(--lh-heading);
  letter-spacing: var(--tracking-tight);
  font-weight: var(--weight-bold);
}

h1 { font-size: var(--text-4xl); }
h2 { font-size: var(--text-3xl); }
h3 { font-size: var(--text-2xl); }
h4 { font-size: var(--text-xl); line-height: var(--lh-snug); }
h5 { font-size: var(--text-lg); line-height: var(--lh-snug); }

p, li { max-width: 65ch; } /* enforce optimal measure */

small, .caption {
  font-size: var(--text-sm);
  line-height: var(--lh-loose);
  letter-spacing: var(--tracking-wide);
}

code, pre {
  font-family: var(--font-mono);
  font-size: 0.9em; /* slightly smaller than surrounding text */
  line-height: var(--lh-relaxed);
}
```