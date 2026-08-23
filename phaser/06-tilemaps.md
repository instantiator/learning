# 06 — Tilemaps

A **tilemap** (or just "map") is a grid of small images called **tiles**. Instead
of loading one big picture of a level, you load a small set of tile images plus a
description of which tile goes in each grid cell. Maps are compact, easy to edit,
and — crucially for us — give you a grid you can do pathfinding on.

## The pieces

| Piece | What it is |
|-------|------------|
| **Tilemap** | the whole grid: its width/height in tiles, tile size, orientation |
| **Tileset** | a texture holding one or more tile images, each with a frame number |
| **Tile layer** | a 2D grid of tile frame numbers; a map can have several (ground, walls, decor) |
| **Tile** | one grid cell: its frame, position, and flags (collides? empty?) |

Phaser supports two ways to define a map:

1. **Tiled JSON** — a file exported from the Tiled map editor
   (https://www.mapeditor.org/). This is the format we use, because it's the only
   one that can describe an **isometric** grid (chapter 07).
2. **Raw data** — a plain JavaScript 2D array you build in code. Simple, but only
   ever produces an orthogonal (flat square) grid.

## Loading and creating a map

`preload` loads the map file; `create` builds the tileset and layers:

```js
class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  preload() {
    this.load.tilemapTiledJSON('map', 'assets/map.json'); // the Tiled file
    this.load.image('tiles', 'assets/tiles.png');         // the tile images
  }

  create() {
    // 1. create the tilemap from the loaded Tiled JSON
    const map = this.add.tilemap('map');

    // 2. connect the texture to the tileset by NAME (the name from Tiled)
    const tiles = map.addTilesetImage('tiles', 'tiles');

    // 3. create the layers, in draw order (bottom layers first)
    const groundLayer = map.createLayer('ground', tiles);
    const wallLayer = map.createLayer('walls', tiles);

    // layer holds the grid you'll read for pathfinding
    this.groundLayer = groundLayer;
    this.wallLayer = wallLayer;
    this.map = map;
  }
}
```

Notes:

- `map.addTilesetImage(tilesetName, textureKey)` finds the tileset with that name
  in the JSON and points it at the texture you loaded. The `tilesetName` must
  match the `"name"` field inside `map.json`.
- `map.createLayer('ground', tiles)` makes a `TilemapLayer` game object — it's
  drawable, and it's also the object that answers "which tile is here?".
- Layers appear in the order you create them, so create bottom layers first.
- In Phaser 4 the alternative `map.createLayer('ground', tiles, 0, 0, true)` has
  a final `gpu` flag. Leave it `false` for isometric maps: the GPU-accelerated
  layer type does not support isometric/hexagonal/staggered grids. The plain
  layer we use here does.

## The Tiled JSON format, briefly

A `map.json` looks like this (the numbers `data` are tile frame indexes):

```json
{
  "type": "map",
  "orientation": "orthogonal",
  "width": 10,
  "height": 8,
  "tilewidth": 32,
  "tileheight": 32,
  "layers": [
    {
      "type": "tilelayer",
      "name": "ground",
      "width": 10,
      "height": 8,
      "data": [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
    },
    {
      "type": "tilelayer",
      "name": "walls",
      "width": 10,
      "height": 8,
      "data": [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ]
    }
  ],
  "tilesets": [
    {
      "firstgid": 1,
      "name": "tiles",
      "tilewidth": 32,
      "tileheight": 32,
      "tilecount": 2,
      "columns": 1,
      "image": "tiles.png",
      "imagewidth": 32,
      "imageheight": 64
    }
  ]
}
```

Things worth knowing:

- `data` is one long array, row by row. `0` means "no tile here"; `1`, `2`, ...
  are indexes into the tileset (offset by the tileset's `firstgid`).
- The `data` must be **uncompressed** (plain numbers). Tiled's default "CSV"
  export is exactly this. Phaser cannot read Tiled's compressed encodings.
- The tileset needs an `image` field so Phaser treats it as a renderable tileset
  (no `image` → it becomes an "image collection", which cannot be rendered).
- External tilesets (an `source` field pointing at a `.tsx` file) are not
  supported — bake the tileset into the map file or inline its properties.
- **You don't have to own the tileset image.** The `image` field just tells
  Phaser the tileset is a real tileset. When you `addTilesetImage` with a
  generated texture (chapter 03), Phaser uses that texture instead — which is
  exactly how the final example draws a full isometric map with zero image files.

## Raw data maps (for small prototypes)

If you don't want a Tiled file, `this.make.tilemap(...)` builds a map from a 2D
array:

```js
const level = [
  [ 1, 1, 1 ],
  [ 1, 0, 1 ],
  [ 1, 1, 1 ]
];

const map = this.make.tilemap({
  tileWidth: 32,
  tileHeight: 32,
  width: 3,
  height: 3,
  data: level
});

const tiles = map.addTilesetImage('tiles', 'tiles'); // reuses a loaded texture
const layer = map.createLayer(0, tiles);             // layer 0
```

> **There is no `orientation` option here.** Whatever you pass, a raw data map is
> always orthogonal. Isometric grids only come from Tiled JSON files. (This is a
> common point of confusion — the config object simply doesn't accept it.)

## Reading and writing tiles

The `TilemapLayer` answers grid questions:

```js
// is there a tile at grid (5, 3)?
const tile = layer.getTileAt(5, 3);
// tile is null when the cell is empty; otherwise tile.index is its frame number

// is any tile (even an empty placeholder) at (5, 3)?
layer.hasTileAt(5, 3);

// place a tile at grid (5, 3): frame index 2 (0 = erase)
layer.putTileAt(2, 5, 3);

// write into many cells at once
layer.fill(1, 0, 0, 10, 8); // fill index 1 across 10x8 starting at (0,0)

// read the frame index directly (0 when empty)
const index = layer.getTileAt(5, 3)?.index ?? 0;
```

### Converting between pixels and grid cells

These two are the bridge between clicks and tiles, and the isometric chapter
builds on them:

```js
// world position -> tile coordinates
const pt = layer.worldToTileXY(pointer.worldX, pointer.worldY, true);
// pt.x, pt.y are tile coordinates (snapped down to integers)

// tile coordinates -> world position (top-left of that tile, in pixels)
const p2 = layer.tileToWorldXY(pt.x, pt.y);
```

Phaser picks the right math for the map's orientation automatically, so the same
two calls work for orthogonal and isometric maps. One isometric wrinkle: on iso
maps `worldToTileXY` is aligned with the diamond's *base* edge, so it returns
the tile one row/column up-left of the diamond you click. Chapter 07 shows
`getIsoTileAtWorldXY`, the top-face variant that matches what you see.

### Collision

Tile layers can be marked as colliding, which ties into Arcade physics (chapter
08):

```js
layer.setCollision(2);          // frame index 2 is solid
layer.setCollisionByProperty({ id: 1 }); // any tile with a property
```

You can then check whether a player is touching a wall tile via the physics
`collider`, or read `layer.getTileAt(x, y).collides`.

## Try it

1. Make a small orthogonal map with `this.make.tilemap` and a generated tile
   texture.
2. Click anywhere and print `layer.worldToTileXY(...)` — you should see tile
   coordinates.
3. Use `layer.putTileAt` to draw a path as you click.

**What's next:** [07 — Isometric](07-isometric.md). Same tilemap system, but the
grid is a diamond grid — and clicks become a little more interesting.
