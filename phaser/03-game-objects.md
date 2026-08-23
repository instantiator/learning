# 03 — Game objects

A **game object** is anything that lives in a scene and can be drawn or updated:
images, sprites, text, graphics, containers, tilemap layers. You create them with
`this.add...` inside the scene, and Phaser puts them on the scene's **display
list** — the ordered list of everything the scene draws.

## The basics

```js
create() {
  // an image: a single texture, drawn as-is
  const img = this.add.image(200, 150, 'my-texture');

  // a sprite: an image that can also flip, play frames, have a physics body, ...
  const spr = this.add.sprite(400, 150, 'my-texture');

  // text: no texture needed, Phaser renders the string
  const txt = this.add.text(600, 150, 'Hello', { fontSize: '24px' });

  // graphics: a canvas-like drawing tool, useful for shapes and debug lines
  const gfx = this.add.graphics();
  gfx.fillStyle(0xffcc00, 1);
  gfx.fillCircle(200, 400, 30);

  // container: groups other game objects so they can be moved together
  const grp = this.add.container(0, 0, [ img, spr ]);
}
```

> **Phaser 4 change.** Older Phaser versions had ready-made shape objects such as
> `this.add.rectangle(...)` and `this.add.circle(...).` These were removed in
> Phaser 4. If you need a shape, use `this.add.graphics()` (or generate a texture
> from it — see below).

## Position, origin, and size

Every drawable game object has these properties (there are also `set` methods for
each):

| Property | Meaning |
|----------|---------|
| `x`, `y` | where the object is in **world coordinates** (see cameras, chapter 05) |
| `originX`, `originY` | the anchor point, in fractions of the object's size. `(0, 0)` = top-left (default), `(0.5, 0.5)` = centre |
| `scaleX`, `scaleY` | 1 = natural size |
| `rotation` | in radians |
| `alpha` | opacity, 0 to 1 |
| `visible` | `false` hides the object |
| `depth` | draw order — bigger depth draws in front |

Examples:

```js
img.setOrigin(0.5);      // centre the image on its x,y
spr.setDepth(10);        // draw above objects with lower depth
txt.setPosition(100, 100);
img.setScale(2);
img.setRotation(Math.PI / 4);
```

## Depth (z-order)

The display list draws objects in order: later ones on top. The `depth` property
overrides that ordering. Two rules are enough for now:

- all objects default to `depth` 0, and are drawn in the order they were added;
- to force an object (or whole layer) to the front or back, use `setDepth(...)`.

This becomes genuinely important in the isometric chapter, where we use `depth`
to make nearer objects draw over farther ones.

## Textures and frames

A **texture** is a named image Phaser has in memory. It can be a whole image or
an **atlas** (several frames inside one image). An image/sprite game object shows
one texture, optionally one frame of it:

```js
this.load.image('ball', 'assets/ball.png'); // a plain texture
this.load.spritesheet('rpg', 'assets/rpg.png', { frameWidth: 32, frameHeight: 32 });

this.add.image(100, 100, 'ball');
this.add.image(200, 100, 'rpg', 4); // the 5th frame of the spritesheet
```

`preload` is the right place for `this.load...` calls — Phaser only fetches
assets during the preload phase, and `create` runs after they have arrived.

## Generating textures with code (no image files needed)

You don't always need an image file. You can draw onto a `Graphics` object and
turn it into a texture that other game objects can use. This is how the example
project at the end of this guide creates its tiles and characters with zero asset
files:

```js
function makeDiamondTexture(scene, key, color) {
  const g = scene.add.graphics();

  g.fillStyle(color, 1);

  // a diamond: (0,16) - (32,0) - (64,16) - (32,32)
  g.beginPath();
  g.moveTo(0, 16);
  g.lineTo(32, 0);
  g.lineTo(64, 16);
  g.lineTo(32, 32);
  g.closePath();
  g.fillPath();

  // generateTexture(key, width, height) turns the drawing into a texture
  g.generateTexture(key, 64, 32);

  g.destroy(); // the Graphics object is no longer needed
}
```

Now `this.add.image(x, y, key)` works as if you had loaded an image file. The
diamond shape is deliberate — it's a **tile** for the isometric map we build in
chapter 07.

> `generateTexture` grabs whatever the Graphics object has drawn and bakes it
> into a texture sized `(width, height)`. Graphics draws in its own coordinate
> space (its `x`,`y` offset), so a `Graphics` placed at `(0,0)` is easiest.

## Destroying objects

Objects can be removed for good with `destroy()`:

```js
this.ball.destroy();
```

Phaser also removes objects when their scene stops.

## Try it

1. Load or generate two textures and place them with different depths; confirm
   the higher depth draws in front.
2. Use `setOrigin(0.5)` and rotate an image around its centre.
3. Generate a small texture with `Graphics.generateTexture` and use it in an
   `add.image`.

**What's next:** [04 — Input](04-input.md). Now that things can be drawn, let's
let the player click on them.
