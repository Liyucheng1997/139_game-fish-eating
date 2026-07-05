import { TAU, randRange } from "./utils.js";

// Layered procedural seabed: water gradient by depth, god rays, marine snow,
// a far parallax silhouette layer, and a near layer of sand / rocks / coral /
// swaying kelp anchored in world space.
export class Background {
  constructor(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;

    // far silhouettes (parallax 0.4)
    this.farRocks = [];
    for (let i = 0; i < 26; i++) {
      this.farRocks.push({
        x: randRange(0, worldW),
        w: randRange(180, 520),
        h: randRange(120, 420),
      });
    }
    this.farKelp = [];
    for (let i = 0; i < 40; i++) {
      this.farKelp.push({ x: randRange(0, worldW), h: randRange(160, 480), seed: Math.random() * TAU });
    }

    // near decorations (world space)
    this.rocks = [];
    for (let i = 0; i < 34; i++) {
      this.rocks.push({
        x: randRange(0, worldW),
        r: randRange(30, 130),
        squash: randRange(0.45, 0.7),
        tone: randRange(0.7, 1.15),
      });
    }
    this.kelp = [];
    for (let i = 0; i < 60; i++) {
      this.kelp.push({
        x: randRange(0, worldW),
        h: randRange(140, 420),
        segs: 5,
        width: randRange(10, 22),
        seed: Math.random() * TAU,
        hue: randRange(140, 175),
      });
    }
    this.corals = [];
    for (let i = 0; i < 30; i++) {
      this.corals.push({
        x: randRange(0, worldW),
        r: randRange(24, 70),
        hue: Math.random() < 0.5 ? randRange(330, 360) : randRange(20, 45),
        branches: (3 + Math.random() * 3) | 0,
        seed: Math.random() * TAU,
      });
    }
    this.shells = [];
    for (let i = 0; i < 20; i++) {
      this.shells.push({ x: randRange(0, worldW), r: randRange(8, 18), a: randRange(-0.4, 0.4) });
    }

    // ambient bubbles rising through the world
    this.bubbles = [];
    for (let i = 0; i < 46; i++) {
      this.bubbles.push({
        x: randRange(0, worldW),
        y: randRange(0, worldH),
        r: randRange(2, 7),
        vy: randRange(18, 55),
        wob: Math.random() * TAU,
      });
    }

    // screen-space marine snow
    this.snow = [];
    for (let i = 0; i < 70; i++) {
      this.snow.push({ x: Math.random(), y: Math.random(), r: randRange(0.6, 2.2), v: randRange(0.008, 0.03), drift: Math.random() * TAU });
    }

    this.rays = [];
    for (let i = 0; i < 7; i++) {
      this.rays.push({ x: randRange(0.05, 0.95), w: randRange(0.05, 0.14), tilt: randRange(-0.22, -0.08), speed: randRange(0.1, 0.25), seed: Math.random() * TAU });
    }
  }

  update(dt) {
    for (const b of this.bubbles) {
      b.y -= b.vy * dt;
      b.wob += dt * 2;
      if (b.y < 30) {
        b.y = this.worldH - 20;
        b.x = randRange(0, this.worldW);
      }
    }
    for (const s of this.snow) {
      s.y += s.v * dt;
      s.drift += dt * 0.4;
      if (s.y > 1.02) {
        s.y = -0.02;
        s.x = Math.random();
      }
    }
  }

  // Water column gradient in SCREEN space, tinted by how deep the camera is.
  drawWater(ctx, W, H, cam) {
    const depth = Math.min(1, Math.max(0, cam.y / this.worldH));
    const top = mixColor([38, 130, 168], [8, 42, 74], depth);
    const bottom = mixColor([10, 60, 96], [3, 16, 36], depth);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${top.join(",")})`);
    g.addColorStop(1, `rgb(${bottom.join(",")})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // God rays + snow in screen space (drawn above water, below world).
  drawRays(ctx, W, H, cam, time) {
    const depth = Math.min(1, Math.max(0, cam.y / this.worldH));
    const strength = (1 - depth * 0.8) * 0.16;
    if (strength > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const r of this.rays) {
        const sway = Math.sin(time * r.speed + r.seed) * 0.06;
        const x = (r.x + sway - cam.x / this.worldW * 0.12) * W;
        const w = r.w * W;
        const alpha = strength * (0.6 + 0.4 * Math.sin(time * 0.5 + r.seed * 3));
        const g = ctx.createLinearGradient(x, 0, x + (r.tilt + sway) * H, H);
        g.addColorStop(0, `rgba(190,235,255,${alpha})`);
        g.addColorStop(0.8, "rgba(190,235,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, -10);
        ctx.lineTo(x + w * 0.5, -10);
        ctx.lineTo(x + w * 1.4 + (r.tilt + sway) * H, H);
        ctx.lineTo(x - w * 1.4 + (r.tilt + sway) * H, H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = "rgba(220,240,255,0.35)";
    for (const s of this.snow) {
      const x = ((s.x + Math.sin(s.drift) * 0.01 - cam.x / this.worldW * 0.25) % 1 + 1) % 1;
      ctx.globalAlpha = 0.12 + s.r * 0.1;
      ctx.beginPath();
      ctx.arc(x * W, s.y * H, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Far parallax silhouettes — call with a ctx already transformed at `parallax` factor.
  drawFar(ctx, time) {
    const floorY = this.worldH;
    ctx.fillStyle = "rgba(6,32,52,0.55)";
    for (const r of this.farRocks) {
      ctx.beginPath();
      ctx.moveTo(r.x - r.w / 2, floorY + 50);
      ctx.quadraticCurveTo(r.x - r.w * 0.2, floorY - r.h, r.x + r.w * 0.15, floorY - r.h * 0.8);
      ctx.quadraticCurveTo(r.x + r.w * 0.4, floorY - r.h * 0.35, r.x + r.w / 2, floorY + 50);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(8,45,60,0.5)";
    ctx.lineCap = "round";
    for (const k of this.farKelp) {
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(k.x, floorY + 10);
      const sway = Math.sin(time * 0.5 + k.seed) * 30;
      ctx.bezierCurveTo(k.x - sway * 0.4, floorY - k.h * 0.4, k.x + sway, floorY - k.h * 0.75, k.x + sway * 1.4, floorY - k.h);
      ctx.stroke();
    }
  }

  // Near world-space layer: seafloor, rocks, corals, kelp, surface, bubbles.
  drawWorld(ctx, time, view) {
    const { worldW, worldH } = this;

    // --- water surface (top of world) ---
    if (view.top < 140) {
      ctx.save();
      const surfY = 60;
      ctx.beginPath();
      ctx.moveTo(view.left - 50, surfY);
      for (let x = view.left - 50; x <= view.right + 50; x += 40) {
        ctx.lineTo(x, surfY + Math.sin(x * 0.02 + time * 1.6) * 6 + Math.sin(x * 0.005 + time * 0.7) * 9);
      }
      ctx.lineTo(view.right + 50, view.top - 80);
      ctx.lineTo(view.left - 50, view.top - 80);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, view.top - 80, 0, surfY + 30);
      g.addColorStop(0, "rgba(220,250,255,0.85)");
      g.addColorStop(1, "rgba(160,225,255,0.15)");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }

    // --- seafloor sand ---
    const floorTop = worldH - 90;
    if (view.bottom > floorTop - 60) {
      const g = ctx.createLinearGradient(0, floorTop - 40, 0, worldH + 80);
      g.addColorStop(0, "rgba(120,105,80,0)");
      g.addColorStop(0.35, "rgba(150,130,95,0.9)");
      g.addColorStop(1, "rgb(105,88,64)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(view.left - 50, worldH + 120);
      ctx.lineTo(view.left - 50, floorTop + 20);
      for (let x = view.left - 50; x <= view.right + 50; x += 60) {
        ctx.lineTo(x, floorTop + Math.sin(x * 0.008) * 18 + Math.sin(x * 0.0023) * 26);
      }
      ctx.lineTo(view.right + 50, worldH + 120);
      ctx.closePath();
      ctx.fill();

      // shells
      ctx.fillStyle = "rgba(235,225,205,0.8)";
      for (const s of this.shells) {
        if (s.x < view.left - 40 || s.x > view.right + 40) continue;
        ctx.save();
        ctx.translate(s.x, worldH - 55 + Math.sin(s.x * 0.01) * 12);
        ctx.rotate(s.a);
        ctx.beginPath();
        ctx.arc(0, 0, s.r, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // rocks
    for (const r of this.rocks) {
      if (r.x + r.r < view.left || r.x - r.r > view.right) continue;
      const y = worldH - 60 + Math.sin(r.x * 0.01) * 14;
      if (y - r.r > view.bottom + 60) continue;
      const g = ctx.createRadialGradient(r.x - r.r * 0.3, y - r.r * 0.5, r.r * 0.15, r.x, y, r.r * 1.15);
      g.addColorStop(0, `rgba(${(96 * r.tone) | 0},${(102 * r.tone) | 0},${(112 * r.tone) | 0},1)`);
      g.addColorStop(1, `rgba(${(46 * r.tone) | 0},${(52 * r.tone) | 0},${(62 * r.tone) | 0},1)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(r.x, y, r.r, r.r * r.squash, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }

    // corals
    for (const c of this.corals) {
      if (c.x + c.r * 2 < view.left || c.x - c.r * 2 > view.right) continue;
      const y = worldH - 58 + Math.sin(c.x * 0.013) * 10;
      if (y - c.r * 2.4 > view.bottom + 40) continue;
      ctx.save();
      ctx.translate(c.x, y);
      ctx.strokeStyle = `hsl(${c.hue},62%,55%)`;
      ctx.lineCap = "round";
      for (let b = 0; b < c.branches; b++) {
        const a = -Math.PI / 2 + (b / (c.branches - 1) - 0.5) * 1.5;
        const len = c.r * (1.3 + Math.sin(c.seed + b * 2.7) * 0.4);
        const sway = Math.sin(time * 0.8 + c.seed + b) * 4;
        ctx.lineWidth = c.r * 0.22;
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.quadraticCurveTo(Math.cos(a) * len * 0.5 + sway, Math.sin(a) * len * 0.6, Math.cos(a) * len + sway, Math.sin(a) * len);
        ctx.stroke();
        ctx.lineWidth = c.r * 0.13;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * len * 0.55 + sway * 0.7, Math.sin(a) * len * 0.62);
        ctx.quadraticCurveTo(Math.cos(a - 0.5) * len * 0.8 + sway, Math.sin(a - 0.5) * len * 0.85, Math.cos(a - 0.55) * len * 0.95 + sway, Math.sin(a - 0.55) * len * 0.95);
        ctx.stroke();
      }
      ctx.restore();
    }

    // kelp
    for (const k of this.kelp) {
      if (k.x + 80 < view.left || k.x - 80 > view.right) continue;
      const baseY = worldH - 52 + Math.sin(k.x * 0.01) * 12;
      if (baseY - k.h > view.bottom + 40 && baseY < view.top - 40) continue;
      ctx.strokeStyle = `hsla(${k.hue},52%,${34 + (k.seed % 1) * 12}%,0.92)`;
      ctx.lineCap = "round";
      let px = k.x;
      let py = baseY;
      const segLen = k.h / k.segs;
      for (let s = 0; s < k.segs; s++) {
        const sway = Math.sin(time * 1.1 + k.seed + s * 0.9) * (6 + s * 5);
        const nx = k.x + sway;
        const ny = baseY - segLen * (s + 1);
        ctx.lineWidth = k.width * (1 - s / (k.segs + 1));
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + sway * 0.4, (py + ny) / 2, nx, ny);
        ctx.stroke();
        px = nx;
        py = ny;
      }
    }

    // ambient bubbles
    ctx.save();
    ctx.strokeStyle = "rgba(210,240,255,0.5)";
    ctx.fillStyle = "rgba(210,240,255,0.14)";
    for (const b of this.bubbles) {
      const x = b.x + Math.sin(b.wob) * 6;
      if (x < view.left - 20 || x > view.right + 20 || b.y < view.top - 20 || b.y > view.bottom + 20) continue;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
