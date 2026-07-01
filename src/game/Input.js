import { clamp } from "./utils.js";

export class Input {
  constructor(target = window) {
    this.target = target;
    this.mouseX = 0; // normalized -1..1
    this.mouseY = 0;
    this.boost = false;
    this._hasPointer = false;
    this._dashRequested = false;
    this._lastTapTime = 0;

    this._onMouseMove = (e) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.mouseX = clamp((e.clientX / w) * 2 - 1, -1, 1);
      this.mouseY = clamp((e.clientY / h) * 2 - 1, -1, 1);
      this._hasPointer = true;
    };
    this._onTouchMove = (e) => {
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.mouseX = clamp((t.clientX / w) * 2 - 1, -1, 1);
      this.mouseY = clamp((t.clientY / h) * 2 - 1, -1, 1);
      this._hasPointer = true;
      this.boost = true;
    };
    this._onTouchStart = () => {
      const now = performance.now();
      if (now - this._lastTapTime < 300) this._dashRequested = true;
      this._lastTapTime = now;
    };
    this._onTouchEnd = () => {
      this.boost = false;
    };
    this._onKeyDown = (e) => {
      if (e.key === "Shift") this.boost = true;
      if (e.code === "Space" || e.key === " ") {
        this._dashRequested = true;
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      if (e.key === "Shift") this.boost = false;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) this.boost = true;
      if (e.button === 2) this._dashRequested = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.boost = false;
    };
    this._onContextMenu = (e) => e.preventDefault();
    this._onBlur = () => {
      this.boost = false;
      this.mouseX = 0;
      this.mouseY = 0;
    };

    window.addEventListener("mousemove", this._onMouseMove);
    window.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("mouseup", this._onMouseUp);
    window.addEventListener("contextmenu", this._onContextMenu);
    window.addEventListener("touchstart", this._onTouchStart, { passive: true });
    window.addEventListener("touchmove", this._onTouchMove, { passive: true });
    window.addEventListener("touchend", this._onTouchEnd);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
  }

  // Returns a small dead-zone-applied version so tiny jitter near center doesn't twitch the fish.
  get steer() {
    const deadZone = 0.04;
    const applyDead = (v) => {
      if (Math.abs(v) < deadZone) return 0;
      const sign = Math.sign(v);
      return sign * ((Math.abs(v) - deadZone) / (1 - deadZone));
    };
    const dash = this._dashRequested;
    this._dashRequested = false;
    return { mouseX: applyDead(this.mouseX), mouseY: applyDead(this.mouseY), boost: this.boost, dash };
  }

  dispose() {
    window.removeEventListener("mousemove", this._onMouseMove);
    window.removeEventListener("mousedown", this._onMouseDown);
    window.removeEventListener("mouseup", this._onMouseUp);
    window.removeEventListener("contextmenu", this._onContextMenu);
    window.removeEventListener("touchstart", this._onTouchStart);
    window.removeEventListener("touchmove", this._onTouchMove);
    window.removeEventListener("touchend", this._onTouchEnd);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
  }
}
