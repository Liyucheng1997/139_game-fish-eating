import { Game } from "./game/Game.js";
import { UI } from "./game/UI.js";

const canvas = document.getElementById("scene");
const ui = new UI();
const game = new Game(canvas, ui);

ui.bind({
  onStart: () => game.start(),
  onRestart: () => game.start(),
  onContinue: () => game.continueEndless(),
});

// handy for poking at the game from devtools during development
if (import.meta.env.DEV) window.__game = game;
