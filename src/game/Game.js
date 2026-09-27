import { clamp, damp, lerp, randRange, randPick, turnToward, TAU } from "./utils.js";
import { Background } from "./Background.js";
import { Input } from "./Input.js";
import { Particles } from "./Particles.js";
import { Sfx } from "./Sfx.js";
import { PlayerFish, AIFish, PufferFish, Jellyfish, Shark, PowerUp, EAT_RATIO } from "./Entities.js";
import { setFishLighting } from "./FishArt.js";

const WORLD_W = 5200;
const WORLD_H = 3000;
const AI_COUNT = 32;
const PUFFER_COUNT = 2;
const JELLY_COUNT = 3;
const COMBO_WINDOW = 2.8;
const FRENZY_COMBO = 6;

// Growth levels: reach the last one to become king of the ocean.
export const LEVELS = [
  { len: 60, name: "小鱼苗" },
  { len: 95, name: "机灵小鱼" },
  { len: 150, name: "浅海猎手" },
  { len: 230, name: "大块头" },
  { len: 340, name: "深海霸主" },
  { len: 480, name: "海洋之王" },
];

function randomSpawnLen(playerLen) {
  const roll = Math.random();
  let len;
  if (roll < 0.62) len = playerLen * randRange(0.3, 0.7);
  else if (roll < 0.86) len = playerLen * randRange(0.75, 1.05);
  else len = playerLen * randRange(1.35, 2.3);
  return clamp(len, 18, 620);
}

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ui = ui;
    this.input = new Input(canvas);
    this.sfx = new Sfx();
    this.background = new Background(WORLD_W, WORLD_H);
    this.particles = new Particles();

    this.running = false;
    this.time = 0;
    this._last = performance.now();

    this.cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    this.shake = 0;
    this.hurtFlash = 0;
    this.hitstop = 0; // brief freeze-frame on big bites
    this.zoomPunch = 0; // camera kick on each chomp
    this.swallows = []; // prey currently being sucked into the player's mouth

    this._resize();
    window.addEventListener("resize", () => this._resize());

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  // ------------------------------------------------------------------ setup
  start() {
    this.sfx.init();
    this.particles.clear();

    this.player = new PlayerFish(WORLD_W / 2, WORLD_H / 2, 60);
    this.player.invincible = 2;
    this.fishes = [];
    this.puffers = [];
    this.jellies = [];
    this.powerups = [];
    this.shark = null;
    this.swallows = [];
    this.hitstop = 0;
    this.zoomPunch = 0;

    this.shake = 0;
    this.hurtFlash = 0;
    this.input.reset();

    this.score = 0;
    this.eaten = 0;
    this.lives = 3;
    this.combo = 0;
    this.comboTimer = 0;
    this.frenzy = false;
    this.level = 0;
    this.won = false;
    this.endless = false;

    this.goldTimer = randRange(14, 22);
    this.powerupTimer = randRange(10, 16);
    this.sharkTimer = randRange(40, 60);

    for (let i = 0; i < AI_COUNT; i++) this._spawnFish(true);
    for (let i = 0; i < PUFFER_COUNT; i++) this._spawnPuffer();
    for (let i = 0; i < JELLY_COUNT; i++) {
      this.jellies.push(new Jellyfish(randRange(300, WORLD_W - 300), randRange(400, WORLD_H - 500), randRange(70, 130)));
    }

    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.cam.zoom = this._targetZoom();

    this.running = true;
    this.ui.reset();
    this.ui.showPlaying();
    this.ui.setLives(this.lives);
    this.ui.setLevel(this.level, LEVELS, this.player.len);
    this._updateHud();
  }

  get zoom() {
    return this.cam.zoom * (1 + this.zoomPunch);
  }

  _viewRadius() {
    return Math.hypot(this.W, this.H) / (2 * this.cam.zoom);
  }

  // Spawn just outside the viewport so fish "arrive" instead of popping in.
  _spawnPos(anywhere = false) {
    for (let i = 0; i < 10; i++) {
      let x, y;
      if (anywhere) {
        x = randRange(200, WORLD_W - 200);
        y = randRange(220, WORLD_H - 220);
      } else {
        const a = randRange(0, TAU);
        const r = this._viewRadius() + randRange(120, 500);
        x = this.player.x + Math.cos(a) * r;
        y = this.player.y + Math.sin(a) * r * 0.7;
      }
      if (x < 150 || x > WORLD_W - 150 || y < 200 || y > WORLD_H - 200) continue;
      if (!anywhere || Math.hypot(x - this.player.x, y - this.player.y) > 500) return { x, y };
    }
    return { x: randRange(300, WORLD_W - 300), y: randRange(300, WORLD_H - 300) };
  }

  _spawnFish(anywhere = false) {
    const pos = this._spawnPos(anywhere);
    this.fishes.push(new AIFish(pos.x, pos.y, randomSpawnLen(this.player.len)));
  }

  _spawnPuffer() {
    const pos = this._spawnPos(true);
    this.puffers.push(new PufferFish(pos.x, pos.y, clamp(this.player.len * randRange(0.6, 0.9), 40, 320)));
  }

  _spawnGold() {
    const pos = this._spawnPos(false);
    this.fishes.push(new AIFish(pos.x, pos.y, clamp(this.player.len * 0.45, 20, 200), { gold: true, ttl: 12 }));
    this.ui.toast("✨ 黄金鱼出现了！");
  }

  _spawnPowerup() {
    const pos = this._spawnPos(false);
    this.powerups.push(new PowerUp(pos.x, pos.y, randPick(["star", "magnet", "bolt"])));
  }

  _spawnShark() {
    const fromLeft = this.player.x > WORLD_W / 2;
    const len = Math.max(this.player.len * 1.7, 300);
    const shark = new Shark(fromLeft ? -250 : WORLD_W + 250, clamp(this.player.y + randRange(-300, 300), 300, WORLD_H - 300), len);
    shark.angle = fromLeft ? 0 : Math.PI;
    this.shark = shark;
    this.ui.warn("🦈 鲨鱼出没！小心！", 3.2);
    this.sfx.warning();
    this.shake = Math.max(this.shake, 8);
  }

  // ------------------------------------------------------------------ loop
  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;
    this.time += dt;

    if (this.input.takeMuteToggle()) {
      const muted = this.sfx.toggleMute();
      this.ui.toast(muted ? "🔇 已静音" : "🔊 声音开启");
    }

    // hit-stop: the world nearly freezes for a beat after a big bite
    let simDt = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      simDt = dt * 0.07;
    }
    if (this.running) this._update(simDt);
    this.background.update(simDt);
    this.particles.update(simDt);
    this.sfx.ambientTick(dt);
    this._updateCamera(dt);
    this._draw();
  }

  _screenToWorld(sx, sy) {
    return {
      x: (sx - this.W / 2) / this.zoom + this.cam.x,
      y: (sy - this.H / 2) / this.zoom + this.cam.y,
    };
  }

  _update(dt) {
    const p = this.player;

    // --- player steering toward the pointer ---
    const target = this.input.hasPointer
      ? this._screenToWorld(this.input.pointerX, this.input.pointerY)
      : { x: p.x + Math.cos(p.angle) * 100, y: p.y + Math.sin(p.angle) * 100 };
    const wasDashReady = p.dashCooldown <= 0;
    p.update(dt, target, this.input.boost, this.input.takeDash(), this.sfx);
    if (wasDashReady && p.dashTimer > 0.3) {
      this.shake = Math.max(this.shake, 3);
      this.particles.bubbles(p.x - Math.cos(p.angle) * p.len * 0.5, p.y - Math.sin(p.angle) * p.len * 0.5, 8, 90, 5);
    }
    p.contain(WORLD_W, WORLD_H);
    if ((this.input.boost && p.speed > 60) || p.dashTimer > 0) {
      if (Math.random() < 0.5) {
        this.particles.bubbles(p.x - Math.cos(p.angle) * p.len * 0.5, p.y - Math.sin(p.angle) * p.len * 0.5, 1, 60, 3.5);
      }
    }

    // --- combo decay ---
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        if (this.frenzy) {
          this.frenzy = false;
          this.ui.setFrenzy(false);
        }
      }
    }

    // --- AI updates ---
    const ctx = { player: p, neighbors: this.fishes, worldW: WORLD_W, worldH: WORLD_H };
    for (const f of this.fishes) f.update(dt, ctx);
    for (const f of this.puffers) f.update(dt, ctx);
    for (const j of this.jellies) j.update(dt, ctx);
    for (const pu of this.powerups) pu.update(dt);
    if (this.shark) {
      this.shark.update(dt, ctx);
      if (!this.shark.alive) this.shark = null;
    }

    // golden fish sparkle trail + expiry
    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];
      if (f.isGold) {
        if (Math.random() < 0.35) this.particles.sparkle(f.x, f.y, 1, f.len * 0.3);
        if (f.ttl <= 0) {
          this.fishes.splice(i, 1);
          this._spawnFish();
        }
      }
    }
    this.powerups = this.powerups.filter((pu) => pu.alive);

    this._updateSwallows(dt);
    if (!this.running) {
      this._updateHud();
      return;
    }
    this._resolveEating(dt);
    this._resolveHazards(dt);
    if (!this.running) return;
    this._resolvePowerups();
    this._updateSpawnTimers(dt);
    this._updateHud();
  }

  // ------------------------------------------------------------ interactions
  // Eating is a three-beat move: SUCK (prey is dragged into the gaping maw),
  // CHOMP (jaws slam shut: hit-stop, camera kick, crunch) and GULP (a bulge
  // rolls down the belly while the gills flare and bubble).
  _beginSwallow(prey, kind) {
    const p = this.player;
    const rel = clamp(prey.len / p.len, 0.12, 1);
    const dur = kind === "shark" ? 0.34 : 0.12 + rel * 0.13;
    prey.swallowK = 0;
    this.swallows.push({ prey, kind, rel, t: 0, dur, ox: prey.x - p.x, oy: prey.y - p.y });
    p.suck = 1;
    p.mouthOpen = Math.max(p.mouthOpen, 0.9);
    this.sfx.suck(rel, dur);
    this.particles.suction(p.mouthX, p.mouthY, p.angle, p.len * (0.5 + rel * 0.4), 8 + Math.round(rel * 10));
  }

  _updateSwallows(dt) {
    const p = this.player;
    const a = p.angle;
    // aim just inside the lips
    const mx = Math.cos(a) * p.len * 0.34;
    const my = Math.sin(a) * p.len * 0.34;
    for (let i = this.swallows.length - 1; i >= 0; i--) {
      const s = this.swallows[i];
      s.t = Math.min(1, s.t + dt / s.dur);
      const k = s.t * s.t; // accelerating pull
      const f = s.prey;
      f.x = p.x + lerp(s.ox, mx, k);
      f.y = p.y + lerp(s.oy, my, k);
      f.angle = turnToward(f.angle, a + Math.PI, dt * 12); // head-first
      f.phase += dt * 30; // frantic wriggle
      f.speed = 0;
      f.swallowK = s.t;
      if (f.inflate != null) f.inflate = damp(f.inflate, 0, 10, dt);
      if (s.t >= 1) {
        this.swallows.splice(i, 1);
        this._finishSwallow(s);
        // A winning bite ends the frame; other meals resume in endless mode.
        if (!this.running) break;
      }
    }
    p.suck = this.swallows.length > 0 ? 1 : 0;
  }

  _finishSwallow(s) {
    const p = this.player;
    const { prey, kind, rel } = s;
    const mx = p.mouthX;
    const my = p.mouthY;

    // CHOMP
    p.chomp = 1;
    p.mouthOpen = 0;
    p.gulpT = 0;
    p.gulpSize = rel;
    p.flash = 0.35;

    let colors = ["#dfe9ef", "#ffffff"];
    let heavy = rel > 0.55;
    if (kind === "fish") {
      heavy = heavy || prey.isGold;
      colors = [prey.spec.body[1][1], prey.spec.body[prey.spec.body.length - 1][1], "#ffffff"];
      this._eatFish(prey, mx, my);
    } else if (kind === "puffer") {
      heavy = true;
      colors = ["#c9a466", "#efe2c0", "#8b6a3a"];
      this._eatPuffer(prey, mx, my);
    } else {
      heavy = true;
      colors = ["#66737e", "#e9edf0", "#46525d"];
      this._eatShark(prey, mx, my);
    }

    this.hitstop = Math.max(this.hitstop, heavy ? 0.07 + rel * 0.05 : rel > 0.3 ? 0.035 : 0);
    this.zoomPunch = Math.max(this.zoomPunch, 0.03 + rel * 0.05 + (kind === "shark" ? 0.06 : 0));
    this.shake = Math.max(this.shake, 2.5 + rel * 6 + (heavy ? 4 : 0));
    this.particles.ring(mx, my, p.len * (0.1 + rel * 0.12), "rgba(230,250,255,0.9)", 0.3, 2 + rel * 4);
    this.particles.flakes(mx, my, p.angle, 6 + Math.round(rel * 16), colors, 90 + p.len * 0.9, Math.max(2, prey.len * 0.035));
    // bubbles vented from the gills
    const gx = p.x + Math.cos(p.angle) * p.len * 0.2;
    const gy = p.y + Math.sin(p.angle) * p.len * 0.2;
    this.particles.bubbles(gx, gy, 4 + Math.round(rel * 8), 70 + p.len * 0.3, 2.5 + p.len * 0.025);

    this.sfx.chomp(rel, this.combo);
    this.sfx.gulp(rel, 0.07 + rel * 0.05);
    if (heavy) this.sfx.boom(kind === "fish" ? 0.6 : 1);
    this.sfx.reward(this.combo);
  }

  _eatFish(f, x, y) {
    const p = this.player;
    this.eaten++;

    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    const mult = Math.min(this.combo, 10);
    if (!this.frenzy && this.combo >= FRENZY_COMBO) {
      this.frenzy = true;
      this.ui.setFrenzy(true);
      this.sfx.frenzy();
      this.particles.ring(p.x, p.y, p.len, "rgba(255,180,60,0.9)");
    }

    let growth = f.len * 0.08;
    let points = Math.ceil(f.len / 6) * mult;
    if (this.frenzy) {
      growth *= 1.4;
      points *= 2;
    }
    if (p.boltPower > 0) points *= 2;
    if (f.isGold) {
      growth *= 5;
      points *= 5;
      this.particles.sparkle(x, y, 22, f.len * 0.6);
      this.ui.toast("✨ 吃到黄金鱼！");
    }

    p.grow(growth);
    this.score += points;

    const color = f.isGold ? "#ffd700" : "#aef2ff";
    if (f.isGold) this.particles.burst(x, y, "rgba(255,215,60,0.9)", 14, 150, f.len * 0.08 + 3);
    this.particles.text(x, y - p.len * 0.3, mult > 1 ? `+${points} x${mult}` : `+${points}`, { color, size: clamp(16 + mult * 2, 18, 34) });

    this._spawnFish();
    this._checkLevelUp();
  }

  _eatPuffer(f, x, y) {
    const p = this.player;
    const points = Math.ceil(f.len / 3) * Math.min(this.combo + 1, 10);
    this.score += points;
    this.eaten++;
    p.grow(f.len * 0.12);
    this.particles.burst(x, y, "rgba(245,215,140,0.9)", 16, 180, 6);
    this.particles.text(x, y - p.len * 0.4, `河豚大餐 +${points}`, { color: "#ffe9a8", size: 26 });
    this._spawnPuffer();
    this._checkLevelUp();
  }

  _eatShark(s, x, y) {
    const p = this.player;
    const points = 2000;
    this.score += points;
    this.eaten++;
    p.grow(s.len * 0.1);
    this.particles.burst(x, y, "rgba(180,200,220,0.95)", 30, 260, 9);
    this.particles.text(x, y - p.len * 0.5, `吞掉鲨鱼！+${points}`, { color: "#ff8a8a", size: 36 });
    this.ui.toast("🏆 你吃掉了鲨鱼！");
    this._checkLevelUp();
  }

  _checkLevelUp() {
    const p = this.player;
    let newLevel = this.level;
    while (newLevel + 1 < LEVELS.length && p.len >= LEVELS[newLevel + 1].len) newLevel++;
    if (newLevel === this.level) {
      this.ui.setLevel(this.level, LEVELS, p.len);
      return;
    }
    this.level = newLevel;
    this.sfx.levelUp();
    this.particles.ring(p.x, p.y, p.len * 1.2, "rgba(140,255,200,0.9)");
    this.particles.text(p.x, p.y - p.len * 0.6, `进化：${LEVELS[this.level].name}！`, { color: "#9dffcf", size: 30 });
    if (this.lives < 3) {
      this.lives++;
      this.ui.setLives(this.lives);
      this.ui.toast("❤️ 生命 +1");
    }
    this.ui.setLevel(this.level, LEVELS, p.len);

    if (this.level === LEVELS.length - 1 && !this.won) {
      this.won = true;
      this.running = false;
      this.sfx.win();
      this.ui.showWin({ score: this.score, eaten: this.eaten, len: p.len });
    }
  }

  _resolveEating(dt) {
    const p = this.player;
    if (p.stunned > 0) {
      p.mouthOpen = damp(p.mouthOpen, p.suck > 0 ? 1.25 : 0, 8, dt);
      return;
    }

    // open mouth when an edible fish is near the snout
    let nearestEdible = Infinity;

    // regular + gold fish
    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];
      const canEat = p.len > f.len * EAT_RATIO;
      const d = Math.hypot(f.x - p.mouthX, f.y - p.mouthY);
      if (canEat) {
        nearestEdible = Math.min(nearestEdible, d - f.r);
        // suction reaches a little ahead of the lips
        if (d < f.r + p.len * 0.18) {
          this.fishes.splice(i, 1);
          this._beginSwallow(f, "fish");
        }
      }
    }

    // puffer fish
    for (let i = this.puffers.length - 1; i >= 0; i--) {
      const f = this.puffers[i];
      const d = Math.hypot(f.x - p.mouthX, f.y - p.mouthY);
      const touching = d < f.r + p.len * 0.15;
      if (!touching) continue;
      if (f.inflated && p.starPower <= 0) {
        // spiky! bounce off and lose your rhythm
        const a = Math.atan2(p.y - f.y, p.x - f.x);
        p.x += Math.cos(a) * 60;
        p.y += Math.sin(a) * 60;
        p.stunned = Math.max(p.stunned, 0.7);
        p.shrink(0.97);
        this._checkLevelUpDown();
        this.combo = 0;
        this.comboTimer = 0;
        if (this.frenzy) {
          this.frenzy = false;
          this.ui.setFrenzy(false);
        }
        this.sfx.sting();
        this.shake = Math.max(this.shake, 7);
        this.hurtFlash = Math.max(this.hurtFlash, 0.4);
        this.particles.ring(f.x, f.y, f.r, "rgba(255,170,60,0.9)");
        this.particles.text(p.x, p.y - p.len * 0.5, "被刺到了！", { color: "#ffb45e", size: 22 });
      } else if (p.len > f.len * EAT_RATIO) {
        this.puffers.splice(i, 1);
        this._beginSwallow(f, "puffer");
      }
    }

    // shark: at max sizes the tables turn
    if (this.shark) {
      const s = this.shark;
      const d = Math.hypot(s.x - p.mouthX, s.y - p.mouthY);
      if (p.len > s.len * EAT_RATIO && d < s.r + p.len * 0.15) {
        this.shark = null;
        this._beginSwallow(s, "shark");
      }
    }

    // jaws gape wider the closer the meal; forced wide open while sucking
    if (p.suck > 0) {
      p.mouthOpen = damp(p.mouthOpen, 1.25, 22, dt);
    } else {
      const openTarget = nearestEdible < p.len * 1.1 ? clamp(1.25 - nearestEdible / (p.len * 1.4), 0.45, 1) : 0;
      p.mouthOpen = damp(p.mouthOpen, openTarget, 9, dt);
    }
  }

  _resolveHazards(dt) {
    const p = this.player;

    // jellyfish sting
    for (const j of this.jellies) {
      const d = Math.hypot(j.x - p.x, j.y - p.y);
      if (d < j.r + p.r * 0.7 && p.invincible <= 0 && p.starPower <= 0) {
        const a = Math.atan2(p.y - j.y, p.x - j.x);
        p.x += Math.cos(a) * 90;
        p.y += Math.sin(a) * 90;
        p.stunned = Math.max(p.stunned, 1.1);
        p.invincible = Math.max(p.invincible, 1.6);
        p.shrink(0.96);
        this._checkLevelUpDown();
        this.combo = 0;
        this.comboTimer = 0;
        if (this.frenzy) {
          this.frenzy = false;
          this.ui.setFrenzy(false);
        }
        this.sfx.sting();
        this.shake = Math.max(this.shake, 8);
        this.hurtFlash = Math.max(this.hurtFlash, 0.5);
        this.particles.burst(p.x, p.y, "rgba(220,140,255,0.9)", 14, 160, 5);
        this.particles.text(p.x, p.y - p.len * 0.5, "⚡ 被水母蜇了！", { color: "#e8a8ff", size: 24 });
      }
    }

    // getting eaten by bigger fish / the shark
    if (p.invincible > 0 || p.starPower > 0) return;
    const threats = this.shark ? [...this.fishes, this.shark] : this.fishes;
    for (const t of threats) {
      if (t.len <= p.len * EAT_RATIO) continue;
      const d = Math.hypot(p.x - t.mouthX, p.y - t.mouthY);
      if (d < p.r + t.len * 0.1) {
        this._playerHit(t);
        return;
      }
    }
  }

  _playerHit(threat) {
    const p = this.player;
    this.lives--;
    this.ui.setLives(this.lives);
    this.combo = 0;
    this.comboTimer = 0;
    if (this.frenzy) {
      this.frenzy = false;
      this.ui.setFrenzy(false);
    }
    this.shake = 14;
    this.hurtFlash = 1;
    this.sfx.hurt();
    this.particles.burst(p.x, p.y, "rgba(255,120,110,0.9)", 22, 220, 7);

    if (this.lives <= 0) {
      this.running = false;
      this.sfx.lose();
      this.ui.showGameOver({ score: this.score, eaten: this.eaten, len: p.len, levelName: LEVELS[this.level].name });
      return;
    }

    // escape the jaws: knockback, brief invincibility, slight shrink
    const a = Math.atan2(p.y - threat.y, p.x - threat.x);
    p.x += Math.cos(a) * (threat.len * 0.8 + 120);
    p.y += Math.sin(a) * (threat.len * 0.5 + 80);
    p.contain(WORLD_W, WORLD_H);
    p.invincible = 2.6;
    p.stunned = 0.4;
    p.shrink(0.9);
    this._checkLevelUpDown();
    this.particles.text(p.x, p.y - p.len, "危险！快逃！", { color: "#ff9d9d", size: 26 });
    this.ui.warn(`💔 被咬了！剩余生命 ${this.lives}`, 2.2);
  }

  _checkLevelUpDown() {
    // shrinking can drop you a level
    let lv = 0;
    while (lv + 1 < LEVELS.length && this.player.len >= LEVELS[lv + 1].len) lv++;
    if (lv !== this.level) {
      this.level = lv;
      this.ui.setLevel(this.level, LEVELS, this.player.len);
    }
  }

  _resolvePowerups() {
    const p = this.player;
    for (const pu of this.powerups) {
      const d = Math.hypot(pu.x - p.x, pu.y - p.y);
      if (d > pu.r + p.r) continue;
      pu.alive = false;
      this.sfx.powerup();
      this.particles.ring(pu.x, pu.y, pu.r, "rgba(160,235,255,0.95)");
      this.particles.burst(pu.x, pu.y, "rgba(200,245,255,0.9)", 12, 140, 4);
      if (pu.type === "star") {
        p.starPower = 8;
        this.ui.toast("⭐ 无敌！大鱼也怕你！");
      } else if (pu.type === "magnet") {
        p.magnetPower = 8;
        this.ui.toast("🧲 磁力！小鱼自动上门！");
      } else {
        p.boltPower = 8;
        this.ui.toast("⚡ 狂暴！极速 + 双倍分数！");
      }
    }
    this.powerups = this.powerups.filter((pu) => pu.alive);
  }

  _updateSpawnTimers(dt) {
    this.goldTimer -= dt;
    if (this.goldTimer <= 0) {
      this.goldTimer = randRange(18, 30);
      this._spawnGold();
    }
    this.powerupTimer -= dt;
    if (this.powerupTimer <= 0) {
      this.powerupTimer = randRange(15, 24);
      this._spawnPowerup();
    }
    if (!this.shark && this.level >= 2) {
      this.sharkTimer -= dt;
      if (this.sharkTimer <= 0) {
        this.sharkTimer = randRange(35, 55);
        this._spawnShark();
      }
    }
  }

  _updateHud() {
    const p = this.player;
    let danger = false;
    const threats = this.shark ? [...this.fishes, this.shark] : this.fishes;
    for (const t of threats) {
      if (t.len > p.len * EAT_RATIO && Math.hypot(t.x - p.x, t.y - p.y) < 460 + t.len) {
        danger = true;
        break;
      }
    }
    this.ui.updateHud({
      score: this.score,
      combo: this.combo,
      comboT: this.comboTimer / COMBO_WINDOW,
      danger: danger && p.starPower <= 0,
      dash: p.dashReadiness,
      len: p.len,
      powers: { star: p.starPower, magnet: p.magnetPower, bolt: p.boltPower },
    });
    this.ui.setLevel(this.level, LEVELS, p.len);
  }

  // ------------------------------------------------------------------ camera
  _targetZoom() {
    const minZoom = Math.max(this.W / WORLD_W, this.H / WORLD_H, 0.4);
    return clamp(90 / this.player.len, minZoom, 1.15);
  }

  _updateCamera(dt) {
    if (!this.player) return;
    const p = this.player;
    this.cam.zoom = damp(this.cam.zoom, this._targetZoom(), 1.6, dt);

    // lead slightly ahead of the swim direction
    const lead = Math.min(120, p.speed * 0.35);
    const tx = p.x + Math.cos(p.angle) * lead;
    const ty = p.y + Math.sin(p.angle) * lead;
    this.cam.x = damp(this.cam.x, tx, 3.2, dt);
    this.cam.y = damp(this.cam.y, ty, 3.2, dt);

    const hw = this.W / (2 * this.cam.zoom);
    const hh = this.H / (2 * this.cam.zoom);
    this.cam.x = clamp(this.cam.x, Math.min(hw, WORLD_W / 2), Math.max(WORLD_W - hw, WORLD_W / 2));
    this.cam.y = clamp(this.cam.y, Math.min(hh, WORLD_H / 2), Math.max(WORLD_H - hh, WORLD_H / 2));

    this.shake = Math.max(0, this.shake - dt * 26);
    this.zoomPunch = damp(this.zoomPunch, 0, 9, dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
  }

  _applyCamera(ctx, parallax = 1) {
    const zoom = this.zoom;
    const shakeX = this.shake > 0 ? this._shakeX : 0;
    const shakeY = this.shake > 0 ? this._shakeY : 0;
    // anchor far layers so they stay inside the world while moving slower
    const cx = this.cam.x * parallax + (WORLD_W / 2) * (1 - parallax);
    const cy = this.cam.y * parallax + WORLD_H * (1 - parallax) * 0.9;
    ctx.setTransform(
      this.dpr * zoom, 0, 0, this.dpr * zoom,
      this.dpr * (this.W / 2 - cx * zoom + shakeX * parallax),
      this.dpr * (this.H / 2 - cy * zoom + shakeY * parallax)
    );
  }

  // ------------------------------------------------------------------ draw
  _draw() {
    const ctx = this.ctx;
    const bg = this.background;
    const zoom = this.zoom;
    this._shakeX = randRange(-this.shake, this.shake);
    this._shakeY = randRange(-this.shake, this.shake);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1. water column (screen space)
    bg.drawWater(ctx, this.W, this.H, this.cam);

    // 2. parallax: hazy far reef + schools, then darker mid pinnacles
    this._applyCamera(ctx, 0.35);
    bg.drawFar(ctx, this.time);
    this._applyCamera(ctx, 0.65);
    bg.drawMid(ctx, this.time);

    // 3. world layer
    this._applyCamera(ctx, 1);
    const worldM = ctx.getTransform();
    const view = {
      left: this.cam.x - this.W / (2 * zoom) - 60,
      right: this.cam.x + this.W / (2 * zoom) + 60,
      top: this.cam.y - this.H / (2 * zoom) - 60,
      bottom: this.cam.y + this.H / (2 * zoom) + 60,
    };
    bg.drawWorld(ctx, this.time, view);

    if (this.player) {
      // caustic light rippling over fish backs, strongest near the surface
      const depth = clamp(this.cam.y / WORLD_H, 0, 1);
      setFishLighting(bg.patterns(ctx).caustic2, worldM, bg.causticMatrix(this.time, 1), 0.28 * (1 - depth) + 0.04);

      const inView = (f) => !(f.x + f.len < view.left || f.x - f.len > view.right || f.y + f.len < view.top || f.y - f.len > view.bottom);
      const sorted = [...this.fishes].sort((a, b) => a.len - b.len);

      // contact shadows on the sand
      for (const f of sorted) if (inView(f)) bg.drawShadow(ctx, f.x, f.y, f.len);
      for (const f of this.puffers) bg.drawShadow(ctx, f.x, f.y, f.len);
      if (this.shark) bg.drawShadow(ctx, this.shark.x, this.shark.y, this.shark.len);
      bg.drawShadow(ctx, this.player.x, this.player.y, this.player.len);

      for (const pu of this.powerups) pu.draw(ctx);

      // small fish first so bigger ones overlap them
      for (const f of sorted) if (inView(f)) f.draw(ctx);
      for (const f of this.puffers) f.draw(ctx);
      if (this.shark) this.shark.draw(ctx);

      // magnet field hint
      if (this.player.magnetPower > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,120,120,${0.25 + Math.sin(this.time * 6) * 0.1})`;
        ctx.setLineDash([14, 12]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y, 560, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      // prey being swallowed is painted inside the open maw (over the throat, under the jaws)
      const inMouth = this.swallows.length
        ? (c) => {
            c.save();
            c.setTransform(worldM);
            c.globalAlpha = 1;
            for (const s of this.swallows) s.prey.draw(c);
            c.restore();
          }
        : null;
      this.player.draw(ctx, this.time, inMouth);
      for (const j of this.jellies) j.draw(ctx);
      this.particles.draw(ctx);
    }

    // 4. screen-space water volume: god rays, marine snow, light falloff
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    bg.drawRays(ctx, this.W, this.H, this.cam, this.time);
    bg.drawSnow(ctx, this.W, this.H, this.cam);
    bg.drawLight(ctx, this.W, this.H, this.cam);

    if (this.player) {
      this._applyCamera(ctx, 1);
      this.particles.drawTexts(ctx, zoom);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    // 5. overlays
    this._drawVignette(ctx);
    if (this.frenzy) {
      const a = 0.12 + Math.sin(this.time * 7) * 0.05;
      const g = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.32, this.W / 2, this.H / 2, this.H * 0.75);
      g.addColorStop(0, "rgba(255,150,40,0)");
      g.addColorStop(1, `rgba(255,140,30,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,40,40,${this.hurtFlash * 0.28})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    if (this.player && this.running) this._drawMinimap(ctx);
  }

  _drawVignette(ctx) {
    const g = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.45, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
    g.addColorStop(0, "rgba(0,10,25,0)");
    g.addColorStop(1, "rgba(0,8,22,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  _drawMinimap(ctx) {
    const mw = 168;
    const mh = mw * (WORLD_H / WORLD_W);
    const mx = this.W - mw - 18;
    const my = this.H - mh - 18;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(4,26,44,0.62)";
    ctx.strokeStyle = "rgba(140,220,255,0.35)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, mx, my, mw, mh, 8);
    ctx.fill();
    ctx.stroke();

    const px = (x) => mx + (x / WORLD_W) * mw;
    const py = (y) => my + (y / WORLD_H) * mh;

    for (const f of this.fishes) {
      if (f.isGold) {
        ctx.fillStyle = "#ffd700";
      } else if (f.len > this.player.len * EAT_RATIO) {
        ctx.fillStyle = "rgba(255,105,95,0.95)";
      } else {
        ctx.fillStyle = "rgba(150,210,235,0.55)";
      }
      ctx.fillRect(px(f.x) - 1.5, py(f.y) - 1.5, 3, 3);
    }
    ctx.fillStyle = "#c792ff";
    for (const j of this.jellies) ctx.fillRect(px(j.x) - 1.5, py(j.y) - 1.5, 3, 3);
    ctx.fillStyle = "#7df9ff";
    for (const pu of this.powerups) {
      ctx.beginPath();
      ctx.arc(px(pu.x), py(pu.y), 3, 0, TAU);
      ctx.fill();
    }
    if (this.shark) {
      ctx.fillStyle = "#ff5d5d";
      ctx.beginPath();
      ctx.arc(px(this.shark.x), py(this.shark.y), 4.5, 0, TAU);
      ctx.fill();
    }
    // player blip
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(px(this.player.x), py(this.player.y), 3.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px(this.player.x), py(this.player.y), 6 + Math.sin(this.time * 4) * 2, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // Continue after winning: endless mode with more sharks.
  continueEndless() {
    this.endless = true;
    this.running = true;
    this.sharkTimer = randRange(12, 20);
    this.ui.showPlaying();
    this.ui.toast("🌊 无尽畅游模式 — 海洋任你遨游！");
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
