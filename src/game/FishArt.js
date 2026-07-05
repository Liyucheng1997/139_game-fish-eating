import { clamp, TAU } from "./utils.js";

// Species are keyed by size band so bigger fish genuinely look like bigger species.
// Each spec describes a procedurally drawn fish facing +x, length 1 (scaled by caller).
export const SPECIES = [
  {
    key: "minnow", name: "灯眼小鱼", maxLen: 42,
    h: 0.34, tail: 0.26, tailSpread: 0.42, dorsal: 0.1, nose: 0.5,
    top: "#8fd8e8", belly: "#e8fbff", fin: "rgba(160,225,240,0.85)",
    pattern: "shine",
  },
  {
    key: "clown", name: "小丑鱼", maxLen: 75,
    h: 0.46, tail: 0.24, tailSpread: 0.5, dorsal: 0.16, nose: 0.44,
    top: "#ff8c3b", belly: "#ffc48a", fin: "rgba(255,140,60,0.9)",
    pattern: "clownStripes",
  },
  {
    key: "angel", name: "神仙鱼", maxLen: 120,
    h: 0.62, tail: 0.2, tailSpread: 0.55, dorsal: 0.34, nose: 0.42,
    top: "#ffd24d", belly: "#fff3c4", fin: "rgba(255,200,70,0.85)",
    pattern: "angelStripes",
  },
  {
    key: "tuna", name: "青花鱼", maxLen: 190,
    h: 0.36, tail: 0.3, tailSpread: 0.58, dorsal: 0.14, nose: 0.5,
    top: "#4d7fb8", belly: "#d7e9f7", fin: "rgba(90,130,175,0.9)",
    pattern: "backStreaks",
  },
  {
    key: "grouper", name: "石斑鱼", maxLen: 300,
    h: 0.5, tail: 0.24, tailSpread: 0.52, dorsal: 0.2, nose: 0.44,
    top: "#7a9a5a", belly: "#d8e2b8", fin: "rgba(110,135,80,0.9)",
    pattern: "spots",
  },
  {
    key: "barracuda", name: "梭子鱼", maxLen: 460,
    h: 0.28, tail: 0.3, tailSpread: 0.5, dorsal: 0.12, nose: 0.56,
    top: "#8494a8", belly: "#dfe7ee", fin: "rgba(120,135,155,0.9)",
    pattern: "backStreaks", teeth: true,
  },
  {
    key: "whalefish", name: "深海巨鲸鱼", maxLen: 9999,
    h: 0.44, tail: 0.28, tailSpread: 0.6, dorsal: 0.16, nose: 0.4,
    top: "#5a6a9e", belly: "#c9d4f0", fin: "rgba(95,110,160,0.9)",
    pattern: "spots", teeth: true,
  },
];

export const PLAYER_SPEC = {
  key: "player", name: "你",
  h: 0.44, tail: 0.27, tailSpread: 0.55, dorsal: 0.2, nose: 0.46,
  top: "#ffb347", belly: "#ffe9bf", fin: "rgba(255,165,70,0.92)",
  pattern: "playerStripes",
};

export const GOLD_SPEC = {
  key: "gold", name: "黄金鱼",
  h: 0.42, tail: 0.26, tailSpread: 0.5, dorsal: 0.18, nose: 0.46,
  top: "#ffd700", belly: "#fff6c8", fin: "rgba(255,215,60,0.95)",
  pattern: "shine", glow: "rgba(255,215,80,0.85)",
};

export const SHARK_SPEC = {
  key: "shark", name: "巨齿鲨",
  h: 0.4, tail: 0.3, tailSpread: 0.62, dorsal: 0.3, nose: 0.52,
  top: "#5c6b7a", belly: "#e6edf2", fin: "rgba(80,95,110,0.95)",
  pattern: "gills", teeth: true, sharkTail: true,
};

export function speciesForLen(len) {
  for (const s of SPECIES) if (len <= s.maxLen) return s;
  return SPECIES[SPECIES.length - 1];
}

// ---------------------------------------------------------------------------
// Core fish painter. Draws at origin facing +x with body length L.
// state: { phase, swim (0..1 tail amplitude), mouthOpen (0..1), flip (bool),
//          alpha, glow (color|null), flash (0..1 white flash) }
// ---------------------------------------------------------------------------
export function drawFish(ctx, spec, L, state) {
  const { phase = 0, swim = 0.6, mouthOpen = 0, alpha = 1, glow = null, flash = 0 } = state;
  const H = L * spec.h;
  const tailAngle = Math.sin(phase) * (0.24 + swim * 0.3);
  const noseX = L * spec.nose;
  const tailBaseX = -L * (0.95 - spec.nose);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = L * 0.35;
  }

  // --- tail fin (rotates around its root) ---
  const tl = L * spec.tail;
  const ts = H * (0.5 + spec.tailSpread * 0.5);
  ctx.save();
  ctx.translate(tailBaseX, 0);
  ctx.rotate(tailAngle);
  ctx.fillStyle = spec.fin;
  ctx.beginPath();
  if (spec.sharkTail) {
    // Asymmetric crescent shark tail
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-tl * 0.7, -ts * 1.35, -tl * 1.15, -ts * 1.15);
    ctx.quadraticCurveTo(-tl * 0.55, -ts * 0.15, -tl * 0.75, ts * 0.7);
    ctx.quadraticCurveTo(-tl * 0.45, ts * 0.25, 0, 0);
  } else {
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-tl * 0.55, -ts * 0.25, -tl, -ts);
    ctx.quadraticCurveTo(-tl * 0.45, 0, -tl, ts);
    ctx.quadraticCurveTo(-tl * 0.55, ts * 0.25, 0, 0);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // --- dorsal fin ---
  const dh = H * (0.5 + spec.dorsal * 2);
  ctx.fillStyle = spec.fin;
  ctx.beginPath();
  ctx.moveTo(L * 0.16, -H * 0.42);
  ctx.quadraticCurveTo(L * 0.02, -dh, -L * 0.16, -dh * 0.82);
  ctx.quadraticCurveTo(-L * 0.2, -H * 0.5, -L * 0.24, -H * 0.32);
  ctx.closePath();
  ctx.fill();

  // --- ventral fin ---
  ctx.beginPath();
  ctx.moveTo(L * 0.02, H * 0.4);
  ctx.quadraticCurveTo(-L * 0.08, H * 0.75, -L * 0.2, H * 0.62);
  ctx.quadraticCurveTo(-L * 0.16, H * 0.45, -L * 0.2, H * 0.3);
  ctx.closePath();
  ctx.fill();

  // --- body ---
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(noseX, -H * 0.06);
    ctx.bezierCurveTo(noseX * 0.6, -H * 0.55, -L * 0.08, -H * 0.56, tailBaseX + L * 0.02, -H * 0.14);
    ctx.lineTo(tailBaseX + L * 0.02, H * 0.14);
    ctx.bezierCurveTo(-L * 0.08, H * 0.56, noseX * 0.6, H * 0.55, noseX, H * 0.06);
    ctx.closePath();
  };
  bodyPath();
  const grad = ctx.createLinearGradient(0, -H * 0.6, 0, H * 0.6);
  grad.addColorStop(0, spec.top);
  grad.addColorStop(0.55, spec.top);
  grad.addColorStop(1, spec.belly);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;

  // --- patterns (clipped to body) ---
  ctx.save();
  bodyPath();
  ctx.clip();
  drawPattern(ctx, spec, L, H, phase);
  // top-edge sheen
  const sheen = ctx.createLinearGradient(0, -H * 0.55, 0, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0.35)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-L * 0.5, -H * 0.6, L * 1.1, H * 0.45);
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * flash})`;
    ctx.fillRect(-L, -H, L * 2, H * 2);
  }
  ctx.restore();

  // --- pectoral fin (flaps with swim phase) ---
  ctx.save();
  ctx.translate(L * 0.08, H * 0.14);
  ctx.rotate(0.5 + Math.sin(phase * 1.3) * 0.25);
  ctx.fillStyle = spec.fin;
  ctx.beginPath();
  ctx.ellipse(-L * 0.07, 0, L * 0.11, H * 0.16, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // --- mouth ---
  const mo = clamp(mouthOpen, 0, 1);
  ctx.strokeStyle = "rgba(30,30,45,0.65)";
  ctx.lineWidth = Math.max(1, L * 0.014);
  ctx.beginPath();
  if (mo > 0.05) {
    ctx.moveTo(noseX, -H * 0.05 - H * 0.14 * mo);
    ctx.quadraticCurveTo(noseX - L * 0.1, 0, noseX, H * 0.05 + H * 0.16 * mo);
  } else {
    ctx.moveTo(noseX - L * 0.005, 0);
    ctx.quadraticCurveTo(noseX - L * 0.06, H * 0.03, noseX - L * 0.11, H * 0.02);
  }
  ctx.stroke();
  if (spec.teeth && mo > 0.15) {
    ctx.fillStyle = "#fff";
    const n = 3;
    for (let i = 0; i < n; i++) {
      const ty = -H * 0.1 * mo + (i / (n - 1)) * H * 0.2 * mo;
      ctx.beginPath();
      ctx.moveTo(noseX - L * 0.02, ty - H * 0.02);
      ctx.lineTo(noseX - L * 0.07, ty);
      ctx.lineTo(noseX - L * 0.02, ty + H * 0.02);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- eye ---
  const ex = L * 0.3;
  const ey = -H * 0.12;
  const er = Math.max(1.5, H * 0.13);
  ctx.fillStyle = "#f4f9ff";
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1c2333";
  ctx.beginPath();
  ctx.arc(ex + er * 0.25, ey, er * 0.55, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(ex + er * 0.05, ey - er * 0.3, er * 0.22, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawPattern(ctx, spec, L, H, phase) {
  switch (spec.pattern) {
    case "clownStripes": {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.strokeStyle = "rgba(40,40,50,0.5)";
      ctx.lineWidth = L * 0.012;
      for (const x of [0.24, -0.05, -0.32]) {
        ctx.beginPath();
        ctx.ellipse(L * x, 0, L * 0.055, H * 0.62, -0.08, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case "angelStripes": {
      ctx.fillStyle = "rgba(40,60,110,0.55)";
      for (const x of [0.18, -0.04, -0.26]) {
        ctx.save();
        ctx.translate(L * x, 0);
        ctx.rotate(-0.12);
        ctx.fillRect(-L * 0.035, -H * 0.7, L * 0.07, H * 1.4);
        ctx.restore();
      }
      break;
    }
    case "backStreaks": {
      ctx.strokeStyle = "rgba(25,45,80,0.4)";
      ctx.lineWidth = L * 0.014;
      for (let i = 0; i < 5; i++) {
        const x = L * (0.3 - i * 0.14);
        ctx.beginPath();
        ctx.moveTo(x, -H * 0.5);
        ctx.quadraticCurveTo(x - L * 0.05, -H * 0.25, x, -H * 0.05);
        ctx.stroke();
      }
      break;
    }
    case "spots": {
      ctx.fillStyle = "rgba(50,60,30,0.3)";
      const pts = [[0.25, -0.2], [0.1, 0.1], [-0.08, -0.25], [-0.2, 0.15], [-0.3, -0.05], [0.02, -0.05], [0.32, 0.12]];
      for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(L * px, H * py, L * 0.035, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "playerStripes": {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (const x of [0.14, -0.1]) {
        ctx.save();
        ctx.translate(L * x, 0);
        ctx.rotate(-0.1);
        ctx.fillRect(-L * 0.028, -H * 0.65, L * 0.056, H * 1.3);
        ctx.restore();
      }
      ctx.fillStyle = "rgba(200,80,30,0.35)";
      ctx.beginPath();
      ctx.ellipse(-L * 0.28, -H * 0.1, L * 0.08, H * 0.2, 0.3, 0, TAU);
      ctx.fill();
      break;
    }
    case "shine": {
      const g = ctx.createLinearGradient(-L * 0.3, 0, L * 0.4, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5 + Math.sin(phase * 0.7) * 0.15, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-L * 0.5, -H * 0.6, L * 1.1, H * 1.2);
      break;
    }
    case "gills": {
      ctx.strokeStyle = "rgba(40,55,70,0.55)";
      ctx.lineWidth = L * 0.012;
      for (let i = 0; i < 4; i++) {
        const x = L * (0.16 - i * 0.045);
        ctx.beginPath();
        ctx.moveTo(x, -H * 0.18);
        ctx.quadraticCurveTo(x - L * 0.03, 0, x, H * 0.2);
        ctx.stroke();
      }
      break;
    }
  }
}

// --- Puffer fish: round body, inflates with spikes ---
export function drawPuffer(ctx, L, state) {
  const { phase = 0, inflate = 0, alpha = 1 } = state; // inflate 0..1
  const R = L * (0.3 + inflate * 0.28);
  ctx.save();
  ctx.globalAlpha = alpha;

  // tail
  ctx.save();
  ctx.translate(-R * 0.95, 0);
  ctx.rotate(Math.sin(phase) * 0.3);
  ctx.fillStyle = "rgba(214,168,90,0.9)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-R * 0.5, -R * 0.35, -R * 0.7, -R * 0.45);
  ctx.quadraticCurveTo(-R * 0.35, 0, -R * 0.7, R * 0.45);
  ctx.quadraticCurveTo(-R * 0.5, R * 0.35, 0, 0);
  ctx.fill();
  ctx.restore();

  // spikes
  if (inflate > 0.1) {
    const n = 14;
    const spike = R * (0.12 + inflate * 0.22);
    ctx.fillStyle = "#c98a3e";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.12;
      const bx = Math.cos(a) * R * 0.96;
      const by = Math.sin(a) * R * 0.96;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.09);
      ctx.lineTo(spike, 0);
      ctx.lineTo(0, R * 0.09);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // body
  const grad = ctx.createRadialGradient(-R * 0.2, -R * 0.3, R * 0.2, 0, 0, R * 1.1);
  grad.addColorStop(0, "#f5d9a0");
  grad.addColorStop(0.6, "#e8b96a");
  grad.addColorStop(1, "#c9903f");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();

  // belly
  ctx.fillStyle = "rgba(255,248,225,0.75)";
  ctx.beginPath();
  ctx.ellipse(R * 0.1, R * 0.4, R * 0.6, R * 0.4, 0, 0, TAU);
  ctx.fill();

  // spots
  ctx.fillStyle = "rgba(140,90,30,0.45)";
  for (const [px, py] of [[-0.3, -0.4], [0.1, -0.55], [0.45, -0.25], [-0.55, 0.05], [-0.1, -0.15]]) {
    ctx.beginPath();
    ctx.arc(R * px, R * py, R * 0.09, 0, TAU);
    ctx.fill();
  }

  // grumpy mouth + eye
  ctx.strokeStyle = "rgba(60,40,20,0.7)";
  ctx.lineWidth = Math.max(1, R * 0.05);
  ctx.beginPath();
  ctx.arc(R * 0.72, R * 0.1, R * 0.16, Math.PI * 1.2, Math.PI * 1.85);
  ctx.stroke();
  const er = R * 0.16;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(R * 0.5, -R * 0.28, er, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#252b3a";
  ctx.beginPath();
  ctx.arc(R * 0.54, -R * 0.28, er * 0.55, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// --- Jellyfish: translucent bell + wavy tentacles ---
export function drawJellyfish(ctx, L, state) {
  const { phase = 0, alpha = 1 } = state;
  const R = L * 0.4;
  const pulse = 1 + Math.sin(phase * 1.6) * 0.08;
  ctx.save();
  ctx.globalAlpha = alpha;

  // tentacles
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const x0 = (i / 5 - 0.5) * R * 1.4;
    const sway = Math.sin(phase * 2 + i * 1.1) * R * 0.3;
    const len = R * (1.7 + (i % 3) * 0.35);
    ctx.strokeStyle = `rgba(228,140,255,${0.4 - i * 0.03})`;
    ctx.lineWidth = Math.max(1, R * 0.07);
    ctx.beginPath();
    ctx.moveTo(x0, R * 0.25);
    ctx.bezierCurveTo(x0 + sway * 0.4, R * 0.9, x0 - sway, R * 1.4, x0 + sway, R * 0.25 + len);
    ctx.stroke();
  }

  // bell
  const grad = ctx.createRadialGradient(0, -R * 0.25, R * 0.1, 0, 0, R * 1.15);
  grad.addColorStop(0, "rgba(255,220,255,0.85)");
  grad.addColorStop(0.6, "rgba(220,130,250,0.55)");
  grad.addColorStop(1, "rgba(170,80,230,0.15)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 1.05 * pulse, R * (2 - pulse), 0, Math.PI, 0);
  ctx.quadraticCurveTo(R * 0.6 * pulse, R * 0.45, 0, R * 0.32);
  ctx.quadraticCurveTo(-R * 0.6 * pulse, R * 0.45, -R * 1.05 * pulse, 0);
  ctx.closePath();
  ctx.fill();

  // inner glow dots
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 4; i++) {
    const a = phase + i * 1.7;
    ctx.beginPath();
    ctx.arc(Math.sin(a) * R * 0.4, -R * 0.3 + Math.cos(a * 0.8) * R * 0.2, R * 0.07, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// --- Power-up icons (drawn in a bubble) ---
export function drawPowerUp(ctx, type, r, t) {
  const bob = Math.sin(t * 2.4) * r * 0.12;
  ctx.save();
  ctx.translate(0, bob);

  // bubble
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r * 1.15);
  grad.addColorStop(0, "rgba(255,255,255,0.4)");
  grad.addColorStop(0.7, "rgba(180,230,255,0.18)");
  grad.addColorStop(1, "rgba(150,215,255,0.35)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(220,245,255,0.7)";
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();

  const s = r * 0.58;
  if (type === "star") {
    ctx.fillStyle = "#ffd94d";
    ctx.shadowColor = "rgba(255,215,80,0.9)";
    ctx.shadowBlur = r * 0.5;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? s : s * 0.45;
      const a = -Math.PI / 2 + (i / 10) * TAU;
      ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  } else if (type === "magnet") {
    ctx.strokeStyle = "#ff5d5d";
    ctx.lineWidth = s * 0.42;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.arc(0, -s * 0.15, s * 0.62, Math.PI, 0, false);
    ctx.stroke();
    ctx.strokeStyle = "#e8f4ff";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * s * 0.62, -s * 0.15);
      ctx.lineTo(sx * s * 0.62, s * 0.45);
      ctx.stroke();
    }
  } else if (type === "bolt") {
    ctx.fillStyle = "#7df9ff";
    ctx.shadowColor = "rgba(120,240,255,0.9)";
    ctx.shadowBlur = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(s * 0.25, -s);
    ctx.lineTo(-s * 0.5, s * 0.15);
    ctx.lineTo(-s * 0.05, s * 0.15);
    ctx.lineTo(-s * 0.25, s);
    ctx.lineTo(s * 0.5, -s * 0.15);
    ctx.lineTo(s * 0.05, -s * 0.15);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
