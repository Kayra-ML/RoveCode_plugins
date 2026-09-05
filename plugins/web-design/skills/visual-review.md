# Visual Review

## The Purpose of Design Critique

Design critique is not about personal taste. It is about evaluating whether the design achieves its functional and communicative goals. A good critique identifies:

1. What the design communicates (vs. what it should communicate)
2. Where the eye goes (vs. where it should go)
3. What is inconsistent (vs. what should be systematic)
4. What is generic (vs. what is distinctive)

The goal is a specific, actionable finding — not "it looks bad" but "the heading weight is insufficient to create hierarchy against the body text weight."

---

## The 7-Layer Review Framework

Review in this exact order. Each layer depends on the previous.

### Layer 1: Communication (5-second test)
Cover the page. Show for 5 seconds. Ask: what did this communicate?
- What industry/product is this for?
- What is the primary action available?
- What is the tone/feeling?

If the answers don't match the brief, everything else is secondary.

### Layer 2: Visual Hierarchy
Squint at the design until it blurs. What stands out?
- There should be 1 dominant element, 2-3 secondary, everything else tertiary
- If 5+ things compete for attention: hierarchy is broken
- If nothing stands out: hierarchy is broken
- Diagnosis tool: convert to grayscale and check if hierarchy still reads

### Layer 3: Typography
- Is body text 15-18px with line-height 1.5-1.7?
- Is heading/body weight contrast sufficient? (heading 600-700, body 400)
- Are heading sizes following a consistent scale?
- Is tracking appropriate for each size? (negative on large, slightly positive on small)
- Is the measure (line length) 60-75 characters?
- Are there more than 2 typefaces without strong rationale?

### Layer 4: Spacing System
Pick any two elements of the same type (e.g., two card margins). Measure them.
- Are they identical? If not, there is no spacing system.
- Are all values multiples of 4 or 8?
- Is spacing intentionally varied (not identical on all sides)?
- Is whitespace used as a design element (isolation = importance)?

### Layer 5: Color
- How many colors are in use? (≤ 3 is disciplined; > 5 without system is chaos)
- Is color doing meaningful work (communicating state, hierarchy, brand) or just decorating?
- Is contrast sufficient? (4.5:1 body text, 3:1 large text, 3:1 UI components)
- Is the palette systematic (related hues, consistent saturation logic)?

### Layer 6: Component Craft
Pick the most complex interactive component. Does it have:
- All 8 states designed (default, hover, focus, active, loading, disabled, error, success)?
- Consistent border radius within the system?
- Appropriate shadow or elevation if used?
- Internal spacing that matches the system?

### Layer 7: Responsiveness
Check at 375px, 768px, 1440px:
- Does layout reflow gracefully?
- Does typography remain readable?
- Are touch targets ≥ 44px?
- Is there any horizontal overflow?

---

## Identifying Generic Design

Generic design is the result of applying defaults without decisions. These are the strongest signals:

### Generic Signals (each one is -1 point from 10)
- [ ] Blue-to-purple gradient hero or CTA background
- [ ] Cards with 12-16px border-radius + box-shadow on everything
- [ ] Glassmorphism without a specific compositional reason
- [ ] Hero with centered text, large gradient heading, two CTA buttons
- [ ] Icon-grid feature section (icon + bold title + 2-sentence description, repeated 6×)
- [ ] Dark mode with neon or glow accent colors
- [ ] Stock photo of a laptop showing the product UI on screen
- [ ] Inter as the only typeface, default weight
- [ ] Every section the same density and padding
- [ ] No recognizable signature element

A design with 7+ of these is functionally indistinguishable from any other AI-generated site.

### How to Make a Generic Design Distinctive

**Step 1**: Identify the one thing that makes the product or brand unique.
**Step 2**: Find a visual expression of that uniqueness.
**Step 3**: Apply it consistently as the signature element.

Examples:
- **Linear**: The signature is speed — the entire visual language (sharp edges, tight spacing, dark mode, snappy transitions) communicates velocity
- **Vercel**: The signature is the triangle/chevron and the high-contrast black/white — simple, bold, developer-coded
- **Stripe**: The signature is the blurred gradient sphere — but used as ONE signature, not a pattern repeated everywhere
- **Notion**: The signature is whitespace and editorial proportion — lots of air, generous margins, restrained color

In each case there is ONE clear signature, not a collection of trending effects.

---

## Reference Site Analysis Protocol

When you want to learn from a site you admire, extract abstract principles — not pixels.

### What to Extract

For any reference site, document these 8 things:

1. **Density**: How much content per viewport? (dense / balanced / airy)
2. **Type relationship**: How dramatic is heading vs. body size contrast? What's the ratio?
3. **Color proportion**: Neutral% / Brand color% / Accent%
4. **Composition axis**: Left-anchored / centered / asymmetric / dynamic
5. **Whitespace strategy**: Uniform margins or intentionally varied?
6. **Motion character**: None / subtle / expressive
7. **Shape language**: Sharp (0-4px) / medium (6-12px) / soft (16px+) / mixed
8. **Signature element**: The one thing that makes it recognizable

### Reference Analysis Example

**Site: Linear.app**

1. Density: Dense — compact 12-13px UI, tight spacing, maximum information density
2. Type: Moderate contrast. Display headings at ~48-64px, body at 14-15px
3. Color: 95% neutral (near-black), 5% purple accent used only for key actions
4. Composition: Left-anchored. Never centered in app UI.
5. Whitespace: Intentional scarcity — white space is used at section boundaries, not within content
6. Motion: Subtle and snappy — transitions under 200ms, no decorative animation
7. Shape: Sharp — 4-6px max. Borders over shadows.
8. Signature: The keyboard shortcut everywhere. Speed as a brand promise expressed visually.

**Extracted principle** (not copied layout): "Density as a feature. The UI trusts users to handle information density. This signals respect for power users."

---

## Specific Critique Language

A critique is only useful if it's actionable. Use this formula:

**[Element] + [what is wrong] + [why it matters] + [specific fix]**

Examples:

BAD: "The typography looks off."
GOOD: "The body text at 13px is below the 16px minimum for comfortable reading at body text sizes. This will cause accessibility issues and reader fatigue. Increase to 15-16px."

BAD: "The colors aren't working."
GOOD: "The blue CTA (#4299E1) on the white background has a contrast ratio of 2.8:1, which fails WCAG AA for UI components (minimum 3:1). Darken to #2B6CB0 to reach 4.7:1."

BAD: "The layout is too busy."
GOOD: "There are 4 elements competing for primary attention in the hero section: the heading, the subheading, the CTA button, and the product screenshot. Reduce to one dominant element — the screenshot — and make everything else secondary."

BAD: "It looks generic."
GOOD: "This design has 6 of the 10 generic signals: gradient hero, icon grid, glassmorphism card, Inter only, same padding on every section, no signature element. The most impactful change: replace the gradient with a solid dark background and add a typographic signature element."

---

## Design Quality Scoring

Use this rubric for a fast quality estimate:

| Dimension | 1 (poor) | 3 (acceptable) | 5 (excellent) |
|-----------|----------|----------------|---------------|
| Communication clarity | Unclear purpose | Purpose readable | Immediate, compelling |
| Visual hierarchy | No clear path | One dominant | Clear path through content |
| Typography | Default, unoptimized | Scale exists | Optical sizing, rhythm, craft |
| Spacing system | Arbitrary | Mostly consistent | Systematic, intentional variation |
| Color discipline | Random or excessive | Limited palette | Color does meaningful work |
| Distinctiveness | Generic | Some character | Recognizable signature |
| Component craft | States missing | Basic states | All 8 states, polished |

Score 5 dimensions. Average = design quality. Below 3 = needs redesign, not refinement.