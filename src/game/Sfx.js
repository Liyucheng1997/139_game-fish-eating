// Procedural sound effects with WebAudio — no audio assets needed.
// Everything runs through a compressor, with a short "underwater" convolution
// reverb on a send bus so bites and gulps sit inside a watery space.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.send = null;
    this._noiseBuf = null;
    this._bubbleT = 2;
  }

  // Must be called from a user gesture (start button click).
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(comp);

      // shared white noise (random offsets keep repeats from sounding identical)
      const len = ctx.sampleRate * 2;
      this._noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // murky reverb: decaying noise impulse, darkened by a lowpass
      const verb = ctx.createConvolver();
      verb.buffer = this._impulse(1.6, 2.8);
      const verbLP = ctx.createBiquadFilter();
      verbLP.type = "lowpass";
      verbLP.frequency.value = 1400;
      this.send = ctx.createGain();
      this.send.gain.value = 0.55;
      this.send.connect(verb).connect(verbLP).connect(this.master);

      this._startAmbient();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = (ctx.sampleRate * seconds) | 0;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _startAmbient() {
    // Low rumble of moving water + a faint detuned pad breathing slowly.
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260;
    const rumble = ctx.createGain();
    rumble.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(rumble.gain);
    src.connect(lp).connect(rumble).connect(this.master);
    src.start();
    lfo.start();

    const pad = ctx.createGain();
    pad.gain.value = 0.022;
    const padLP = ctx.createBiquadFilter();
    padLP.type = "lowpass";
    padLP.frequency.value = 300;
    for (const [freq, detune] of [[55, 0], [82.4, 6], [110, -5]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(padLP);
      osc.start();
    }
    padLP.connect(pad).connect(this.master);
  }

  // Occasional distant bubble plinks; call every frame.
  ambientTick(dt) {
    if (!this.ctx || this.muted) return;
    this._bubbleT -= dt;
    if (this._bubbleT > 0) return;
    this._bubbleT = 1.5 + Math.random() * 4;
    const n = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) this._bubble(0.02 + Math.random() * 0.02, i * (0.06 + Math.random() * 0.1), 0.9);
  }

  // ------------------------------------------------------------ primitives
  _env(gainNode, t0, vol, attack, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(vol, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  _out(node, wet = 0.2) {
    node.connect(this.master);
    if (wet > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      node.connect(w).connect(this.send);
    }
  }

  _blip({ freq = 440, endFreq = null, type = "sine", dur = 0.15, vol = 0.3, delay = 0, attack = 0.004, wet = 0.15 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    this._env(gain, t0, vol, attack, dur);
    osc.connect(gain);
    this._out(gain, wet);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.25, vol = 0.2, freq = 900, endFreq = null, q = 1, type = "bandpass", delay = 0, attack = 0.003, wet = 0.15 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t0);
    if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    const gain = ctx.createGain();
    this._env(gain, t0, vol, attack, dur);
    src.connect(filter).connect(gain);
    this._out(gain, wet);
    src.start(t0, Math.random() * 1.5, dur + 0.05);
  }

  _bubble(vol, delay, wet = 0.4) {
    const f = 380 + Math.random() * 500;
    this._blip({ freq: f, endFreq: f * (2.2 + Math.random()), type: "sine", dur: 0.05 + Math.random() * 0.03, vol, delay, attack: 0.002, wet });
  }

  // ------------------------------------------------------------ eating
  // Water rushing into the maw: rising filtered noise + a slurping sweep.
  suck(rel = 0.5, dur = 0.18) {
    const d = dur + 0.04;
    this._noise({ dur: d, vol: 0.2 + rel * 0.14, freq: 300, endFreq: 2600 - rel * 1100, q: 1.4, attack: d * 0.75, wet: 0.25 });
    this._noise({ dur: d * 0.9, vol: 0.08, freq: 5000, endFreq: 1800, q: 0.7, type: "bandpass", attack: d * 0.6, wet: 0.1 });
    this._blip({ freq: 150 - rel * 50, endFreq: 420 - rel * 120, type: "sine", dur: d, vol: 0.12, attack: d * 0.7, wet: 0.2 });
  }

  // Jaws slamming shut: crisp click, crunchy grains, deep body thump.
  chomp(rel = 0.5, combo = 1) {
    const pitch = Math.pow(1.035, Math.min(combo, 14));
    this._noise({ dur: 0.018, vol: 0.5, freq: 3800, type: "highpass", q: 0.7, attack: 0.001, wet: 0.05 });
    const grains = 3 + Math.round(rel * 3);
    for (let i = 0; i < grains; i++) {
      this._noise({
        dur: 0.022 + Math.random() * 0.02,
        vol: 0.26 * (1 - i / (grains + 1)),
        freq: (1400 + Math.random() * 1800) * pitch,
        q: 2.2,
        delay: 0.006 + i * (0.016 + Math.random() * 0.01),
        attack: 0.001,
        wet: 0.1,
      });
    }
    const f0 = (170 - rel * 80) * pitch;
    this._blip({ freq: f0, endFreq: 38, type: "sine", dur: 0.2 + rel * 0.15, vol: 0.55 + rel * 0.25, attack: 0.002, wet: 0.25 });
    this._blip({ freq: f0 * 2, endFreq: 80, type: "triangle", dur: 0.08, vol: 0.14, attack: 0.001, wet: 0.1 });
  }

  // Throat swallow: a resonant downward "glug" and gill bubbles.
  gulp(rel = 0.5, delay = 0.08) {
    const f = 520 - rel * 200;
    this._blip({ freq: f, endFreq: f * 0.36, type: "sine", dur: 0.13, vol: 0.3, delay, attack: 0.012, wet: 0.35 });
    this._noise({ dur: 0.14, vol: 0.18, freq: 1100 - rel * 300, endFreq: 260, q: 7, delay, attack: 0.01, wet: 0.35 });
    this._blip({ freq: f * 0.8, endFreq: f * 0.32, type: "sine", dur: 0.1, vol: 0.14, delay: delay + 0.09, attack: 0.01, wet: 0.35 });
    const n = 2 + Math.round(rel * 3);
    for (let i = 0; i < n; i++) this._bubble(0.07, delay + 0.14 + i * (0.04 + Math.random() * 0.05));
  }

  // Reward sparkle — pitch climbs with the combo for a satisfying ladder.
  reward(combo = 1) {
    const base = 520 * Math.pow(1.06, Math.min(combo, 14));
    this._blip({ freq: base, endFreq: base * 1.02, type: "triangle", dur: 0.14, vol: 0.08, delay: 0.06, wet: 0.3 });
    this._blip({ freq: base * 2, type: "sine", dur: 0.18, vol: 0.05, delay: 0.09, wet: 0.35 });
  }

  // Huge prey: sub-bass boom rolling under the bite.
  boom(rel = 1) {
    this._blip({ freq: 90, endFreq: 28, type: "sine", dur: 0.6, vol: 0.6 * rel, attack: 0.005, wet: 0.4 });
    this._noise({ dur: 0.5, vol: 0.2, freq: 180, type: "lowpass", q: 0.8, attack: 0.005, wet: 0.5 });
  }

  // kept for callers that just want a quick generic eat
  eat(combo = 1) {
    this.chomp(0.3, combo);
    this.reward(combo);
  }

  bigEat() {
    this.chomp(1, 1);
    this.boom(0.8);
  }

  // ------------------------------------------------------------ other events
  dash() {
    this._noise({ dur: 0.3, vol: 0.24, freq: 500, endFreq: 2200, q: 1, attack: 0.04, wet: 0.2 });
    this._blip({ freq: 220, endFreq: 660, type: "sine", dur: 0.2, vol: 0.07 });
  }

  hurt() {
    this._blip({ freq: 160, endFreq: 60, type: "sawtooth", dur: 0.4, vol: 0.26 });
    this._noise({ dur: 0.3, vol: 0.2, freq: 250 });
  }

  powerup() {
    [523, 659, 784, 1047].forEach((f, i) => this._blip({ freq: f, type: "triangle", dur: 0.14, vol: 0.16, delay: i * 0.07, wet: 0.3 }));
  }

  levelUp() {
    [392, 494, 587, 784].forEach((f, i) => this._blip({ freq: f, type: "sine", dur: 0.3, vol: 0.18, delay: i * 0.1, wet: 0.35 }));
    this._noise({ dur: 0.5, vol: 0.06, freq: 2000, delay: 0.2 });
  }

  frenzy() {
    [660, 880, 1100].forEach((f, i) => this._blip({ freq: f, endFreq: f * 1.3, type: "square", dur: 0.1, vol: 0.09, delay: i * 0.05 }));
  }

  sting() {
    this._blip({ freq: 800, endFreq: 200, type: "square", dur: 0.25, vol: 0.14 });
  }

  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this._blip({ freq: f, type: "triangle", dur: 0.5, vol: 0.18, delay: i * 0.13, wet: 0.4 }));
  }

  lose() {
    [440, 349, 262, 196].forEach((f, i) => this._blip({ freq: f, type: "sine", dur: 0.4, vol: 0.2, delay: i * 0.16, wet: 0.4 }));
  }

  warning() {
    this._blip({ freq: 440, endFreq: 440, type: "square", dur: 0.16, vol: 0.12 });
    this._blip({ freq: 330, endFreq: 330, type: "square", dur: 0.16, vol: 0.12, delay: 0.22 });
  }
}
