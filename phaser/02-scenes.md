# 02 — Scenes

A **scene** is a self-contained part of your game: a menu, the level itself, a
HUD, a game-over screen. Each scene has its own set of game objects, its own
assets to load, and its own code that runs each frame. Phaser runs your game by
running one or more scenes and swapping between them.

## The scene lifecycle

A scene is a JavaScript object (or class) with optional special methods. Phaser
calls them for you at the right time:

| Method | When it runs | What it's for |
|--------|--------------|---------------|
| `init(data)` | once, first | setting up values; receives data passed from another scene |
| `preload()` | once, after `init` | loading assets (images, maps, sounds) |
| `create(data)` | once, after `preload` | building the scene: creating game objects |
| `update(time, delta)` | every frame | movement, logic, reacting to input |

The two most useful are `create` — build the scene once — and `update` — change
it every frame.

## Writing a scene

The simplest form is a plain object, like we used in chapter 01:

```js
const sceneA = {
  preload: function () {
    this.load.image('ball', 'assets/ball.png');
  },
  create: function () {
    this.add.image(400, 300, 'ball');
  },
  update: function (time, delta) {
    // called every frame
  }
};
```

Or a class that extends `Phaser.Scene`. Both are valid; the class form lets you
put the scene in its own file and keeps state tidy:

```js
class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu'); // the scene's key (name)
  }

  create() {
    this.add.text(400, 300, 'Click to start', { fontSize: '24px' })
      .setOrigin(0.5);

    this.input.on('pointerdown', () => {
      this.scene.start('game'); // switch to the scene with key 'game'
    });
  }
}
```

Note the `super('menu')` line: it gives the scene a **key**. The key is how you
refer to the scene when starting or stopping it, and it must match the `key` in
your scene config.

## Registering scenes

```js
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: [ MenuScene, GameScene ]  // an array of scene classes/objects
};

new Phaser.Game(config);
```

The first scene in the array starts automatically. All the others are created but
not started until you tell them to start.

> **Two scene forms, same idea.** A scene class is `new MenuScene()` wrapped so
> Phaser can manage it. A plain object is shorthand Phaser accepts. Throughout
> this guide we use the class form, because it keeps each chapter's code tidy.

## Starting, stopping, and passing data

Inside a scene, `this.scene` gives you control over the scene system:

```js
// start another scene (it boots, preloads, and creates)
this.scene.start('game');

// start it with data (the other scene receives it in init(data))
this.scene.start('game', { level: 2, score: 1200 });

// run a second scene on top (for a HUD, for example)
this.scene.launch('hud');

// stop the current scene
this.scene.stop();
```

The receiving scene reads it in `init`:

```js
init(data) {
  this.level = data.level;
  this.score = data.score;
}
```

## The `update` loop

`update(time, delta)` runs once per animation frame (typically 60 times per
second). `time` is the total time in milliseconds since the game started; `delta`
is the time in milliseconds since the last frame — useful for making movement
frame-rate independent (a slow frame gets a bigger `delta`).

```js
update(time, delta) {
  // move something to the right at 100 pixels per second,
  // regardless of frame rate
  this.ball.x += 100 * (delta / 1000);
}
```

We'll lean on this pattern a lot from chapter 09 on, when objects start walking
around.

## A scene with all four methods

```js
class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.level = data.level || 1;
    this.score = 0;
  }

  preload() {
    this.load.image('ball', 'assets/ball.png');
  }

  create() {
    this.ball = this.add.image(100, 300, 'ball');
  }

  update(time, delta) {
    this.ball.x += 100 * (delta / 1000);
  }
}
```

## Try it

1. Make a `MenuScene` and a `GameScene`, with a click on the menu starting the
   game.
2. Pass the number of clicks from the menu into the game scene via `init(data)`
   and print it with `this.add.text(...)`.
3. Add an `update` method that makes the ball move, and confirm it moves at a
   steady speed.

**What's next:** [03 — Game objects](03-game-objects.md). Scenes are the
containers; game objects are what actually lives inside them.
