# 01 — Getting started

**Phaser** is a JavaScript game framework. You write a game in JavaScript, Phaser
draws it into a `<canvas>` element on a web page, and the browser runs it. There
is no special tooling you have to install to start: a single HTML file that loads
Phaser from a CDN is enough to make your first game.

A Phaser game is built from a few pieces:

- a `Phaser.Game` object created with a **config** object,
- one or more **scenes** (we cover those properly in the next chapter),
- **game objects** inside the scenes — sprites, text, shapes (chapter 03).

## Your first Phaser game

Create a folder for the project, and inside it a file called `index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>My first Phaser game</title>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/phaser@4.1.0/dist/phaser.min.js"></script>
  <script src="main.js"></script>
</body>
</html>
```

Then `main.js`:

```js
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#222222',
  scene: {
    create: create
  }
};

new Phaser.Game(config);

function create() {
  this.add.text(400, 300, 'Hello, Phaser!', {
    fontFamily: 'monospace',
    fontSize: '32px',
    color: '#ffffff'
  }).setOrigin(0.5);
}
```

Open it in a browser and you should see the text in the middle of the dark
canvas.

> **Note on versions.** The CDN line pins Phaser `4.1.0`. There may be a newer
> 4.x release by the time you read this — you can use a newer version number, or
> drop the `@4.1.0` pin to always get the latest 4.x. Everything in this guide
> works on any Phaser 4.x (and, with minor differences, Phaser 3.x).

## What's in the config?

- `type: Phaser.AUTO` — let Phaser choose the best renderer. Phaser 4 uses a
  WebGL renderer; `AUTO` picks WebGL when the browser supports it.
- `width` / `height` — the size of the game canvas in pixels.
- `backgroundColor` — what the canvas looks like before anything is drawn.
- `scene` — the scene (or scenes) the game starts with. Here we use the compact
  "just give me a `create` method" form.

> **Note for Phaser 3 users.** Phaser 3 would also accept `type: Phaser.CANVAS`.
> Phaser 4's canvas renderer is deprecated, so just use `Phaser.AUTO`.

## How the game actually starts

When you call `new Phaser.Game(config)`, a few things happen in order:

1. Phaser sets up the renderer and creates the `<canvas>` inside the page.
2. It creates the scenes from your config.
3. Each scene boots and its `create` method runs once.
4. The game loop starts: for every animation frame, Phaser updates all running
   scenes and then renders everything to the canvas.

We haven't defined a `update` method yet — that's the function Phaser calls on
every frame, and it's where movement and game logic live. We'll use it from
chapter 02 onward.

## Running it

A modern browser is all you need, but you should get into the habit of serving
your game over HTTP, because Phaser loads assets (images, map files, sounds) with
HTTP requests, and `file://` pages block those. From inside your project folder:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

## Where to look things up

- The official docs: https://docs.phaser.io/
- The Phaser GitHub repo: https://github.com/phaserjs/phaser

## Try it

1. Change the text, the color, and the canvas size.
2. Add a second `this.add.text(...)` line and offset it from the first one.
3. Guess what happens if you use `setOrigin(0, 0)` instead of `setOrigin(0.5)`.

**What's next:** [02 — Scenes](02-scenes.md). Right now everything lives in one
`create` function; scenes are how we organise a real game.
