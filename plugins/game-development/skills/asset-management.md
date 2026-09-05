# Asset Management

## Asset Loading Pipeline

Assets move through: source files → import/process → runtime format → GPU/audio memory.

Two strategies:
- **Preload**: load everything before the scene starts. Simple, causes loading screens.
- **Streaming**: load on demand as the player approaches. Complex, avoids hitches in open worlds.

```ts
class AssetLoader {
  private cache = new Map<string, unknown>();
  private loading = new Map<string, Promise<unknown>>();

  async load<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    if (this.loading.has(key)) return this.loading.get(key) as Promise<T>;

    const promise = loader().then(asset => {
      this.cache.set(key, asset);
      this.loading.delete(key);
      return asset;
    });
    this.loading.set(key, promise);
    return promise;
  }

  unload(key: string) {
    this.cache.delete(key);
  }
}
```

## Texture Atlases

Pack multiple sprites into one texture to reduce draw call texture switches. Store UV regions in a companion JSON:

```json
{
  "frames": {
    "player_idle_0": { "x": 0,   "y": 0,  "w": 32, "h": 32 },
    "player_idle_1": { "x": 32,  "y": 0,  "w": 32, "h": 32 },
    "coin_spin_0":   { "x": 64,  "y": 0,  "w": 16, "h": 16 }
  },
  "meta": { "image": "atlas.png", "size": { "w": 512, "h": 512 } }
}
```

```ts
function getUV(atlas: Atlas, frameName: string, texW: number, texH: number) {
  const f = atlas.frames[frameName];
  return {
    u0: f.x / texW,       v0: f.y / texH,
    u1: (f.x + f.w) / texW, v1: (f.y + f.h) / texH,
  };
}
```

## Sprite Sheet Animation State

Drive animation frames from a state machine:

```ts
class SpriteAnimator {
  private frame = 0;
  private elapsed = 0;

  constructor(
    private atlas: Atlas,
    private animations: Record<string, { frames: string[]; fps: number }>,
    private currentAnim = "idle"
  ) {}

  play(name: string) {
    if (this.currentAnim !== name) { this.currentAnim = name; this.frame = 0; this.elapsed = 0; }
  }

  update(dt: number) {
    const anim = this.animations[this.currentAnim];
    this.elapsed += dt;
    const frameDuration = 1 / anim.fps;
    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frame = (this.frame + 1) % anim.frames.length;
    }
  }

  currentFrameName(): string {
    return this.animations[this.currentAnim].frames[this.frame];
  }
}
```

## Audio Pooling

Browsers and engines limit simultaneous audio instances. Pool Audio objects to reuse them.

```ts
class AudioPool {
  private pool: HTMLAudioElement[] = [];
  private maxConcurrent = 8;

  play(src: string, volume = 1.0) {
    // Find a free instance
    let audio = this.pool.find(a => a.paused || a.ended);
    if (!audio) {
      if (this.pool.length >= this.maxConcurrent) return; // drop excess
      audio = new Audio();
      this.pool.push(audio);
    }
    audio.src = src;
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {}); // ignore autoplay policy errors
  }
}
```

## Reference Counting for Asset Unloading

Track how many systems are using each asset. Unload only when count reaches zero.

```ts
class RefCountedCache {
  private assets = new Map<string, { data: unknown; refs: number }>();

  acquire(key: string): unknown {
    const entry = this.assets.get(key);
    if (entry) { entry.refs++; return entry.data; }
    return null;
  }

  release(key: string) {
    const entry = this.assets.get(key);
    if (!entry) return;
    entry.refs--;
    if (entry.refs <= 0) {
      this.assets.delete(key);
      // dispose GPU texture, free audio buffer, etc.
    }
  }
}
```

## Loading Screens with Progress

Report progress by counting loaded assets vs total:

```ts
async function loadScene(manifest: string[], onProgress: (p: number) => void) {
  let loaded = 0;
  await Promise.all(
    manifest.map(async key => {
      await assetLoader.load(key, () => fetchAsset(key));
      loaded++;
      onProgress(loaded / manifest.length);
    })
  );
}
```

Show a progress bar using `onProgress`. Fake minimum time (e.g. 500ms) to avoid flashing screen.

## Hot Reloading Assets in Development

Watch source files and reload changed assets without restarting:

```ts
// Node/Bun watcher
import { watch } from "fs";

watch("./assets", { recursive: true }, (event, filename) => {
  if (!filename) return;
  const key = filenameToAssetKey(filename);
  assetLoader.unload(key);
  assetLoader.load(key, () => fetchAsset(key)).then(() => {
    eventBus.emit("asset-reloaded", key);
  });
});
```

## Memory Budgets Per Platform

| Platform      | Texture budget | Audio budget |
|---------------|---------------|--------------|
| Mobile (low)  | 64–128 MB     | 16 MB        |
| Mobile (high) | 256 MB        | 32 MB        |
| Desktop       | 512 MB–2 GB   | 128 MB       |
| Console       | Per title spec| Per spec     |

Use compressed formats to fit more within budget: ETC2 (Android), ASTC (iOS/modern), DXT/BC (desktop).

## Asset Packing and Compression Formats

- **Textures**: PNG for source, compress to ETC2/ASTC/BC at build time. Never ship raw PNGs in production.
- **Audio**: WAV for source; OGG Vorbis for background music (high compression), WAV/MP3 short for SFX (low latency).
- **Atlases**: pack at build time with TexturePacker or custom scripts; output power-of-two textures.
- **Binary bundles**: pack multiple assets into one file to reduce HTTP requests (web games) or IO calls (consoles).

## Engine Notes

- **Unity**: Addressables system for async load/unload with reference counting; Sprite Atlas for packing; Audio Mixer for pooled playback.
- **Godot**: ResourceLoader with background threading; AtlasTexture for sub-regions; AudioStreamPlayer pool via instantiation.
- **Unreal**: Asset Manager + Primary Asset Labels for streaming; Derived Data Cache (DDC) for cook-time compression.