# 09 — Movement & targets

The task for this chapter: **click a tile, and an object walks there.** This is
the small core that the whole example grows out of.

## Step 1: click → world → tile

The click gives us world coordinates; the tilemap layer gives us tiles:

```js
this.input.on('pointerdown', (pointer) => {
  // 1. world position under the click (camera-aware)
  const wx = pointer.worldX;
  const wy = pointer.worldY;

  // 2. which tile is there? (chapter 07: top face, so it matches the diamond
  //    you see; returns null outside the map)
  const tile = this.groundLayer.getIsoTileAtWorldXY(wx, wy);
  if (!tile) return;

  const tx = tile.x;
  const ty = tile.y;

  this.moveTo(tx, ty);
});
```

> Why not `worldToTileXY`? On iso maps that function uses the diamond's *base*
> edge, so it returns the tile one row/column up-left of the diamond you
> actually clicked. `getIsoTileAtWorldXY` is the top-face version and matches
> what the player sees (chapter 07).

## Step 2: tile → world centre

Remember from chapter 07: `tileToWorldXY` gives the diamond's *left corner*; the
centre is half a tile down-right:

```js
const hw = this.map.tileWidth / 2;
const hh = this.map.tileHeight / 2;

  const p = this.groundLayer.tileToWorldXY(tx, ty);
const targetX = p.x + hw;
const targetY = p.y + hh;
```

That `(targetX, targetY)` is where the character should end up standing.

## Step 3: walk there — two approaches

### Approach A: free-form, physics-style

Use `physics.moveTo` and check arrival yourself (chapter 08 warned that it never
stops):

```js
update() {
  if (!this.target) return;

  this.physics.moveTo(this.hero, this.target.x, this.target.y, 120);

  const dist = Phaser.Math.Distance.Between(
    this.hero.x, this.hero.y, this.target.x, this.target.y
  );

  if (dist < 4) {
    this.hero.body.stop();
    this.target = null;
  }
}
```

Simple and looks smooth — but the character walks in a straight line and can get
stuck on corners, and it's hard to keep the character aligned to the grid.

### Approach B: grid-step movement (what we use)

Instead of aiming at a distant point, the character walks toward the **next tile
centre** on its route, and snaps onto the grid when it arrives:

```js
moveTo(tx, ty) {
  this.targetTile = { x: tx, y: ty };
  // pathfinding will fill this.route with a list of tiles (chapter 10)
  this.route = [ this.targetTile ];
  this.stepIndex = 0;
}

update(delta) {
  const hero = this.hero;

  if (!this.route || this.route.length === 0) return;

  // which tile centre are we walking toward?
  const step = this.route[this.stepIndex];
  const p = this.groundLayer.tileToWorldXY(step.x, step.y);
  const stepX = p.x + this.hw;
  const stepY = p.y + this.hh;

  // walk towards it at a fixed speed (pixels per second, delta-scaled)
  const dx = stepX - hero.x;
  const dy = stepY - hero.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const speed = 140 * (delta / 1000);

  if (dist < speed) {
    // arrived: snap onto the tile centre and take the next step
    hero.x = stepX;
    hero.y = stepY;
    hero.setDepth(step.x + step.y);   // iso depth sort (chapter 07)
    this.stepIndex++;

    if (this.stepIndex >= this.route.length) {
      this.route = null;              // arrived at the final tile
      hero.x = stepX;
      hero.y = stepY;
    }
  } else {
    hero.x += dx / dist * speed;
    hero.y += dy / dist * speed;
  }
}
```

Grid-step movement is what makes pathfinding (chapter 10) and the "someone is in
the way" logic (chapter 11) manageable: the character is *always* either on a
tile or moving toward the next one, and the only places it ever stops are tile
centres.

> One frame-rate note: `update(time, delta)` receives `delta` in milliseconds.
> Multiplying speeds by `delta / 1000` makes movement identical no matter how
> fast or slow the browser renders frames.

## Step 4: remember where you are

Because our character only rests on tile centres, we can keep an up-to-date
"which tile am I on?" value cheaply — it changes only when a step completes:

```js
// on arrival at a step
hero.tileX = step.x;
hero.tileY = step.y;
```

Pathfinding and occupancy (chapter 10-11) read `hero.tileX/hero.tileY` constantly,
so keeping this up to date is the hidden foundation of everything that follows.

## A reusable helper

Both the movement and the click handler use "tile → world centre", so extract it:

```js
tileCenter(tx, ty) {
const p = this.groundLayer.tileToWorldXY(tx, ty);
  return { x: p.x + this.hw, y: p.y + this.hh };
}
```

## Try it

1. Build a scene where clicking anywhere walks a character to that tile using
   grid-step movement.
2. Give the character two sequential targets (a small route) and watch it step
   through them.
3. Watch what happens when you click a *wall* tile — the character walks into the
   wall. That's the problem chapters 10 and 11 fix.

**What's next:** [10 — Pathfinding](10-pathfinding.md). Time to stop the
character from walking into walls, and let it find a route around them.
