# 12 — Putting it together

Everything from the last eleven chapters now comes together in one runnable
example. It lives in [`example/`](example/):

```
example/
  index.html         the HTML page (chapter 01)
  game.js            the whole game
  assets/map.json    the isometric Tiled map (chapters 06-07)
```

There are **no image files** — every texture is generated in code (chapter 03),
and the tileset image referenced inside `map.json` is only a placeholder so
Phaser treats the tileset as renderable.

## Running it

Serve the folder over HTTP (chapter 01 explained why — the map file is fetched
with an HTTP request):

```sh
cd example
python3 -m http.server 8000
```

Then open http://localhost:8000.

## What you can do

- **Click a tile** — the nearest idle character walks there, finding its own way
  around the walls.
- **Click near a character** — it gets selected (it turns gold). Then click a
  tile and that one goes instead.
- Click a tile that an idle character is standing on — that character is asked
  to **step aside** first.
- Send two characters through each other — they re-plan around each other, and
  if they get stuck, the lower-priority one moves aside.

## How the example is built

### 1. The map (`assets/map.json`)

An isometric map, 10×8 tiles of 64×32, with two layers and one tileset:

- `ground` — every cell is tile index 1 (grass).
- `walls` — mostly empty, a few cells are index 2 (stone): a small block at the
  top-left and a vertical wall on the right. These give the pathfinder something
  to route around.
- the tileset entry declares `"image": "tiles.png"`, which **doesn't exist**.
  It's just there to make the tileset renderable; the real texture is generated
  in `create`.

### 2. Textures from code (`makeTileTextures`, `makeHeroTexture`)

A `Graphics` object draws two 64×32 diamonds (grass + stone) and bakes them into
one `iso-tiles` texture with `generateTexture` (chapter 03). `map.addTilesetImage('tiles', 'iso-tiles')`
then uses that texture: Phaser slices it into frames using the tileset's
tile size (64×32), so tile index 1 → top half, index 2 → bottom half. The three
character textures are small coloured diamonds.

### 3. The scene (`create`)

In order, following the chapters:

- build the tilemap and layers (06),
- shape the **camera** and **physics world** bounds to the diamond (05, 07, 08),
- spawn three characters as Arcade sprites with small bodies (08), register each
  one's tile in the occupancy set (11), and add a collider between every pair
  (11),
- hook up input: click → `getIsoTileAtWorldXY` → route a character (04, 07, 09).

The character objects bundle the sprite with the game state the logic needs:
`tile` (which tile it's on), `route`/`stepIndex` (the path it's walking),
`isBusy`, `movingAside`, `priority`.

### 4. Walking (`update`)

Every frame, each character with a route walks toward the centre of its next
path tile at a fixed speed (`170 * delta/1000` pixels/sec, so speed is
frame-rate independent — chapter 09). On arrival it snaps to the centre, updates
the occupancy set, re-sorts its depth (`tileX + tileY`, chapter 07), and takes
the next step. Then `replanBlocked()` runs (chapter 11).

### 5. Finding the way (`findPath`, `pathGrid`)

`findPath` is the compact A* from chapter 10. The grid it searches is built fresh
by `pathGrid(mover)`: walls from the tile layer **plus** every tile currently
occupied by a character (chapter 11) — except the mover's own tile, so the
character can start its search where it stands.

Because occupancy is part of the grid, characters naturally plan *around* parked
characters, not through them.

### 6. Being in the way (`moveCharTo`, `stepAside`, `replanBlocked`)

The strategies from chapter 11, wired up:

- **Goal occupied?** `moveCharTo` finds the blocker. If it's idle, the blocker's
  `stepAside()` picks a free neighbouring tile and routes there; the walker
  retries shortly after.
- **Path crossed mid-walk?** `replanBlocked` checks the next path tile each
  frame. If someone else has taken it, it computes a fresh path from where the
  character is.
- **No alternative route?** If the character outranks the blocker (lower
  `priority` number = more important), it asks the blocker to move aside anyway;
  otherwise it stops with an honest "stuck behind X" message.

The physics colliders are the safety net: even if planning and reality disagree
for one frame, characters are pushed apart rather than stacking on the same tile.

## Things to try next

Now that the pieces are in place, here are natural next steps:

1. **Edit the map.** Add more walls to `assets/map.json` (any tile that is `2` in
   the walls layer becomes a barrier) and reload.
2. **8-way movement.** Add diagonals to the neighbour lists in `findPath` and
   `freeNeighbour` (and cost diagonals a bit more) for smoother routes.
3. **Walk around corners better.** Make pathfinding treat "cutting a corner"
   between two diagonal walls as blocked, so characters don't hug walls.
4. **Colourful walls.** Give the tileset more frames (a bigger generated texture)
   and vary `tileHeight`/wall heights.
5. **Path smoothing.** Remove zig-zags from routes before walking them, so
   characters don't step back and forth on diagonal runs.
6. **Smarter blocking.** Replace "nearest idle character" with a queued
   task-queue per character, or a follow-me mode.

The example's value is that every line of it was justified in a chapter — when
you want to change behaviour, you know exactly which chapter explains the piece
you're touching.
