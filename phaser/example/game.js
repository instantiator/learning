// Phaser 4 isometric example — "click to walk there".
//
// Everything the code does is explained in the chapter files in the parent
// directory (01-getting-started.md ... 12-putting-it-together.md). This file is
// the finished, runnable result of chapter 12.

// ---------------------------------------------------------------------------
// A* pathfinding (chapter 10). grid[y][x] === 0 means walkable.
// Returns an array of {x, y} tiles from start (inclusive) to goal (inclusive),
// or null if no path exists.
// ---------------------------------------------------------------------------
function findPath(grid, sx, sy, gx, gy) {
  const width = grid[0].length;
  const height = grid.length;

  const blocked = (x, y) =>
    x < 0 || y < 0 || x >= width || y >= height || grid[y][x] !== 0;

  if (blocked(sx, sy) || blocked(gx, gy)) return null;

  const key = (x, y) => y * width + x;
  const cameFrom = new Map();
  const gCost = new Map();
  const fCost = new Map();

  const heuristic = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);

  const start = { x: sx, y: sy };
  gCost.set(key(sx, sy), 0);
  fCost.set(key(sx, sy), heuristic(sx, sy));

  const open = [];
  const push = (node) => {
    open.push(node);
    open.sort((a, b) => fCost.get(key(a.x, a.y)) - fCost.get(key(b.x, b.y)));
  };
  push(start);

  while (open.length > 0) {
    const current = open.shift();
    const ck = key(current.x, current.y);

    if (current.x === gx && current.y === gy) {
      const path = [];
      let node = current;
      while (node) {
        path.push({ x: node.x, y: node.y });
        node = cameFrom.get(key(node.x, node.y));
      }
      return path.reverse();
    }

    const neighbours = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    ];

    for (const n of neighbours) {
      if (blocked(n.x, n.y)) continue;
      const nk = key(n.x, n.y);
      const tentative = gCost.get(ck) + 1;

      if (tentative < (gCost.get(nk) ?? Infinity)) {
        cameFrom.set(nk, current);
        gCost.set(nk, tentative);
        fCost.set(nk, tentative + heuristic(n.x, n.y));

        if (!open.some((o) => o.x === n.x && o.y === n.y)) {
          push(n);
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Runtime textures (chapter 03) — no image files needed.
// ---------------------------------------------------------------------------
function makeTileTextures(scene) {
  const g = scene.add.graphics();

  // Frame 0 (top half): ground tile — a green diamond.
  g.fillStyle(0x7fb069, 1);
  g.beginPath();
  g.moveTo(0, 16); g.lineTo(32, 0); g.lineTo(64, 16); g.lineTo(32, 32);
  g.closePath(); g.fillPath();

  g.lineStyle(2, 0x4e7a3d, 1);
  g.strokePath();

  g.lineStyle(1, 0xa8c98f, 1);
  g.beginPath();
  g.moveTo(32, 3); g.lineTo(61, 16); g.lineTo(32, 29); g.lineTo(3, 16);
  g.closePath(); g.strokePath();

  // Frame 1 (bottom half, offset +32 in y): wall tile — a stone block.
  g.fillStyle(0x8a8f98, 1);
  g.beginPath();
  g.moveTo(0, 48); g.lineTo(32, 32); g.lineTo(64, 48); g.lineTo(32, 64);
  g.closePath(); g.fillPath();

  g.lineStyle(2, 0x5f6570, 1);
  g.strokePath();

  g.fillStyle(0xa7adb8, 1);
  g.beginPath();
  g.moveTo(32, 36); g.lineTo(59, 48); g.lineTo(32, 60); g.lineTo(5, 48);
  g.closePath(); g.fillPath();

  g.generateTexture('iso-tiles', 64, 64);
  g.destroy();
}

function makeHeroTexture(scene, key, fill, border) {
  const g = scene.add.graphics();

  g.fillStyle(fill, 1);
  g.beginPath();
  g.moveTo(0, 8); g.lineTo(16, 0); g.lineTo(32, 8); g.lineTo(16, 16);
  g.closePath(); g.fillPath();

  g.lineStyle(2, border, 1);
  g.strokePath();

  g.generateTexture(key, 32, 16);
  g.destroy();
}

// ---------------------------------------------------------------------------
// The scene.
// ---------------------------------------------------------------------------
class IsoScene extends Phaser.Scene {
  constructor() {
    super('iso');
  }

  preload() {
    this.load.tilemapTiledJSON('map', 'assets/map.json');
  }

  create() {
    makeTileTextures(this);
    makeHeroTexture(this, 'hero-a', 0x4f8cff, 0x1f4fa8);
    makeHeroTexture(this, 'hero-b', 0xff6b6b, 0xb03a3a);
    makeHeroTexture(this, 'hero-c', 0x5ee07b, 0x2f9448);

    // --- tilemap (chapters 06-07) ---
    const map = this.add.tilemap('map');
    const tiles = map.addTilesetImage('tiles', 'iso-tiles');
    const groundLayer = map.createLayer('ground', tiles);
    const wallLayer = map.createLayer('walls', tiles);

    groundLayer.setDepth(0);
    wallLayer.setDepth(0);

    this.map = map;
    this.groundLayer = groundLayer;
    this.wallLayer = wallLayer;

    this.hw = map.tileWidth / 2;
    this.hh = map.tileHeight / 2;
    this.mapWidth = map.width;
    this.mapHeight = map.height;

    // reusable point for tileToWorldXY (it fills the passed Vector2 via .set)
    this.pt = new Phaser.Math.Vector2();

    // --- camera + physics bounds shaped to the diamond (chapters 05, 07) ---
    const bounds = {
      x: -map.height * this.hw,
      y: 0,
      width: (map.width + map.height) * this.hw,
      height: (map.width + map.height) * this.hh
    };

    const cam = this.cameras.main;
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    cam.centerOn(0, (map.width + map.height) * this.hh * 0.5);

    this.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);

    // --- characters (chapters 08-09) ---
    const spawns = [
      { key: 'hero-a', tile: { x: 1, y: 6 }, priority: 1 },
      { key: 'hero-b', tile: { x: 5, y: 2 }, priority: 2 },
      { key: 'hero-c', tile: { x: 8, y: 6 }, priority: 3 }
    ];

    this.heroes = [];
    this.occupied = new Set(); // occupancy grid, keyed by y * mapWidth + x

    for (const s of spawns) {
      const c = this.tileCenter(s.tile.x, s.tile.y);
      const spr = this.physics.add.sprite(c.x, c.y, s.key);
      spr.setDepth(s.tile.x + s.tile.y);
      spr.body.setSize(24, 12);
      spr.body.setOffset(4, 2);
      spr.body.setCollideWorldBounds(true);

      const hero = {
        name: s.key,
        sprite: spr,
        tile: { x: s.tile.x, y: s.tile.y },
        route: null,
        stepIndex: 0,
        targetTile: null,
        isBusy: false,
        movingAside: false,
        priority: s.priority
      };

      this.heroes.push(hero);
      this.occupy(hero);
    }

    // belt and braces: characters physically never overlap (chapter 11)
    for (let i = 0; i < this.heroes.length; i++) {
      for (let j = i + 1; j < this.heroes.length; j++) {
        this.physics.add.collider(this.heroes[i].sprite, this.heroes[j].sprite);
      }
    }

    // --- input (chapters 04, 07, 09) ---
    this.selected = null;

    this.input.on('pointerdown', (pointer) => {
      // click near a character -> select it
      const hit = this.nearestHeroTo(pointer.worldX, pointer.worldY, 26);
      if (hit) {
        this.select(hit);
        this.msg('Selected ' + hit.name + '. Now click a tile.');
        return;
      }

      // which visible diamond was clicked? (chapter 07)
      // getIsoTileAtWorldXY uses the diamond TOP face, so it lines up with what
      // the player sees; plain worldToTileXY would be one tile off on iso maps.
      const tile = this.groundLayer.getIsoTileAtWorldXY(pointer.worldX, pointer.worldY);
      if (!tile) return; // clicked outside the map's diamond

      // otherwise: send the selected character, or the nearest idle one
      const target = this.selected || this.nearestIdleHeroTo(tile.x, tile.y);
      if (!target) {
        this.msg('All characters are busy.');
        return;
      }
      this.moveCharTo(target, tile.x, tile.y);
    });

    // --- HUD ---
    this.statusText = this.add
      .text(10, 10, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffe9a8' })
      .setScrollFactor(0);

    this.msg('Click a tile to walk there. Click near a character to select it.');
  }

  update(time, delta) {
    // --- grid-step movement (chapter 09) ---
    for (const h of this.heroes) {
      if (!h.route || h.route.length === 0) continue;

      const step = h.route[h.stepIndex];
      const c = this.tileCenter(step.x, step.y);

      const dx = c.x - h.sprite.x;
      const dy = c.y - h.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 170 * (delta / 1000);

      if (dist < speed) {
        // arrived at this step: snap, update occupancy + depth, next step
        h.sprite.x = c.x;
        h.sprite.y = c.y;
        this.release(h);
        h.tile = { x: step.x, y: step.y };
        this.occupy(h);
        h.sprite.setDepth(step.x + step.y);
        h.stepIndex++;

        if (h.stepIndex >= h.route.length) {
          this.finishRoute(h);
        }
      } else {
        h.sprite.x += (dx / dist) * speed;
        h.sprite.y += (dy / dist) * speed;
      }
    }

    // --- react when a tile on a path becomes occupied (chapter 11) ---
    this.replanBlocked();
  }

  // --- helpers ---------------------------------------------------------

  tileCenter(tx, ty) {
    const p = this.groundLayer.tileToWorldXY(tx, ty, this.pt);
    return { x: p.x + this.hw, y: p.y + this.hh };
  }

  occKey(tx, ty) {
    return ty * this.mapWidth + tx;
  }

  occupy(h) {
    this.occupied.add(this.occKey(h.tile.x, h.tile.y));
    h.occKey = this.occKey(h.tile.x, h.tile.y);
  }

  release(h) {
    this.occupied.delete(this.occKey(h.tile.x, h.tile.y));
  }

  isWall(tx, ty) {
    return this.wallLayer.getTileAt(tx, ty) !== null;
  }

  // combined walk grid: walls + occupied tiles (mover's own tile stays free)
  pathGrid(mover) {
    const grid = [];
    for (let y = 0; y < this.mapHeight; y++) {
      const row = [];
      for (let x = 0; x < this.mapWidth; x++) {
        let blocked = this.isWall(x, y);
        if (this.occupied.has(this.occKey(x, y)) && mover && mover.occKey !== this.occKey(x, y)) {
          blocked = true;
        }
        row.push(blocked ? 1 : 0);
      }
      grid.push(row);
    }
    return grid;
  }

  charAtTile(tx, ty) {
    const k = this.occKey(tx, ty);
    return this.heroes.find((h) => h.occKey === k) || null;
  }

  setRoute(h, tx, ty, temporary) {
    const path = findPath(this.pathGrid(h), h.tile.x, h.tile.y, tx, ty);
    if (!path || path.length === 0) return false;

    h.route = path.slice(1); // skip tile 0 — already standing on it
    h.stepIndex = 0;
    h.targetTile = { x: tx, y: ty };
    h.isBusy = true;
    h.movingAside = temporary;
    return true;
  }

  moveCharTo(h, tx, ty) {
    if (this.isWall(tx, ty)) {
      this.msg(h.name + ': that tile is a wall.');
      return;
    }
    if (h.tile.x === tx && h.tile.y === ty) {
      this.msg(h.name + ': already there.');
      return;
    }

    // goal occupied by another character? ask it to step aside (chapter 11)
    const blocker = this.charAtTile(tx, ty);
    if (blocker) {
      if (blocker.isBusy || blocker.movingAside) {
        this.msg(h.name + ': ' + blocker.name + ' is in the way.');
        return;
      }
      this.stepAside(blocker);
      this.msg(h.name + ': asked ' + blocker.name + ' to step aside.');
      this.time.delayedCall(350, () => {
        if (h.route === null) this.moveCharTo(h, tx, ty);
      });
      return;
    }

    if (this.setRoute(h, tx, ty, false)) {
      this.msg(h.name + ': on my way.');
    } else {
      this.msg(h.name + ': no route to that tile.');
    }
  }

  stepAside(h) {
    if (h.movingAside) return;
    const spot = this.freeNeighbour(h);
    if (!spot) return;
    this.setRoute(h, spot.x, spot.y, true);
    this.msg(h.name + ': moving aside.');
  }

  freeNeighbour(h) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const tx = h.tile.x + dx;
      const ty = h.tile.y + dy;
      if (tx < 0 || ty < 0 || tx >= this.mapWidth || ty >= this.mapHeight) continue;
      if (this.isWall(tx, ty)) continue;
      if (this.occupied.has(this.occKey(tx, ty))) continue;
      return { x: tx, y: ty };
    }
    return null;
  }

  finishRoute(h) {
    h.route = null;
    h.targetTile = null;
    h.isBusy = false;
    if (h.movingAside) {
      h.movingAside = false;
      this.msg(h.name + ': moved aside, free again.');
    }
  }

  // if the next path tile is occupied by someone else, re-plan; if there is
  // no alternative and we outrank the blocker, ask it to move instead
  replanBlocked() {
    for (const h of this.heroes) {
      if (!h.route || h.route.length === 0) continue;

      const next = h.route[h.stepIndex];
      const blocker = this.charAtTile(next.x, next.y);

      if (blocker && blocker !== h) {
        const path = findPath(this.pathGrid(h), h.tile.x, h.tile.y, h.targetTile.x, h.targetTile.y);

        if (path) {
          h.route = path.slice(1);
          h.stepIndex = 0;
          continue;
        }

        if (!blocker.movingAside && blocker.priority > h.priority) {
          this.stepAside(blocker);
          continue;
        }

        h.route = null;
        h.isBusy = false;
        h.movingAside = false;
        this.msg(h.name + ': stuck behind ' + blocker.name + '.');
      }
    }
  }

  select(h) {
    for (const o of this.heroes) o.sprite.clearTint();
    this.selected = h;
    h.sprite.setTint(0xffe9a8);
  }

  nearestHeroTo(wx, wy, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const h of this.heroes) {
      const dx = h.sprite.x - wx;
      const dy = h.sprite.y - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }

  nearestIdleHeroTo(tx, ty) {
    let best = null;
    let bestD = Infinity;
    for (const h of this.heroes) {
      if (h.isBusy || h.movingAside) continue;
      const dx = h.tile.x - tx;
      const dy = h.tile.y - ty;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }

  msg(text) {
    this.statusText.setText(text);
  }
}

// --- game config (chapters 01, 08) ---
const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#16203a',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 }
    }
  },
  scene: [ IsoScene ]
};

new Phaser.Game(config);
