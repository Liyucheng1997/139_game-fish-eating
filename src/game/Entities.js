import { clamp, damp, randRange, turnToward, angleDiff, TAU } from "./utils.js";
import { drawFish, drawPuffer, drawJellyfish, drawPowerUp, speciesForLen, PLAYER_SPEC, GOLD_SPEC, SHARK_SPEC } from "./FishArt.js";

export const EAT_RATIO = 1.12; // predator must be this many times longer than prey

const smoothFade = (k) => {
  const t = clamp((k - 0.72) / 0.28, 0, 1);
  return t * t * (3 - 2 * t);
};

let nextId = 1;

// ---------------------------------------------------------------------------
class BaseFish {
  constructor(x, y, len) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.len = len;
    this.displayLen = len;
    this.angle = randRange(0, TAU);
    this.speed = 0;
    this.phase = Math.random() * TAU;
    this.alive = true;
    this.mouthOpen = 0;
    this.turn = 0; // smoothed angular velocity → body bend
    this.swallowK = -1; // 0..1 while being sucked into a predator's mouth
  }

  get bend() {
    const flip = Math.cos(this.angle) < 0 ? -1 : 1;
    return clamp(this.turn * 0.22, -0.8, 0.8) * flip;
  }

  // Collision "body radius" — roughly half the body height.
  get r() {
    return this.len * 0.2;
  }

  get mouthX() {
    return this.x + Math.cos(this.angle) * this.len * 0.42;
  }
  get mouthY() {
    return this.y + Math.sin(this.angle) * this.len * 0.42;
  }

  cruiseSpeed() {
    return 85 * Math.pow(this.len / 60, 0.3);
  }

  _step(dt, targetAngle, targetSpeed, turnRate) {
    const prev = this.angle;
    this.angle = turnToward(this.angle, targetAngle, turnRate * dt);
    if (dt > 0) this.turn = damp(this.turn, angleDiff(prev, this.angle) / dt, 6, dt);
    this.speed = damp(this.speed, targetSpeed, 3.2, dt);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    // tail beat frequency follows swim effort
    this.phase += dt * (3 + (this.speed / Math.max(1, this.cruiseSpeed())) * 6);
    this.displayLen = damp(this.displayLen, this.len, 4, dt);
  }

  contain(worldW, worldH) {
    const m = this.len * 0.4 + 20;
    this.x = clamp(this.x, m, worldW - m);
    this.y = clamp(this.y, 90 + m * 0.4, worldH - 70 - m * 0.4);
  }

  drawTransformed(ctx, painter) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (this.swallowK >= 0) {
      // stretched toward the maw, shrinking and fading as it disappears
      const k = this.swallowK;
      const s = 1 - 0.55 * k * k;
      ctx.scale(s * (1 + 0.45 * k), s * (1 - 0.3 * k));
      ctx.globalAlpha *= 1 - smoothFade(k);
    }
    if (Math.cos(this.angle) < 0) ctx.scale(1, -1); // keep the fish upright
    painter(ctx);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
export class PlayerFish extends BaseFish {
  constructor(x, y, len = 60) {
    super(x, y, len);
    this.angle = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.invincible = 0; // respawn / star power
    this.stunned = 0;
    this.flash = 0;
    this.starPower = 0;
    this.boltPower = 0;
    this.magnetPower = 0;
    this.chomp = 0; // 1 → 0 snap-shut squash
    this.gulpT = -1; // 0..1 bulge travelling down the belly
    this.gulpSize = 0.5;
    this.suck = 0; // >0 while something is being sucked in: jaws forced wide
  }

  get dashCooldownMax() {
    return this.boltPower > 0 ? 0.45 : 2.0;
  }

  maxSpeed() {
    return 265 * Math.pow(this.len / 60, 0.18);
  }

  grow(amount) {
    this.len += amount;
  }

  shrink(factor) {
    this.len = Math.max(40, this.len * factor);
  }

  update(dt, target, boost, dashPressed, sfx) {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.starPower = Math.max(0, this.starPower - dt);
    this.boltPower = Math.max(0, this.boltPower - dt);
    this.magnetPower = Math.max(0, this.magnetPower - dt);
    this.chomp = Math.max(0, this.chomp - dt * 4.5);
    if (this.gulpT >= 0) {
      this.gulpT += dt / (0.45 + this.gulpSize * 0.25);
      if (this.gulpT > 1) this.gulpT = -1;
    }

    if (dashPressed && this.dashCooldown <= 0 && this.stunned <= 0) {
      this.dashTimer = 0.32;
      this.dashCooldown = this.dashCooldownMax;
      if (sfx) sfx.dash();
    }
    const dashing = this.dashTimer > 0;
    if (dashing) this.dashTimer = Math.max(0, this.dashTimer - dt);

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const targetAngle = dist > 2 ? Math.atan2(dy, dx) : this.angle;

    let speedMult = boost ? 1.0 : 0.62;
    if (this.boltPower > 0) speedMult *= 1.35;
    let targetSpeed = clamp(dist * 2.6, 0, this.maxSpeed() * speedMult);
    if (dashing) targetSpeed = this.maxSpeed() * 2.1;
    if (this.stunned > 0) targetSpeed *= 0.15;

    // committed lunge: harder to steer mid-dash
    const turnRate = (dashing ? 3.2 : 7.5) * (this.stunned > 0 ? 0.3 : 1) / (0.75 + 0.25 * Math.sqrt(this.len / 60));
    this._step(dt, targetAngle, targetSpeed, turnRate);
    if (dashing) {
      // dash keeps its burst speed rather than damping toward it
      this.speed = this.maxSpeed() * 2.1;
    }
  }

  get dashReadiness() {
    return this.dashCooldown <= 0 ? 1 : 1 - this.dashCooldown / this.dashCooldownMax;
  }

  draw(ctx, time, inMouth = null) {
    const blink = this.invincible > 0 && this.starPower <= 0 && Math.sin(time * 18) > 0;
    const glow = this.starPower > 0 ? "rgba(255,225,90,0.95)" : this.boltPower > 0 ? "rgba(110,240,255,0.9)" : null;
    this.drawTransformed(ctx, (c) => {
      drawFish(c, PLAYER_SPEC, this.displayLen, {
        phase: this.phase,
        swim: clamp(this.speed / this.maxSpeed(), 0.25, 1.4),
        mouthOpen: this.mouthOpen,
        alpha: blink ? 0.35 : 1,
        glow,
        flash: this.flash,
        bend: this.bend,
        chomp: this.chomp,
        gulp: this.gulpT,
        gulpSize: this.gulpSize,
        inMouth,
      });
    });
    if (this.starPower > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255,220,90,${0.35 + Math.sin(time * 8) * 0.15})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.displayLen * 0.62 + Math.sin(time * 5) * 4, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
export class AIFish extends BaseFish {
  constructor(x, y, len, opts = {}) {
    super(x, y, len);
    this.spec = opts.spec || speciesForLen(len);
    this.isGold = !!opts.gold;
    if (this.isGold) this.spec = GOLD_SPEC;
    this.aggression = randRange(0.15, 0.9);
    this.wanderX = x;
    this.wanderY = y;
    this.wanderTimer = 0;
    this.state = "wander";
    this.ttl = opts.ttl || Infinity; // golden fish are fleeting
  }

  update(dt, ctx) {
    const { player, neighbors, worldW, worldH } = ctx;
    this.ttl -= dt;

    let dx = 0;
    let dy = 0;
    let scared = false;
    let hungry = false;

    // 1. soft-avoid world edges
    const margin = 260;
    if (this.x < margin) dx += (margin - this.x) / margin * 2.4;
    if (this.x > worldW - margin) dx -= (this.x - (worldW - margin)) / margin * 2.4;
    if (this.y < margin) dy += (margin - this.y) / margin * 2.4;
    if (this.y > worldH - margin) dy -= (this.y - (worldH - margin)) / margin * 2.4;

    // 2. react to the player
    if (player && player.alive) {
      const px = player.x - this.x;
      const py = player.y - this.y;
      const d = Math.hypot(px, py) || 1;
      const fleeRange = 190 + player.len * 1.2;
      const huntRange = 320 + this.len * 1.4;

      const pulled = player.magnetPower > 0 && player.len > this.len * EAT_RATIO && d < 560;
      if (pulled) {
        // magnet: edible fish get dragged toward the player's mouth
        this.x += (px / d) * 340 * dt;
        this.y += (py / d) * 340 * dt;
      } else if (this.len * EAT_RATIO < player.len && d < fleeRange && player.starPower <= 0) {
        const w = clamp(1 - d / fleeRange, 0, 1) * (this.isGold ? 3.4 : 2.4);
        dx -= (px / d) * w;
        dy -= (py / d) * w;
        scared = w > 0.2;
      } else if (this.len > player.len * EAT_RATIO && this.aggression > 0.35 && d < huntRange && player.starPower <= 0) {
        const w = clamp(1 - d / huntRange, 0, 1) * this.aggression * 1.6;
        dx += (px / d) * w;
        dy += (py / d) * w;
        hungry = w > 0.25;
      } else if (player.starPower > 0 && d < 420) {
        // everyone fears the star
        dx -= (px / d) * 2;
        dy -= (py / d) * 2;
        scared = true;
      }
    }

    // 3. separation from neighbors
    if (neighbors) {
      for (const o of neighbors) {
        if (o === this) continue;
        const ox = this.x - o.x;
        const oy = this.y - o.y;
        const d = Math.hypot(ox, oy);
        const min = this.r + o.r + 26;
        if (d < min && d > 0.001) {
          const w = ((min - d) / min) * 1.15;
          dx += (ox / d) * w;
          dy += (oy / d) * w;
        }
      }
    }

    // 4. lazy wander
    this.wanderTimer -= dt;
    const wd = Math.hypot(this.wanderX - this.x, this.wanderY - this.y);
    if (this.wanderTimer <= 0 || wd < 80) {
      this.wanderTimer = randRange(3, 7);
      this.wanderX = clamp(this.x + randRange(-900, 900), 150, worldW - 150);
      this.wanderY = clamp(this.y + randRange(-500, 500), 160, worldH - 160);
    }
    const wdx = this.wanderX - this.x;
    const wdy = this.wanderY - this.y;
    const wl = Math.hypot(wdx, wdy) || 1;
    dx += (wdx / wl) * 0.5;
    dy += (wdy / wl) * 0.5;

    this.state = scared ? "flee" : hungry ? "hunt" : "wander";

    const mag = Math.hypot(dx, dy);
    const targetAngle = mag > 0.001 ? Math.atan2(dy, dx) : this.angle;

    let targetSpeed = this.cruiseSpeed() * 0.7;
    if (scared) {
      // small fry are weak swimmers — tiny prey stays catchable without boost
      const ratio = ctx.player ? clamp(this.len / ctx.player.len, 0.2, 1) : 1;
      targetSpeed = this.cruiseSpeed() * (0.6 + ratio * 1.15) * (this.isGold ? 1.5 : 1);
    } else if (hungry) {
      const d = ctx.player ? Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) : Infinity;
      targetSpeed = this.cruiseSpeed() * (d < this.len * 1.6 ? 1.9 : 1.45);
      this.mouthOpen = damp(this.mouthOpen, d < this.len * 2.2 ? 1 : 0, 6, dt);
    }
    if (!hungry) this.mouthOpen = damp(this.mouthOpen, 0, 6, dt);

    const turnRate = (2.6 + (scared ? 1.4 : 0)) / (0.6 + 0.4 * Math.sqrt(this.len / 60));
    this._step(dt, targetAngle, targetSpeed, turnRate);
    this.contain(ctx.worldW, ctx.worldH);
  }

  draw(ctx) {
    this.drawTransformed(ctx, (c) => {
      drawFish(c, this.spec, this.displayLen, {
        phase: this.phase,
        swim: clamp(this.speed / this.cruiseSpeed(), 0.3, 1.5),
        mouthOpen: this.mouthOpen,
        bend: this.bend,
        glow: this.isGold ? GOLD_SPEC.glow : null,
        alpha: this.isGold && this.ttl < 3 ? 0.4 + Math.sin(this.ttl * 10) * 0.3 : 1,
      });
    });
  }
}

// ---------------------------------------------------------------------------
export class PufferFish extends BaseFish {
  constructor(x, y, len) {
    super(x, y, len);
    this.inflate = 0; // 0 deflated .. 1 fully inflated
    this.wanderX = x;
    this.wanderY = y;
    this.wanderTimer = 0;
  }

  get r() {
    return this.len * (0.3 + this.inflate * 0.3);
  }

  get inflated() {
    return this.inflate > 0.5;
  }

  update(dt, ctx) {
    const { player, worldW, worldH } = ctx;

    // inflate when a bigger player gets close
    let threatened = false;
    if (player && player.alive && player.len > this.len * 0.9) {
      const d = Math.hypot(player.x - this.x, player.y - this.y);
      threatened = d < 240 + player.len * 0.8;
    }
    this.inflate = damp(this.inflate, threatened ? 1 : 0, threatened ? 9 : 2.2, dt);

    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = randRange(4, 8);
      this.wanderX = clamp(this.x + randRange(-500, 500), 200, worldW - 200);
      this.wanderY = clamp(this.y + randRange(-300, 300), 200, worldH - 200);
    }
    const dx = this.wanderX - this.x;
    const dy = this.wanderY - this.y;
    const targetAngle = Math.atan2(dy, dx);
    const targetSpeed = this.cruiseSpeed() * (this.inflated ? 0.2 : 0.45);
    this._step(dt, targetAngle, targetSpeed, 1.6);
    this.contain(worldW, worldH);
  }

  draw(ctx) {
    this.drawTransformed(ctx, (c) => {
      drawPuffer(c, this.displayLen, { phase: this.phase, inflate: this.inflate });
    });
  }
}

// ---------------------------------------------------------------------------
export class Jellyfish {
  constructor(x, y, len) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.len = len;
    this.phase = Math.random() * TAU;
    this.driftA = Math.random() * TAU;
    this.alive = true;
  }

  get r() {
    return this.len * 0.42;
  }

  update(dt, ctx) {
    this.phase += dt * 1.5;
    this.driftA += dt * 0.14;
    // pulse upward, sink slowly, drift sideways
    this.y += (Math.sin(this.phase * 1.6) * -34 + 12) * dt;
    this.x += Math.cos(this.driftA) * 26 * dt;
    this.x = clamp(this.x, 120, ctx.worldW - 120);
    this.y = clamp(this.y, 180, ctx.worldH - 200);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    drawJellyfish(ctx, this.len, { phase: this.phase });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
export class Shark extends BaseFish {
  constructor(x, y, len) {
    super(x, y, len);
    this.ttl = 26; // leaves the area after a while
    this.leaving = false;
  }

  cruiseSpeed() {
    return 120 * Math.pow(this.len / 60, 0.18);
  }

  update(dt, ctx) {
    const { player, worldW, worldH } = ctx;
    this.ttl -= dt;
    if (this.ttl <= 0) this.leaving = true;

    let targetAngle = this.angle;
    let targetSpeed = this.cruiseSpeed();

    if (this.leaving) {
      // swim off toward the nearest horizontal edge
      targetAngle = this.x < worldW / 2 ? Math.PI : 0;
      targetSpeed = this.cruiseSpeed() * 1.5;
      if (this.x < -400 || this.x > worldW + 400) this.alive = false;
    } else if (player && player.alive) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      if (player.len > this.len * EAT_RATIO || player.starPower > 0) {
        // the hunter becomes the hunted
        targetAngle = Math.atan2(-dy, -dx);
        targetSpeed = this.cruiseSpeed() * 1.4;
      } else {
        targetAngle = Math.atan2(dy, dx);
        targetSpeed = this.cruiseSpeed() * (d < 500 ? 1.75 : 1.25);
        this.mouthOpen = damp(this.mouthOpen, d < this.len * 2.4 ? 1 : 0.1, 5, dt);
      }
    }

    // sharks turn slowly — dodging sideways works
    this._step(dt, targetAngle, targetSpeed, 1.35);
    if (!this.leaving) this.contain(worldW, worldH);
    else this.y = clamp(this.y, 140, worldH - 140);
  }

  draw(ctx) {
    this.drawTransformed(ctx, (c) => {
      drawFish(c, SHARK_SPEC, this.displayLen, {
        phase: this.phase,
        swim: clamp(this.speed / this.cruiseSpeed(), 0.3, 1.3),
        mouthOpen: this.mouthOpen,
        bend: this.bend,
      });
    });
  }
}

// ---------------------------------------------------------------------------
export class PowerUp {
  constructor(x, y, type) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.type = type; // star | magnet | bolt
    this.r = 26;
    this.ttl = 14;
    this.t = Math.random() * TAU;
    this.alive = true;
  }

  update(dt) {
    this.t += dt;
    this.ttl -= dt;
    this.y += Math.sin(this.t * 1.3) * 8 * dt;
    if (this.ttl <= 0) this.alive = false;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.ttl < 3) ctx.globalAlpha = 0.4 + Math.sin(this.ttl * 9) * 0.3;
    drawPowerUp(ctx, this.type, this.r, this.t);
    ctx.restore();
  }
}
