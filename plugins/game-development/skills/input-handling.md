# Input Handling

## Polling vs Event-Driven

**Polling**: check input state every frame. Simple, good for held buttons and analog sticks.
**Event-driven**: respond to key-down/key-up events. Better for UI, text input, one-shot actions.

Most games use both: poll analog axes every frame, handle discrete actions via events.

## Action Mapping Abstraction

Never hardcode raw keys. Map physical inputs to named logical actions.

```ts
const actionMap = {
  jump:    { keys: ["Space", "KeyW"], gamepadButton: 0 },
  attack:  { keys: ["KeyZ", "KeyJ"], gamepadButton: 2 },
  moveX:   { axis: "gamepadLeftX", keys: ["ArrowLeft", "ArrowRight"] },
};

class InputManager {
  private state = new Map<string, boolean>();
  private prevState = new Map<string, boolean>();

  isPressed(action: string): boolean {
    return !!this.state.get(action);
  }

  justPressed(action: string): boolean {
    return !!this.state.get(action) && !this.prevState.get(action);
  }

  justReleased(action: string): boolean {
    return !this.state.get(action) && !!this.prevState.get(action);
  }

  endFrame() {
    for (const [k, v] of this.state) this.prevState.set(k, v);
  }
}
```

## Input Buffering

Store recent inputs so brief presses aren't missed between frames.

```ts
class InputBuffer {
  private buffer: { action: string; time: number }[] = [];
  private readonly WINDOW_MS = 150;

  record(action: string) {
    this.buffer.push({ action, time: performance.now() });
  }

  consume(action: string): boolean {
    const now = performance.now();
    const idx = this.buffer.findIndex(
      e => e.action === action && now - e.time < this.WINDOW_MS
    );
    if (idx !== -1) { this.buffer.splice(idx, 1); return true; }
    return false;
  }
}
```

## Coyote Time

Allow jumping shortly after walking off a platform ledge — feels fair to the player.

```ts
const COYOTE_MS = 120;
let lastGroundedTime = 0;

function canJump(): boolean {
  return performance.now() - lastGroundedTime < COYOTE_MS;
}

// In physics update:
if (entity.isGrounded) lastGroundedTime = performance.now();
```

## Jump Buffering

Accept a jump press slightly before landing so it feels responsive.

```ts
const JUMP_BUFFER_MS = 100;
let jumpPressTime = -Infinity;

// On jump pressed:
jumpPressTime = performance.now();

// In physics update when landing:
if (entity.justLanded && performance.now() - jumpPressTime < JUMP_BUFFER_MS) {
  entity.jump();
}
```

## Gamepad API (Web)

```ts
function getGamepads(): Gamepad[] {
  return Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[];
}

function pollGamepad(gp: Gamepad) {
  const leftX = applyDeadzone(gp.axes[0], 0.15);
  const leftY = applyDeadzone(gp.axes[1], 0.15);
  const aButton = gp.buttons[0].pressed;
  return { leftX, leftY, aButton };
}

function applyDeadzone(value: number, threshold: number): number {
  if (Math.abs(value) < threshold) return 0;
  // Rescale so edge of deadzone maps to 0
  return (value - Math.sign(value) * threshold) / (1 - threshold);
}
```

## Analog Stick Deadzone

Raw sticks have drift near center. Always apply a deadzone. Radial deadzone is better than axial:

```ts
function radialDeadzone(x: number, y: number, threshold: number) {
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude < threshold) return { x: 0, y: 0 };
  const scale = (magnitude - threshold) / (1 - threshold) / magnitude;
  return { x: x * scale, y: y * scale };
}
```

## Touch Input Normalization

Map touch to the same action system as keyboard/gamepad:

```ts
canvas.addEventListener("touchstart", e => {
  for (const touch of e.changedTouches) {
    const normalized = {
      x: touch.clientX / canvas.width,
      y: touch.clientY / canvas.height,
    };
    // Map screen regions to actions or use virtual joystick math
    dispatchInputAction(normalized);
  }
}, { passive: false });
```

## Key Rebinding System Design

Store bindings in a separate config object, not in code. Persist to localStorage / save file.

```ts
// Default bindings
const defaultBindings: Record<string, string[]> = {
  jump: ["Space"],
  attack: ["KeyZ"],
};

// User overrides stored separately
function resolveBinding(action: string): string[] {
  return userBindings[action] ?? defaultBindings[action] ?? [];
}
```

## Input Replay for Debugging

Record all inputs with timestamps. Replay by feeding recorded inputs back to the same InputManager. Useful for reproducing physics bugs.

```ts
type InputEvent = { time: number; action: string; value: boolean };

class InputRecorder {
  log: InputEvent[] = [];
  startTime = 0;

  record(action: string, value: boolean) {
    this.log.push({ time: performance.now() - this.startTime, action, value });
  }
}
```

## Input Prediction for Network Games

Client predicts local player input immediately; server confirms or corrects.
- Apply input locally without waiting for server round-trip.
- Tag each input with a sequence number.
- On server mismatch, roll back and re-simulate from last confirmed state.