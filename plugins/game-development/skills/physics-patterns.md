# Physics Patterns

## Collision Detection Overview

Two phases: **broadphase** (quickly reject non-colliding pairs) then **narrowphase** (exact intersection test).

## AABB Collision (Axis-Aligned Bounding Box)

The cheapest useful test. No rotation.

```js
function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// Penetration depth for response
function aabbPenetration(a, b) {
  const dx = (a.x + a.w / 2) - (b.x + b.w / 2);
  const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
  const overlapX = (a.w / 2 + b.w / 2) - Math.abs(dx);
  const overlapY = (a.h / 2 + b.h / 2) - Math.abs(dy);
  return { overlapX, overlapY, dx, dy };
}
```

## Circle Collision

```js
function circleOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distSq = dx * dx + dy * dy;
  const radSum = a.radius + b.radius;
  return distSq < radSum * radSum; // avoid sqrt
}
```

## Separating Axis Theorem (SAT)

For convex polygons. If any axis separates the shapes, there is no collision.

```js
function satOverlap(shapeA, shapeB) {
  const axes = [...getNormals(shapeA), ...getNormals(shapeB)];
  for (const axis of axes) {
    const [minA, maxA] = project(shapeA, axis);
    const [minB, maxB] = project(shapeB, axis);
    if (maxA < minB || maxB < minA) return false; // gap found
  }
  return true; // no separating axis = collision
}
```

## Broadphase Strategies

**Spatial Hashing**: divide world into a grid, hash each cell. O(1) insert/query per object.

```js
function hashCell(x, y, cellSize) {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}
```

**Quadtree**: subdivide space recursively. Good when objects cluster unevenly.

**BVH (Bounding Volume Hierarchy)**: tree of AABBs. Best for static geometry, ray casting.

## Continuous vs Discrete Detection

**Discrete**: test position at end of frame. Fast objects can tunnel through thin walls.

**Continuous (CCD)**: sweep the object's volume along its trajectory. Use for bullets and fast projectiles.

```js
// Simple swept AABB
function sweptAABB(moving, velocity, static_box, dt) {
  const expandedBox = expandByVelocity(static_box, velocity, dt);
  return rayVsAABB(moving.center, velocity, expandedBox);
}
```

## Tunneling Prevention

- Use CCD for fast-moving objects.
- Cap maximum velocity to less than the smallest collidable object per frame.
- Use substeps: split the physics step into multiple smaller steps.

## Verlet Integration

More stable than Euler for position-based constraints:

```js
function verletUpdate(entity, dt) {
  const ax = entity.forceX / entity.mass;
  const ay = entity.forceY / entity.mass;
  const newX = 2 * entity.x - entity.prevX + ax * dt * dt;
  const newY = 2 * entity.y - entity.prevY + ay * dt * dt;
  entity.prevX = entity.x;
  entity.prevY = entity.y;
  entity.x = newX;
  entity.y = newY;
}
```

## Impulse Resolution

Resolve collisions by applying opposing impulses. Preserve momentum.

```js
function resolveCollision(a, b, normal) {
  const relVel = dot(subtract(b.vel, a.vel), normal);
  if (relVel > 0) return; // already separating

  const restitution = Math.min(a.restitution, b.restitution);
  const j = -(1 + restitution) * relVel / (1 / a.mass + 1 / b.mass);

  a.vel.x -= (j / a.mass) * normal.x;
  a.vel.y -= (j / a.mass) * normal.y;
  b.vel.x += (j / b.mass) * normal.x;
  b.vel.y += (j / b.mass) * normal.y;
}
```

## Friction

Apply friction tangentially after normal impulse:

```js
const tangent = { x: -normal.y, y: normal.x };
const frictionJ = -dot(relativeVel, tangent) / (1 / a.mass + 1 / b.mass);
const mu = Math.sqrt(a.friction * b.friction); // geometric mean
const clampedJ = Math.max(-mu * j, Math.min(mu * j, frictionJ));
// apply clampedJ along tangent
```

## Raycasting

```js
function rayVsAABB(origin, dir, box) {
  const tmin = (box.minX - origin.x) / dir.x;
  const tmax = (box.maxX - origin.x) / dir.x;
  const tymin = (box.minY - origin.y) / dir.y;
  const tymax = (box.maxY - origin.y) / dir.y;
  const tenter = Math.max(Math.min(tmin, tmax), Math.min(tymin, tymax));
  const texit = Math.min(Math.max(tmin, tmax), Math.max(tymin, tymax));
  return tenter <= texit && texit >= 0 ? tenter : null;
}
```

## Engine Notes

- **Unity**: Rigidbody + Collider; use `Physics.Raycast`; enable CCD per-rigidbody for fast objects.
- **Godot**: RigidBody2D / CharacterBody2D; `move_and_collide` vs `move_and_slide`.
- **Unreal**: Chaos Physics; collision channels and traces replace manual math.