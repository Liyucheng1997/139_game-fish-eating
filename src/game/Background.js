import { TAU, randRange, clamp, lerp } from "./utils.js";

// Layered procedural ocean:
//   screen  : water column gradient (absorbs light with depth)
//   far     : hazy reef ridges, kelp silhouettes, drifting fish schools
//   mid     : darker rock pinnacles and arches
//   world   : sunlit surface, sand with animated caustics, textured rocks,
//             corals, anemones, sea grass, giant kelp forests, bubble vents
//   overlay : soft volumetric god rays, marine snow, depth light falloff
// Heavy things (caustics, sand, rocks, corals) are pre-rendered once.

const SURFACE_Y = 60;

function mk(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// --------------------------------------------------------------- textures
// Tileable Worley (F2 - F1) network: bright where light focuses.
function makeCaustics(size = 256, cells = 5) {
  const c = mk(size, size);
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + Math.random()) / cells, (j + Math.random()) / cells]);
  const mod = (a, n) => ((a % n) + n) % n;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const cx = Math.floor(u * cells);
      const cy = Math.floor(v * cells);
      let f1 = 9;
      let f2 = 9;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ci = mod(cx + di, cells);
          const cj = mod(cy + dj, cells);
          const p = pts[cj * cells + ci];
          const px = p[0] + (cx + di - ci) / cells;
          const py = p[1] + (cy + dj - cj) / cells;
          const d = Math.hypot(u - px, v - py);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      }
      const e = clamp(1 - (f2 - f1) * cells * 2.4, 0, 1);
      const a = Math.pow(e, 3.2);
      const o = (y * size + x) * 4;
      img.data[o] = 210;
      img.data[o + 1] = 245;
      img.data[o + 2] = 255;
      img.data[o + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Tileable rippled sand with grain and speckles.
function makeSand(size = 256) {
  const c = mk(size, size);
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  const ph = [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const warp = Math.sin(TAU * (v * 2 + u) + ph[0]) * 0.08 + Math.sin(TAU * (u * 3 - v) + ph[1]) * 0.05;
      const ripple = Math.sin(TAU * (u * 7 + warp * 3 + v * 0.5) + ph[2]);
      const lum = 0.86 + ripple * 0.07 + (Math.random() - 0.5) * 0.12;
      const o = (y * size + x) * 4;
      img.data[o] = 176 * lum;
      img.data[o + 1] = 156 * lum;
      img.data[o + 2] = 116 * lum;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) {
    const dark = Math.random() < 0.6;
    g.fillStyle = dark ? `rgba(80,65,45,${randRange(0.2, 0.5)})` : `rgba(250,240,215,${randRange(0.2, 0.6)})`;
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = randRange(0.5, 1.6);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath();
      g.arc(x + ox, y + oy, r, 0, TAU);
      g.fill();
    }
  }
  return c;
}

// Soft light shaft: gaussian across, fading downward.
function makeRay() {
  const w = 64;
  const h = 256;
  const c = mk(w, h);
  const g = c.getContext("2d");
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const fy = Math.pow(1 - y / h, 1.6);
    for (let x = 0; x < w; x++) {
      const d = (x - w / 2) / (w * 0.26);
      const a = Math.exp(-d * d) * fy;
      const o = (y * w + x) * 4;
      img.data[o] = 200;
      img.data[o + 1] = 238;
      img.data[o + 2] = 255;
      img.data[o + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function makeSoftDot(color = "255,255,255") {
  const c = mk(64, 64);
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${color},1)`);
  gr.addColorStop(0.4, `rgba(${color},0.55)`);
  gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// --------------------------------------------------------------- sprites
const S = 2; // sprite supersampling so zoomed-in views stay crisp

function makeRock(w, h) {
  const c = mk(w * S, h * S);
  const g = c.getContext("2d");
  g.scale(S, S);
  const n = 22;
  const ph = [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
  const path = new Path2D();
  path.moveTo(0, h);
  const top = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = Math.PI + t * Math.PI;
    const r = 0.86 + Math.sin(t * 7 + ph[0]) * 0.07 + Math.sin(t * 15 + ph[1]) * 0.04 + Math.random() * 0.04;
    const x = clamp(w / 2 + Math.cos(ang) * (w / 2) * 0.98, 0, w);
    const y = h + Math.sin(ang) * h * 0.95 * r;
    top.push([x, y]);
    path.lineTo(x, y);
  }
  path.lineTo(w, h);
  path.closePath();

  const hue = randRange(190, 230);
  const sat = randRange(6, 16);
  const base = g.createLinearGradient(0, 0, w * 0.3, h);
  base.addColorStop(0, `hsl(${hue},${sat}%,46%)`);
  base.addColorStop(0.5, `hsl(${hue},${sat}%,30%)`);
  base.addColorStop(1, `hsl(${hue},${sat}%,14%)`);
  g.fillStyle = base;
  g.fill(path);

  g.save();
  g.clip(path);
  // mottled texture
  for (let i = 0; i < 260; i++) {
    const light = Math.random() < 0.45;
    g.fillStyle = light ? `rgba(220,230,240,${randRange(0.03, 0.09)})` : `rgba(0,0,0,${randRange(0.05, 0.14)})`;
    g.beginPath();
    g.ellipse(Math.random() * w, Math.random() * h, randRange(2, w * 0.07), randRange(2, h * 0.05), Math.random() * 3, 0, TAU);
    g.fill();
  }
  // cracks
  g.strokeStyle = "rgba(0,0,0,0.3)";
  g.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    let x = Math.random() * w;
    let y = h * randRange(0.2, 0.8);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += randRange(-w * 0.08, w * 0.08);
      y += randRange(2, h * 0.1);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // algae turf and coralline crust along the sunlit top
  for (const [x, y] of top) {
    for (let k = 0; k < 5; k++) {
      const green = Math.random() < 0.8;
      g.fillStyle = green ? `hsla(${randRange(75, 120)},${randRange(30, 50)}%,${randRange(24, 36)}%,0.7)` : `hsla(${randRange(330, 355)},45%,62%,0.6)`;
      g.beginPath();
      g.ellipse(x + randRange(-10, 10), y + randRange(0, h * 0.14), randRange(3, 10), randRange(2, 6), 0, 0, TAU);
      g.fill();
    }
  }
  // top-light highlight & ground contact shadow
  const hl = g.createRadialGradient(w * 0.35, 0, 0, w * 0.35, 0, w * 0.7);
  hl.addColorStop(0, "rgba(200,235,255,0.22)");
  hl.addColorStop(1, "rgba(200,235,255,0)");
  g.fillStyle = hl;
  g.fillRect(0, 0, w, h);
  const sh = g.createLinearGradient(0, h * 0.6, 0, h);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,5,15,0.55)");
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
  g.restore();
  return { canvas: c, w, h };
}

function branch(g, x, y, ang, len, width, depth, spread, tipColor) {
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  const bend = randRange(-0.25, 0.25) * len;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo((x + x2) / 2 + bend, (y + y2) / 2, x2, y2);
  g.stroke();
  if (depth <= 0) {
    if (tipColor) {
      g.save();
      g.fillStyle = tipColor;
      g.beginPath();
      g.arc(x2, y2, width * 0.9, 0, TAU);
      g.fill();
      g.restore();
    }
    return;
  }
  const n = Math.random() < 0.3 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = ang + (i - (n - 1) / 2) * spread * randRange(0.7, 1.3);
    branch(g, x2, y2, a, len * randRange(0.66, 0.84), width * 0.72, depth - 1, spread, tipColor);
  }
}

function makeCoral(type) {
  let w;
  let h;
  let c;
  let g;
  if (type === "fan") {
    w = randRange(120, 200);
    h = randRange(130, 210);
    c = mk(w * S, h * S);
    g = c.getContext("2d");
    g.scale(S, S);
    const hue = [330, 350, 8, 280, 40][(Math.random() * 5) | 0];
    g.strokeStyle = `hsl(${hue},62%,48%)`;
    g.lineCap = "round";
    for (let i = 0; i < 3; i++) branch(g, w / 2, h, -Math.PI / 2 + (i - 1) * 0.45, h * 0.3, 4.5, 6, 0.42, null);
    // lace mesh between branches
    g.globalCompositeOperation = "source-atop";
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `hsl(${hue},70%,66%)`);
    gr.addColorStop(1, `hsl(${hue},55%,34%)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  } else if (type === "staghorn") {
    w = randRange(120, 180);
    h = randRange(90, 140);
    c = mk(w * S, h * S);
    g = c.getContext("2d");
    g.scale(S, S);
    g.strokeStyle = `hsl(${randRange(25, 40)},38%,${randRange(52, 62)}%)`;
    g.lineCap = "round";
    const tip = `hsl(${randRange(250, 290)},45%,72%)`;
    for (let i = 0; i < 5; i++) branch(g, w / 2 + randRange(-10, 10), h, -Math.PI / 2 + (i - 2) * 0.35, h * 0.32, 9, 3, 0.55, tip);
  } else if (type === "brain") {
    w = randRange(90, 150);
    h = w * randRange(0.45, 0.6);
    c = mk(w * S, h * S);
    g = c.getContext("2d");
    g.scale(S, S);
    const hue = Math.random() < 0.5 ? randRange(55, 85) : randRange(20, 35);
    const dome = new Path2D();
    dome.ellipse(w / 2, h, w / 2, h, 0, Math.PI, 0);
    dome.closePath();
    const gr = g.createRadialGradient(w * 0.4, h * 0.2, 0, w / 2, h, w * 0.6);
    gr.addColorStop(0, `hsl(${hue},38%,62%)`);
    gr.addColorStop(1, `hsl(${hue},32%,30%)`);
    g.fillStyle = gr;
    g.fill(dome);
    g.save();
    g.clip(dome);
    g.strokeStyle = `hsla(${hue},30%,22%,0.55)`;
    g.lineWidth = 1.6;
    for (let i = 0; i < 30; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h;
      let a = Math.random() * TAU;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        a += randRange(-0.9, 0.9);
        x += Math.cos(a) * 5;
        y += Math.sin(a) * 5;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  } else {
    // tube sponges
    w = randRange(70, 120);
    h = randRange(100, 170);
    c = mk(w * S, h * S);
    g = c.getContext("2d");
    g.scale(S, S);
    const hue = [285, 25, 48, 340][(Math.random() * 4) | 0];
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const tw = randRange(14, 22);
      const th = h * randRange(0.45, 1);
      const x = w * (0.15 + 0.7 * (i / (n - 1))) - tw / 2;
      const gr = g.createLinearGradient(x, 0, x + tw, 0);
      gr.addColorStop(0, `hsl(${hue},45%,28%)`);
      gr.addColorStop(0.4, `hsl(${hue},55%,52%)`);
      gr.addColorStop(1, `hsl(${hue},45%,24%)`);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 2, h - th);
      g.lineTo(x + tw - 2, h - th);
      g.lineTo(x + tw, h);
      g.fill();
      g.fillStyle = `hsl(${hue},40%,14%)`;
      g.beginPath();
      g.ellipse(x + tw / 2, h - th, tw / 2 - 2, 3.5, 0, 0, TAU);
      g.fill();
    }
  }
  return { canvas: c, w, h };
}

// --------------------------------------------------------------- class
export class Background {
  constructor(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.floorBase = worldH - 90;

    this.causticTex = makeCaustics();
    this.sandTex = makeSand();
    this.rayTex = makeRay();
    this.softDot = makeSoftDot();
    this.shadowDot = makeSoftDot("0,12,24");
    this._patterns = null;

    // --- far parallax layer ---
    this.ridge = [];
    for (let x = -600; x <= worldW + 600; x += 70) {
      this.ridge.push([x, 160 + Math.sin(x * 0.0021) * 110 + Math.sin(x * 0.0067 + 1.3) * 60 + Math.random() * 40]);
    }
    this.farKelp = [];
    for (let i = 0; i < 46; i++) this.farKelp.push({ x: randRange(0, worldW), h: randRange(200, 620), seed: Math.random() * TAU });
    this.schools = [];
    for (let i = 0; i < 4; i++) {
      const members = [];
      const n = (18 + Math.random() * 22) | 0;
      for (let k = 0; k < n; k++) members.push({ ox: randRange(-110, 110), oy: randRange(-45, 45), ph: Math.random() * TAU, s: randRange(0.7, 1.2) });
      this.schools.push({ x: randRange(0, worldW), y: randRange(600, worldH - 700), dir: Math.random() < 0.5 ? -1 : 1, speed: randRange(25, 45), members, wob: Math.random() * TAU });
    }

    // --- mid parallax layer ---
    this.pinnacles = [];
    for (let i = 0; i < 16; i++) {
      this.pinnacles.push({ x: randRange(0, worldW), w: randRange(140, 360), h: randRange(260, 720), arch: Math.random() < 0.3, seed: Math.random() * TAU });
    }

    // --- world scenery ---
    const rockSprites = Array.from({ length: 10 }, () => makeRock(randRange(150, 260), randRange(80, 170)));
    this.rocks = [];
    for (let i = 0; i < 34; i++) {
      const spr = rockSprites[(Math.random() * rockSprites.length) | 0];
      this.rocks.push({ x: randRange(0, worldW), spr, scale: randRange(0.5, 1.3), flip: Math.random() < 0.5 });
    }
    this.rocks.sort((a, b) => b.scale - a.scale); // big ones behind

    const coralTypes = ["fan", "fan", "staghorn", "brain", "tube", "staghorn", "brain", "tube"];
    const coralSprites = Array.from({ length: 16 }, (_, i) => makeCoral(coralTypes[i % coralTypes.length]));
    this.corals = [];
    for (let i = 0; i < 44; i++) {
      const spr = coralSprites[(Math.random() * coralSprites.length) | 0];
      this.corals.push({ x: randRange(0, worldW), spr, scale: randRange(0.6, 1.2), seed: Math.random() * TAU, flip: Math.random() < 0.5 });
    }

    this.anemones = [];
    for (let i = 0; i < 16; i++) {
      const palette = [["#ff8fb3", "#ffd0e0"], ["#b58cff", "#f0e0ff"], ["#7bd88f", "#e6ff9a"], ["#ff9f5a", "#ffe0b0"]][i % 4];
      this.anemones.push({ x: randRange(0, worldW), r: randRange(18, 34), n: (18 + Math.random() * 10) | 0, seed: Math.random() * TAU, col: palette });
    }

    this.grass = [];
    for (let i = 0; i < 80; i++) {
      const blades = [];
      const n = (5 + Math.random() * 7) | 0;
      for (let k = 0; k < n; k++) blades.push({ dx: randRange(-14, 14), h: randRange(30, 90), lean: randRange(-0.3, 0.3), ph: Math.random() * TAU });
      this.grass.push({ x: randRange(0, worldW), blades, hue: randRange(85, 125), light: randRange(26, 38) });
    }

    this.kelp = [];
    for (let f = 0; f < 4; f++) {
      const cx = randRange(300, worldW - 300);
      const n = (3 + Math.random() * 4) | 0;
      for (let i = 0; i < n; i++) {
        const h = randRange(600, 1700);
        this.kelp.push({ x: cx + randRange(-320, 320), h, segs: Math.round(h / 58), seed: Math.random() * TAU, hue: randRange(32, 48), w: randRange(2.5, 4.5), z: Math.random() });
      }
    }
    this.kelp.sort((a, b) => b.z - a.z); // far plants first

    this.pebbles = [];
    for (let i = 0; i < 160; i++) {
      this.pebbles.push({ x: randRange(0, worldW), r: randRange(2, 7), tone: randRange(0.5, 1), dy: randRange(6, 40) });
    }
    this.shells = [];
    for (let i = 0; i < 26; i++) this.shells.push({ x: randRange(0, worldW), r: randRange(7, 15), a: randRange(-0.4, 0.4), star: Math.random() < 0.35, hue: randRange(0, 40) });

    this.vents = [];
    for (let i = 0; i < 5; i++) this.vents.push({ x: randRange(200, worldW - 200), t: Math.random() * 3 });

    // rising bubbles (world space)
    this.bubbles = [];
    for (let i = 0; i < 46; i++) {
      this.bubbles.push({ x: randRange(0, worldW), y: randRange(0, worldH), r: randRange(2, 7), vy: randRange(18, 55), wob: Math.random() * TAU });
    }
    this.ventBubbles = [];

    // screen-space marine snow, 2 depths + blurred foreground motes
    this.snow = [];
    for (let i = 0; i < 90; i++) {
      this.snow.push({ x: Math.random(), y: Math.random(), r: randRange(0.5, 2), v: randRange(0.006, 0.025), drift: Math.random() * TAU, par: randRange(0.2, 0.6) });
    }
    this.motes = [];
    for (let i = 0; i < 9; i++) this.motes.push({ x: Math.random(), y: Math.random(), r: randRange(8, 26), v: randRange(0.004, 0.012), drift: Math.random() * TAU });

    this.rays = [];
    for (let i = 0; i < 9; i++) {
      this.rays.push({ x: randRange(-0.1, 1.1), w: randRange(0.06, 0.2), tilt: randRange(-0.3, -0.1), speed: randRange(0.1, 0.25), seed: Math.random() * TAU });
    }
  }

  floorY(x) {
    return this.floorBase + Math.sin(x * 0.008) * 18 + Math.sin(x * 0.0023) * 26;
  }

  depthAt(y) {
    return clamp(y / this.worldH, 0, 1);
  }

  patterns(ctx) {
    if (!this._patterns) {
      this._patterns = {
        caustic: ctx.createPattern(this.causticTex, "repeat"),
        caustic2: ctx.createPattern(this.causticTex, "repeat"),
        sand: ctx.createPattern(this.sandTex, "repeat"),
      };
    }
    return this._patterns;
  }

  // pattern-space → world-space transform for caustics at a given time
  causticMatrix(time, layer = 0) {
    const m = new DOMMatrix();
    if (layer === 0) return m.translateSelf(time * 14, time * 5).scaleSelf(2.6, 2.6);
    return m.translateSelf(-time * 11, time * 7).rotateSelf(35).scaleSelf(3.4, 3.4);
  }

  update(dt) {
    for (const b of this.bubbles) {
      b.y -= b.vy * dt;
      b.wob += dt * 2;
      if (b.y < SURFACE_Y + 10) {
        b.y = this.worldH - 40;
        b.x = randRange(0, this.worldW);
      }
    }
    for (const v of this.vents) {
      v.t -= dt;
      if (v.t <= 0) {
        v.t = randRange(0.08, 0.35);
        this.ventBubbles.push({ x: v.x + randRange(-6, 6), y: this.floorY(v.x) - 10, r: randRange(2, 6), vy: randRange(60, 110), wob: Math.random() * TAU });
      }
    }
    for (let i = this.ventBubbles.length - 1; i >= 0; i--) {
      const b = this.ventBubbles[i];
      b.y -= b.vy * dt;
      b.vy += 12 * dt;
      b.r += dt * 0.6;
      b.wob += dt * 3;
      if (b.y < SURFACE_Y + 10) this.ventBubbles.splice(i, 1);
    }
    for (const s of this.snow) {
      s.y += s.v * dt;
      s.drift += dt * 0.4;
      if (s.y > 1.02) {
        s.y = -0.02;
        s.x = Math.random();
      }
    }
    for (const m of this.motes) {
      m.y += m.v * dt;
      m.drift += dt * 0.3;
      if (m.y > 1.1) {
        m.y = -0.1;
        m.x = Math.random();
      }
    }
    for (const sc of this.schools) {
      sc.x += sc.dir * sc.speed * dt;
      sc.wob += dt;
      if (sc.x < -400) sc.x = this.worldW + 300;
      if (sc.x > this.worldW + 400) sc.x = -300;
    }
  }

  // ------------------------------------------------------------- screen
  drawWater(ctx, W, H, cam) {
    const depth = clamp(cam.y / this.worldH, 0, 1);
    const top = mixColor([48, 150, 182], [10, 48, 82], Math.pow(depth, 0.8));
    const bottom = mixColor([14, 74, 110], [4, 20, 42], depth);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${top.join(",")})`);
    g.addColorStop(1, `rgb(${bottom.join(",")})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this._water = { top, bottom, depth };
    // sun glow from above when shallow
    if (depth < 0.55) {
      const a = (0.55 - depth) * 0.5;
      const rg = ctx.createRadialGradient(W * 0.5, -H * 0.2, 0, W * 0.5, -H * 0.2, H * 1.1);
      rg.addColorStop(0, `rgba(200,245,255,${a})`);
      rg.addColorStop(1, "rgba(200,245,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Volumetric shafts, drawn *over* the world with additive blending.
  drawRays(ctx, W, H, cam, time) {
    const depth = clamp(cam.y / this.worldH, 0, 1);
    const strength = (1 - depth * 0.85) * 0.2;
    if (strength < 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const r of this.rays) {
      const sway = Math.sin(time * r.speed + r.seed) * 0.05;
      const x = (r.x + sway - (cam.x / this.worldW) * 0.18) * W;
      const w = r.w * W * (1 + Math.sin(time * 0.37 + r.seed) * 0.2);
      ctx.globalAlpha = strength * (0.55 + 0.45 * Math.sin(time * 0.45 + r.seed * 3));
      ctx.save();
      ctx.translate(x, -20);
      ctx.transform(1, 0, r.tilt + sway, 1, 0, 0);
      ctx.drawImage(this.rayTex, -w / 2, 0, w, H * 1.15);
      ctx.restore();
    }
    ctx.restore();
  }

  drawSnow(ctx, W, H, cam) {
    ctx.save();
    ctx.fillStyle = "rgb(225,242,255)";
    for (const s of this.snow) {
      const x = (((s.x + Math.sin(s.drift) * 0.01 - (cam.x / this.worldW) * s.par) % 1) + 1) % 1;
      const y = (((s.y - (cam.y / this.worldH) * s.par * 0.6) % 1) + 1) % 1;
      ctx.globalAlpha = 0.1 + s.r * 0.12;
      ctx.beginPath();
      ctx.arc(x * W, y * H, s.r, 0, TAU);
      ctx.fill();
    }
    // out-of-focus particles drifting right in front of the lens
    for (const m of this.motes) {
      const x = (((m.x + Math.sin(m.drift) * 0.02 - (cam.x / this.worldW) * 1.4) % 1) + 1) % 1;
      const y = (((m.y - (cam.y / this.worldH) * 0.9) % 1) + 1) % 1;
      ctx.globalAlpha = 0.07;
      ctx.drawImage(this.softDot, x * W - m.r, y * H - m.r, m.r * 2, m.r * 2);
    }
    ctx.restore();
  }

  // Light falls off with depth and toward the bottom of the frame.
  drawLight(ctx, W, H, cam) {
    const depth = clamp(cam.y / this.worldH, 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(0,10,28,${depth * 0.12})`);
    g.addColorStop(1, `rgba(0,6,20,${0.1 + depth * 0.18})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------- far / mid
  drawFar(ctx, time) {
    const floorY = this.worldH;
    // hazy reef ridge
    ctx.fillStyle = "rgba(4,34,56,0.5)";
    ctx.beginPath();
    ctx.moveTo(this.ridge[0][0], floorY + 200);
    for (const [x, h] of this.ridge) ctx.lineTo(x, floorY - h);
    ctx.lineTo(this.ridge[this.ridge.length - 1][0], floorY + 200);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(6,44,56,0.42)";
    ctx.lineCap = "round";
    for (const k of this.farKelp) {
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(k.x, floorY + 10);
      const sway = Math.sin(time * 0.45 + k.seed) * 34;
      ctx.bezierCurveTo(k.x - sway * 0.4, floorY - k.h * 0.4, k.x + sway, floorY - k.h * 0.75, k.x + sway * 1.4, floorY - k.h);
      ctx.stroke();
    }

    // distant schools: tiny silhouettes flowing together
    ctx.fillStyle = "rgba(8,42,62,0.6)";
    for (const sc of this.schools) {
      for (const m of sc.members) {
        const x = sc.x + m.ox + Math.sin(sc.wob * 1.3 + m.ph) * 14;
        const y = sc.y + m.oy + Math.sin(sc.wob * 0.9 + m.ph * 1.7) * 10 + Math.sin(sc.wob * 0.3) * 30;
        const s = 9 * m.s;
        const tail = Math.sin(sc.wob * 9 + m.ph) * 0.3;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(sc.dir, 1);
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.32, 0, 0, TAU);
        ctx.moveTo(-s * 0.8, 0);
        ctx.lineTo(-s * 1.5, -s * (0.45 + tail));
        ctx.lineTo(-s * 1.5, s * (0.45 - tail));
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawMid(ctx, time) {
    const floorY = this.worldH;
    ctx.fillStyle = "rgba(3,26,42,0.55)";
    for (const p of this.pinnacles) {
      ctx.beginPath();
      ctx.moveTo(p.x - p.w / 2, floorY + 80);
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = p.x - p.w / 2 + t * p.w;
        const bump = Math.sin(t * Math.PI) * p.h * (0.75 + Math.sin(t * 9 + p.seed) * 0.12);
        ctx.lineTo(x, floorY - bump);
      }
      ctx.lineTo(p.x + p.w / 2, floorY + 80);
      ctx.closePath();
      if (p.arch) {
        ctx.moveTo(p.x + p.w * 0.18, floorY + 80);
        ctx.ellipse(p.x, floorY + 80, p.w * 0.18, p.h * 0.45, 0, 0, Math.PI, true);
      }
      ctx.fill("evenodd");
    }
    ctx.strokeStyle = "rgba(4,34,36,0.5)";
    ctx.lineCap = "round";
    for (let i = 0; i < this.farKelp.length; i += 2) {
      const k = this.farKelp[i];
      const x = (k.x * 1.37) % this.worldW;
      const sway = Math.sin(time * 0.6 + k.seed) * 26;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, floorY + 20);
      ctx.quadraticCurveTo(x + sway, floorY - k.h * 0.5, x + sway * 1.5, floorY - k.h * 0.85);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------- world
  drawWorld(ctx, time, view) {
    const { worldW, worldH } = this;
    const pats = this.patterns(ctx);
    const vis = (x, r) => x + r > view.left && x - r < view.right;

    // --- surface seen from below: bright window + rippling reflections ---
    if (view.top < SURFACE_Y + 260) {
      ctx.save();
      const wave = (x) => SURFACE_Y + Math.sin(x * 0.02 + time * 1.6) * 6 + Math.sin(x * 0.005 + time * 0.7) * 9;
      const surf = new Path2D();
      surf.moveTo(view.left - 50, wave(view.left - 50));
      for (let x = view.left - 50; x <= view.right + 50; x += 30) surf.lineTo(x, wave(x));
      surf.lineTo(view.right + 50, view.top - 200);
      surf.lineTo(view.left - 50, view.top - 200);
      surf.closePath();
      const g = ctx.createLinearGradient(0, view.top - 200, 0, SURFACE_Y + 20);
      g.addColorStop(0, "rgba(225,250,255,0.95)");
      g.addColorStop(1, "rgba(160,225,245,0.5)");
      ctx.fillStyle = g;
      ctx.fill(surf);
      // shimmering underside
      const band = new Path2D();
      band.moveTo(view.left - 50, wave(view.left - 50));
      for (let x = view.left - 50; x <= view.right + 50; x += 30) band.lineTo(x, wave(x));
      band.lineTo(view.right + 50, SURFACE_Y + 220);
      band.lineTo(view.left - 50, SURFACE_Y + 220);
      band.closePath();
      ctx.clip(band);
      ctx.globalCompositeOperation = "lighter";
      const m = new DOMMatrix().translateSelf(time * 30, SURFACE_Y).scaleSelf(2.2, 0.55);
      pats.caustic.setTransform(m);
      ctx.fillStyle = pats.caustic;
      // strips with falling alpha give a soft fade instead of a hard edge
      const strips = 10;
      for (let i = 0; i < strips; i++) {
        const t = i / strips;
        ctx.globalAlpha = 0.34 * Math.pow(1 - t, 1.6);
        ctx.fillRect(view.left - 50, SURFACE_Y - 20 + t * 240, view.right - view.left + 100, 240 / strips + 1);
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(235,252,255,0.8)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = view.left - 50; x <= view.right + 50; x += 30) (x === view.left - 50 ? ctx.moveTo(x, wave(x)) : ctx.lineTo(x, wave(x)));
      ctx.stroke();
    }

    // --- giant kelp (tall, behind everything on the floor) ---
    for (const k of this.kelp) {
      if (!vis(k.x, 260)) continue;
      const baseY = this.floorY(k.x) + 6;
      if (baseY - k.h > view.bottom || baseY < view.top) continue;
      this._drawKelp(ctx, k, baseY, time);
    }

    const floorTop = this.floorBase - 60;
    if (view.bottom > floorTop - 400) {
      // back dune, hazier
      ctx.fillStyle = "rgba(70,92,96,0.55)";
      ctx.beginPath();
      ctx.moveTo(view.left - 50, worldH + 120);
      for (let x = view.left - 50; x <= view.right + 50; x += 60) {
        ctx.lineTo(x, this.floorBase - 40 + Math.sin(x * 0.004 + 2) * 30 + Math.sin(x * 0.011) * 10);
      }
      ctx.lineTo(view.right + 50, worldH + 120);
      ctx.fill();

      // rocks
      for (const r of this.rocks) {
        const w = r.spr.w * r.scale;
        const h = r.spr.h * r.scale;
        if (!vis(r.x, w)) continue;
        const y = this.floorY(r.x) + h * 0.2;
        if (y - h > view.bottom) continue;
        ctx.save();
        ctx.translate(r.x, y);
        if (r.flip) ctx.scale(-1, 1);
        ctx.drawImage(r.spr.canvas, -w / 2, -h, w, h);
        ctx.restore();
      }

      // corals (gentle sway: skew anchored at the base)
      for (const c of this.corals) {
        const w = c.spr.w * c.scale;
        const h = c.spr.h * c.scale;
        if (!vis(c.x, w)) continue;
        const y = this.floorY(c.x) + 14;
        if (y - h > view.bottom) continue;
        const sway = Math.sin(time * 0.8 + c.seed) * 0.05;
        ctx.save();
        ctx.transform(1, 0, sway, 1, -sway * y, 0);
        ctx.translate(c.x, y);
        if (c.flip) ctx.scale(-1, 1);
        ctx.drawImage(c.spr.canvas, -w / 2, -h, w, h);
        ctx.restore();
      }

      // --- sand (buries rock and coral bases) ---
      const sand = new Path2D();
      sand.moveTo(view.left - 50, worldH + 160);
      for (let x = view.left - 50; x <= view.right + 50; x += 40) sand.lineTo(x, this.floorY(x));
      sand.lineTo(view.right + 50, worldH + 160);
      sand.closePath();
      pats.sand.setTransform(new DOMMatrix([0.9, 0, 0, 0.55, 0, 0]));
      ctx.fillStyle = pats.sand;
      ctx.fill(sand);
      ctx.save();
      ctx.clip(sand);
      // water absorption: sand fades into blue with distance/depth
      const tint = ctx.createLinearGradient(0, this.floorBase - 60, 0, worldH + 40);
      tint.addColorStop(0, "rgba(40,95,120,0.55)");
      tint.addColorStop(0.3, "rgba(30,70,90,0.22)");
      tint.addColorStop(1, "rgba(5,25,40,0.5)");
      ctx.fillStyle = tint;
      ctx.fillRect(view.left - 50, this.floorBase - 80, view.right - view.left + 100, 400);
      // dancing caustics
      ctx.globalCompositeOperation = "lighter";
      pats.caustic.setTransform(this.causticMatrix(time, 0));
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = pats.caustic;
      ctx.fillRect(view.left - 50, this.floorBase - 80, view.right - view.left + 100, 400);
      pats.caustic2.setTransform(this.causticMatrix(time, 1));
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = pats.caustic2;
      ctx.fillRect(view.left - 50, this.floorBase - 80, view.right - view.left + 100, 400);
      ctx.restore();

      // pebbles, shells, starfish
      for (const p of this.pebbles) {
        if (!vis(p.x, 10)) continue;
        const y = this.floorY(p.x) + p.dy;
        const l = (40 + p.tone * 40) | 0;
        ctx.fillStyle = `rgb(${l + 20},${l + 14},${l})`;
        ctx.beginPath();
        ctx.ellipse(p.x, y, p.r, p.r * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.ellipse(p.x - p.r * 0.2, y - p.r * 0.25, p.r * 0.45, p.r * 0.2, 0, 0, TAU);
        ctx.fill();
      }
      for (const s of this.shells) {
        if (!vis(s.x, 20)) continue;
        ctx.save();
        ctx.translate(s.x, this.floorY(s.x) + 14);
        ctx.rotate(s.a);
        if (s.star) {
          ctx.fillStyle = `hsl(${s.hue + 5},70%,52%)`;
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? s.r * 0.42 : s.r * 1.1;
            const a = (i / 10) * TAU - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.55);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = "rgba(236,222,200,0.9)";
          ctx.beginPath();
          ctx.arc(0, 0, s.r, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "rgba(150,120,95,0.6)";
          ctx.lineWidth = 1;
          for (let i = 1; i < 5; i++) {
            const a = Math.PI + (i / 5) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * s.r, Math.sin(a) * s.r);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // anemones
    for (const a of this.anemones) {
      if (!vis(a.x, a.r * 3)) continue;
      const y = this.floorY(a.x) + 10;
      if (y - a.r * 3 > view.bottom) continue;
      this._drawAnemone(ctx, a, y, time);
    }

    // sea grass
    ctx.lineCap = "round";
    for (const g of this.grass) {
      if (!vis(g.x, 40)) continue;
      const y = this.floorY(g.x) + 12;
      if (y - 100 > view.bottom) continue;
      ctx.strokeStyle = `hsl(${g.hue},42%,${g.light}%)`;
      for (const b of g.blades) {
        const sway = Math.sin(time * 1.3 + b.ph + g.x * 0.01) * 0.25 + b.lean;
        const x0 = g.x + b.dx;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.quadraticCurveTo(x0 + sway * b.h * 0.3, y - b.h * 0.55, x0 + sway * b.h, y - b.h);
        ctx.stroke();
      }
    }

    // bubbles: ambient + vent columns
    ctx.save();
    ctx.lineWidth = 1.2;
    for (const list of [this.bubbles, this.ventBubbles]) {
      for (const b of list) {
        const x = b.x + Math.sin(b.wob) * 6;
        if (x < view.left - 20 || x > view.right + 20 || b.y < view.top - 20 || b.y > view.bottom + 20) continue;
        ctx.strokeStyle = "rgba(215,242,255,0.55)";
        ctx.fillStyle = "rgba(215,242,255,0.1)";
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Giant kelp: a slender stipe swaying in the current with long, wavy,
  // translucent golden-brown blades that trail downstream.
  _drawKelp(ctx, k, baseY, time) {
    const pts = [];
    for (let s = 0; s <= k.segs; s++) {
      const t = s / k.segs;
      const sway = Math.sin(time * 0.5 + k.seed + t * 2.2) * 70 * t * t + Math.sin(time * 1.2 + k.seed * 2 + t * 5) * 7 * t;
      pts.push([k.x + sway + t * 50, baseY - k.h * t]);
    }
    const dark = k.z; // 0 near .. 1 far: fade toward the water colour
    ctx.globalAlpha = 1 - dark * 0.45;
    ctx.strokeStyle = `hsl(${k.hue},40%,${18 - dark * 6}%)`;
    ctx.lineWidth = k.w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();

    const current = Math.sin(time * 0.5 + k.seed) * 0.35;
    for (let i = 2; i < pts.length; i++) {
      const [x, y] = pts[i];
      const side = i % 2 ? 1 : -1;
      const flutter = Math.sin(time * 1.4 + k.seed + i * 0.9);
      // blades rise at a shallow angle then droop with the current
      const ang = -Math.PI / 2 + side * (0.42 + flutter * 0.1) + current;
      const len = 70 + ((i * 37) % 5) * 9;
      const wid = 7 + (i % 3) * 1.5;
      const bend = side * 0.35 + current * 0.8;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const ex = x + ca * len + Math.cos(ang + bend) * len * 0.15;
      const ey = y + sa * len + Math.sin(ang + bend) * len * 0.15;
      const nx = -sa;
      const ny = ca;
      const wave = Math.sin(time * 3 + i) * 2;
      const p1x = x + ca * len * 0.33;
      const p1y = y + sa * len * 0.33;
      const p2x = x + ca * len * 0.7;
      const p2y = y + sa * len * 0.7;
      ctx.fillStyle = `hsla(${k.hue + (i % 3) * 3},58%,${30 - dark * 10 + (i % 4)}%,0.72)`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(p1x + nx * (wid + wave), p1y + ny * (wid + wave), p2x + nx * wid * 0.9, p2y + ny * wid * 0.9, ex, ey);
      ctx.bezierCurveTo(p2x - nx * wid * 0.8, p2y - ny * wid * 0.8, p1x - nx * (wid - wave), p1y - ny * (wid - wave), x, y);
      ctx.fill();
      ctx.fillStyle = `hsl(${k.hue + 6},55%,${34 - dark * 10}%)`;
      ctx.beginPath();
      ctx.ellipse(x + ca * 5, y + sa * 5, 3.5, 2.6, ang, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawAnemone(ctx, a, y, time) {
    const r = a.r;
    // column
    const cg = ctx.createLinearGradient(a.x - r * 0.6, 0, a.x + r * 0.6, 0);
    cg.addColorStop(0, "rgba(60,30,40,1)");
    cg.addColorStop(0.5, a.col[0]);
    cg.addColorStop(1, "rgba(60,30,40,1)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(a.x - r * 0.55, y);
    ctx.lineTo(a.x - r * 0.45, y - r * 0.8);
    ctx.lineTo(a.x + r * 0.45, y - r * 0.8);
    ctx.lineTo(a.x + r * 0.55, y);
    ctx.fill();
    // tentacles
    ctx.lineCap = "round";
    for (let i = 0; i < a.n; i++) {
      const t = i / (a.n - 1);
      const baseX = a.x + (t - 0.5) * r * 0.9;
      const baseY = y - r * 0.8;
      const ang = -Math.PI / 2 + (t - 0.5) * 2.4 + Math.sin(time * 1.4 + a.seed + i * 0.5) * 0.25;
      const len = r * (1.1 + Math.sin(i * 1.9 + a.seed) * 0.25);
      const bend = Math.sin(time * 1.8 + a.seed + i) * r * 0.25;
      const ex = baseX + Math.cos(ang) * len + bend;
      const ey = baseY + Math.sin(ang) * len;
      ctx.strokeStyle = a.col[0];
      ctx.lineWidth = r * 0.13;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(baseX + Math.cos(ang) * len * 0.5 - bend, baseY + Math.sin(ang) * len * 0.5, ex, ey);
      ctx.stroke();
      ctx.fillStyle = a.col[1];
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.08, 0, TAU);
      ctx.fill();
    }
  }

  // Soft contact shadow on the sand under fish swimming low.
  drawShadow(ctx, x, y, len) {
    const fy = this.floorY(x) + 10;
    const d = fy - y;
    if (d < 0 || d > 480) return;
    const k = 1 - d / 480;
    const rx = len * 0.5 * (1.2 - k * 0.4);
    const ry = rx * 0.2;
    ctx.globalAlpha = 0.5 * k * k;
    ctx.drawImage(this.shadowDot, x - rx, fy - ry, rx * 2, ry * 2);
    ctx.globalAlpha = 1;
  }
}

function mixColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}
