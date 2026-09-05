# Interaction Design

## What Interaction Design Actually Is

Interaction design is not "adding hover effects." It is the complete design of how a user moves through a system — every state, every transition, every moment of feedback. Poor interaction design creates friction. Good interaction design is invisible.

The test: can a user accomplish their goal without thinking about the interface?

---

## The 8 States Every Interactive Element Needs

Never design only the "default" state. Every interactive element has 8 states that must be explicitly designed:

| State | What it communicates | Design requirement |
|-------|---------------------|-------------------|
| **Default** | Resting, available | Clear affordance — looks interactive |
| **Hover** | "You can interact here" | Subtle change: background, border, color, elevation |
| **Focus** | Keyboard/accessibility position | Visible focus ring — never `outline: none` alone |
| **Active** | Currently being pressed | Immediate response — scale down 2-3%, color shift |
| **Loading** | Action in progress | Maintain layout — skeleton or spinner in-place |
| **Disabled** | Not available | 40-50% opacity + `cursor: not-allowed` + explanation |
| **Error** | Something went wrong | Red/warning + specific message + recovery path |
| **Success** | Action completed | Positive confirmation + what happens next |

```css
/* Complete button state system */
.btn-primary {
  background: hsl(217, 91%, 50%);        /* default */
  transition: all 150ms ease;
}
.btn-primary:hover {
  background: hsl(217, 91%, 45%);        /* darken 5% */
  transform: translateY(-1px);           /* subtle lift */
  box-shadow: 0 4px 12px hsl(217 91% 50% / 0.3);
}
.btn-primary:focus-visible {
  outline: 2px solid hsl(217, 91%, 50%);
  outline-offset: 2px;
}
.btn-primary:active {
  transform: translateY(0) scale(0.98); /* press down */
  box-shadow: none;
}
.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}
```

---

## Microinteraction Design

Microinteractions are the smallest unit of interaction design. Each has 4 parts:
1. **Trigger**: what starts it (user action or system event)
2. **Rules**: what happens
3. **Feedback**: how the user knows
4. **Loop/mode**: does it repeat? does it end?

### Timing Rules

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Button press feedback | 50-100ms | ease-out |
| Tooltip appear | 120-150ms | ease-out |
| Dropdown open | 150-200ms | ease-out |
| Toggle/switch | 150-200ms | ease-in-out |
| Modal open | 200-300ms | ease-out |
| Page transition | 250-400ms | ease-in-out |
| Skeleton → content | 200ms | ease |
| Toast/notification | 300ms in, 200ms out | ease |

**Too fast** (< 100ms for transitions): Jarring, unreadable
**Too slow** (> 400ms for UI elements): Feels sluggish, frustrating

### Button Microinteraction Patterns

```css
/* Ripple effect on click */
.btn { position: relative; overflow: hidden; }
.btn::after {
  content: '';
  position: absolute;
  inset: 50%;
  border-radius: 50%;
  background: white;
  opacity: 0;
  transform: scale(0);
  transition: transform 0.4s, opacity 0.4s;
}
.btn:active::after {
  inset: -50%;
  transform: scale(1);
  opacity: 0.15;
  transition: 0s;
}

/* Weight shift on hover (variable font) */
.btn-text {
  font-weight: 500;
  transition: font-weight 100ms;
}
.btn-text:hover { font-weight: 650; }
```

---

## Form Interaction Design

Forms are where most interaction design fails. Comprehensive rules:

### Validation Timing

| Scenario | When to validate | Why |
|----------|-----------------|-----|
| First visit to field | On blur (when leaving) | Don't interrupt while typing |
| After first error shown | On input (while typing) | User is actively correcting |
| On submit | Always | Catch everything |
| Async validation (email exists) | On blur + 500ms debounce | Don't hammer server |

```typescript
// Correct validation pattern
function handleFieldBlur(field: HTMLInputElement) {
  // Only validate after user has left the field
  const error = validate(field.value);
  if (error) {
    showError(field, error);
    // Now switch to real-time validation since user knows there's an error
    field.addEventListener('input', () => {
      const newError = validate(field.value);
      newError ? showError(field, newError) : clearError(field);
    }, { once: false });
  }
}
```

### Error Message Design

| Bad | Good |
|-----|------|
| "Invalid input" | "Email must include @domain.com" |
| "Required" | "Enter your email to continue" |
| "Password invalid" | "Password must be 8+ characters with one number" |
| "Error occurred" | "Couldn't save changes. Check your connection and try again." |

**Error message formula**: [What went wrong] + [How to fix it]

### Input Affordance

```css
/* Clear affordance: this is editable */
input {
  border: 1.5px solid hsl(215, 16%, 76%);
  border-radius: 6px;
  background: hsl(0, 0%, 100%);
  padding: 10px 14px;
}

/* Clear state: you are editing this */
input:focus {
  border-color: hsl(217, 91%, 50%);
  box-shadow: 0 0 0 3px hsl(217 91% 50% / 0.15);
  outline: none; /* replaced by box-shadow */
}

/* Clear state: this is wrong */
input[aria-invalid="true"] {
  border-color: hsl(0, 84%, 60%);
  box-shadow: 0 0 0 3px hsl(0 84% 60% / 0.15);
}
```

---

## Loading State Design

Loading states are interaction design, not just "add a spinner."

### Progressive Loading Strategy

```
0ms    → Show skeleton immediately (never blank screen)
0-1s   → Skeleton only, no spinner (feels fast)
1-3s   → Add subtle spinner indicator
3s+    → Add progress indicator + cancel option if possible
10s+   → Something went wrong — show error + retry
```

### Skeleton Design Rules

```css
/* Skeletons must match actual content shape */
.skeleton {
  background: linear-gradient(
    90deg,
    hsl(215, 16%, 90%) 25%,
    hsl(215, 16%, 95%) 50%,
    hsl(215, 16%, 90%) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

/* Skeleton preserves layout — same dimensions as real content */
.skeleton-text    { height: 1em; width: 80%; margin-bottom: 0.5em; }
.skeleton-title   { height: 1.5em; width: 60%; margin-bottom: 1em; }
.skeleton-avatar  { height: 40px; width: 40px; border-radius: 50%; }
```

### Optimistic UI

Update the UI before the server confirms. Revert on failure.

```typescript
async function toggleLike(postId: string) {
  // 1. Immediately update UI
  setLiked(true);
  setLikeCount(count => count + 1);
  
  try {
    await api.likePost(postId);
    // Server confirmed — nothing to do
  } catch {
    // Revert on failure
    setLiked(false);
    setLikeCount(count => count - 1);
    showToast("Couldn't save. Try again.");
  }
}
```

Use for: likes, follows, bookmarks, non-financial mutations.
Never for: purchases, deletions, form submissions, anything irreversible.

---

## Navigation Interaction Design

### Mobile Navigation Patterns (in order of preference)

1. **Tab bar** (bottom, 4-5 items): Best for mobile apps. Thumb-reachable. Always visible.
2. **Scrollable top nav**: Works for 5-8 items. Shows which items exist.
3. **Priority+ pattern**: Show N items, overflow into "More" dropdown.
4. **Bottom sheet**: For secondary navigation options.
5. **Hamburger menu**: Last resort. Hides navigation. Use only when space is truly impossible.

### Scroll Behavior

```css
/* Smooth scrolling — but respect user preferences */
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}

/* Sticky header that shrinks on scroll */
.header {
  transition: padding 200ms ease, box-shadow 200ms ease;
}
.header.scrolled {
  padding-block: 8px; /* was 16px */
  box-shadow: 0 1px 0 hsl(215 16% 90%);
}
```

---

## Interaction Anti-Patterns

| Anti-pattern | Why it fails | Fix |
|-------------|-------------|-----|
| No hover state on clickable elements | User can't tell it's interactive | Always add hover feedback |
| `outline: none` without replacement | Keyboard users can't navigate | Replace with visible focus style |
| Click target under 44px | Mobile users miss taps | Min 44×44px touch target |
| Form resets on validation error | Users lose their work | Preserve input values always |
| Dead-end error states | User is stuck | Every error needs a recovery action |
| Infinite scroll with no position memory | Back button loses position | Save/restore scroll position |
| Loading spinner with no timeout | User waits forever | Always add a maximum wait + error |
| Hover-only tooltips | Invisible on mobile | Add tap/focus trigger for tooltips |
| Disabled buttons with no explanation | User doesn't know why | Explain what enables the button |