# 04 — Input

Phaser gives you three kinds of input we'll care about: the **pointer** (mouse
and touch), **keyboard**, and per-object interaction (hover, click on a specific
game object). Everything hangs off `this.input` inside a scene.

## The pointer: where the user clicked

`pointerdown` fires whenever the mouse is pressed (or a touch begins) anywhere on
the canvas:

```js
this.input.on('pointerdown', (pointer) => {
  console.log(pointer.x, pointer.y);        // position on the canvas
  console.log(pointer.worldX, pointer.worldY); // position in the world
});
```

The distinction matters once we have a camera that scrolls (chapter 05):

- `pointer.x`, `pointer.y` are **screen coordinates** relative to the canvas.
- `pointer.worldX`, `pointer.worldY` are the world position under the pointer,
  already adjusted for camera scroll and zoom. **Use these for world logic.**

Other pointer events: `pointerup`, `pointermove`, and (for the currently held
button) `pointer.isDown`, `pointer.leftButtonDown()`.

For our isometric game, `pointerdown` is how the player says *"walk here"*.

## Making game objects interactive

By default, clicking doesn't do anything to a game object. Call `setInteractive()`
on it first, then listen to its events:

```js
const crate = this.add.image(400, 300, 'crate').setInteractive();

crate.on('pointerdown', (pointer, localX, localY) => {
  console.log('clicked the crate');
});

crate.on('pointerover', () => console.log('hovering'));
crate.on('pointerout', () => console.log('not hovering'));
```

There is also a scene-level event for "any game object was clicked", which lets
you handle clicks for a whole group at once:

```js
this.input.on('gameobjectdown', (pointer, gameObject) => {
  console.log('clicked', gameObject);
});
```

> The `setInteractive()` hit area uses the object's bounding box by default. For
> our diamond-shaped isometric tiles, a square hit area feels close enough in
> practice, but chapter 11 shows a cleaner way: let *where* you click decide,
> not *what* you click.

## Dragging

`this.input.setDraggable(gameObject)` enables dragging, and the object fires
`drag` events while the pointer moves:

```js
this.input.setDraggable(crate);

crate.on('drag', (pointer, dragX, dragY) => {
  crate.x = dragX;
  crate.y = dragY;
});
```

Useful for a level editor or for dragging objects onto a grid.

## Keyboard

The keyboard plugin gives you both named keys and cursor keys:

```js
// create cursor keys (up/down/left/right) — good for testing movement
const cursors = this.input.keyboard.createCursorKeys();

// a specific key (SPACE is a Phaser.KeyCodes constant)
const space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

// poll in update() — this is the standard way
update() {
  if (cursors.left.isDown) {
    this.ball.x -= 3;
  }
  if (Phaser.Input.Keyboard.JustDown(space)) {
    console.log('space pressed just now');
  }
}
```

`isDown` is true while the key is held. `Phaser.Input.Keyboard.JustDown(key)` is
true only on the first frame of a press — better for one-shot actions like jump.

## Try it

1. Print `pointer.worldX` / `pointer.worldY` when you click; move the ball to the
   click position.
2. Make an image interactive and log `pointerover`.
3. Make a crate draggable and confirm it follows the pointer.

**What's next:** [05 — Cameras](05-cameras.md). Once the world is bigger than the
screen, `pointer.worldX/worldY` becomes essential — a camera is why.
