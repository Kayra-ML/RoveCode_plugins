# Game Loop

## Core Concept

The game loop drives every interactive experience. It reads input, updates state, and renders output — repeatedly, as fast as possible or at a controlled rate.

```
while (running) {
  processInput();
  update(deltaTime);
  render();
}
```

## Fixed Timestep vs Variable Timestep

**Variable timestep**: multiply everything by `deltaTime`. Simple, but physics can go unstable at low frame rates.

**Fixed timestep**: physics runs at a constant step (e.g. 16ms / 60Hz). Rendering can happen at any rate with interpolation. This is the industry standard for games with physics.

```js
const FIXED_STEP = 1 / 60; // 60 Hz physics
let accumulator = 0;
let previousTime = performance.now();

function loop() {
  const currentTime = performance.now();
  let elapsed = (currentTime - previousTime) / 1000;
  previousTime = currentTime;

  // Clamp to prevent spiral of death
  if (elapsed > 0.25) elapsed = 0.25;

  accumulator += elapsed;

  while (accumulator >= FIXED_STEP) {
    fixedUpdate(FIXED_STEP);
    accumulator -= FIXED_STEP;
  }

  // Alpha: how far between physics ticks we are
  const alpha = accumulator / FIXED_STEP;
  render(alpha);

  requestAnimationFrame(loop);
}
```

## Delta Time Calculation

Always measure wall-clock time between frames. Never assume a constant frame rate.

```js
let lastTime = 0;

function tick(timestamp) {
  const deltaTime = (timestamp - lastTime) / 1000; // seconds
  lastTime = timestamp;
  update(deltaTime);
  render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

## Spiral of Death

When update takes longer than a frame, accumulator grows unboundedly. The CPU never catches up.

**Prevention**: cap `elapsed` before adding to accumulator (see `if (elapsed > 0.25)` above). Accept that slow hardware runs in slow-motion rather than freezing.

## Update / Render Separation

Keep physics and rendering decoupled:
- `fixedUpdate(step)` — deterministic, fixed rate, physics, AI, game logic
- `render(alpha)` — runs as fast as possible, interpolates positions for smooth visuals

## Render Interpolation

When rendering between physics ticks, interpolate object positions using `alpha`:

```js
// Store previous and current transform
entity.renderX = lerp(entity.prevX, entity.currX, alpha);
entity.renderY = lerp(entity.prevY, entity.currY, alpha);

function lerp(a, b, t) {
  return a + (b - a) * t;
}
```

This makes movement look smooth even when physics runs at 30Hz and rendering at 120Hz.

## Frame Rate Independence

Never tie game speed to frame rate. Common mistake:

```js
// WRONG — speed depends on FPS
player.x += 5;

// CORRECT — speed in units/second
player.x += 300 * deltaTime;
```

## requestAnimationFrame for Web Games

`requestAnimationFrame` syncs to the display refresh rate and pauses when the tab is hidden:

```js
// Handle tab visibility — reset time to avoid huge delta on resume
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastTime = performance.now();
});
```

## Bun / Node Game Loop

`setInterval` and `setTimeout` have ~1ms minimum resolution and drift. For server-side game simulations use `process.hrtime.bigint()` for precise timing:

```ts
const STEP_NS = BigInt(Math.round(1e9 / 60));
let last = process.hrtime.bigint();

function serverLoop() {
  const now = process.hrtime.bigint();
  const delta = Number(now - last) / 1e9;
  last = now;
  update(delta);
  const drift = Number(process.hrtime.bigint() - now);
  const wait = Number(STEP_NS) - drift;
  if (wait > 0) setTimeout(serverLoop, wait / 1e6);
  else setImmediate(serverLoop);
}
serverLoop();
```

## Engine-Specific Notes

- **Unity**: `FixedUpdate()` for physics (default 50Hz), `Update()` for input/visuals, `Time.deltaTime` / `Time.fixedDeltaTime` provided automatically.
- **Godot**: `_physics_process(delta)` for physics, `_process(delta)` for rendering, engine provides fixed step.
- **Unreal**: `Tick(DeltaTime)` for actors; physics sub-stepping available in project settings.