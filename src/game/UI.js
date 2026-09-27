// DOM overlay: screens, HUD, toasts and warnings.
export class UI {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.hud = this.$("hud");
    this.screenStart = this.$("screen-start");
    this.screenOver = this.$("screen-gameover");
    this.screenWin = this.$("screen-win");

    this.scoreEl = this.$("hud-score");
    this.comboEl = this.$("hud-combo");
    this.comboFill = this.$("hud-combo-fill");
    this.levelName = this.$("hud-level-name");
    this.levelFill = this.$("hud-level-fill");
    this.livesEl = this.$("hud-lives");
    this.dashFill = this.$("hud-dash-fill");
    this.warnEl = this.$("hud-warning");
    this.toastEl = this.$("hud-toast");
    this.frenzyEl = this.$("hud-frenzy");
    this.powersEl = this.$("hud-powers");

    this._warnTimer = null;
    this._toastTimer = null;
    this._lastCombo = -1;
    this._lastScore = -1;
  }

  bind({ onStart, onRestart, onContinue }) {
    this.$("btn-start").addEventListener("click", onStart);
    this.$("btn-restart").addEventListener("click", onRestart);
    this.$("btn-win-restart").addEventListener("click", onRestart);
    this.$("btn-continue").addEventListener("click", onContinue);
  }

  _show(el, visible) {
    el.classList.toggle("hidden", !visible);
  }

  showPlaying() {
    this._show(this.screenStart, false);
    this._show(this.screenOver, false);
    this._show(this.screenWin, false);
    this._show(this.hud, true);
  }

  showGameOver({ score, eaten, len, levelName }) {
    this.$("gameover-detail").textContent = `最终得分 ${score} ・ 吞食 ${eaten} 条 ・ 体长 ${(len / 100).toFixed(1)}m（${levelName}）`;
    this._show(this.hud, false);
    this._show(this.screenOver, true);
  }

  reset() {
    clearTimeout(this._warnTimer);
    clearTimeout(this._toastTimer);
    this._warnLock = false;
    this._lastCombo = -1;
    this._lastScore = -1;
    this._lastPowers = null;
    this.comboEl.classList.remove("pop");
    this.toastEl.classList.remove("show");
    this._show(this.toastEl, false);
    this._show(this.warnEl, false);
    this.setFrenzy(false);
  }

  showWin({ score, eaten, len }) {
    this.$("win-detail").textContent = `得分 ${score} ・ 吞食 ${eaten} 条 ・ 体长 ${(len / 100).toFixed(1)}m`;
    this._show(this.hud, false);
    this._show(this.screenWin, true);
  }

  setLives(n) {
    this.livesEl.textContent = "❤️".repeat(Math.max(0, n)) + "🖤".repeat(Math.max(0, 3 - n));
  }

  setLevel(level, levels, len) {
    const cur = levels[level];
    const next = levels[level + 1];
    this.levelName.textContent = cur.name;
    if (next) {
      const t = Math.max(0, Math.min(1, (len - cur.len) / (next.len - cur.len)));
      this.levelFill.style.width = `${(t * 100).toFixed(1)}%`;
    } else {
      this.levelFill.style.width = "100%";
    }
  }

  setFrenzy(on) {
    this._show(this.frenzyEl, on);
  }

  updateHud({ score, combo, comboT, danger, dash, powers }) {
    if (score !== this._lastScore) {
      this._lastScore = score;
      this.scoreEl.textContent = score;
    }
    if (combo !== this._lastCombo) {
      this._lastCombo = combo;
      if (combo >= 2) {
        this.comboEl.textContent = `x${Math.min(combo, 10)} 连击`;
        this.comboEl.classList.remove("pop");
        void this.comboEl.offsetWidth; // restart animation
        this.comboEl.classList.add("pop");
      } else {
        this.comboEl.textContent = "";
      }
    }
    this.comboFill.style.width = combo >= 2 ? `${(comboT * 100).toFixed(1)}%` : "0%";
    this.dashFill.style.width = `${(dash * 100).toFixed(0)}%`;
    this.dashFill.classList.toggle("ready", dash >= 1);
    this._show(this.warnEl, danger && !this._warnLock);
    if (danger && !this._warnLock) this.warnEl.textContent = "⚠️ 危险！附近有大鱼！";

    // power-up pills
    let html = "";
    if (powers.star > 0) html += `<span class="power star">⭐ ${powers.star.toFixed(0)}s</span>`;
    if (powers.magnet > 0) html += `<span class="power magnet">🧲 ${powers.magnet.toFixed(0)}s</span>`;
    if (powers.bolt > 0) html += `<span class="power bolt">⚡ ${powers.bolt.toFixed(0)}s</span>`;
    if (html !== this._lastPowers) {
      this._lastPowers = html;
      this.powersEl.innerHTML = html;
    }
  }

  // Priority banner (shark warning, life lost) — temporarily overrides danger text.
  warn(text, seconds = 2.5) {
    this.warnEl.textContent = text;
    this._show(this.warnEl, true);
    this._warnLock = true;
    clearTimeout(this._warnTimer);
    this._warnTimer = setTimeout(() => {
      this._warnLock = false;
      this._show(this.warnEl, false);
    }, seconds * 1000);
  }

  toast(text, seconds = 2.2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove("hidden", "show");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), seconds * 1000);
  }
}
