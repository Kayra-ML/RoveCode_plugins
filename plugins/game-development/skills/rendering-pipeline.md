# Rendering Pipeline

## Draw Calls and Why They Matter

A draw call is a CPU-to-GPU command to render geometry. Each call has overhead (state change, driver work). Minimizing draw calls is the single most impactful rendering optimization for 2D games.

Target: fewer than 100 draw calls per frame for mobile; up to 2000 for desktop.

## Sprite Batching

Group sprites that share the same texture and material into a single draw call.

```js
// Batch all sprites with same texture before flushing
class SpriteBatch {
  vertices = [];
  currentTexture = null;

  add(sprite) {
    if (sprite.texture !== this.currentTexture) {
      this.flush(); // new draw call
      this.currentTexture = sprite.texture;
    }
    this.vertices.push(...sprite.getQuad());
  }

  flush() {
    if (this.vertices.length === 0) return;
    gpu.drawIndexed(this.currentTexture, this.vertices);
    this.vertices = [];
  }
}
```

Sort sprites by texture before batching to maximize batch size.

## Texture Atlases / Sprite Sheets

Packing multiple sprites into one texture eliminates texture switches between draw calls.

```
atlas.png
┌──────────┬──────────┬──────┐
│ player_0 │ player_1 │ coin │
├──────────┴──────────┴──────┤
│ tileset_grass  │ tileset_d │
└───────────────────────────-┘
```

UV coordinates select the sub-region. Tools: TexturePacker, Aseprite export, Godot atlas importer.

## Z-Ordering Strategies

**Painter's algorithm**: sort back-to-front by Z, draw in order. Simple, handles transparency.

**Z-buffer (depth buffer)**: GPU discards fragments behind already-drawn geometry. Not available in Canvas2D.

**Layer buckets**: assign objects to named layers (background, gameplay, UI). Sort within layers. Avoids per-frame full sort.

```js
const LAYERS = { BACKGROUND: 0, SHADOW: 1, ENTITY: 2, FX: 3, UI: 10 };

function sortForRender(entities) {
  return entities.sort((a, b) => {
    if (a.layer !== b.layer) return a.layer - b.layer;
    return a.y - b.y; // isometric Y-sort within layer
  });
}
```

## Dirty Flag Pattern

Only re-render objects that changed. Critical for UI and static backgrounds.

```js
class RenderComponent {
  _dirty = true;
  _cachedSprite = null;

  markDirty() { this._dirty = true; }

  getSprite() {
    if (this._dirty) {
      this._cachedSprite = this.rebuildSprite();
      this._dirty = false;
    }
    return this._cachedSprite;
  }
}
```

## Camera / Viewport Transform

World coordinates → screen coordinates:

```js
function worldToScreen(worldX, worldY, camera, viewport) {
  return {
    x: (worldX - camera.x) * camera.zoom + viewport.width / 2,
    y: (worldY - camera.y) * camera.zoom + viewport.height / 2,
  };
}

function screenToWorld(screenX, screenY, camera, viewport) {
  return {
    x: (screenX - viewport.width / 2) / camera.zoom + camera.x,
    y: (screenY - viewport.height / 2) / camera.zoom + camera.y,
  };
}
```

## Frustum Culling

Skip rendering objects outside the camera's view:

```js
function isVisible(entity, camera, viewport) {
  const halfW = (viewport.width / 2) / camera.zoom;
  const halfH = (viewport.height / 2) / camera.zoom;
  return (
    entity.x + entity.w > camera.x - halfW &&
    entity.x < camera.x + halfW &&
    entity.y + entity.h > camera.y - halfH &&
    entity.y < camera.y + halfH
  );
}
```

## Parallax Scrolling

Different layers scroll at different speeds to simulate depth:

```js
function parallaxOffset(cameraX, depth) {
  // depth 0 = fixed (UI), depth 1 = same as world, depth < 1 = background
  return cameraX * depth;
}
```

## Shader Basics

**Vertex shader**: runs per vertex, outputs clip-space position.
**Fragment shader**: runs per pixel, outputs RGBA color.

```glsl
// Simple sprite fragment shader (GLSL)
uniform sampler2D uTexture;
uniform vec4 uTint;
in vec2 vUV;
out vec4 fragColor;

void main() {
  vec4 texColor = texture(uTexture, vUV);
  if (texColor.a < 0.01) discard; // alpha test
  fragColor = texColor * uTint;
}
```

Common effects: outline (sample neighbors), flash (tint toward white), dissolve (threshold noise texture).

## WebGL vs Canvas2D

| | Canvas2D | WebGL |
|---|---|---|
| Ease | High | Low |
| Draw calls | ~500/frame max | Thousands/frame |
| Shaders | No | Yes |
| Batch control | None | Full |

Use Canvas2D for simple 2D games. Use WebGL (or a lib like PixiJS) for performance-critical 2D.

## Framebuffer Objects (Render Targets)

Render to a texture for post-processing, shadows, or portal effects:

```js
// WebGL
const fbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderTex, 0);
// Render scene → apply post-process shader → blit to screen
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
```

## Engine Notes

- **Unity URP**: SRP Batcher, GPU instancing, and sprite atlases reduce draw calls automatically.
- **Godot**: CanvasItem batching enabled in project settings; use `VisualServer` for low-level control.
- **Unreal**: Nanite for static meshes; Lumen for dynamic GI; profile with RenderDoc.