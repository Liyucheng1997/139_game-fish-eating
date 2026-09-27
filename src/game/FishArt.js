import { clamp, lerp, TAU } from "./utils.js";

// ---------------------------------------------------------------------------
// Procedural "realistic" fish renderer.
//
// Every fish is built around a spine sampled at N points from snout (u = 0) to
// the caudal peduncle (u = 1). A species profile gives the dorsal/ventral edge
// at each u; a travelling wave, a turning bend and a gulp bulge deform it every
// frame. The jaw is a real hinge: the lower jaw rotates down around a pivot and
// the skull lifts a little, cutting an actual gape into the silhouette.
// Fins are translucent membranes with rays; the tail foreshortens as it beats.
// Fish face +x, length L (including tail fin), centred roughly at the origin.
// ---------------------------------------------------------------------------

const N = 26;
const US = Array.from({ length: N }, (_, i) => i / (N - 1));
const HALF_PI = Math.PI / 2;

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- lighting
// The game shares its caustic pattern so light ripples across fish backs in
// world space (fish swim *through* the light instead of carrying it along).
const light = { pattern: null, world: null, tex: null, strength: 0 };
export function setFishLighting(pattern, worldMatrix, texMatrix, strength) {
  light.pattern = pattern;
  light.world = worldMatrix;
  light.tex = texMatrix;
  light.strength = strength;
}

// Overlapping-scale texture tile (arcs convex toward the tail).
let scaleTile = null;
function scalePattern(ctx) {
  if (scaleTile) return scaleTile;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 24;
  const g = c.getContext("2d");
  for (let row = -1; row <= 2; row++) {
    for (let col = -1; col <= 2; col++) {
      const x = col * 16 + (row & 1) * 8 + 4;
      const y = row * 12 + 6;
      g.strokeStyle = "rgba(0,0,0,0.6)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(x, y, 9, HALF_PI, HALF_PI * 3);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.45)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x + 1.6, y, 7, HALF_PI * 1.2, HALF_PI * 2.8);
      g.stroke();
    }
  }
  scaleTile = ctx.createPattern(c, "repeat");
  return scaleTile;
}

// ---------------------------------------------------------------- species
const FIN_DEFAULT = "rgba(150,170,185,0.7)";

function mkSpec(o) {
  const s = {
    snoutX: 0.5, bodyLen: 0.8, waveK: 4.2,
    mouthU: 0, hingeU: 0.1, hingeDrop: 0.008, gape: 0.5, upperLift: 0.2, lipCurve: 0.005,
    eyeU: 0.085, eyeV: -0.3, eyeR: 0.024, iris: "#d8c27a", pupil: "#0b0d12",
    gillU: 0.2, latV: -0.28, latColor: "rgba(255,255,255,0.18)",
    scaleAlpha: 0.14, scaleSize: 0.026, sheen: 0, rim: 0.2,
    fins: [], caudal: { shape: "fork", len: 0.2, span: 0.11 },
    finColor: FIN_DEFAULT, finEdge: "rgba(200,220,230,0.12)", rayColor: "rgba(30,40,50,0.25)",
    teeth: null, pattern: null, seed: 1, finlets: null,
    ...o,
  };
  // pre-sample the static profile on the spine grid
  s._top = new Float32Array(N);
  s._bot = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const [t, b] = sampleProfile(s.profile, US[i]);
    s._top[i] = t;
    s._bot[i] = b;
  }
  // hinge height across the body (v in -1..1) — default: just below the mouth tip
  if (s.hingeV == null) {
    const tipY = interp(s._bot, s.mouthU);
    const t = interp(s._top, s.hingeU);
    const b = interp(s._bot, s.hingeU);
    s.hingeV = clamp(((tipY + s.hingeDrop - t) / (b - t)) * 2 - 1, -0.9, 0.9);
  }
  return s;
}

// Catmull-Rom through profile keys [u, dorsalY, ventralY] (units of L)
function sampleProfile(prof, u) {
  let i = 0;
  while (i < prof.length - 2 && u > prof[i + 1][0]) i++;
  const p0 = prof[Math.max(0, i - 1)];
  const p1 = prof[i];
  const p2 = prof[i + 1];
  const p3 = prof[Math.min(prof.length - 1, i + 2)];
  const t = clamp((u - p1[0]) / (p2[0] - p1[0] || 1), 0, 1);
  return [cr(p0[1], p1[1], p2[1], p3[1], t), cr(p0[2], p1[2], p2[2], p3[2], t)];
}
function cr(a, b, c, d, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
function interp(arr, u) {
  const f = clamp(u, 0, 1) * (N - 1);
  const i = Math.min(N - 2, f | 0);
  const t = f - i;
  return arr[i] + (arr[i + 1] - arr[i]) * t;
}

export const SPECIES = [
  mkSpec({
    key: "sardine", name: "沙丁鱼", maxLen: 42, seed: 3,
    profile: [[0, 0.004, 0.004], [0.04, -0.034, 0.03], [0.13, -0.072, 0.066], [0.32, -0.09, 0.084], [0.52, -0.084, 0.078], [0.74, -0.056, 0.052], [0.92, -0.026, 0.025], [1, -0.02, 0.019]],
    hingeU: 0.11, gape: 0.75, eyeU: 0.075, eyeV: -0.12, eyeR: 0.026, iris: "#b9c2c8", gillU: 0.16,
    body: [[0, "#1d4e68"], [0.34, "#3f7f98"], [0.5, "#b9d3dd"], [1, "#f4f8fa"]],
    sheen: 1, scaleAlpha: 0.1, pattern: "sardine",
    finColor: "rgba(170,200,212,0.5)", finEdge: "rgba(210,230,238,0.1)",
    fins: [
      { kind: "dorsal", u0: 0.38, u1: 0.52, h: 0.075, rake: 0.55, shape: "tri" },
      { kind: "anal", u0: 0.74, u1: 0.86, h: 0.035, rake: 0.7, shape: "tri" },
      { kind: "anal", u0: 0.46, u1: 0.5, h: 0.04, rake: 1.0, shape: "tri" },
      { kind: "pectoral", u: 0.19, v: 0.45, h: 0.075, front: true },
    ],
    caudal: { shape: "fork", len: 0.21, span: 0.1 },
  }),
  mkSpec({
    key: "clown", name: "小丑鱼", maxLen: 75, seed: 7,
    profile: [[0, 0.02, 0.02], [0.04, -0.07, 0.075], [0.14, -0.15, 0.15], [0.32, -0.19, 0.18], [0.52, -0.175, 0.165], [0.72, -0.12, 0.11], [0.9, -0.07, 0.066], [1, -0.062, 0.058]],
    hingeU: 0.1, gape: 0.7, eyeU: 0.095, eyeV: -0.32, eyeR: 0.034, iris: "#d9661e", gillU: 0.19,
    body: [[0, "#d94a12"], [0.4, "#fb6f1c"], [0.75, "#ff8a33"], [1, "#ffa75a"]],
    scaleAlpha: 0.08, pattern: "clown", rim: 0.26,
    finColor: "rgba(252,112,32,0.92)", finEdge: "rgba(255,150,70,0.85)", rayColor: "rgba(120,40,10,0.28)", finRim: "rgba(15,10,10,0.9)",
    fins: [
      { kind: "dorsal", u0: 0.24, u1: 0.5, h: 0.085, rake: 0.3, shape: "round", spines: 9 },
      { kind: "dorsal", u0: 0.5, u1: 0.8, h: 0.11, rake: 0.45, shape: "round" },
      { kind: "anal", u0: 0.6, u1: 0.84, h: 0.1, rake: 0.45, shape: "round" },
      { kind: "anal", u0: 0.36, u1: 0.42, h: 0.08, rake: 0.9, shape: "tri" },
      { kind: "pectoral", u: 0.2, v: 0.35, h: 0.1, front: true, color: "rgba(255,125,40,0.88)" },
    ],
    caudal: { shape: "round", len: 0.2, span: 0.13, rim: true },
  }),
  mkSpec({
    key: "angel", name: "皇帝神仙鱼", maxLen: 120, seed: 11,
    profile: [[0, 0.03, 0.03], [0.05, -0.1, 0.085], [0.16, -0.22, 0.2], [0.36, -0.28, 0.265], [0.56, -0.26, 0.245], [0.76, -0.17, 0.16], [0.92, -0.085, 0.08], [1, -0.07, 0.066]],
    hingeU: 0.09, gape: 0.65, eyeU: 0.1, eyeV: -0.3, eyeR: 0.028, iris: "#3a5fd0", gillU: 0.2,
    body: [[0, "#1b2f8f"], [0.45, "#2446b8"], [1, "#2b52c6"]],
    scaleAlpha: 0.1, pattern: "emperor", rim: 0.3,
    finColor: "rgba(28,52,150,0.95)", finEdge: "rgba(60,110,230,0.8)", rayColor: "rgba(255,210,70,0.35)", finRim: "rgba(120,190,255,0.9)",
    fins: [
      { kind: "dorsal", u0: 0.2, u1: 0.92, h: 0.13, rake: 0.75, shape: "sail" },
      { kind: "anal", u0: 0.48, u1: 0.92, h: 0.12, rake: 0.75, shape: "sail" },
      { kind: "anal", u0: 0.3, u1: 0.35, h: 0.1, rake: 0.9, shape: "tri", color: "rgba(40,70,190,0.9)" },
      { kind: "pectoral", u: 0.22, v: 0.3, h: 0.09, front: true, color: "rgba(255,210,60,0.55)", edge: "rgba(255,230,120,0.2)" },
    ],
    caudal: { shape: "round", len: 0.2, span: 0.16, color: "rgba(255,196,36,0.97)", edge: "rgba(255,215,90,0.85)" },
  }),
  mkSpec({
    key: "mackerel", name: "青花鱼", maxLen: 190, seed: 17,
    profile: [[0, 0.005, 0.005], [0.04, -0.04, 0.035], [0.14, -0.085, 0.078], [0.36, -0.104, 0.096], [0.56, -0.094, 0.086], [0.76, -0.058, 0.054], [0.93, -0.02, 0.02], [1, -0.015, 0.015]],
    hingeU: 0.13, gape: 0.75, eyeU: 0.075, eyeV: -0.14, eyeR: 0.021, iris: "#c8ccc0", gillU: 0.19,
    body: [[0, "#123f4c"], [0.35, "#2f7784"], [0.52, "#b8d6db"], [1, "#f1f6f6"]],
    sheen: 0.9, scaleAlpha: 0.06, pattern: "mackerel",
    finColor: "rgba(90,125,135,0.72)", finEdge: "rgba(160,190,200,0.2)",
    fins: [
      { kind: "dorsal", u0: 0.3, u1: 0.46, h: 0.07, rake: 0.5, shape: "tri", spines: 8 },
      { kind: "dorsal", u0: 0.6, u1: 0.68, h: 0.045, rake: 0.6, shape: "tri" },
      { kind: "anal", u0: 0.63, u1: 0.71, h: 0.04, rake: 0.6, shape: "tri" },
      { kind: "anal", u0: 0.4, u1: 0.44, h: 0.035, rake: 1.0, shape: "tri" },
      { kind: "pectoral", u: 0.2, v: 0.0, h: 0.07, front: true },
    ],
    finlets: { from: 0.72, to: 0.93, count: 5, color: "rgba(120,150,150,0.85)" },
    caudal: { shape: "fork", len: 0.22, span: 0.14 },
  }),
  mkSpec({
    key: "grouper", name: "石斑鱼", maxLen: 300, seed: 23,
    profile: [[0, 0.018, 0.018], [0.04, -0.07, 0.085], [0.14, -0.15, 0.16], [0.32, -0.19, 0.185], [0.52, -0.18, 0.172], [0.72, -0.13, 0.12], [0.9, -0.082, 0.078], [1, -0.075, 0.07]],
    hingeU: 0.19, hingeDrop: 0.02, gape: 0.8, upperLift: 0.25, eyeU: 0.09, eyeV: -0.46, eyeR: 0.02, iris: "#b58a3a", gillU: 0.25,
    body: [[0, "#4a3a26"], [0.4, "#7a6444"], [0.75, "#a58e62"], [1, "#d2c196"]],
    scaleAlpha: 0.12, pattern: "grouper", rim: 0.3,
    finColor: "rgba(95,75,50,0.9)", finEdge: "rgba(140,115,80,0.55)", rayColor: "rgba(35,25,15,0.35)",
    teeth: { n: 7, size: 0.013 },
    fins: [
      { kind: "dorsal", u0: 0.2, u1: 0.5, h: 0.07, rake: 0.35, shape: "round", spines: 11 },
      { kind: "dorsal", u0: 0.5, u1: 0.8, h: 0.085, rake: 0.4, shape: "round" },
      { kind: "anal", u0: 0.62, u1: 0.82, h: 0.075, rake: 0.4, shape: "round" },
      { kind: "anal", u0: 0.34, u1: 0.4, h: 0.07, rake: 0.95, shape: "round" },
      { kind: "pectoral", u: 0.26, v: 0.3, h: 0.1, front: true, color: "rgba(120,95,62,0.85)" },
    ],
    caudal: { shape: "round", len: 0.19, span: 0.12 },
  }),
  mkSpec({
    key: "barracuda", name: "梭子鱼", maxLen: 460, seed: 29,
    snoutX: 0.5, bodyLen: 0.83, waveK: 5,
    profile: [[0, 0.014, 0.014], [0.03, -0.018, 0.028], [0.1, -0.042, 0.052], [0.3, -0.062, 0.066], [0.56, -0.06, 0.06], [0.8, -0.043, 0.041], [0.95, -0.025, 0.024], [1, -0.022, 0.021]],
    hingeU: 0.15, hingeDrop: -0.004, gape: 0.7, upperLift: 0.18, eyeU: 0.1, eyeV: -0.28, eyeR: 0.016, iris: "#cfc9a8", gillU: 0.17,
    body: [[0, "#2c4050"], [0.35, "#61798a"], [0.55, "#c4d0d8"], [1, "#f1f4f6"]],
    sheen: 0.7, scaleAlpha: 0.07, pattern: "barracuda",
    finColor: "rgba(70,85,100,0.8)", finEdge: "rgba(120,140,160,0.25)",
    teeth: { n: 6, size: 0.022, fangs: true },
    fins: [
      { kind: "dorsal", u0: 0.34, u1: 0.42, h: 0.05, rake: 0.4, shape: "tri", spines: 5 },
      { kind: "dorsal", u0: 0.66, u1: 0.73, h: 0.04, rake: 0.55, shape: "tri" },
      { kind: "anal", u0: 0.68, u1: 0.75, h: 0.04, rake: 0.55, shape: "tri" },
      { kind: "anal", u0: 0.42, u1: 0.46, h: 0.035, rake: 1.0, shape: "tri" },
      { kind: "pectoral", u: 0.19, v: 0.3, h: 0.055, front: true },
    ],
    caudal: { shape: "fork", len: 0.18, span: 0.1, darkTip: true },
  }),
  mkSpec({
    key: "bluefin", name: "蓝鳍金枪鱼", maxLen: 9999, seed: 31,
    profile: [[0, 0.006, 0.006], [0.04, -0.042, 0.038], [0.15, -0.1, 0.09], [0.36, -0.12, 0.112], [0.56, -0.108, 0.1], [0.78, -0.056, 0.052], [0.94, -0.018, 0.018], [1, -0.014, 0.014]],
    hingeU: 0.13, gape: 0.75, eyeU: 0.08, eyeV: -0.16, eyeR: 0.019, iris: "#b8b29a", gillU: 0.2,
    body: [[0, "#0a1b3a"], [0.38, "#1d3f6e"], [0.52, "#8fa3b8"], [1, "#eef2f5"]],
    sheen: 1, scaleAlpha: 0.04, pattern: "tuna", rim: 0.26,
    finColor: "rgba(40,55,80,0.85)", finEdge: "rgba(90,110,140,0.35)",
    fins: [
      { kind: "dorsal", u0: 0.3, u1: 0.44, h: 0.05, rake: 0.6, shape: "tri", spines: 10 },
      { kind: "dorsal", u0: 0.5, u1: 0.57, h: 0.1, rake: 0.75, shape: "sickle", color: "rgba(120,110,80,0.85)" },
      { kind: "anal", u0: 0.53, u1: 0.6, h: 0.09, rake: 0.75, shape: "sickle", color: "rgba(150,145,120,0.8)" },
      { kind: "pectoral", u: 0.21, v: -0.05, h: 0.12, front: true, slim: true },
    ],
    finlets: { from: 0.66, to: 0.93, count: 8, color: "rgba(250,205,40,0.95)", edge: "rgba(30,30,30,0.8)" },
    caudal: { shape: "lunate", len: 0.2, span: 0.2, color: "rgba(30,45,70,0.95)" },
  }),
];

export const PLAYER_SPEC = mkSpec({
  key: "player", name: "你", seed: 41,
  profile: [[0, 0.018, 0.018], [0.02, -0.06, 0.04], [0.08, -0.135, 0.075], [0.18, -0.15, 0.105], [0.38, -0.138, 0.11], [0.62, -0.098, 0.084], [0.86, -0.044, 0.04], [1, -0.028, 0.026]],
  hingeU: 0.13, gape: 0.8, upperLift: 0.22, eyeU: 0.07, eyeV: 0.02, eyeR: 0.026, iris: "#f3d266", gillU: 0.18,
  body: [[0, "#15735f"], [0.26, "#39a067"], [0.48, "#e6c53a"], [0.8, "#f6dc5a"], [1, "#fff2b0"]],
  sheen: 0.8, scaleAlpha: 0.08, pattern: "mahi", rim: 0.24,
  finColor: "rgba(30,110,210,0.88)", finEdge: "rgba(90,180,255,0.55)", rayColor: "rgba(10,40,90,0.35)",
  teeth: { n: 5, size: 0.012 },
  fins: [
    { kind: "dorsal", u0: 0.05, u1: 0.9, h: 0.085, rake: 0.55, shape: "long" },
    { kind: "anal", u0: 0.5, u1: 0.9, h: 0.06, rake: 0.55, shape: "long", color: "rgba(230,190,50,0.85)", edge: "rgba(255,230,120,0.4)" },
    { kind: "anal", u0: 0.28, u1: 0.33, h: 0.06, rake: 0.95, shape: "tri", color: "rgba(60,140,230,0.8)" },
    { kind: "pectoral", u: 0.2, v: 0.25, h: 0.09, front: true, color: "rgba(240,205,70,0.75)", edge: "rgba(80,170,255,0.35)" },
  ],
  caudal: { shape: "fork", len: 0.22, span: 0.15, color: "rgba(235,200,50,0.95)", edge: "rgba(120,200,255,0.55)" },
});

export const GOLD_SPEC = mkSpec({
  key: "gold", name: "黄金鱼", seed: 43,
  profile: [[0, 0.012, 0.012], [0.05, -0.08, 0.07], [0.16, -0.165, 0.14], [0.36, -0.195, 0.175], [0.56, -0.165, 0.155], [0.78, -0.09, 0.082], [0.93, -0.04, 0.036], [1, -0.034, 0.03]],
  hingeU: 0.1, gape: 0.7, eyeU: 0.09, eyeV: -0.3, eyeR: 0.03, iris: "#ff9d2e", gillU: 0.2,
  body: [[0, "#c77f00"], [0.4, "#f3b416"], [0.75, "#ffd84a"], [1, "#fff2b8"]],
  sheen: 1.4, scaleAlpha: 0.2, pattern: "gold",
  finColor: "rgba(255,190,40,0.85)", finEdge: "rgba(255,235,150,0.4)", rayColor: "rgba(160,90,0,0.35)",
  fins: [
    { kind: "dorsal", u0: 0.25, u1: 0.72, h: 0.1, rake: 0.5, shape: "round", spines: 10 },
    { kind: "anal", u0: 0.6, u1: 0.8, h: 0.08, rake: 0.5, shape: "round" },
    { kind: "anal", u0: 0.36, u1: 0.41, h: 0.07, rake: 0.95, shape: "tri" },
    { kind: "pectoral", u: 0.21, v: 0.2, h: 0.09, front: true },
  ],
  caudal: { shape: "fork", len: 0.22, span: 0.14 },
  glow: "rgba(255,215,80,0.85)",
});

export const SHARK_SPEC = mkSpec({
  key: "shark", name: "巨齿鲨", seed: 47,
  waveK: 3.4,
  profile: [[0, -0.004, 0.006], [0.03, -0.038, 0.034], [0.1, -0.082, 0.074], [0.3, -0.128, 0.118], [0.5, -0.118, 0.1], [0.72, -0.066, 0.056], [0.9, -0.032, 0.03], [1, -0.03, 0.028]],
  mouthU: 0.07, hingeU: 0.2, hingeV: 0.35, gape: 0.72, upperLift: 0.32, lipCurve: -0.01,
  eyeU: 0.1, eyeV: -0.28, eyeR: 0.012, iris: "#050608", pupil: "#000",
  gillU: 0.99, latColor: "rgba(0,0,0,0)",
  body: [[0, "#46525d"], [0.4, "#66737e"], [0.56, "#8894a0"], [1, "#eef1f3"]],
  scaleAlpha: 0, pattern: "shark", rim: 0.3,
  finColor: "rgba(80,92,104,0.98)", finEdge: "rgba(70,82,94,0.95)", rayColor: "rgba(0,0,0,0)",
  teeth: { n: 9, size: 0.02, shark: true },
  fins: [
    { kind: "dorsal", u0: 0.34, u1: 0.5, h: 0.16, rake: 0.62, shape: "shark" },
    { kind: "dorsal", u0: 0.82, u1: 0.86, h: 0.03, rake: 0.6, shape: "shark" },
    { kind: "anal", u0: 0.8, u1: 0.84, h: 0.028, rake: 0.7, shape: "shark" },
    { kind: "anal", u0: 0.6, u1: 0.66, h: 0.045, rake: 0.9, shape: "shark" },
    { kind: "pectoral", u: 0.24, v: 0.6, h: 0.19, front: true, shark: true, color: "rgba(88,100,112,0.98)", edge: "rgba(70,80,92,0.98)" },
  ],
  caudal: { shape: "shark", len: 0.23, span: 0.21, color: "rgba(76,88,100,0.98)", edge: "rgba(64,74,86,0.98)" },
});

export function speciesForLen(len) {
  for (const s of SPECIES) if (len <= s.maxLen) return s;
  return SPECIES[SPECIES.length - 1];
}

// ---------------------------------------------------------------- geometry
function geometry(spec, L, phase, swim, bend, gulpT, gulpSize) {
  const xs = L * spec.snoutX;
  const bl = L * spec.bodyLen;
  const amp = L * (0.006 + 0.016 * clamp(swim, 0, 1.5));
  const X = new Float32Array(N);
  const T = new Float32Array(N);
  const B = new Float32Array(N);
  let bulgeC = -1;
  let bulgeA = 0;
  if (gulpT >= 0 && gulpT <= 1) {
    bulgeC = 0.16 + 0.44 * gulpT;
    bulgeA = Math.sin(Math.PI * Math.min(1, gulpT * 1.3)) * (0.018 + 0.06 * gulpSize) * L;
  }
  for (let i = 0; i < N; i++) {
    const u = US[i];
    const off = amp * (0.08 + u * u * 1.2) * Math.sin(phase - u * spec.waveK) + bend * L * 0.16 * u * u;
    X[i] = xs - u * bl;
    let t = spec._top[i] * L + off;
    let b = spec._bot[i] * L + off;
    if (bulgeA > 0) {
      const d = (u - bulgeC) / 0.13;
      const k = bulgeA * Math.exp(-d * d);
      b += k;
      t -= k * 0.3;
    }
    T[i] = t;
    B[i] = b;
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    if (T[i] < minY) minY = T[i];
    if (B[i] > maxY) maxY = B[i];
  }
  return { X, T, B, xs, bl, minY, maxY, L };
}

function bodyPt(g, u, v) {
  const t = interp(g.T, u);
  const b = interp(g.B, u);
  return [interp(g.X, u), lerp(t, b, (v + 1) / 2)];
}

function rotAbout(hx, hy, x, y, a) {
  if (a === 0) return [x, y];
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - hx;
  const dy = y - hy;
  return [hx + dx * c - dy * s, hy + dx * s + dy * c];
}

// Builds the silhouette polygon, splitting it at the mouth when the jaw opens.
function jawRig(spec, g, L, gape) {
  const hu = spec.hingeU;
  const mu = spec.mouthU;
  const [hx, hy] = bodyPt(g, hu, spec.hingeV);
  const aU = -gape * spec.upperLift;
  const aL = gape;
  const w = (u) => smoothstep(hu + 0.07, hu - 0.02, u);
  const rotU = (x, y, u) => rotAbout(hx, hy, x, y, aU * w(u));
  const rotL = (x, y, u) => rotAbout(hx, hy, x, y, aL * w(u));
  const tip = [interp(g.X, mu), interp(g.B, mu)];
  const K = 7;
  const cutPt = (s) => {
    const x = lerp(tip[0], hx, s);
    const y = lerp(tip[1], hy, s) + spec.lipCurve * L * Math.sin(Math.PI * s);
    return [x, y, lerp(mu, hu, s)];
  };
  const open = gape > 0.02;
  const pts = [];
  for (let i = 0; i < N; i++) pts.push(rotU(g.X[i], g.T[i], US[i]));
  const cutU = [];
  const cutL = [];
  if (!open) {
    for (let i = N - 1; i >= 0; i--) pts.push([g.X[i], g.B[i]]);
    for (let k = 0; k <= K; k++) cutL.push(cutPt(k / K));
    return { pts, cutU: cutL, cutL, open, hx, hy, aU: 0, aL: 0, rotU: (x, y) => [x, y], cutRaw: cutL };
  }
  for (let i = N - 1; i >= 0 && US[i] > mu; i--) pts.push(rotL(g.X[i], g.B[i], US[i]));
  for (let k = 0; k <= K; k++) {
    const [x, y, u] = cutPt(k / K);
    cutL.push(k === K ? [hx, hy] : rotL(x, y, u));
    cutU.push(k === K ? [hx, hy] : rotU(x, y, u));
  }
  for (let k = 0; k <= K; k++) pts.push(cutL[k]);
  for (let k = K - 1; k >= 0; k--) pts.push(cutU[k]);
  for (let i = N - 1; i >= 0; i--) if (US[i] < mu) pts.push(rotU(g.X[i], g.B[i], US[i]));
  return { pts, cutU, cutL, open, hx, hy, aU, aL, rotU, cutRaw: null };
}

function smoothPath(pts, closed = true) {
  const p = new Path2D();
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const m = mid(a, b);
    p.quadraticCurveTo(a[0], a[1], m[0], m[1]);
  }
  if (closed) p.closePath();
  return p;
}

// ---------------------------------------------------------------- fins
const FIN_SHAPES = {
  tri: (s) => 0.12 + 0.88 * Math.pow(1 - s, 0.9),
  round: (s) => 0.3 + 0.7 * Math.sin(Math.PI * (0.12 + 0.8 * s)),
  sail: (s) => 0.28 + 0.72 * Math.sin(Math.PI * Math.pow(s, 0.65)),
  long: (s) => 0.95 - 0.45 * s + 0.12 * Math.sin(Math.PI * s),
  sickle: (s) => 0.08 + 0.92 * Math.pow(1 - s, 2.2),
  shark: (s) => 0.04 + 0.96 * Math.pow(1 - s, 1.5),
};

function drawFin(ctx, base, angles, lens, opts) {
  const M = base.length;
  const outer = new Array(M);
  for (let i = 0; i < M; i++) {
    outer[i] = [base[i][0] + Math.cos(angles[i]) * lens[i], base[i][1] + Math.sin(angles[i]) * lens[i]];
  }
  const path = new Path2D();
  path.moveTo(base[0][0], base[0][1]);
  path.lineTo(outer[0][0], outer[0][1]);
  if (opts.spines) {
    // membrane dips between spine tips
    for (let i = 1; i < M; i++) {
      const a = outer[i - 1];
      const b = outer[i];
      const ba = base[i - 1];
      const bb = base[i];
      const cx = (a[0] + b[0]) / 2 * 0.62 + (ba[0] + bb[0]) / 2 * 0.38;
      const cy = (a[1] + b[1]) / 2 * 0.62 + (ba[1] + bb[1]) / 2 * 0.38;
      path.quadraticCurveTo(cx, cy, b[0], b[1]);
    }
  } else {
    for (let i = 1; i < M - 1; i++) {
      const mx = (outer[i][0] + outer[i + 1][0]) / 2;
      const my = (outer[i][1] + outer[i + 1][1]) / 2;
      path.quadraticCurveTo(outer[i][0], outer[i][1], mx, my);
    }
    path.lineTo(outer[M - 1][0], outer[M - 1][1]);
  }
  path.lineTo(base[M - 1][0], base[M - 1][1]);
  for (let i = M - 2; i > 0; i--) path.lineTo(base[i][0], base[i][1]);
  path.closePath();

  const bm = base[(M / 2) | 0];
  const om = outer[(M / 2) | 0];
  const grad = ctx.createLinearGradient(bm[0], bm[1], om[0], om[1]);
  grad.addColorStop(0, opts.color);
  grad.addColorStop(1, opts.edge);
  ctx.fillStyle = grad;
  ctx.fill(path);

  if (opts.rayColor && opts.lod > 1) {
    ctx.strokeStyle = opts.rayColor;
    ctx.lineWidth = Math.max(0.5, opts.L * (opts.spines ? 0.004 : 0.0022));
    ctx.beginPath();
    for (let i = 0; i < M; i++) {
      ctx.moveTo(base[i][0], base[i][1]);
      ctx.lineTo(lerp(base[i][0], outer[i][0], 0.97), lerp(base[i][1], outer[i][1], 0.97));
    }
    ctx.stroke();
  }
  if (opts.rim && opts.lod > 0) {
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = opts.rim;
    ctx.lineWidth = opts.L * 0.018;
    ctx.stroke(path);
    ctx.restore();
  }
}

function drawFinSpec(ctx, spec, f, g, L, phase, swim, lod) {
  const color = f.color || spec.finColor;
  const edge = f.edge || spec.finEdge;
  const shape = FIN_SHAPES[f.shape] || FIN_SHAPES.round;
  const flutterAmp = 0.05 * (0.5 + swim);
  const base = [];
  const angles = [];
  const lens = [];

  if (f.kind === "pectoral") {
    const M = 7;
    const flap = Math.sin(phase * 1.35 + 0.6) * (f.shark ? 0.06 : 0.28);
    const p0 = bodyPt(g, f.u, f.v - 0.1);
    const p1 = f.shark ? bodyPt(g, f.u + 0.07, f.v + 0.2) : bodyPt(g, f.u + 0.012, f.v + 0.1);
    for (let i = 0; i < M; i++) {
      const s = i / (M - 1);
      base.push([lerp(p0[0], p1[0], s), lerp(p0[1], p1[1], s)]);
      if (f.shark) {
        angles.push(Math.PI - 1.2 + s * 0.75 + flap);
        lens.push(f.h * L * Math.pow(1 - s * 0.88, 1.4));
      } else if (f.slim) {
        angles.push(Math.PI - 0.15 + s * 0.12 + flap * 0.4);
        lens.push(f.h * L * (1 - s * 0.8));
      } else {
        angles.push(Math.PI + 0.25 - s * 0.85 + flap);
        lens.push(f.h * L * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + 0.7 * s))));
      }
    }
    drawFin(ctx, base, angles, lens, { color, edge, rayColor: f.shark ? null : spec.rayColor, L, rim: null, lod });
    return;
  }

  const top = f.kind === "dorsal";
  const arr = top ? g.T : g.B;
  const inset = (top ? 1 : -1) * L * 0.006;
  const M = f.spines ? f.spines : Math.max(6, Math.round((f.u1 - f.u0) * 40));
  for (let i = 0; i < M; i++) {
    const s = M === 1 ? 0 : i / (M - 1);
    const u = lerp(f.u0, f.u1, s);
    base.push([interp(g.X, u), interp(arr, u) + inset]);
    const flutter = Math.sin(phase * 1.1 - s * 2.4 + f.u0 * 9) * flutterAmp;
    const rake = f.rake + s * 0.15;
    angles.push(top ? -HALF_PI - rake + flutter : HALF_PI + rake + flutter);
    lens.push(f.h * L * shape(s));
  }
  drawFin(ctx, base, angles, lens, {
    color, edge, rayColor: spec.rayColor, L, spines: !!f.spines, lod,
    rim: spec.finRim && f.shape !== "tri" ? spec.finRim : null,
  });
}

function drawFinlets(ctx, spec, g, L) {
  const fl = spec.finlets;
  ctx.fillStyle = fl.color;
  for (let k = 0; k < fl.count; k++) {
    const u = lerp(fl.from, fl.to, k / (fl.count - 1));
    const size = L * 0.018 * (1 - k / fl.count * 0.4);
    for (const top of [true, false]) {
      const x = interp(g.X, u);
      const y = interp(top ? g.T : g.B, u);
      const d = top ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x + size * 0.5, y - d * size * 0.2);
      ctx.lineTo(x - size * 0.9, y + d * size * 0.9);
      ctx.lineTo(x - size * 0.5, y - d * size * 0.15);
      ctx.closePath();
      ctx.fill();
      if (fl.edge) {
        ctx.strokeStyle = fl.edge;
        ctx.lineWidth = Math.max(0.5, L * 0.002);
        ctx.stroke();
      }
    }
  }
}

// Caudal shapes: control nets in (x: fraction of len backwards, y: fraction of span)
const CAUDAL = {
  fork: { U: [1, -1], N: [0.36, 0], D: [1, 1], c1: [0.4, -0.45], c2: [0.62, -0.3], c3: [0.62, 0.3], c4: [0.4, 0.45] },
  lunate: { U: [1, -1], N: [0.2, 0], D: [1, 1], c1: [0.6, -0.3], c2: [0.45, -0.5], c3: [0.45, 0.5], c4: [0.6, 0.3] },
  round: { U: [0.8, -0.85], N: [1.02, 0], D: [0.8, 0.85], c1: [0.28, -0.95], c2: [1.02, -0.62], c3: [1.02, 0.62], c4: [0.28, 0.95] },
  shark: { U: [1, -1], N: [0.3, -0.05], D: [0.56, 0.62], c1: [0.55, -0.42], c2: [0.52, -0.42], c3: [0.42, 0.28], c4: [0.28, 0.48] },
};

function quadPts(out, p0, c, p1, n) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    out.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]);
  }
}

function drawCaudal(ctx, spec, g, L, phase, swim, lod) {
  const c = spec.caudal;
  const net = CAUDAL[c.shape] || CAUDAL.fork;
  const i = N - 1;
  const cx = g.X[i] + L * 0.012;
  const cy = (g.T[i] + g.B[i]) / 2;
  const r = (g.B[i] - g.T[i]) / 2;
  const dx = g.X[i] - g.X[i - 2];
  const dy = (g.T[i] + g.B[i] - g.T[i - 2] - g.B[i - 2]) / 2;
  const ang = Math.atan2(dy, dx) - Math.PI;
  const len = c.len * L;
  const span = c.span * L;
  const fs = 0.74 + 0.26 * Math.cos(phase); // yaw foreshortening
  const lagU = Math.sin(phase - 0.9) * span * 0.08 * (0.4 + swim);
  const lagD = Math.sin(phase - 1.5) * span * 0.08 * (0.4 + swim);
  const P = (q, lag = 0) => [-q[0] * len * fs, q[1] * span + lag];

  const R0 = [0, -r * 1.05];
  const R1 = [0, r * 1.05];
  const U = P(net.U, lagU);
  const Nn = P(net.N, (lagU + lagD) / 2);
  const D = P(net.D, lagD);
  const edge = [];
  quadPts(edge, U, P(net.c2, lagU * 0.6), Nn, 5);
  quadPts(edge, Nn, P(net.c3, lagD * 0.6), D, 5);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  const path = new Path2D();
  path.moveTo(R0[0], R0[1]);
  const c1 = P(net.c1, lagU * 0.5);
  path.quadraticCurveTo(c1[0], c1[1], U[0], U[1]);
  const c2 = P(net.c2, lagU * 0.6);
  path.quadraticCurveTo(c2[0], c2[1], Nn[0], Nn[1]);
  const c3 = P(net.c3, lagD * 0.6);
  path.quadraticCurveTo(c3[0], c3[1], D[0], D[1]);
  const c4 = P(net.c4, lagD * 0.5);
  path.quadraticCurveTo(c4[0], c4[1], R1[0], R1[1]);
  path.closePath();

  const grad = ctx.createLinearGradient(0, 0, -len * fs, 0);
  grad.addColorStop(0, c.color || spec.finColor);
  grad.addColorStop(1, c.edge || spec.finEdge);
  ctx.fillStyle = grad;
  ctx.fill(path);
  // darker when the fin is turned edge-on
  if (fs < 0.9) {
    ctx.fillStyle = `rgba(0,10,25,${(0.9 - fs) * 0.8})`;
    ctx.fill(path);
  }

  if (spec.rayColor && lod > 1 && c.shape !== "shark") {
    ctx.strokeStyle = spec.rayColor;
    ctx.lineWidth = Math.max(0.5, L * 0.0022);
    ctx.beginPath();
    const all = [U, ...edge];
    for (let k = 0; k < all.length; k++) {
      const t = k / (all.length - 1);
      ctx.moveTo(0, lerp(-r, r, t) * 0.9);
      ctx.lineTo(all[k][0] * 0.97, all[k][1] * 0.97);
    }
    ctx.stroke();
  }
  if (c.rim && spec.finRim) {
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = spec.finRim;
    ctx.lineWidth = L * 0.02;
    ctx.stroke(path);
    ctx.restore();
  }
  if (c.darkTip) {
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = "rgba(15,20,28,0.55)";
    ctx.beginPath();
    ctx.arc(U[0], U[1], span * 0.45, 0, TAU);
    ctx.arc(D[0], D[1], span * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- patterns
function bandPath(g, uc, w, curve, v0 = -1.3, v1 = 1.3) {
  const pts = [];
  const K = 8;
  for (let k = 0; k <= K; k++) {
    const v = lerp(v0, v1, k / K);
    pts.push(bodyPt(g, uc - w / 2 + curve * (1 - v * v), v));
  }
  for (let k = K; k >= 0; k--) {
    const v = lerp(v0, v1, k / K);
    pts.push(bodyPt(g, uc + w / 2 + curve * (1 - v * v), v));
  }
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

function linePath(g, u0, u1, v, wiggle = 0, freq = 0, K = 14) {
  const p = new Path2D();
  for (let k = 0; k <= K; k++) {
    const u = lerp(u0, u1, k / K);
    const [x, y] = bodyPt(g, u, v + Math.sin(u * freq) * wiggle);
    if (k === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  return p;
}

function dot(ctx, g, u, v, r) {
  const [x, y] = bodyPt(g, u, v);
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

function paintPattern(ctx, spec, g, L, phase) {
  const R = rng(spec.seed);
  switch (spec.pattern) {
    case "sardine": {
      ctx.fillStyle = "rgba(20,40,55,0.55)";
      ctx.beginPath();
      for (let k = 0; k < 6; k++) dot(ctx, g, 0.22 + k * 0.06, -0.38, L * (0.012 - k * 0.0012));
      ctx.fill();
      ctx.strokeStyle = "rgba(110,220,230,0.35)";
      ctx.lineWidth = L * 0.012;
      ctx.stroke(linePath(g, 0.15, 0.95, -0.12));
      break;
    }
    case "clown": {
      const bands = [[0.17, 0.075, 0.035], [0.47, 0.095, -0.045], [0.9, 0.055, 0]];
      for (const [uc, w, cv] of bands) {
        ctx.fillStyle = "#16100e";
        ctx.fill(bandPath(g, uc, w + 0.024, cv));
        ctx.fillStyle = "#fbfbf6";
        ctx.fill(bandPath(g, uc, w, cv));
      }
      break;
    }
    case "emperor": {
      ctx.strokeStyle = "#ffd84a";
      ctx.lineWidth = L * 0.008;
      for (let v = -0.92; v <= 0.95; v += 0.13) ctx.stroke(linePath(g, 0.26, 1, v, 0.02, 9));
      // face
      ctx.fillStyle = "#8fb6ff";
      ctx.fill(bandPath(g, 0.03, 0.09, 0));
      // eye mask
      ctx.fillStyle = "#0b1233";
      ctx.fill(bandPath(g, 0.1, 0.05, 0.01, -1.2, 0.4));
      ctx.strokeStyle = "#9cd0ff";
      ctx.lineWidth = L * 0.006;
      ctx.stroke(bandPath(g, 0.1, 0.05, 0.01, -1.2, 0.4));
      // shoulder patch behind the gill, rimmed in gold
      const [px, py] = bodyPt(g, 0.235, -0.35);
      ctx.fillStyle = "#0b1230";
      ctx.strokeStyle = "#ffd84a";
      ctx.lineWidth = L * 0.008;
      ctx.beginPath();
      ctx.ellipse(px, py, L * 0.026, (g.maxY - g.minY) * 0.15, 0.15, 0, TAU);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "mackerel": {
      ctx.strokeStyle = "rgba(6,20,26,0.8)";
      ctx.lineWidth = L * 0.008;
      ctx.lineCap = "round";
      for (let k = 0; k < 15; k++) {
        const u = 0.2 + k * 0.05;
        const p = new Path2D();
        for (let j = 0; j <= 6; j++) {
          const v = lerp(-1.1, -0.28 - R() * 0.1, j / 6);
          const [x, y] = bodyPt(g, u + Math.sin(j * 1.7 + k) * 0.014 - j * 0.004, v);
          if (j === 0) p.moveTo(x, y);
          else p.lineTo(x, y);
        }
        ctx.stroke(p);
      }
      break;
    }
    case "grouper": {
      ctx.fillStyle = "rgba(40,28,15,0.35)";
      for (let k = 0; k < 5; k++) ctx.fill(bandPath(g, 0.18 + k * 0.17, 0.07, 0.02 * (k % 2 ? 1 : -1), -1.2, 0.6));
      ctx.fillStyle = "rgba(55,35,18,0.55)";
      ctx.beginPath();
      for (let k = 0; k < 70; k++) dot(ctx, g, 0.04 + R() * 0.94, -0.95 + R() * 1.85, L * (0.004 + R() * 0.006));
      ctx.fill();
      break;
    }
    case "barracuda": {
      ctx.strokeStyle = "rgba(25,40,52,0.38)";
      ctx.lineWidth = L * 0.01;
      for (let k = 0; k < 18; k++) {
        const u = 0.2 + k * 0.036;
        const a = bodyPt(g, u + 0.02, -1.1);
        const b = bodyPt(g, u, -0.2);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(15,18,22,0.6)";
      ctx.beginPath();
      for (let k = 0; k < 16; k++) dot(ctx, g, 0.5 + R() * 0.45, -0.1 + R() * 0.8, L * 0.005);
      ctx.fill();
      break;
    }
    case "tuna": {
      ctx.strokeStyle = "rgba(90,170,255,0.45)";
      ctx.lineWidth = L * 0.01;
      ctx.stroke(linePath(g, 0.12, 0.9, -0.42));
      ctx.strokeStyle = "rgba(230,200,90,0.25)";
      ctx.lineWidth = L * 0.008;
      ctx.stroke(linePath(g, 0.2, 0.85, -0.12));
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      for (let k = 0; k < 14; k++) for (let j = 0; j < 3; j++) dot(ctx, g, 0.3 + k * 0.035, 0.2 + j * 0.2, L * 0.004);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,25,35,0.6)";
      ctx.lineWidth = L * 0.01;
      ctx.stroke(linePath(g, 0.88, 1, 0));
      break;
    }
    case "mahi": {
      ctx.fillStyle = "rgba(40,150,255,0.8)";
      ctx.beginPath();
      for (let k = 0; k < 44; k++) dot(ctx, g, 0.12 + R() * 0.74, -0.75 + R() * 1.1, L * (0.005 + R() * 0.005));
      ctx.fill();
      ctx.strokeStyle = "rgba(30,160,120,0.35)";
      ctx.lineWidth = L * 0.02;
      ctx.stroke(linePath(g, 0.02, 0.95, -0.55, 0.05, 8));
      break;
    }
    case "gold": {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,240,170,0.5)";
      ctx.beginPath();
      for (let k = 0; k < 18; k++) {
        const tw = 0.5 + 0.5 * Math.sin(phase * 0.6 + k * 2.1);
        dot(ctx, g, 0.1 + R() * 0.8, -0.7 + R() * 1.2, L * 0.008 * tw);
      }
      ctx.fill();
      ctx.restore();
      break;
    }
    case "shark": {
      // countershading with a ragged demarcation line
      const pts = [];
      const K = 22;
      for (let k = 0; k <= K; k++) {
        const u = lerp(0.03, 1, k / K);
        pts.push(bodyPt(g, u, 0.12 + Math.sin(u * 31) * 0.07 + Math.sin(u * 13) * 0.05));
      }
      for (let k = K; k >= 0; k--) pts.push(bodyPt(g, lerp(0.03, 1, k / K), 1.4));
      ctx.fillStyle = "#e9edf0";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.fill();
      // gill slits
      ctx.strokeStyle = "rgba(30,36,44,0.6)";
      ctx.lineWidth = L * 0.005;
      for (let k = 0; k < 5; k++) {
        const u = 0.21 + k * 0.022;
        const a = bodyPt(g, u, -0.3 + k * 0.03);
        const m = bodyPt(g, u - 0.012, 0.05);
        const b = bodyPt(g, u - 0.004, 0.4);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]);
        ctx.stroke();
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- head parts
function drawEye(ctx, spec, g, L, jaw) {
  const p = bodyPt(g, spec.eyeU, spec.eyeV);
  const [ex, ey] = jaw.rotU(p[0], p[1], spec.eyeU);
  const r = Math.max(1, spec.eyeR * L);
  if (r < 1.6) {
    ctx.fillStyle = "#101418";
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, TAU);
    ctx.fill();
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.arc(ex, ey, r * 1.3, 0, TAU);
  ctx.fill();
  const ig = ctx.createRadialGradient(ex + r * 0.1, ey - r * 0.1, r * 0.1, ex, ey, r);
  ig.addColorStop(0, spec.iris);
  ig.addColorStop(0.75, spec.iris);
  ig.addColorStop(1, "rgba(10,12,18,1)");
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(ex, ey, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = spec.pupil;
  ctx.beginPath();
  ctx.arc(ex + r * 0.08, ey + r * 0.02, r * 0.64, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(ex + r * 0.26, ey - r * 0.3, r * 0.2, r * 0.13, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(ex - r * 0.3, ey + r * 0.32, r * 0.11, 0, TAU);
  ctx.fill();
}

function drawMouthInterior(ctx, jaw, L) {
  const pts = [...jaw.cutL, ...jaw.cutU.slice().reverse()];
  const g = ctx.createRadialGradient(jaw.hx, jaw.hy, 0, jaw.hx, jaw.hy, L * 0.18);
  g.addColorStop(0, "#050102");
  g.addColorStop(0.6, "#3a0c12");
  g.addColorStop(1, "#6e1e24");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
}

function drawTeeth(ctx, spec, jaw, L) {
  const t = spec.teeth;
  const n = t.n;
  ctx.fillStyle = "#f3efe2";
  ctx.strokeStyle = "rgba(90,80,60,0.5)";
  ctx.lineWidth = Math.max(0.4, L * 0.0015);
  const K = jaw.cutU.length - 1;
  for (const [edge, ang, dir] of [[jaw.cutU, jaw.aU, 1], [jaw.cutL, jaw.aL, -1]]) {
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) / n * 0.8;
      const f = s * K;
      const k = Math.min(K - 1, f | 0);
      const fr = f - k;
      const x = lerp(edge[k][0], edge[k + 1][0], fr);
      const y = lerp(edge[k][1], edge[k + 1][1], fr);
      let size = t.size * L;
      if (t.fangs) size *= i % 3 === 0 ? 1.5 : 0.6;
      if (t.shark) size *= 0.8 + 0.4 * Math.sin((i / n) * Math.PI);
      const w = size * (t.shark ? 0.75 : 0.45);
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      // along-edge vector ~ (-1,0) rotated, tooth axis ~ (0, dir) rotated
      const ax = -sn * dir;
      const ay = c * dir;
      const bx = c;
      const by = sn;
      ctx.beginPath();
      ctx.moveTo(x - bx * w - ax * size * 0.15, y - by * w - ay * size * 0.15);
      ctx.lineTo(x + ax * size, y + ay * size);
      ctx.lineTo(x + bx * w - ax * size * 0.15, y + by * w - ay * size * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- main painter
// state: { phase, swim, mouthOpen (0..1.3), alpha, glow, flash, bend (-1..1),
//          gulp (0..1 progress, <0 idle), gulpSize (0..1), chomp (0..1),
//          inMouth(ctx) callback for prey being swallowed }
export function drawFish(ctx, spec, L, st = {}) {
  const phase = st.phase || 0;
  const swim = st.swim ?? 0.6;
  const gape = clamp(st.mouthOpen || 0, 0, 1.3) * spec.gape;
  const gulpT = st.gulp ?? -1;
  const g = geometry(spec, L, phase, swim, clamp(st.bend || 0, -1, 1), gulpT, st.gulpSize || 0.5);
  const jaw = jawRig(spec, g, L, gape);
  // level of detail from the on-screen size of the fish
  const m0 = ctx.getTransform();
  const pxL = L * Math.hypot(m0.a, m0.b);
  const lod = pxL > 90 ? 2 : pxL > 34 ? 1 : 0;

  ctx.save();
  if (st.alpha != null) ctx.globalAlpha *= st.alpha;
  const chomp = st.chomp || 0;
  if (chomp > 0.001) {
    const px = L * 0.2;
    ctx.translate(px, 0);
    ctx.scale(1 + 0.13 * chomp, 1 - 0.1 * chomp);
    ctx.translate(-px, 0);
  }

  // --- fins behind the body ---
  drawCaudal(ctx, spec, g, L, phase, swim, lod);
  for (const f of spec.fins) if (!f.front) drawFinSpec(ctx, spec, f, g, L, phase, swim, lod);
  if (spec.finlets && lod > 0) drawFinlets(ctx, spec, g, L);

  // --- open mouth: throat, prey being swallowed, teeth ---
  if (jaw.open) {
    drawMouthInterior(ctx, jaw, L);
    if (st.inMouth) st.inMouth(ctx);
    if (spec.teeth) drawTeeth(ctx, spec, jaw, L);
  }

  // --- body ---
  const path = smoothPath(jaw.pts);
  const grad = ctx.createLinearGradient(0, g.minY, 0, g.maxY);
  for (const [s, c] of spec.body) grad.addColorStop(s, c);
  const glow = st.glow || spec.glow;
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = L * 0.35;
  }
  ctx.fillStyle = grad;
  ctx.fill(path);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const bx0 = g.X[N - 1] - L * 0.05;
  const bw = g.xs - bx0 + L * 0.1;
  const by0 = g.minY - L * 0.1;
  const bh = g.maxY - g.minY + L * 0.2;
  const alpha0 = ctx.globalAlpha;

  ctx.save();
  ctx.clip(path);
  paintPattern(ctx, spec, g, L, phase);

  // scales
  if (spec.scaleAlpha > 0 && lod > 1 && L * spec.scaleSize > 2.2) {
    const pat = scalePattern(ctx);
    const k = (L * spec.scaleSize) / 16;
    pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    ctx.globalAlpha = alpha0 * spec.scaleAlpha;
    ctx.fillStyle = pat;
    ctx.fillRect(bx0, by0, bw, bh);
    ctx.globalAlpha = alpha0;
  }

  // iridescent silver sheen that slides as the fish flexes
  if (spec.sheen > 0) {
    const s = 0.5 + Math.sin(phase * 0.35) * 0.25;
    const sg = ctx.createLinearGradient(g.xs, 0, g.X[N - 1], 0);
    sg.addColorStop(clamp(s - 0.25, 0, 1), "rgba(255,255,255,0)");
    sg.addColorStop(clamp(s - 0.08, 0, 1), `rgba(170,255,235,${0.16 * spec.sheen})`);
    sg.addColorStop(s, `rgba(255,255,255,${0.3 * spec.sheen})`);
    sg.addColorStop(clamp(s + 0.08, 0, 1), `rgba(255,190,255,${0.12 * spec.sheen})`);
    sg.addColorStop(clamp(s + 0.25, 0, 1), "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = sg;
    ctx.fillRect(bx0, by0, bw, bh);
    ctx.globalCompositeOperation = "source-over";
  }

  // lateral line
  if (lod > 1 && spec.latColor) {
    ctx.strokeStyle = spec.latColor;
    ctx.lineWidth = Math.max(0.6, L * 0.004);
    ctx.stroke(linePath(g, spec.gillU + 0.02, 0.98, spec.latV, 0.04, 6));
  }

  // cylindrical volume: light from above, shadowed belly, darkened rim
  const vg = ctx.createLinearGradient(0, g.minY, 0, g.maxY);
  vg.addColorStop(0, "rgba(255,255,255,0.26)");
  vg.addColorStop(0.28, "rgba(255,255,255,0.04)");
  vg.addColorStop(0.55, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,12,35,0.4)");
  ctx.fillStyle = vg;
  ctx.fillRect(bx0, by0, bw, bh);
  const H = g.maxY - g.minY;
  if (lod > 0) {
    ctx.strokeStyle = `rgba(0,14,32,${spec.rim * 0.5})`;
    for (const w of lod > 1 ? [0.34, 0.2, 0.09] : [0.22]) {
      ctx.lineWidth = H * w;
      ctx.stroke(path);
    }
  }

  // dancing caustic light (world-anchored)
  if (light.pattern && light.strength > 0.02 && lod > 0) {
    const m = ctx.getTransform().invertSelf().multiplySelf(light.world).multiplySelf(light.tex);
    light.pattern.setTransform(m);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha0 * light.strength;
    ctx.fillStyle = light.pattern;
    ctx.fillRect(bx0, by0, bw, bh * 0.6);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha0;
  }

  // gill cover (flares while gulping)
  if (spec.gillU < 0.9 && lod > 0) {
    const flare = gulpT >= 0 ? Math.sin(Math.PI * clamp(gulpT * 1.4, 0, 1)) : 0;
    const a = bodyPt(g, spec.gillU + 0.012, -0.62);
    const m = bodyPt(g, spec.gillU + 0.05 - flare * 0.03, 0.12);
    const b = bodyPt(g, spec.gillU - 0.005, 0.9);
    if (flare > 0.05) {
      const m2 = bodyPt(g, spec.gillU + 0.05 - flare * 0.07, 0.12);
      ctx.fillStyle = `rgba(190,30,50,${0.75 * flare})`;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]);
      ctx.quadraticCurveTo(m2[0], m2[1], a[0], a[1]);
      ctx.fill();
    }
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.32)";
    ctx.lineWidth = Math.max(0.7, L * 0.007);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(0.5, L * 0.004);
    ctx.beginPath();
    ctx.moveTo(a[0] - L * 0.006, a[1]);
    ctx.quadraticCurveTo(m[0] - L * 0.007, m[1], b[0] - L * 0.006, b[1]);
    ctx.stroke();
  }

  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.6 * st.flash})`;
    ctx.fillRect(bx0, by0, bw, bh);
  }
  ctx.restore();

  // --- fins in front of the body ---
  for (const f of spec.fins) if (f.front && lod > 0) drawFinSpec(ctx, spec, f, g, L, phase, swim, lod);

  // --- mouth line / lips, eye ---
  ctx.lineCap = "round";
  if (!jaw.open) {
    ctx.strokeStyle = "rgba(10,10,20,0.5)";
    ctx.lineWidth = Math.max(0.7, L * 0.006);
    ctx.beginPath();
    jaw.cutRaw.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(255,190,190,0.35)";
    ctx.lineWidth = Math.max(0.6, L * 0.005);
    for (const edge of [jaw.cutU, jaw.cutL]) {
      ctx.beginPath();
      edge.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }
  }
  drawEye(ctx, spec, g, L, jaw);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Puffer fish: a boxy swimmer that balloons into a spiky sphere.
export function drawPuffer(ctx, L, state) {
  const { phase = 0, inflate = 0, alpha = 1 } = state;
  const rx = L * (0.3 + inflate * 0.2);
  const ry = L * (0.2 + inflate * 0.31);
  ctx.save();
  ctx.globalAlpha *= alpha;

  // tail + small dorsal/anal fins (sculling fast)
  const scull = Math.sin(phase * 2.2);
  ctx.fillStyle = "rgba(196,160,96,0.85)";
  ctx.save();
  ctx.translate(-rx * 0.92, 0);
  ctx.scale(0.75 + 0.25 * Math.cos(phase), 1);
  ctx.beginPath();
  ctx.moveTo(0, -ry * 0.25);
  ctx.quadraticCurveTo(-rx * 0.35, -ry * 0.55, -rx * 0.55, -ry * 0.35);
  ctx.quadraticCurveTo(-rx * 0.62, 0, -rx * 0.55, ry * 0.35);
  ctx.quadraticCurveTo(-rx * 0.35, ry * 0.55, 0, ry * 0.25);
  ctx.fill();
  ctx.restore();
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-rx * 0.45, d * ry * 0.8);
    ctx.quadraticCurveTo(-rx * 0.7, d * ry * (1.25 + scull * 0.1), -rx * 0.85, d * ry * 0.7);
    ctx.lineTo(-rx * 0.6, d * ry * 0.6);
    ctx.fill();
  }

  // spines: stubby prickles that erect into long barbs when inflated
  const n = 34;
  const spike = L * (0.02 + inflate * 0.16);
  const bw = L * (0.008 + inflate * 0.01);
  ctx.fillStyle = inflate > 0.3 ? "rgba(214,186,120,0.95)" : "rgba(110,80,38,0.95)";
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (i % 2) * 0.09;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cx = ca * rx * 0.9;
    const cy = sa * ry * 0.9;
    const k = spike * (0.8 + (i % 3) * 0.15);
    ctx.moveTo(cx - sa * bw, cy + ca * bw);
    ctx.lineTo(cx + ca * k, cy + sa * k);
    ctx.lineTo(cx + sa * bw, cy - ca * bw);
  }
  ctx.fill();

  // body
  const grad = ctx.createLinearGradient(0, -ry, 0, ry);
  grad.addColorStop(0, "#8b6a3a");
  grad.addColorStop(0.45, "#c9a466");
  grad.addColorStop(0.62, "#efe2c0");
  grad.addColorStop(1, "#fbf7ea");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.clip();
  // dark saddles + spots
  ctx.fillStyle = "rgba(70,48,20,0.45)";
  for (const [px, w] of [[-0.45, 0.22], [0.02, 0.2], [0.42, 0.14]]) {
    ctx.beginPath();
    ctx.ellipse(rx * px, -ry * 0.75, rx * w, ry * 0.55, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(60,40,15,0.5)";
  const R = rng(5);
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const x = (R() * 2 - 1) * rx * 0.9;
    const y = (-R() * 0.9 + 0.05) * ry;
    const r = L * 0.008 * (0.6 + R());
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
  const vg = ctx.createRadialGradient(-rx * 0.3, -ry * 0.45, 0, 0, 0, Math.max(rx, ry) * 1.1);
  vg.addColorStop(0, "rgba(255,255,255,0.28)");
  vg.addColorStop(0.5, "rgba(255,255,255,0)");
  vg.addColorStop(1, "rgba(0,15,35,0.4)");
  ctx.fillStyle = vg;
  ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
  ctx.restore();

  // pectoral fin fluttering fast
  ctx.save();
  ctx.translate(rx * 0.1, ry * 0.05);
  ctx.rotate(0.3 + Math.sin(phase * 3.3) * 0.45);
  ctx.fillStyle = "rgba(220,190,120,0.7)";
  ctx.beginPath();
  ctx.ellipse(-L * 0.05, 0, L * 0.065, L * 0.035, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // beak mouth
  ctx.fillStyle = "#e8dcc0";
  ctx.strokeStyle = "rgba(70,50,25,0.7)";
  ctx.lineWidth = Math.max(0.8, L * 0.006);
  ctx.beginPath();
  ctx.ellipse(rx * 0.98, ry * 0.12, L * 0.03, L * 0.024, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx * 0.98 - L * 0.02, ry * 0.12);
  ctx.lineTo(rx * 0.98 + L * 0.03, ry * 0.12);
  ctx.stroke();

  // big eye
  const er = L * (0.055 + inflate * 0.01);
  const ex = rx * 0.55;
  const ey = -ry * 0.35;
  const ig = ctx.createRadialGradient(ex, ey, er * 0.1, ex, ey, er);
  ig.addColorStop(0, "#9fe0a0");
  ig.addColorStop(0.7, "#3e8f5a");
  ig.addColorStop(1, "#0d1a12");
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#050806";
  ctx.beginPath();
  ctx.arc(ex + er * 0.12, ey, er * 0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(ex + er * 0.35, ey - er * 0.35, er * 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Jellyfish: translucent pulsing bell, ruffled oral arms, long fine tentacles.
export function drawJellyfish(ctx, L, state) {
  const { phase = 0, alpha = 1 } = state;
  const R = L * 0.4;
  const pulse = Math.sin(phase * 1.6);
  const sx = 1 + pulse * 0.1;
  const sy = 1 - pulse * 0.1;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = "round";

  // long trailing tentacles
  ctx.strokeStyle = "rgba(255,190,230,0.28)";
  ctx.lineWidth = Math.max(0.6, R * 0.025);
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const x0 = (i / 13 - 0.5) * R * 1.9 * sx;
    const len = R * (2.6 + (i % 4) * 0.45);
    ctx.moveTo(x0, R * 0.12);
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const sw = Math.sin(phase * 1.8 - t * 4 + i * 0.9) * R * 0.28 * t;
      ctx.lineTo(x0 * (1 - t * 0.3) + sw, R * 0.12 + len * t);
    }
  }
  ctx.stroke();

  // ruffled oral arms
  for (let a = 0; a < 4; a++) {
    const x0 = (a / 3 - 0.5) * R * 0.5;
    ctx.strokeStyle = `rgba(245,150,215,${0.4 - a * 0.04})`;
    ctx.lineWidth = R * 0.14;
    ctx.beginPath();
    ctx.moveTo(x0, R * 0.2);
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const sw = Math.sin(phase * 1.4 - t * 3 + a * 1.7) * R * 0.18;
      ctx.lineTo(x0 + sw, R * 0.2 + t * R * 1.5);
    }
    ctx.stroke();
  }

  // bell
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const grad = ctx.createRadialGradient(0, -R * 0.35, R * 0.1, 0, 0, R * 1.2);
  grad.addColorStop(0, "rgba(255,210,240,0.26)");
  grad.addColorStop(0.6, "rgba(200,120,220,0.14)");
  grad.addColorStop(0.92, "rgba(230,160,255,0.3)");
  grad.addColorStop(1, "rgba(160,80,220,0.05)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, R * 0.1, R * 1.05 * sx, R * 0.95 * sy, 0, Math.PI, 0);
  // scalloped rim
  const lobes = 12;
  for (let i = 0; i <= lobes; i++) {
    const t = i / lobes;
    const x = R * 1.05 * sx * (1 - 2 * t);
    const y = R * 0.1 + Math.sin(t * Math.PI * lobes) * R * 0.04 + R * 0.08;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,220,255,0.35)";
  ctx.lineWidth = Math.max(0.8, R * 0.03);
  ctx.stroke();
  // four horseshoe gonads seen through the bell
  ctx.strokeStyle = "rgba(255,140,200,0.32)";
  ctx.lineWidth = R * 0.06;
  for (let i = 0; i < 4; i++) {
    const cx = (i - 1.5) * R * 0.36 * sx;
    ctx.beginPath();
    ctx.ellipse(cx, -R * 0.22 * sy, R * 0.11, R * 0.15, (i - 1.5) * 0.35, 0.3, Math.PI * 2 - 0.3);
    ctx.stroke();
  }
  // bioluminescent rim dots
  ctx.fillStyle = "rgba(255,240,255,0.7)";
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10;
    const tw = 0.5 + 0.5 * Math.sin(phase * 3 + i);
    ctx.beginPath();
    ctx.arc(R * 1.05 * sx * (1 - 2 * t), R * 0.17, R * 0.035 * tw, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
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
