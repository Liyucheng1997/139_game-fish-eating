export class UI {
  constructor() {
    this.hud = document.getElementById("hud");
    this.hudSize = document.getElementById("hud-size-value");
    this.hudScore = document.getElementById("hud-score-value");
    this.hudWarning = document.getElementById("hud-warning");
    this.hudDashFill = document.getElementById("hud-dash-fill");
    this.crosshair = document.getElementById("crosshair");

    this.screenStart = document.getElementById("screen-start");
    this.screenGameOver = document.getElementById("screen-gameover");
    this.screenLoading = document.getElementById("loading");
    this.gameOverTitle = document.getElementById("gameover-title");
    this.gameOverDetail = document.getElementById("gameover-detail");

    this.btnStart = document.getElementById("btn-start");
    this.btnRestart = document.getElementById("btn-restart");
  }

  onStart(cb) {
    this.btnStart.addEventListener("click", cb);
  }

  onRestart(cb) {
    this.btnRestart.addEventListener("click", cb);
  }

  hideLoading() {
    this.screenLoading.classList.add("hidden");
  }

  showStart() {
    this.screenStart.classList.remove("hidden");
    this.screenGameOver.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.crosshair.classList.add("hidden");
  }

  showPlaying() {
    this.screenStart.classList.add("hidden");
    this.screenGameOver.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.crosshair.classList.remove("hidden");
  }

  showGameOver({ won, size, score }) {
    this.screenGameOver.classList.remove("hidden");
    this.hud.classList.add("hidden");
    this.crosshair.classList.add("hidden");
    this.gameOverTitle.textContent = won ? "你已成为海洋之王！" : "你被吃掉了";
    this.gameOverDetail.textContent = `最终体长 ${size.toFixed(1)}m ・ 吞食 ${score} 条鱼`;
  }

  updateHud({ size, score, danger, dashReadiness = 1 }) {
    this.hudSize.textContent = size.toFixed(1);
    this.hudScore.textContent = String(score);
    this.hudWarning.classList.toggle("hidden", !danger);
    this.hudDashFill.style.width = `${Math.round(dashReadiness * 100)}%`;
  }
}
