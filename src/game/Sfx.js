// Tiny procedural sound effects with WebAudio — no audio assets needed.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this._ambient = null;
  }

  // Must be called from a user gesture (start button click).
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startAmbient();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _startAmbient() {
    // A very quiet detuned pad + slow LFO — gentle underwater hum.
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(gain.gain);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    for (const [freq, detune] of [[55, 0], [82.4, 6], [110, -5]]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start();
    }
    filter.connect(gain).connect(this.master);
    lfo.start();
    this._ambient = gain;
  }

  _blip({ freq = 440, endFreq = null, type = "sine", dur = 0.15, vol = 0.3, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.25, vol = 0.2, freq = 900, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  // Eating pop — pitch climbs with the current combo for a satisfying ladder.
  eat(combo = 1) {
    const base = 340 * Math.pow(1.09, Math.min(combo, 14));
    this._blip({ freq: base, endFreq: base * 1.6, type: "square", dur: 0.09, vol: 0.13 });
    this._blip({ freq: base * 2, endFreq: base * 2.6, type: "sine", dur: 0.12, vol: 0.1 });
  }

  bigEat() {
    this._blip({ freq: 200, endFreq: 90, type: "sawtooth", dur: 0.3, vol: 0.2 });
    this._noise({ dur: 0.2, vol: 0.18, freq: 500 });
  }

  dash() {
    this._noise({ dur: 0.28, vol: 0.22, freq: 1400 });
    this._blip({ freq: 220, endFreq: 660, type: "sine", dur: 0.2, vol: 0.08 });
  }

  hurt() {
    this._blip({ freq: 160, endFreq: 60, type: "sawtooth", dur: 0.4, vol: 0.28 });
    this._noise({ dur: 0.3, vol: 0.2, freq: 250 });
  }

  powerup() {
    [523, 659, 784, 1047].forEach((f, i) => this._blip({ freq: f, type: "triangle", dur: 0.14, vol: 0.16, delay: i * 0.07 }));
  }

  levelUp() {
    [392, 494, 587, 784].forEach((f, i) => this._blip({ freq: f, type: "sine", dur: 0.3, vol: 0.18, delay: i * 0.1 }));
    this._noise({ dur: 0.5, vol: 0.06, freq: 2000, delay: 0.2 });
  }

  frenzy() {
    [660, 880, 1100].forEach((f, i) => this._blip({ freq: f, endFreq: f * 1.3, type: "square", dur: 0.1, vol: 0.1, delay: i * 0.05 }));
  }

  sting() {
    this._blip({ freq: 800, endFreq: 200, type: "square", dur: 0.25, vol: 0.15 });
  }

  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this._blip({ freq: f, type: "triangle", dur: 0.5, vol: 0.18, delay: i * 0.13 }));
  }

  lose() {
    [440, 349, 262, 196].forEach((f, i) => this._blip({ freq: f, type: "sine", dur: 0.4, vol: 0.2, delay: i * 0.16 }));
  }

  warning() {
    this._blip({ freq: 440, endFreq: 440, type: "square", dur: 0.16, vol: 0.12 });
    this._blip({ freq: 330, endFreq: 330, type: "square", dur: 0.16, vol: 0.12, delay: 0.22 });
  }
}
