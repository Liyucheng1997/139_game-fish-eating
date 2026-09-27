import { TAU, randRange } from "./utils.js";

// Bubbles, eat-bursts, sparkles, ripple rings and floating score text.
export class Particles {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
  }

  clear() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
  }

  bubbles(x, y, count, speed = 60, size = 4) {
    for (let i = 0; i < count; i++) {
      const a = randRange(0, TAU);
      this.parts.push({
        kind: "bubble",
        x: x + Math.cos(a) * randRange(0, size * 2),
        y: y + Math.sin(a) * randRange(0, size * 2),
        vx: Math.cos(a) * speed * 0.35,
        vy: -randRange(speed * 0.5, speed) ,
        r: randRange(size * 0.4, size),
        life: randRange(0.5, 1.1),
        t: 0,
      });
    }
  }

  burst(x, y, color, count = 14, speed = 160, size = 5) {
    for (let i = 0; i < count; i++) {
      const a = randRange(0, TAU);
      const v = randRange(speed * 0.3, speed);
      this.parts.push({
        kind: "dot",
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: randRange(size * 0.4, size),
        color,
        life: randRange(0.35, 0.8),
        t: 0,
        drag: 3,
      });
    }
  }

  sparkle(x, y, count = 6, spread = 30) {
    for (let i = 0; i < count; i++) {
      this.parts.push({
        kind: "spark",
        x: x + randRange(-spread, spread),
        y: y + randRange(-spread, spread),
        vx: randRange(-15, 15),
        vy: randRange(-30, -8),
        r: randRange(2, 5),
        life: randRange(0.4, 0.9),
        t: 0,
      });
    }
  }

  ring(x, y, radius, color = "rgba(255,255,255,0.6)", life = 0.5, width = 3) {
    this.rings.push({ x, y, r: radius * 0.4, target: radius * 2.2, color, life, t: 0, width });
  }

  // Water rushing into an opening mouth: streaks converge on (mx, my).
  suction(mx, my, angle, reach, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = angle + randRange(-0.9, 0.9);
      const d = reach * randRange(0.45, 1);
      const life = randRange(0.14, 0.24);
      const x = mx + Math.cos(a) * d;
      const y = my + Math.sin(a) * d;
      this.parts.push({
        kind: "streak",
        x, y,
        vx: (mx - x) / life,
        vy: (my - y) / life,
        len: randRange(0.25, 0.45) * reach,
        w: Math.max(1, reach * 0.018),
        life,
        t: 0,
      });
    }
  }

  // Scale flakes glinting as they tumble out of a bite.
  flakes(x, y, angle, count, colors, speed = 160, size = 4) {
    for (let i = 0; i < count; i++) {
      const a = angle + randRange(-1.4, 1.4);
      const v = randRange(speed * 0.3, speed);
      this.parts.push({
        kind: "flake",
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 20,
        r: randRange(size * 0.5, size),
        rot: randRange(0, TAU),
        spin: randRange(-14, 14),
        color: colors[(Math.random() * colors.length) | 0],
        life: randRange(0.5, 1.1),
        t: 0,
        drag: 2.6,
        sink: 30,
      });
    }
  }

  text(x, y, str, { color = "#ffffff", size = 22 } = {}) {
    this.texts.push({ x, y, str, color, size, life: 1.1, t: 0, vy: -55 });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.parts.splice(i, 1);
        continue;
      }
      if (p.drag) {
        p.vx -= p.vx * p.drag * dt;
        p.vy -= p.vy * p.drag * dt;
      }
      if (p.kind === "bubble") p.vy -= 30 * dt;
      if (p.sink) p.vy += p.sink * dt;
      if (p.spin) p.rot += p.spin * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      t.y += t.vy * dt;
      t.vy *= 1 - 1.5 * dt;
      if (t.t >= t.life) this.texts.splice(i, 1);
    }
  }

  // World-space pass (particles + rings), called inside camera transform.
  draw(ctx) {
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      if (p.kind === "bubble") {
        ctx.strokeStyle = `rgba(220,245,255,${0.65 * k})`;
        ctx.fillStyle = `rgba(220,245,255,${0.15 * k})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
        ctx.stroke();
      } else if (p.kind === "spark") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,235,150,${k})`;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.t * 4);
        const s = p.r * (0.5 + k);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.2, -s * 0.2, s, 0);
        ctx.quadraticCurveTo(s * 0.2, s * 0.2, 0, s);
        ctx.quadraticCurveTo(-s * 0.2, s * 0.2, -s, 0);
        ctx.quadraticCurveTo(-s * 0.2, -s * 0.2, 0, -s);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === "streak") {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const tail = p.len * k;
        ctx.strokeStyle = `rgba(215,245,255,${0.6 * Math.sin(Math.PI * (1 - k))})`;
        ctx.lineWidth = p.w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * tail, p.y - (p.vy / sp) * tail);
        ctx.stroke();
      } else if (p.kind === "flake") {
        const glint = Math.abs(Math.cos(p.rot));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * 0.5);
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * (0.25 + 0.75 * glint), 0, 0, TAU);
        ctx.fill();
        if (glint > 0.85) {
          ctx.fillStyle = `rgba(255,255,255,${(glint - 0.85) * 6 * k})`;
          ctx.fill();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.5), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.lineWidth = (r.width || 3) * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r + (r.target - r.r) * k, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Score text pass — world coords but constant screen size, so pass zoom.
  drawTexts(ctx, zoom) {
    for (const t of this.texts) {
      const k = 1 - t.t / t.life;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(1 / zoom, 1 / zoom);
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `800 ${t.size}px "Baloo 2","PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,25,45,0.75)";
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
  }
}
