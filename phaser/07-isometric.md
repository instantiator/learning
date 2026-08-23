# 07 — Isometric

**Isometric** ("iso") rendering shows a grid as if you were looking down at it
from a corner: rows of square tiles become rows of **diamonds**. It's the classic
"2.5D" look. With iso tiles twice as wide as they are tall (e.g. 64×32), each
grid cell looks like a diamond:

```
      (0,0)
        /\
       /  \
      /    \
   (0,1)    (1,0)     <- tile (1,0) sits lower-right, tile (0,1) lower-left
      \    /
       \  /
        \/
```

Two things make iso interesting compared with flat orthogonal maps:

1. **The world coordinates of a tile are not `x * tileWidth`.** Each step down
   and to the right shifts the tile diagonally.
2. **Draw order matters.** A tile that is "farther away" (higher up on screen)
   must be drawn before the tiles nearer to the camera, or they'll overlap
   wrongly.

## Getting an isometric map

As noted in chapter 06, Phaser only builds iso maps from **Tiled JSON** files.
In your Tiled map set *Orientation* to *Isometric*, then export. The JSON will
contain `"orientation": "isometric"`, and that single field tells Phaser which
grid math to use everywhere — tile rendering, `worldToTileXY`, `tileToWorldXY`,
collision, all of it.

```js
const map = this.add.tilemap('map');       // loads from preload
const tiles = map.addTilesetImage('tiles', 'tiles');
const layer = map.createLayer('ground', tiles);
```

That's it. Phaser handles the diamond layout internally.

## The coordinate math

Phaser's iso tile ↔ world conversions use the tile's half-sizes,
`hw = tileWidth / 2` and `hh = tileHeight / 2`.

**Tile → world** (`layer.tileToWorldXY(tx, ty, ...)`) returns the *left* corner
of the diamond:

```
worldX = (tx - ty) * hw
worldY = (tx + ty) * hh
```

**The centre of the tile** (where you'd stand a character, and what clicks feel
like) is a little further down-right:

```
centerX = (tx - ty) * hw + hw
centerY = (tx + ty) * hh + hh
```

**World → tile** (inverse, for the diamond you *see*):

```
tx = Math.floor(wx / tw + wy / th - 0.5)
ty = Math.floor(-wx / tw + wy / th + 0.5)
```

Phaser wraps exactly this in **`layer.getIsoTileAtWorldXY(wx, wy)`**, which
returns the `Tile` under a world point using the diamond's *top face* (or `null`
if the point is outside the map). That's the function to feed clicks into.

> **Heads up — don't use `layer.worldToTileXY` for iso clicks.** That function
> is aligned with the diamond's *base* instead of its top, so it returns the
> tile one row/column up-left of the diamond you're looking at. This is Phaser's
> design, not a mistake in your code. For clicks, use `getIsoTileAtWorldXY`
> (top face), or add `1` to both results if you ever need `worldToTileXY`.

A nice property of the diamond grid: **every cell with the same `tx + ty` sits
on the same diagonal line** on screen, going down-right. That single number is
the basis of depth sorting.

### A worked example

With 64×32 tiles, tile `(2, 3)`:

```
left corner = ((2-3)*32, (2+3)*16) = (-32, 80)
centre      = (-32 + 32, 80 + 16) = (0, 96)
```

If you click world `(0, 96)`:

```
tx = floor(0/64 + 96/32 - 0.5)  = floor(3 - 0.5)  = 2
ty = floor(-0/64 + 96/32 + 0.5) = floor(3 + 0.5)  = 3
```

So clicking the middle of the diamond you *see* as tile `(2,3)` gives you tile
`(2,3)`. This is the "click a diamond → which tile?" pipeline we'll use for
movement.

> The `+hw/+hh` centre offset is the thing that avoids the classic bug of objects
> standing at the diamond's corner instead of its middle: `tileToWorldXY` gives
> the corner, and the visible centre is half a tile down-right from it.

## Depth sorting

Every game object has a `depth`. For iso, objects with a bigger `tx + ty` are
nearer the viewer and must have a bigger depth:

```js
// each frame (or whenever an object moves):
sprite.setDepth(tileX + tileY);
```

That keeps characters and tiles in the right order: a character at tile `(5, 5)`
draws over a character at `(2, 3)`.

A smoother alternative uses the object's bottom edge (`body.bottom` for physics
objects, `sprite.y` for feet-anchored ones). With feet at the diamond centre, the
centre's `worldY` grows by `hh` per unit of `tx+ty`, so:

```js
sprite.setDepth(sprite.y / hh); // hh = tileHeight / 2
```

Both are fine. We'll use `tileX + tileY` in the example because it's robust and
simple to reason about.

## Camera bounds for an iso map

The whole map forms a large diamond. If the map is `W` × `H` tiles:

- leftmost point: `-H * hw`
- rightmost point: `W * hw`
- bottom point: `(W + H) * hh`
- the map starts at `y = 0`

So the camera bounds rectangle is:

```js
const cam = this.cameras.main;
cam.setBounds(
  -map.height * hw,                  // x
  0,                                 // y
  (map.width + map.height) * hw,     // width
  (map.width + map.height) * hh      // height
);
```

> **Don't use `map.widthInPixels` / `map.heightInPixels` here.** For iso maps
> those are just `width * tileWidth` and `height * tileHeight` (the flat bounding
> box), which don't match the diamond. Compute bounds as above.

You can then `cam.centerOn(...)` the middle of the diamond:

```js
cam.centerOn(0, (map.width + map.height) * hh * 0.5);
```

## Faces: top vs base

Iso tiles are usually drawn as boxes: a **top face** (the diamond you see) and
**base faces** (the sides going down). Phaser's tile tests understand this:

```js
// which tile is at a world position, using the TOP face (default)
const t = layer.getIsoTileAtWorldXY(wx, wy);

// using the BASE face instead
const t2 = layer.getIsoTileAtWorldXY(wx, wy, false);
```

For a flat ground map with characters walking on top, the top face is right.
That's why `getIsoTileAtWorldXY` (which defaults to the top face) is the
function to feed clicks to, while plain `worldToTileXY` uses the base alignment
and lands one tile up-left of the diamond you click — see the callout above.

## Putting objects on iso tiles

A common bug: you place a character at `tileToWorldXY(tx, ty)` and it hovers at
the diamond's left corner. Use the centre instead:

```js
const p = layer.tileToWorldXY(tx, ty);   // left corner of the diamond
sprite.setPosition(p.x + hw, p.y + hh);
```

For a sprite with origin `(0.5, 0.5)` (centre), this parks it in the middle of
the diamond. For a "feet" origin `(0.5, 1)`, it stands its feet at the middle
height of the diamond, which reads as standing on the tile.

## Try it

1. Make (or generate) a diamond texture and build a small iso map with it.
2. Click anywhere and print `getIsoTileAtWorldXY`; confirm it returns the tile
   you pointed at. (And try `worldToTileXY` to see the one-tile base offset in
   action.)
3. Place a character sprite on several tiles using the centre formula, and depth
   sort them with `tileX + tileY`.
4. Scroll with a big map and confirm the camera bounds match the diamond.

**What's next:** [08 — Arcade physics](08-arcade-physics.md). A character that
just sits on a tile is fine — but ours needs to walk, collide with walls, and
bump into other characters.
