# 05 — Cameras

The **camera** decides which part of the world is visible on the canvas. In
Phaser the world can be much bigger than the screen; the camera scrolls around
it. Each scene has a main camera at `this.cameras.main`, and you can create more
(e.g. a mini-map).

## Scroll: showing a slice of the world

By default the camera sits at `(0, 0)` — the top-left of the world — and shows a
`width` × `height` slice.

```js
this.cameras.main.setScroll(100, 50);   // scroll to a world position
// or directly:
this.cameras.main.scrollX = 100;
this.cameras.main.scrollY = 50;
```

Two useful details:

- `scrollX`/`scrollY` are the world coordinates at the camera's top-left corner.
- You rarely set them by hand — you use **bounds** and **follow**.

## Bounds: keeping the camera inside the world

```js
this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
```

Once bounds are set, the camera won't scroll outside that rectangle. This is the
first thing you want for a big map. (For isometric maps, the bounds rectangle
needs a little care — chapter 07 computes it from the diamond shape.)

## Following a target

The camera can smoothly track a game object:

```js
this.cameras.main.startFollow(player, true, 0.1, 0.1);
```

Arguments: the target, `roundPixels` (true helps avoid blurry scrolling), and
left/right/top/bottom lerp factors — how quickly the camera catches up. `1, 1`
means "stick instantly". Stop with `this.cameras.main.stopFollow()`.

## Zoom

```js
this.cameras.main.setZoom(1.5); // zoom in
```

Zoom multiplies what you see: with zoom 2 the world appears twice as big, and
`pointer.worldX` / `pointer.worldY` still resolve correctly through the camera.

## Camera effects

A few one-liners that are handy for polish:

```js
this.cameras.main.fadeOut(500);          // fade to black
this.cameras.main.flash(200);            // brief white flash
this.cameras.main.shake(300, 0.01);      // shake the screen
this.cameras.main.setBackgroundColor('#000000');
```

## Converting between screen and world coordinates

This is the part the isometric game leans on. All of these do the same kind of
math in different directions:

```js
// screen -> world
const point = { x: 0, y: 0 };
this.cameras.main.getWorldPoint(pointer.x, pointer.y, point);
// point.x, point.y are now world coordinates

// world -> screen
const sx = this.cameras.main.worldToScreenX(worldX);
const sy = this.cameras.main.worldToScreenY(worldY);
```

But in practice you'll most often use `pointer.worldX` / `pointer.worldY`, which
Phaser already computes for you through the main camera. In the isometric
chapter, that world position gets fed into the tilemap's `worldToTileXY`, and
that's exactly how "click on a diamond → which tile did I click" works.

## HUD: objects that never scroll

Give a game object `setScrollFactor(0)` and it stops moving when the camera
scrolls — the standard trick for UI that stays fixed on screen:

```js
this.add.text(10, 10, 'SCORE: 0', { fontSize: '20px' }).setScrollFactor(0);
```

## Try it

1. Make a world bigger than the canvas, add a player, set bounds, and `startFollow`.
2. Move the player with cursor keys and watch the camera glide.
3. Add a `setScrollFactor(0)` text label and confirm it never moves.
4. Zoom in and click around — check `pointer.worldX` still points at the right
   world position.

**What's next:** [06 — Tilemaps](06-tilemaps.md). A scrollable world is much
easier to build when it's made of tiles instead of one giant image.
