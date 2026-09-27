// Mouse / touch / keyboard input. The player fish swims toward the pointer
// (classic 2D big-fish controls); boost is held, dash is a tap.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.pointerX = window.innerWidth / 2;
    this.pointerY = window.innerHeight / 2;
    this.hasPointer = false;
    this._boostSources = new Set(); // independent mouse / touch / Shift holds
    this._dashQueued = false; // tap: Space or right mouse button
    this._muteQueued = false;

    canvas.addEventListener("mousemove", (e) => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      this.hasPointer = true;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this._boostSources.add("mouse");
      if (e.button === 2) this._dashQueued = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this._boostSources.delete("mouse");
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Touch: fish follows the finger; a quick second finger tap dashes.
    canvas.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        if (e.touches.length >= 2) this._dashQueued = true;
        const t = e.touches[0];
        this.pointerX = t.clientX;
        this.pointerY = t.clientY;
        this.hasPointer = true;
        this._boostSources.add("touch");
      },
      { passive: false }
    );
    canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const t = e.touches[0];
        this.pointerX = t.clientX;
        this.pointerY = t.clientY;
      },
      { passive: false }
    );
    canvas.addEventListener("touchend", (e) => {
      if (e.touches.length === 0) this._boostSources.delete("touch");
    });
    canvas.addEventListener("touchcancel", () => this._boostSources.delete("touch"));

    window.addEventListener("keydown", (e) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this._boostSources.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) this._dashQueued = true;
      }
      if (e.code === "KeyM" && !e.repeat) this._muteQueued = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this._boostSources.delete(e.code);
    });
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
  }

  get boost() {
    return this._boostSources.size > 0;
  }

  reset() {
    this._boostSources.clear();
    this._dashQueued = false;
    this._muteQueued = false;
    this.hasPointer = false;
  }

  // Consume the dash tap (edge trigger).
  takeDash() {
    const d = this._dashQueued;
    this._dashQueued = false;
    return d;
  }

  takeMuteToggle() {
    const m = this._muteQueued;
    this._muteQueued = false;
    return m;
  }
}
