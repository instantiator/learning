# 10 — Pathfinding

In chapter 09 the character walked in a straight line towards the clicked tile —
straight *into* walls. To avoid obstacles the character needs a **path**: a list
of tiles from where it is to where it's going, staying on walkable tiles.

## From map to graph

The tile grid is a graph. Each tile is a node, and it's connected to its four
neighbours (up, down, left, right; you can add diagonals for 8-way movement).
A path is just a sequence of adjacent tiles:

```
      ┌──┬──┬──┬──┬──┐
      │S │  │▧ │  │G │    S = start, G = goal, ▧ = wall
      └──┴──┴──┴──┴──┘
```

The question is: which sequence? Finding the *shortest* sequence is what
**pathfinding** does.

## A* in one paragraph

**A\*** is the classic algorithm, and it's surprisingly easy to trust without
memorising its proof:

- Keep a list of tiles to explore, sorted by an estimate of "how good is this
  route".
- The estimate is `f = g + h`:
  - `g` — the cost of the route found so far (here: number of steps),
  - `h` (heuristic) — an optimistic guess of what's still left, e.g. the
    **Manhattan distance** `|dx| + |dy|` (which never overestimates, since you
    must at least move that many tiles).
- Always explore the tile with the smallest `f` first. When you reach the goal,
  walk the recorded "came from" chain backwards to get the path.

Because the heuristic never overestimates, the first time A* reaches the goal it
is guaranteed to be the shortest path. That's the whole trick.

## A small, self-contained A*

Phaser has no built-in pathfinding, so we include a compact implementation.
It's ~50 lines, needs no libraries, and is plenty fast for grids like ours
(10×8). For enormous maps you'd swap it for a library (see the end of this
chapter).

```js
// grid[y][x] === 0 means walkable, anything else means blocked.
// Returns an array of {x, y} tiles from start (inclusive) to goal (inclusive),
// or null if no path exists.
function findPath(grid, sx, sy, gx, gy) {
  const width = grid[0].length;
  const height = grid.length;

  const blocked = (x, y) =>
    x < 0 || y < 0 || x >= width || y >= height || grid[y][x] !== 0;

  if (blocked(sx, sy) || blocked(gx, gy)) return null;

  const key = (x, y) => y * width + x;
  const cameFrom = new Map();
  const gCost = new Map();
  const fCost = new Map();

  const heuristic = (x, y) => Math.abs(x - gx) + Math.abs(y - gy); // Manhattan

  const start = { x: sx, y: sy };
  gCost.set(key(sx, sy), 0);
  fCost.set(key(sx, sy), heuristic(sx, sy));

  const open = [];
  const push = (node) => {
    open.push(node);
    // keep the lowest-f node first (fine for small grids; a heap is faster for big ones)
    open.sort((a, b) => fCost.get(key(a.x, a.y)) - fCost.get(key(b.x, b.y)));
  };
  push(start);

  while (open.length > 0) {
    const current = open.shift();
    const ck = key(current.x, current.y);

    if (current.x === gx && current.y === gy) {
      const path = [];
      let node = current;
      while (node) {
        path.push({ x: node.x, y: node.y });
        node = cameFrom.get(key(node.x, node.y));
      }
      return path.reverse();
    }

    const neighbours = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    ];

    for (const n of neighbours) {
      if (blocked(n.x, n.y)) continue;
      const nk = key(n.x, n.y);
      const tentative = gCost.get(ck) + 1;

      if (tentative < (gCost.get(nk) ?? Infinity)) {
        cameFrom.set(nk, current);
        gCost.set(nk, tentative);
        fCost.set(nk, tentative + heuristic(n.x, n.y));

        if (!open.some((o) => o.x === n.x && o.y === n.y)) {
          push(n);
        }
      }
    }
  }

  return null; // goal unreachable
}
```

## Building the walkable grid

"Walkable" depends on two things: **static** obstacles (walls from the map) and
**dynamic** ones (where characters currently stand — chapter 11). Start with the
walls:

```js
function buildWalkGrid(map, wallLayer) {
  const grid = [];

  for (let y = 0; y < map.height; y++) {
    const row = [];
    for (let x = 0; x < map.width; x++) {
      const tile = wallLayer.getTileAt(x, y);   // null = empty cell
      row.push(tile ? 1 : 0);                   // 1 = blocked
    }
    grid.push(row);
  }

  return grid;
}
```

## Hooking the path into movement

Chapter 09's grid-step movement already walks a `route` of tiles one by one. A
path *is* that route:

```js
moveTo(tx, ty) {
  const path = findPath(this.walkGrid, this.hero.tileX, this.hero.tileY, tx, ty);

  if (!path) {
    // no route — maybe blocked or clicked a wall. Decide what to do (chapter 11)
    return;
  }

  this.route = path.slice(1); // skip tile 0 — the hero is already standing on it
  this.stepIndex = 0;
}
```

The `update` from chapter 09 needs no changes. The character now steers around
walls automatically.

## Re-planning when the world changes

A path is only valid while the world matches the grid it was computed on. If
something changes mid-walk (a door closes, a character wanders onto the path,
another character is standing on the goal), the sensible response is: **stop,
recompute from the current tile, continue** — or give up and tell the player.

```js
replanIfBlocked() {
  const next = this.route[this.stepIndex];
  if (!next) return;

  // if the tile we're heading to is now blocked, re-plan from where we are
  if (this.walkGrid[next.y][next.x] !== 0) {
    this.moveTo(this.targetTile.x, this.targetTile.y);
  }
}
```

Call `replanIfBlocked()` every frame (or on a timer) while moving. This is the
seed of the cooperation logic in chapter 11.

## Using a library instead

If you'd rather not maintain the algorithm, **EasyStar.js**
(https://easystarjs.com) is a tiny (~7 kB), framework-independent A* that is
popular in Phaser projects:

```js
const easystar = new EasyStar.js();
easystar.setGrid(walkGrid);          // 0 = walkable
easystar.setAcceptableTiles([0]);

easystar.findPath(startX, startY, goalX, goalY, (path) => {
  // path is null if unreachable, otherwise an array of {x, y} tiles
  this.route = path;
});
easystar.calculate();                // run one step; call each frame
```

Its callback is async, which matters for huge maps (it won't freeze the frame).
For our small example the inline `findPath` is simpler — no async, no extra
dependency, and it's instructive to see the whole algorithm.

## Try it

1. Build the walk grid from a walls layer and route a character around a wall
   using `findPath`.
2. Click *inside* a wall — confirm `findPath` returns `null` and nothing happens.
3. Remove a wall tile mid-walk (`layer.putTileAt(0, ...)`) and watch a
   `replanIfBlocked` route update.

**What's next:** [11 — Obstacles & cooperation](11-obstacles-and-cooperation.md).
Walls are static. Other characters aren't — the real challenge is when the
obstacle is alive and moves.
