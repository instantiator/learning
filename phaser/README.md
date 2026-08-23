# Phaser, from zero to an isometric scene

A guided, hands-on introduction to the **Phaser** game framework. We work through
the official documentation (https://docs.phaser.io/) one topic at a time, and end
with a small but complete game: a **scrollable isometric map** with walls and
objects, where you click a tile and an object **walks there on its own**, finding
its way around anything that blocks it — including *other moving objects that are
in the way*.

Everything is written in plain language. When a term appears for the first time it
is written in **bold** and explained on the spot.

## What we're aiming for

By the end you will have built the working example in
[`example/`](example/):

- an isometric map (a diamond-shaped grid) loaded from a Tiled map file,
- walls that cannot be walked through,
- two or three moveable objects (characters),
- click anywhere on the map to tell a character "go there",
- the character computes a **path** across the grid and follows it,
- if another character is standing in the way, the characters sort it out
  (wait, re-plan, or ask each other to move).

That last problem — *"I want to walk to X, but someone is in the way"* — is the
core of the tutorial. Everything else is built up so that the last chapter can
answer it properly.

## Target version

This guide is written for **Phaser 4** (the current major version, 4.1.0+ at the
time of writing; 4.2.x is the latest release line). Phaser 4 keeps the same
familiar API as Phaser 3 for everything we use here, so almost all of this also
applies to a Phaser 3 project. Where Phaser 4 changed something relevant, the
chapter calls it out in a note box.

## How to use this guide

Read the chapters **in order**. Each one is short, ends with a small "try it"
exercise, and assumes you have done the ones before it. Code samples are complete
enough to copy and paste.

| # | Chapter | What you'll learn |
|---|---------|-------------------|
| 01 | [Getting started](01-getting-started.md) | What Phaser is, the HTML page, your first Phaser game. |
| 02 | [Scenes](02-scenes.md) | How a game is divided into scenes, and the scene lifecycle. |
| 03 | [Game objects](03-game-objects.md) | Sprites, images, text, graphics, and how they're placed and ordered. |
| 04 | [Input](04-input.md) | Clicks, hover, dragging, and keyboard input. |
| 05 | [Cameras](05-cameras.md) | The camera: scrolling, following, zooming, and converting coordinates. |
| 06 | [Tilemaps](06-tilemaps.md) | Tile maps, Tiled maps, tilesets and layers. |
| 07 | [Isometric](07-isometric.md) | Diamond grids, iso coordinates, and depth sorting. |
| 08 | [Arcade physics](08-arcade-physics.md) | Velocities, collisions, and static vs dynamic bodies. |
| 09 | [Movement & targets](09-movement-and-targets.md) | Telling an object to walk to a clicked tile. |
| 10 | [Pathfinding](10-pathfinding.md) | Letting an object find a route around obstacles. |
| 11 | [Obstacles & cooperation](11-obstacles-and-cooperation.md) | What happens when another object is *in the way*. |
| 12 | [Putting it together](12-putting-it-together.md) | The full example, explained step by step. |

The final chapter walks through the complete example, which also lives in
[`example/`](example/) and runs in any browser.

## Before you start

You only need a text editor, a browser, and (for most of the guide) a way to serve
a folder over HTTP. Chapter 01 explains both the HTML and how to run a local
server.
