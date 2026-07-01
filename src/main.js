import { UI } from "./game/UI.js";
import { Game } from "./game/Game.js";

const canvas = document.getElementById("scene");
const ui = new UI();
const game = new Game(canvas, ui);

ui.onStart(() => game.start());
ui.onRestart(() => game.start());

ui.hideLoading();
ui.showStart();
