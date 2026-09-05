# Layout & Composition

## The Purpose of Layout

Layout is not "how to arrange things." Layout is how the eye moves through information. Every layout decision either guides or confuses the reader's path. Before placing anything, answer:

1. What is the single most important thing on this page?
2. What path do you want the eye to travel?
3. What density does the content's purpose require?

---

## Reading Patterns

Users don't read — they scan. Two dominant patterns:

### F-Pattern (Text-heavy pages, documentation, articles)
Eye scans horizontally across the top, then drops down the left edge, with occasional short horizontal scans.
- **Implication**: Most important content top-left. First sentence of each paragraph carries the most weight. Right-side content gets least attention.
- **Design response**: Strong left anchor. Short paragraphs. Bold first words. Critical CTAs on left or center-left.

### Z-Pattern (Marketing pages, visual content, sparse layouts)
Eye starts top-left, sweeps to top-right, diagonals to bottom-left, sweeps to bottom-right.
- **Implication**: Place key content at the 4 corners of the Z.
- **Design response**: Logo top-left, nav top-right, key value prop bottom-left, CTA bottom-right.

### Layer-Cake Pattern (Landing pages with defined sections)
Users scan headings only, skip bodies until one heading catches interest.
- **Implication**: Section headings ARE the UX. Make every heading a complete thought.
- **Design response**: Heading first. Supporting text second. CTA third.

---

## Grid Systems

### When to Use Each Grid

| Grid Type | Use Case | Example |
|-----------|----------|---------|
| 12-column | Complex editorial, dashboard | News, Figma-style UI |
| 6-column | Balanced content pages | Marketing sites, landing pages |
| 4-column | Mobile-first, simple layouts | App shells |
| Auto-flow | Galleries, card collections | Portfolio, product catalog |
| Named areas | App shells with persistent regions | Dashboard with sidebar + header |
| Subgrid | Nested components that must align | Card collections with multi-line content |

### CSS Grid: Named Template Areas (App Shell)

```css
.app-shell {
  display: grid;
  grid-template-areas:
    "header header header"
    "nav    main   aside"
    "footer footer footer";
  grid-template-columns: 240px 1fr 320px;
  grid-template-rows: 56px 1fr auto;
  min-height: 100vh;
}

header  { grid-area: header; }
nav     { grid-area: nav;    }
main    { grid-area: main;   }
aside   { grid-area: aside;  }
footer  { grid-area: footer; }
```

### Subgrid for Card Alignment

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}

.card {
  display: grid;
  grid-row: span 3;
  grid-template-rows: subgrid; /* align content across cards */
}
/* Now .card-image, .card-title, .card-action align across all cards */
```

---

## Proportional Systems

### Golden Ratio (1:1.618)
Use for major layout divisions:
- Content area to sidebar: 62% / 38%
- Hero text block width: 61.8% of container
- Section heights: each ~1.618x the previous

### Rule of Thirds
Divide any space into a 3×3 grid. Place focal points at intersections, not dead center.
- **Applied to hero sections**: Place heading at top-third intersection. Avoid dead-center alignment unless intentionally formal.
- **Applied to images**: Subject at third-line, not centered.

### Modular Scale for Spacing

Base unit: 4px or 8px (match your type baseline).

**4px system (dense/data)**:
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96

**8px system (balanced)**:
8, 16, 24, 32, 48, 64, 96, 128

Never use arbitrary values (17px, 23px, 37px). Every spacing value must be a multiple of the base unit.

---

## Visual Hierarchy in Practice

### The 5 Tools of Hierarchy

1. **Scale** — larger = more important. Not just text — elements, images, whitespace.
2. **Weight** — heavier = more important. But only one or two things should be heavy.
3. **Color** — high saturation / high contrast = more important. Low saturation = supporting.
4. **Position** — top-left = highest importance in LTR layouts. Center = formal, static.
5. **Isolation** — surrounded by whitespace = important. Crowded = less important.

### Anti-Patterns

**Same-weight problem**: Every element has equal visual weight. The eye doesn't know where to go. Fix: create at least 3 distinct weight levels on every page.

**Centering everything**: Centering creates formality and symmetry. On informational pages it flattens hierarchy. Use left-alignment as the default, center only for ceremonial moments (hero statements, empty states).

**Margin equality**: Same margin on all four sides of every section. This creates monotony. Vary vertical and horizontal margins intentionally.

---

## Density: The Most Important Choice

Density is not about whether you like "minimal" designs. It is about what the user is trying to do.

| Density Level | When to Use | Examples |
|---------------|-------------|---------|
| **Dense** (4-8px base spacing, 12-13px text) | Users are working, scanning data, making decisions | Dashboards, admin panels, trading tools, Excel-like apps |
| **Balanced** (8-16px base, 15-16px text) | General purpose — browsing + doing | SaaS products, documentation, e-commerce |
| **Airy** (16-32px+ base, 16-18px text) | Users are exploring, reading, being persuaded | Marketing sites, editorial, portfolio, luxury brands |

**Critical rule**: Match density to task, not aesthetic preference. A "minimal" dashboard that uses 32px padding wastes screen real estate and slows users down.

---

## Composition Patterns

### Asymmetric Tension

Symmetry is stable and forgettable. Asymmetry creates tension and interest.

**How to create productive asymmetry:**
- One large element + multiple small (not equal sizes)
- Off-center focal point — subject at 1/3 position, not center
- Varied column widths — not equal-width everything
- One dominant color zone, not evenly distributed

```css
/* Asymmetric hero: text takes 55%, image 45% */
.hero {
  display: grid;
  grid-template-columns: 55fr 45fr;
  align-items: center;
  gap: 4rem;
}
/* vs. boring equal split: 50fr 50fr */
```

### Section Rhythm

Pages feel static when every section has the same density and height. Create pacing:

```
Section 1: DENSE  (product features, data)
Section 2: AIRY   (testimonial, breathing room)
Section 3: DENSE  (pricing table)
Section 4: AIRY   (final CTA, whitespace)
```

This creates the equivalent of musical dynamics — loud and quiet, fast and slow.

### Negative Space as a Design Element

Whitespace is not "empty" — it is a design element that creates:
- **Focus**: Isolate one element with whitespace = that element is important
- **Luxury**: Generous whitespace signals premium, unhurried, quality
- **Clarity**: Dense content with whitespace borders = scannable

**Practical rule**: If you're not sure whether to add more whitespace, add more whitespace. Most web designs are too tight, not too loose.

---

## Sidebar Patterns

The sidebar is a structural decision, not a styling choice.

| Sidebar Width | Purpose | When to Use |
|---------------|---------|-------------|
| 48-64px | Icon-only navigation | Collapsed state, ultra-dense apps |
| 200-240px | Text + icon navigation | Most SaaS apps, dashboards |
| 260-320px | Navigation + secondary info | Project management, complex apps |
| 320-400px | Navigation + content panel | Email clients, file browsers |
| 400px+ | Primary content pane | Split-pane editors, documentation |

**Never**: Use a sidebar wider than necessary for its content. Chrome that competes with content is friction.

---

## Common Mistakes

| Mistake | What it signals | Fix |
|---------|-----------------|-----|
| Equal margins everywhere | No compositional thinking | Vary section padding vertically vs horizontally |
| Every card same size | No hierarchy in content | Vary card sizes to signal importance |
| Centering all headings | Weak left anchor | Left-align body headings; center only hero statements |
| Grid gutters too large | Disconnects related content | Gutter should be smaller than outer margins |
| Max-width too wide | Long line lengths, unreadable | prose max-width: 65-75ch |
| Sidebar too wide | Chrome competes with content | Size sidebar to its content only |
| No section breathing | Monotonous density | Alternate dense/airy sections |