# Color System Engineering

## Why Color Systems Fail

Most UI color problems come from the same root cause: colors chosen as raw values rather than as a system. A designer picks `#3B82F6` for the primary button. Later someone adds `#2563EB` for hover. Then `#1D4ED8` for active. Then a sidebar uses `#60A5FA`. None of these are coordinated — they're decisions made under pressure without a framework.

A color system answers: given any UI state, surface, or semantic meaning, what is the exact color, and why?

---

## Why HSL Over Hex

Hex values (`#3B82F6`) encode color in RGB channels — a format that mirrors display hardware, not human perception. Manipulating hex is opaque: you cannot intuit what a 10% lighter version of `#3B82F6` looks like without a tool.

HSL (`hsl(217, 91%, 60%)`) encodes:
- **Hue**: the color's position on the wheel (0–360°)
- **Saturation**: how vivid vs gray (0–100%)
- **Lightness**: how light vs dark (0–100%)

**Advantages of HSL for design engineering:**

1. **Readable manipulation**: `hsl(217, 91%, 70%)` is obviously lighter than `hsl(217, 91%, 60%)`. You can adjust one axis without touching the others.
2. **Programmatic generation**: Generate an entire palette by iterating lightness values from one hue.
3. **Dark mode math**: Flip lightness, preserve hue and saturation. A formula, not a guessing game.
4. **Consistency**: All shades of a color share the same hue — the palette stays harmonious.

---

## HSL Anatomy

```
hsl( H , S% , L% )
     │    │    │
     │    │    └── 0% = black, 100% = white, 50% = pure color
     │    └─────── 0% = gray, 100% = fully saturated
     └──────────── 0/360 = red, 120 = green, 240 = blue
```

**Key hue landmarks:**
| Hue | Color |
|-----|-------|
| 0 / 360 | Red |
| 30 | Orange |
| 60 | Yellow |
| 120 | Green |
| 180 | Cyan |
| 210–240 | Blue |
| 270 | Violet |
| 300 | Magenta |
| 330 | Pink/Rose |

---

## Building a Palette from One Hue

Start with your brand hue. Generate a 10-step scale by varying lightness:

```
50:   hsl(H, S%, 97%)   ← near-white tint, backgrounds
100:  hsl(H, S%, 93%)
200:  hsl(H, S%, 85%)
300:  hsl(H, S%, 72%)
400:  hsl(H, S%, 60%)
500:  hsl(H, S%, 50%)   ← "pure" color (use sparingly)
600:  hsl(H, S%, 40%)   ← primary interactive default (often here)
700:  hsl(H, S%, 30%)
800:  hsl(H, S%, 22%)
900:  hsl(H, S%, 14%)   ← near-black, dark backgrounds
```

**Saturation adjustment per step**: Pure lightness scaling produces washed-out mid-tones. In practice, slightly reduce saturation at the extremes:
- Steps 50–200: reduce saturation by 10–20% (they'd be garish at full saturation)
- Steps 700–900: reduce saturation by 5–15% (very dark colors look muddy at full saturation)

---

## The Perceptual Uniformity Problem

HSL's `L=50` is not perceived as "mid-tone" for all hues. Yellow at `L=50` looks much lighter than blue at `L=50`. This is because human vision is not equally sensitive to all wavelengths — we perceive yellow and green as inherently brighter.

**Consequence**: An HSL palette where all 500-level colors are `L=50` will appear inconsistent. Your blue will look darker than your yellow at the "same" lightness.

**Solutions:**
1. Adjust lightness manually per hue to achieve equal perceived brightness
2. Use OKLCH instead of HSL

---

## OKLCH: The Modern Alternative

OKLCH (`oklch(L C H)`) is perceptually uniform — a step in L produces the same perceived lightness change across all hues.

```css
/* OKLCH syntax */
color: oklch(0.6 0.15 250);
/*           │    │    │
             │    │    └── Hue (0–360, same as HSL)
             │    └─────── Chroma (0 = gray, ~0.37 = max vivid)
             └──────────── Lightness (0 = black, 1 = white)
```

**Use OKLCH when:**
- Building a design system with multiple hues that must appear equally vivid
- Generating palettes programmatically
- Needing precise dark mode math

**Browser support**: OKLCH is supported in all modern browsers (Chrome 111+, Safari 15.4+, Firefox 113+). Use it.

**Practical approach**: Design in OKLCH, provide HSL fallbacks for tools that don't support it yet.

---

## Semantic Color Tokens

Raw color values should never appear in component styles. Components consume semantic tokens — names that describe *purpose*, not *appearance*.

**Why this matters**: When you change from light to dark mode, or rebrand, you change the token values — not every component.

```css
:root {
  /* Backgrounds */
  --color-bg-primary: hsl(0, 0%, 100%);       /* page background */
  --color-bg-secondary: hsl(220, 14%, 96%);   /* card, sidebar, subtle surface */
  --color-bg-tertiary: hsl(220, 13%, 91%);    /* input background, hover surface */

  /* Text */
  --color-text-primary: hsl(220, 9%, 12%);    /* headings, primary content */
  --color-text-secondary: hsl(220, 9%, 40%);  /* supporting text, metadata */
  --color-text-disabled: hsl(220, 9%, 65%);   /* disabled states, placeholder */
  --color-text-inverse: hsl(0, 0%, 100%);     /* text on dark backgrounds */

  /* Borders */
  --color-border-default: hsl(220, 13%, 87%); /* cards, dividers, inputs */
  --color-border-strong: hsl(220, 13%, 72%);  /* emphasized borders */
  --color-border-focus: hsl(217, 91%, 55%);   /* focus ring */

  /* Interactive */
  --color-interactive-default: hsl(217, 91%, 55%);  /* primary button, link */
  --color-interactive-hover: hsl(217, 91%, 48%);    /* hover state */
  --color-interactive-active: hsl(217, 91%, 40%);   /* pressed state */
  --color-interactive-muted: hsl(217, 91%, 96%);    /* ghost button background */

  /* Feedback */
  --color-feedback-success: hsl(142, 72%, 29%);
  --color-feedback-success-bg: hsl(142, 76%, 95%);
  --color-feedback-warning: hsl(38, 92%, 40%);
  --color-feedback-warning-bg: hsl(48, 100%, 95%);
  --color-feedback-error: hsl(0, 72%, 42%);
  --color-feedback-error-bg: hsl(0, 86%, 97%);
  --color-feedback-info: hsl(217, 91%, 45%);
  --color-feedback-info-bg: hsl(217, 91%, 96%);
}
```

**Usage rule**: Component CSS only references `--color-*` tokens. Never `hsl(...)` or `#hex` directly in components.

---

## Dark Mode: Not Just Inverted Lightness

The most common dark mode mistake is inverting lightness: `light = hsl(H, S%, 95%)` becomes `dark = hsl(H, S%, 5%)`. This produces oppressive, high-contrast dark themes that cause eye strain.

**What actually changes in dark mode:**

1. **Surfaces are not black**: Real dark UIs use very dark grays (8–15% lightness), not black. Pure black is only for text on white, never for large surfaces.
2. **Surface elevation is reversed**: In light mode, elevation is shown by shadow. In dark mode, elevation is shown by *lighter* surfaces — a floating card is lighter than the background, not darker.
3. **Saturation drops**: Fully saturated colors on dark backgrounds vibrate uncomfortably. Reduce saturation by 10–20% for dark mode.
4. **Text is off-white, not white**: Pure white text on dark gray creates more contrast than WCAG requires, causing halation. Use 85–92% lightness for primary text.

---

## Dark Mode Surface Layer Math

Build dark mode surfaces as a stack of lightness steps:

```css
[data-theme="dark"] {
  /* Background hierarchy — each layer 4-8% lighter */
  --color-bg-primary: hsl(220, 14%, 9%);     /* page: near-black */
  --color-bg-secondary: hsl(220, 14%, 13%);  /* card: +4% lightness */
  --color-bg-tertiary: hsl(220, 14%, 18%);   /* input, hover: +5% */
  --color-bg-elevated: hsl(220, 14%, 22%);   /* modal, popover: +4% */

  /* Text — not pure white */
  --color-text-primary: hsl(220, 9%, 90%);   /* off-white */
  --color-text-secondary: hsl(220, 9%, 60%); /* supporting */
  --color-text-disabled: hsl(220, 9%, 40%);  /* disabled */

  /* Interactive — slightly lighter, slightly less saturated */
  --color-interactive-default: hsl(217, 85%, 65%);
  --color-interactive-hover: hsl(217, 85%, 72%);
}
```

**The 4–8% rule**: Adjacent surfaces must differ by at least 4% lightness to be distinguishable. Less than 4% = invisible layers. More than 8% = jarring contrast between surfaces.

---

## WCAG Contrast Requirements

Contrast ratio is calculated between foreground and background luminance values.

| Level | Normal text (<18px normal / <14px bold) | Large text (≥18px normal / ≥14px bold) | UI components & graphics |
|-------|----------------------------------------|----------------------------------------|--------------------------|
| AA | 4.5:1 | 3:1 | 3:1 |
| AAA | 7:1 | 4.5:1 | N/A |

**Minimum target**: AA for all text. Aim for AAA on body text — users read thousands of words, the contrast cost is zero and the readability gain is real.

**Contrast quick check**: The luminance formula is complex but tools make it instant:
- Browser DevTools → Accessibility panel → contrast ratio on any element
- `color-contrast()` CSS function (emerging standard)
- Figma A11y plugins

**Practical shortcut for HSL**: On a white background (`L=100%`), text passes AA at approximately `L ≤ 55%`. On a dark background (`L=9%`), text passes AA at approximately `L ≥ 55%`. These are rough guides — always verify with a calculator.

---

## Color Blindness: Safe and Unsafe Combinations

**~8% of males, 0.5% of females** have some form of color vision deficiency. The most common is red-green (deuteranopia/protanopia).

**Unsafe combinations (break for red-green colorblind):**
- Red and green at similar lightness values
- Orange and red
- Green and brown
- Blue and purple (less common: tritanopia)

**Safe combinations:**
- Blue and orange (the universally safe pair)
- Blue and red (sufficient hue difference)
- Yellow and purple
- Black and white

**Design rule**: Never use color as the *only* signal. Status (success/error/warning) must always have a secondary cue: icon, text label, pattern, or position. A red border alone is invisible to ~8% of users.

---

## From Brand Color to System

Given one brand color (e.g., `hsl(156, 72%, 42%)`), derive a full system:

1. **Brand color becomes your `--color-interactive-default`**: adjust lightness to pass 4.5:1 on white
2. **Generate the hue scale**: Use the same hue, vary lightness for 9 steps
3. **Neutral palette**: Slightly tinted neutrals (same hue, 5–10% saturation) feel more polished than pure grays. `hsl(156, 8%, 50%)` is a "green-tinted gray" that harmonizes with your brand.
4. **Feedback colors**: Choose hues that are perceptually distinct from your brand color. If brand is green, use amber for warning (not yellow-green), and a clear red for error.
5. **Test all semantic tokens**: Every token in the semantic layer must pass contrast in both light and dark mode.

---

## Anti-Patterns

**Pure black on white (`#000` on `#fff`)**: Contrast ratio 21:1 — far exceeds requirements and causes halation. Use near-black (`hsl(220, 9%, 12%)`) on white instead. The contrast is still excellent (>15:1) and reading comfort improves significantly.

**Pure white on dark (`#fff` on `#1a1a1a`)**: Same problem. Use `hsl(220, 9%, 90%)` instead.

**Random grays**: `#666`, `#777`, `#888`, `#999` — these are not a system. A hue-tinted neutral scale (`hsl(220, 9%, 40%)`, `hsl(220, 9%, 55%)`, etc.) creates grays that feel part of the same design.

**Using the same color for interactive and feedback states**: If your primary button is blue and your info toast is also blue, users cannot distinguish action from information. Keep these distinct.

**Building dark mode by wrapping everything in `filter: invert(1)`**: This inverts images, SVGs, and video. It produces incorrect results for any non-solid-color element.

**Insufficient surface differentiation**: Cards and page backgrounds that differ by only 1–2% lightness are invisible on slightly uncalibrated monitors. Always test on multiple displays.

**Saturated text on colored backgrounds**: Placing `hsl(217, 91%, 55%)` text on `hsl(200, 50%, 20%)` — both vivid colors — creates simultaneous contrast vibration and is extremely hard to read. Text on colored backgrounds should be desaturated (white, near-white, or near-black).