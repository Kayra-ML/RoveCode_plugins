# Game State Management

## Finite State Machine (FSM)

The backbone of game logic. Every entity and screen can be modeled as an FSM.

```ts
type State = "idle" | "running" | "jumping" | "dead";

class PlayerFSM {
  state: State = "idle";

  transition(event: string) {
    const transitions: Record<State, Partial<Record<string, State>>> = {
      idle:    { move: "running", jump: "jumping" },
      running: { stop: "idle",    jump: "jumping"  },
      jumping: { land: "running", die: "dead"      },
      dead:    { respawn: "idle"                   },
    };
    const next = transitions[this.state]?.[event];
    if (next) {
      this.onExit(this.state);
      this.state = next;
      this.onEnter(next);
    }
  }

  onEnter(state: State) { /* play animation, reset timers */ }
  onExit(state: State)  { /* clean up effects */ }
}
```

## Hierarchical State Machine (HSM)

Child states inherit parent transitions. "Any state" → dead eliminates repetition.

```
GameState
├── Playing
│   ├── Exploring
│   ├── InCombat
│   └── Dialogue
├── Paused        ← overlays Playing, resumes on unpause
└── GameOver
```

## Pushdown Automaton (Stack-Based States)

Push states onto a stack to support "pause over gameplay" without destroying the playing state.

```ts
class StateStack {
  private stack: GameState[] = [];

  push(state: GameState) {
    this.stack.at(-1)?.onPause();
    this.stack.push(state);
    state.onEnter();
  }

  pop() {
    this.stack.pop()?.onExit();
    this.stack.at(-1)?.onResume();
  }

  update(dt: number) {
    this.stack.at(-1)?.update(dt);
  }

  render(alpha: number) {
    // Render all states bottom-up (pause menu over game)
    for (const state of this.stack) state.render(alpha);
  }
}
```

## Scene Management

A scene is a self-contained chunk of the game (main menu, level 1, cutscene).

```ts
interface Scene {
  load(): Promise<void>;   // async asset loading
  enter(): void;           // first frame setup
  update(dt: number): void;
  render(alpha: number): void;
  exit(): void;            // cleanup
}

class SceneManager {
  current: Scene | null = null;

  async transition(next: Scene) {
    this.current?.exit();
    await next.load();
    next.enter();
    this.current = next;
  }
}
```

## Entity-Component-System (ECS) Basics

Separate data (components) from logic (systems). Avoids deep inheritance hierarchies.

```ts
// Components are plain data
type Position = { x: number; y: number };
type Velocity = { vx: number; vy: number };
type Health   = { hp: number; max: number };

// Systems operate on components
function movementSystem(entities: Entity[], dt: number) {
  for (const e of entities) {
    const pos = e.get(Position);
    const vel = e.get(Velocity);
    if (pos && vel) {
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;
    }
  }
}
```

## Save Game Serialization

Only serialize what cannot be derived. Derive everything else at load time.

```ts
interface SaveData {
  version: number;          // for migration
  timestamp: number;
  playerPos: { x: number; y: number };
  inventory: string[];
  levelId: string;
  flags: Record<string, boolean>; // story triggers
  // DO NOT save: enemy positions (spawn from level data), calculated stats
}

function serialize(game: GameState): SaveData { ... }
function deserialize(data: SaveData): GameState { ... }
```

Use JSON for human-readable saves; consider binary (msgpack) for large save files.

## Checkpoint Systems

Save at checkpoints rather than continuously. Store checkpoint ID, not full world state.

```ts
class CheckpointSystem {
  private checkpoints = new Map<string, CheckpointData>();

  activate(id: string) {
    this.checkpoints.set(id, {
      playerPos: game.player.pos,
      activeEnemies: game.enemies.map(e => e.id),
      time: Date.now(),
    });
    persistToStorage(id, this.checkpoints.get(id)!);
  }

  respawn(id: string) {
    const cp = this.checkpoints.get(id);
    if (cp) game.loadFromCheckpoint(cp);
  }
}
```

## Game Progression Graphs

Use a directed acyclic graph for non-linear progression. Nodes = events/levels, edges = unlock conditions.

```ts
type ProgressNode = {
  id: string;
  requires: string[];   // prerequisite node ids
  unlocks: string[];
};

function isUnlocked(nodeId: string, completed: Set<string>): boolean {
  const node = progressGraph.get(nodeId)!;
  return node.requires.every(r => completed.has(r));
}
```

## Undo / Redo for Puzzle Games

Command pattern: each action encapsulates do/undo.

```ts
interface Command {
  execute(): void;
  undo(): void;
}

class UndoStack {
  private history: Command[] = [];
  private redoStack: Command[] = [];

  execute(cmd: Command) {
    cmd.execute();
    this.history.push(cmd);
    this.redoStack = []; // clear redo on new action
  }

  undo() { const cmd = this.history.pop(); if (cmd) { cmd.undo(); this.redoStack.push(cmd); } }
  redo() { const cmd = this.redoStack.pop(); if (cmd) { cmd.execute(); this.history.push(cmd); } }
}
```

## State Diffing for Netcode

For rollback netcode, store full game state snapshots. Diff between frames to detect mispredictions.

```ts
type Snapshot = { frame: number; state: Uint8Array };

class SnapshotBuffer {
  private buf: Snapshot[] = [];

  save(frame: number, state: GameState) {
    this.buf.push({ frame, state: serialize(state) });
    if (this.buf.length > 60) this.buf.shift(); // keep 1 second at 60fps
  }

  rollbackTo(frame: number): GameState | null {
    const snap = this.buf.find(s => s.frame === frame);
    return snap ? deserialize(snap.state) : null;
  }
}
```