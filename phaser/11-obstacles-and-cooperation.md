# 11 — Obstacles & cooperation

Here's the moment the whole tutorial has been building towards. The character has
a path, but the world isn't static: **another character is standing on the tile
it wants to walk to** (or on a tile its path crosses). What should happen?

There's no single right answer — it's game design as much as programming. But
the useful strategies form a ladder, from "do nothing clever" to "objects help
each other", and we can build them in order.

## First, make walkability include characters

Before any strategy can work, the grid that pathfinding sees must include
**where characters currently are**, not just walls. We maintain an **occupancy
set**: which tiles have a character on them.

```js
this.occupied = new Set();                 // keys: y * mapWidth + x

occupy(tile) {
  if (tile) this.occupied.add(tile.y * this.mapWidth + tile.x);
}
release(tile) {
  if (tile) this.occupied.delete(tile.y * this.mapWidth + tile.x);
}
```

A character registers when it arrives on a tile and unregisters when it leaves.
Chapter 09 made characters snap onto tile centres, so there's a clean moment for
this — when a step completes:

```js
// on arrival at step:
this.release(this.heroTile);
this.heroTile = { x: step.x, y: step.y };
this.occupy(this.heroTile);
```

And `buildWalkGrid` from chapter 10 now adds characters on top of walls:

```js
function gridWithOccupancy(map, wallLayer, occupied) {
  const grid = [];
  for (let y = 0; y < map.height; y++) {
    const row = [];
    for (let x = 0; x < map.width; x++) {
      const hasWall = wallLayer.getTileAt(x, y) !== null;
      const hasChar = occupied.has(y * map.width + x);
      row.push(hasWall || hasChar ? 1 : 0);
    }
    grid.push(row);
  }
  return grid;
}
```

Now `findPath` will already route *around* characters, exactly as it routes
around walls. That handles "someone is standing somewhere on my path" almost for
free. Two cases remain:

1. the **goal tile itself** is occupied (nothing to route around — it's the
   destination), and
2. the world changes *while* the character is walking (a character wanders into
   the path mid-walk).

## Strategy 1 — Wait and re-plan

The simplest behaviour: when the way ahead is blocked, wait; if it clears, carry
on; if it doesn't, look again.

```js
replanIfBlocked() {
  const next = this.route?.[this.stepIndex];
  if (!next) return;

  // the next tile on the path is occupied — stop and recompute
  if (this.walkGrid[next.y][next.x] !== 0) {
    this.route = null;                                  // stop walking
    this.retryTimer = this.time.addEvent({              // try again later
      delay: 250,
      repeat: 3,
      callback: () => this.moveTo(this.targetTile.x, this.targetTile.y)
    });
  }
}
```

If the blocker moves away within ~1 second, the character continues and nobody
notices. If not, the character gives up (or you escalate to strategy 3).

> Gotcha: if two characters *both* keep re-planning towards each other's
> occupied tiles forever, nothing moves. This is a **livelock**. Waiting alone
> can't solve it — one of them must do something different.

## Strategy 2 — Physically separate the characters

Pathfinding and occupancy stop characters from *planning* to share a tile, but
floating-point rounding or a mid-walk collision can still overlap them. Belt and
braces: give them Arcade bodies and a collider (chapter 08) so they push each
other apart:

```js
this.heroes = this.physics.add.group(this.allCharacters);

// every pair of characters collides
for (let i = 0; i < this.allCharacters.length; i++) {
  for (let j = i + 1; j < this.allCharacters.length; j++) {
    this.physics.add.collider(this.allCharacters[i], this.allCharacters[j]);
  }
}
```

The physics collider is the "always-on" guard; the occupancy grid is the
"intelligent" planning layer. They complement each other.

## Strategy 3 — Ask the blocker to move

The player clicks a tile, the character plots a path, and *the goal tile is
occupied by an idle character*. Waiting won't help — that character has no
reason to move. The answer is cooperation: **ask the idle character to step
aside.**

```js
findBlockerAt(tile) {
  const key = tile.y * this.mapWidth + tile.x;
  return this.allCharacters.find((c) => c.occupiedKey === key);
}
```

Give every character a **role**: `busy` (has a target it's walking to) or
`idle` (standing around). An idle character is a good citizen: if someone asks,
it steps aside to a neighbouring free tile.

```js
stepAside() {
  if (this.isBusy) return false;                 // can't step aside, I'm working
  const spot = this.findFreeNeighbourTile();     // an adjacent walkable, unoccupied tile
  if (!spot) return false;
  this.moveTo(spot.x, spot.y, /* temporary */ true);
  return true;
}
```

And the walker, when it finds its goal occupied:

```js
const blocker = this.findBlockerAt(this.targetTile);
if (blocker && blocker.stepAside()) {
  // great — wait a moment, then re-plan; the tile should free up
  this.route = null;
  this.time.delayedCall(300, () => this.moveTo(this.targetTile.x, this.targetTile.y));
}
```

## Strategy 4 — Priority, and breaking deadlocks

Asking works until the blocker is also busy, or two busy characters block each
other. Now you need an ordering so conflicts resolve deterministically instead
of livelocking.

Give each character a **priority** (say, the order they were created, or a
"who's more important" number):

```js
yieldTo(other) {
  return other.priority < this.priority;   // lower number = more important
}
```

Rules of the road:

- When two characters would enter the same tile, the higher-priority one gets it;
  the other re-plans.
- When two characters are stuck facing each other (A wants B's tile, B wants A's
  tile — a **mutual block**), the lower-priority character clears out:

```js
resolveMutualBlock(a, b) {
  if (a.yieldTo(b)) {
    // b is more important — a moves aside
    a.stepAside();
  } else {
    b.stepAside();
  }
}
```

- A `stepAside` character also deserves protection: it won't step aside again
  for a character that already made it move (a **cooldown** or a "who asked me"
  check) — otherwise two characters can ping-pong forever.

This is a design decision as much as an algorithm. The ladder you choose depends
on your game: an RTS wants "walk through or ask nicely", a puzzle wants "you
cannot pass until the way is clear", and a traffic game wants rigid priority
rules.

## What the example uses

The final example (chapter 12) combines the ladder like this:

1. The walk grid = walls **+** occupancy, so paths plan around standing
   characters.
2. Characters physically collide (arcade collider) so they never visually
   overlap.
3. On every frame, `replanIfBlocked` — if a path tile is taken, recompute.
4. If the **goal** is occupied by an idle character, it is asked to step aside
   (strategy 3).
5. A tiny priority number breaks ties and mutual blocks (strategy 4).

So the honest answer to "another object is in the way" is: *it depends — plan
around it if you can, wait if it's temporary, ask it to move if it's idle, and
use priority to break ties when two of you want the same space.*

## Try it

1. Add occupancy to your walk grid and confirm paths go around a parked
   character.
2. Click a tile that an idle character is standing on — watch it step aside.
3. Create two characters with different priorities, send them to each other's
   positions, and confirm the deadlock breaks.

**What's next:** [12 — Putting it together](12-putting-it-together.md). All the
pieces in one complete, runnable example.
