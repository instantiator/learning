# 08 — Arcade physics

**Arcade physics** is Phaser's built-in, easy-to-use physics engine. It gives
game objects a **body** with position, velocity, and a collision shape, and then
handles movement and collisions for you. It's called "arcade" because it does a
limited amount (no rotations, no joints, square or circle bodies) — but for a
2D/iso game that's plenty.

To use it, set `physics` in the game config:

```js
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },   // our iso game has no gravity
      debug: false               // set true to see body outlines
    }
  },
  scene: [ GameScene ]
};
```

> **Phaser 4 change.** Physics (Arcade and Matter) carry over from Phaser 3
> largely unchanged — the migration notes flag them as "likely unchanged". So
> everything in this chapter applies to both.

## Dynamic and static bodies

- A **dynamic body** moves: it has velocity, gets pushed by collisions, falls
  with gravity.
- A **static body** never moves: it's the floor, walls, and other furniture that
  things bump into.

```js
create() {
  // a moving character
  this.player = this.physics.add.sprite(100, 100, 'player');

  // an immovable wall
  this.wall = this.physics.add.staticSprite(400, 300, 'wall');

  // a group of rocks
  this.rocks = this.physics.add.staticGroup();

  // turn them all into colliders:
  this.physics.add.collider(this.player, this.wall);
  this.physics.add.collider(this.player, this.rocks);
}
```

## Moving a body

Set velocity directly, or use the helpers:

```js
body.setVelocity(100, 0);               // 100 px/sec right
body.setVelocityX(-50);
body.velocity.x += 5;                    // accelerate

this.physics.moveTo(player, x, y, 120);  // set velocity towards a point
this.physics.moveToObject(player, target, 120);
```

> `moveTo` returns the angle (radians) towards the target — handy if you want to
> rotate a sprite to face where it's going. Two gotchas from the docs: the object
> keeps going after it reaches the destination (it doesn't stop), and it ignores
> drag/acceleration. So most games do their own "am I there yet?" check. We'll
> write that ourselves in chapter 09:

```js
const dist = Phaser.Math.Distance.Between(player.x, player.y, target.x, target.y);
if (dist < 4) {
  body.stop();   // body.stop() zeroes velocity
}
```

## Collision vs overlap

```js
// physical collision: bodies push each other
this.physics.add.collider(this.player, this.wall);

// overlap: just "are they touching?" — no pushing. Great for pickups and
// proximity checks
this.physics.add.overlap(this.player, this.gem, (player, gem) => {
  gem.destroy();
});
```

Callbacks get both bodies:

```js
this.physics.add.collider(this.player, this.wall, (player, wall) => {
  console.log('bumped into a wall');
});
```

## Reading what the body is touching

After collisions are resolved, the body records what it hit:

```js
body.blocked.up;     // true if something pushed up into us
body.blocked.down;
body.blocked.left;
body.blocked.right;

body.touching.up;    // true if we pushed up into something
```

`blocked` answers "is something in my way?" — useful for a character who has
walked into a wall.

## Body size and shape

A body starts as the size of the object's texture. For characters (and especially
for iso sprites, which are tall) you usually shrink it:

```js
body.setSize(24, 32);           // box, anchored at the top-left of the body
body.setOffset(4, 0);           // shift it to sit nicely under the sprite
body.setCircle(12);             // or a circle (radius), centred
```

## Colliding with tilemap layers

The tilemap collision we saw in chapter 06 plugs straight in:

```js
const wallLayer = map.createLayer('walls', tiles);
wallLayer.setCollision(2);           // tiles with frame index 2 are solid

this.physics.add.collider(this.player, wallLayer, () => {
  // the player can't move through wall tiles
});
```

Bodies also get the classic convenience flags:

```js
body.setCollideWorldBounds(true);    // stop at the world/physics bounds
body.setImmovable(true);             // collisions never move this body
```

## The world bounds

`body.setCollideWorldBounds(true)` uses the physics world's bounds, which by
default match the canvas. For a big scrolling map you extend them:

```js
this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
```

(For iso maps, set them to the same rectangle you gave the camera in chapter 07.)

## Try it

1. Make a player and a wall; move the player with cursor keys; confirm it can't
   cross the wall.
2. Add a `collider` callback that prints when the player hits the wall.
3. Use `body.setCircle(12)` and check `debug: true` shows the smaller body.

**What's next:** [09 — Movement & targets](09-movement-and-targets.md). Physics
gives us movement; now let's make an object walk to a specific clicked tile.
