# Creative Direction

## What This Skill Does

Before any code, before any component, establish the visual identity of the project. This skill provides the reasoning process to go from a brief to a concrete, original Design DNA — a compact record that every subsequent design decision references.

A project without creative direction produces: generic SaaS gradients, purple-to-blue hero sections, glassmorphism cards, oversized rounded corners, and layouts that look like every other AI-generated site.

---

## Industry → Visual Character Decision Tree

Use this reasoning chain when you receive a brief:

### Finance / Fintech
- Trust is primary → restraint, precision, no decoration
- Typography: transitional serif (authority) OR geometric sans (precision), never humanist
- Color: dark navy or charcoal primary, single accent (never gradient), white space dominant
- Density: medium-dense (data matters, but not overwhelming)
- Signature moves: tight grid, small caps labels, thin rules between sections
- Anti-patterns: gradients, rounded cards, playful icons, bright colors

### B2B SaaS / Productivity
- Efficiency is primary → clarity, fast scanning, zero ambiguity
- Typography: geometric or humanist sans, tight tracking on headings
- Color: neutral base (slate/gray), functional accent (blue or teal), status colors reserved for meaning
- Density: dense — users are working, not browsing
- Signature moves: tabular data that breathes, consistent 4px/8px rhythm, sidebar navigation
- Anti-patterns: decorative illustrations, oversized hero, unnecessary animations

### Consumer / Lifestyle
- Emotion is primary → warmth, personality, story
- Typography: expressive pairing — display + humanist, generous leading
- Color: brand-driven, higher saturation acceptable, warm tones if applicable
- Density: airy — let products and imagery breathe
- Signature moves: editorial layout, full-bleed imagery, asymmetric composition
- Anti-patterns: dense data tables, cold colors, corporate rigidity

### Developer Tools / Infrastructure
- Credibility is primary → technical precision, no fluff
- Typography: monospace for code/data, clean sans for prose
- Color: dark mode default, syntax highlight palette as accent system
- Density: variable — dense in code areas, spacious in docs
- Signature moves: code snippets as design elements, terminal aesthetics done tastefully
- Anti-patterns: stock photos, gradient hero backgrounds, marketing-heavy language

### Healthcare / Medical
- Safety and clarity primary → calm, legible, no stress
- Typography: humanist sans, large body text, high contrast
- Color: muted, desaturated palette — no harsh primaries, avoid pure red except for errors
- Density: airy to balanced — no cognitive load
- Anti-patterns: dark mode, complex animations, information overload

### Creative / Agency / Portfolio
- Differentiation is primary → distinctive, risk-taking, conceptual
- Typography: expressive, can break rules intentionally
- Color: concept-driven, not convention-driven
- Density: concept-driven
- Signature moves: the design IS the message — structure is content
- Anti-patterns: safe, conventional, generic

---

## Design DNA Format

Every project gets a Design DNA block before implementation. Fill all 9 fields:

```
DESIGN DNA: [Project Name]

Visual concept:    [One phrase — the core feeling/metaphor]
Typography logic:  [Role + primary typeface + scale character]
Composition logic: [Grid type + alignment philosophy + density]
Spacing rhythm:    [Base unit + progression + section breathing]
Color philosophy:  [Role of color + palette size + dominant/accent ratio]
Shape language:    [Corner radius + geometric vs organic + border use]
Motion language:   [Purposeful vs decorative + speed character + triggers]
Imagery direction: [Type + treatment + integration with layout]
Signature element: [One distinctive thing that makes this recognizable]
```

### Example — B2B Analytics Dashboard

```
DESIGN DNA: DataPulse

Visual concept:    "Instrument panel" — precision tools, not marketing
Typography logic:  Functional. Inter for UI, JetBrains Mono for numbers/code.
                   Scale: compact (1.25 ratio). Dense heading weight.
Composition logic: 12-col grid, named template areas for shell.
                   Left-anchored, never centered. Dense.
Spacing rhythm:    4px base. 4/8/12/16/24/32/48. Sections: 48px gap.
Color philosophy:  Color carries meaning only. Gray-900 base, Gray-100 text.
                   Single blue accent (#2563EB) for primary actions.
                   Green/red/amber reserved for status only.
Shape language:    0-4px radius only. Borders over shadows. Sharp = precision.
Motion language:   Purposeful only. Data updates: 150ms fade. No decorative.
Imagery direction: No stock photos. Icons: Lucide, 16px, stroke-width 1.5.
Signature element: Monospaced numbers everywhere. Data feels like instruments.
```

### Example — Consumer Wellness App

```
DESIGN DNA: Bloom

Visual concept:    "Breathing room" — organic, calm, personal
Typography logic:  Expressive. Fraunces (display serif) for headings,
                   Plus Jakarta Sans for body. Scale: 1.5 ratio. Generous leading.
Composition logic: Loose 6-col. Asymmetric sections. Airy.
Spacing rhythm:    8px base. 8/16/24/40/64/96. Sections: 80-120px gap.
Color philosophy:  Color as mood. Warm sand (#F5EDD6) base.
                   Sage green (#6B8F6B) primary. Single warm accent.
Shape language:    16-24px radius. Organic, rounded. Soft shadows.
Motion language:   Flowing. 300-500ms transitions. Spring easing.
Imagery direction: Human-scale photography. Warm tones. People in nature.
Signature element: Generous whitespace as an intentional design choice.
```

---

## What This Is NOT

Design DNA is not:
- A color palette document
- A complete style guide
- A Figma file
- A list of components

It is a compact reasoning record: a single reference that answers "why does this look the way it does" at every decision point.

---

## Reference Analysis Protocol

When given reference sites/screenshots:

**Extract only:**
1. Spatial density — how much whitespace per viewport?
2. Type scale relationship — how dramatic is heading vs body contrast?
3. Color proportion — what % of the page is neutral vs colored?
4. Motion character — snappy/smooth/absent?
5. Compositional axis — centered/left-anchored/asymmetric?
6. Signature element — what makes this recognizable?

**Never extract:**
- Specific color hex values
- Exact layout structures
- Copy or messaging
- Proprietary illustrations or icons
- Animation timing functions

**Transform to principles:**
BAD: "They use #1a1a2e as background"
GOOD: "Near-black background with blue cast — reads as technical/premium, not warm"

BAD: "Their hero is fullscreen with centered text"
GOOD: "Full-viewport opening establishes scale immediately — works because they have strong imagery"

---

## Originality Check

Before finalizing Design DNA, run this check:

1. Does this look like it could be from any SaaS company? → Too generic, revise
2. Is the signature element truly distinctive? → If not, create one
3. Does the visual concept match the industry character? → If not, reconsider
4. Are you defaulting to dark mode just because? → Justify it or use light
5. Is color doing real work or just decorating? → If decorating, reduce palette