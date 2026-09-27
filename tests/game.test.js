import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/game/Game.js";
import { PlayerFish, AIFish, PufferFish, Jellyfish, Shark } from "../src/game/Entities.js";
import { Particles } from "../src/game/Particles.js";
import { Input } from "../src/game/Input.js";
import { UI } from "../src/game/UI.js";
import { Sfx } from "../src/game/Sfx.js";

function fixture(len = 100) {
  const calls = [];
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    player: new PlayerFish(2600, 1500, len),
    fishes: [], puffers: [], jellies: [], powerups: [], shark: null,
    swallows: [], particles: new Particles(),
    sfx: new Proxy({}, { get: (_, key) => () => calls.push(key) }),
    ui: new Proxy({}, { get: (_, key) => () => calls.push(key) }),
    input: { hasPointer: false, boost: false, takeDash: () => false, reset() {} },
    score: 0, eaten: 0, lives: 3, combo: 0, comboTimer: 0,
    frenzy: false, level: 0, won: false, endless: false, running: true,
    shake: 0, hurtFlash: 0, hitstop: 0, zoomPunch: 0,
    W: 800, H: 600, cam: { zoom: 1 },
    goldTimer: 20, powerupTimer: 20, sharkTimer: 50,
  });
  return { game, calls };
}

for (const angle of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
  test(`swallow follows the mouth and awards exactly once (angle ${angle})`, () => {
    const { game, calls } = fixture();
    const p = game.player;
    p.angle = angle;
    const prey = new AIFish(p.mouthX, p.mouthY, 45);
    game.fishes = [prey];
    game._resolveEating(1 / 60);
    assert.equal(game.fishes.length, 0);
    assert.equal(game.swallows.length, 1);
    assert.equal(game.score, 0);
    p.x += 20;
    p.y += 15;
    game._updateSwallows(0.08);
    assert.ok(Number.isFinite(prey.x) && Number.isFinite(prey.y));
    game._updateSwallows(1);
    assert.equal(game.swallows.length, 0);
    assert.equal(game.eaten, 1);
    assert.equal(game.score, 8);
    assert.equal(game.fishes.length, 1);
    assert.ok(p.len > 100 && p.chomp > 0 && p.gulpT === 0);
    assert.ok(calls.includes("suck") && calls.includes("chomp") && calls.includes("gulp"));
    game._updateSwallows(1);
    assert.equal(game.score, 8);
  });
}

test("gold, deflated puffer and shark meals complete with their rewards", () => {
  for (const kind of ["fish", "puffer", "shark"]) {
    const { game } = fixture(400);
    const p = game.player;
    const prey = kind === "fish" ? new AIFish(p.mouthX, p.mouthY, 60, { gold: true })
      : kind === "puffer" ? new PufferFish(p.mouthX, p.mouthY, 60)
      : new Shark(p.mouthX, p.mouthY, 60);
    if (kind === "fish") game.fishes = [prey];
    else if (kind === "puffer") game.puffers = [prey];
    else game.shark = prey;
    game._resolveEating(1 / 60);
    game._updateSwallows(1);
    assert.equal(game.eaten, 1);
    assert.equal(game.score, kind === "fish" ? 50 : kind === "puffer" ? 20 : 2000);
  }
});

test("winning bite stops hazards in that frame; pending meals resume in endless mode", () => {
  const { game, calls } = fixture(479);
  game.level = 4;
  for (let i = 0; i < 2; i++) game._beginSwallow(new AIFish(game.player.mouthX, game.player.mouthY, 30), "fish");
  game._update(0.05);
  game._resolveHazards = () => { throw new Error("hazard ran after winning"); };
  game._update(0.2);
  assert.equal(game.won, true);
  assert.equal(game.running, false);
  assert.equal(game.eaten, 1);
  assert.equal(game.swallows.length, 1);
  assert.equal(calls.filter(c => c === "showWin").length, 1);
  game.continueEndless();
  game._updateSwallows(1);
  assert.equal(game.eaten, 2);
  assert.equal(game.running, true);
  assert.equal(calls.filter(c => c === "showWin").length, 1);
});

test("jellyfish and puffer shrink also update the evolution level", () => {
  for (const hazard of ["jelly", "puffer"]) {
    const { game } = fixture(96);
    game.level = 1;
    const p = game.player;
    if (hazard === "jelly") {
      game.jellies = [new Jellyfish(p.x, p.y, 80)];
      game._resolveHazards(1 / 60);
    } else {
      const f = new PufferFish(p.mouthX, p.mouthY, 60);
      f.inflate = 1;
      game.puffers = [f];
      game._resolveEating(1 / 60);
    }
    assert.ok(p.len < 95);
    assert.equal(game.level, 0);
  }
});

test("a stun prevents new meals even while another prey is being swallowed", () => {
  const { game } = fixture();
  game.player.stunned = 1;
  game.player.suck = 1;
  game.fishes = [new AIFish(game.player.mouthX, game.player.mouthY, 30)];
  game._resolveEating(1 / 60);
  assert.equal(game.swallows.length, 0);
  assert.equal(game.fishes.length, 1);
});

test("restarting clears bite effects and refreshes the HUD immediately", () => {
  const { game, calls } = fixture();
  game.shake = 14;
  game.hurtFlash = 1;
  game.score = 500;
  game.start();
  assert.equal(game.score, 0);
  assert.equal(game.shake, 0);
  assert.equal(game.hurtFlash, 0);
  assert.equal(game.swallows.length, 0);
  assert.ok(calls.includes("reset") && calls.includes("updateHud"));
});

test("boost sources do not cancel each other and blur clears held input", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const win = new EventTarget();
  win.innerWidth = 800; win.innerHeight = 600;
  globalThis.window = win;
  globalThis.document = new EventTarget();
  try {
    const canvas = new EventTarget();
    const input = new Input(canvas);
    const dispatch = (target, type, data) => target.dispatchEvent(Object.assign(new Event(type), data));
    dispatch(win, "keydown", { code: "ShiftLeft" });
    dispatch(canvas, "mousedown", { button: 0 });
    dispatch(win, "mouseup", { button: 0 });
    assert.equal(input.boost, true);
    dispatch(win, "keydown", { code: "Space", repeat: false });
    assert.equal(input.takeDash(), true);
    dispatch(win, "keydown", { code: "Space", repeat: true });
    assert.equal(input.takeDash(), false);
    win.dispatchEvent(new Event("blur"));
    assert.equal(input.boost, false);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test("resetting UI clears frenzy, priority banners and stale power pills", () => {
  const classes = () => {
    const values = new Set();
    return { remove: (...names) => names.forEach(n => values.delete(n)),
      toggle: (n, on) => on ? values.add(n) : values.delete(n), contains: n => values.has(n) };
  };
  const ui = Object.create(UI.prototype);
  for (const key of ["comboEl", "toastEl", "warnEl", "frenzyEl"]) ui[key] = { classList: classes() };
  ui._warnLock = true;
  ui.reset();
  assert.equal(ui._warnLock, false);
  assert.ok(ui.frenzyEl.classList.contains("hidden"));
  assert.ok(ui.warnEl.classList.contains("hidden"));
  ui.levelName = {}; ui.levelFill = { style: {} };
  ui.setLevel(1, [{ len: 60 }, { len: 95 }, { len: 150 }], 80);
  assert.equal(ui.levelFill.style.width, "0.0%");
});

test("audio initialization resumes an existing suspended context", async () => {
  const sfx = new Sfx();
  let resumed = false;
  sfx.ctx = { state: "suspended", resume: async () => { resumed = true; } };
  sfx.init();
  assert.equal(resumed, true);
});
