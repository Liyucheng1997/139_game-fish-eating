import * as THREE from "three";
import { World } from "./World.js";
import { Input } from "./Input.js";
import { FishEntity, EAT_RATIO } from "./entities/FishEntity.js";
import { WakeTrail } from "./effects/WakeTrail.js";
import { IndicatorManager } from "./effects/IndicatorManager.js";
import { clamp, randRange, randomInSphere } from "./utils.js";

const BOUNDARY_RADIUS = 32;
const AI_COUNT = 36;
const WIN_SIZE = 10;

function randomSpawnSize(playerSize) {
  const roll = Math.random();
  let size;
  if (roll < 0.68) size = playerSize * randRange(0.3, 0.7);
  else if (roll < 0.9) size = playerSize * randRange(0.75, 1.05);
  else size = playerSize * randRange(1.6, 2.6);
  return clamp(size, 0.22, 34);
}

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.running = false;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    this._cameraPos = new THREE.Vector3(0, 4, -12);
    this._cameraLookOffset = new THREE.Vector3();

    this.world = new World(this.scene, { boundaryRadius: BOUNDARY_RADIUS });
    this.input = new Input();
    this.wake = new WakeTrail(this.scene, 70);
    this.indicators = new IndicatorManager(this.scene);

    this.entities = [];
    this.player = null;
    this.score = 0;

    this._resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width < 1 || height < 1) return;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    });
    this._resizeObserver.observe(this.canvas);

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  start() {
    for (const e of this.entities) {
      this.scene.remove(e.object3D);
      e.dispose();
    }
    this.entities = [];
    this.indicators.clear();
    this.score = 0;

    this.player = new FishEntity({
      isPlayer: true,
      size: 1,
      position: new THREE.Vector3(0, 0, 0),
      heading: new THREE.Vector3(0, 0, 1),
      hue: 42,
    });
    this.scene.add(this.player.object3D);
    this.entities.push(this.player);

    for (let i = 0; i < AI_COUNT; i++) {
      this._spawnAI(randomSpawnSize(this.player.size));
    }

    this.running = true;
    this.ui.showPlaying();
  }

  _spawnAI(size) {
    let pos;
    // Spawn near the player's current neighborhood rather than anywhere in the whole
    // world, so there's always a nearby shoal to hunt instead of an empty search.
    for (let attempt = 0; attempt < 8; attempt++) {
      const p = randomInSphere(randRange(8, BOUNDARY_RADIUS * 0.6));
      const vec = this.player ? this.player.position.clone().add(new THREE.Vector3(p.x, p.y * 0.4, p.z)) : new THREE.Vector3(p.x, p.y * 0.5, p.z);
      if (vec.length() > BOUNDARY_RADIUS * 0.95) vec.multiplyScalar((BOUNDARY_RADIUS * 0.95) / vec.length());
      if (!this.player || vec.distanceTo(this.player.position) > 10) {
        pos = vec;
        break;
      }
    }
    if (!pos) pos = new THREE.Vector3(randRange(-BOUNDARY_RADIUS, BOUNDARY_RADIUS), 0, randRange(-BOUNDARY_RADIUS, BOUNDARY_RADIUS));

    const entity = new FishEntity({
      isPlayer: false,
      size,
      position: pos,
      aggression: randRange(0.15, 0.85),
    });
    this.scene.add(entity.object3D);
    this.entities.push(entity);
    return entity;
  }

  _removeAI(entity) {
    this.scene.remove(entity.object3D);
    entity.dispose();
    this.indicators.remove(entity);
    const idx = this.entities.indexOf(entity);
    if (idx >= 0) this.entities.splice(idx, 1);
  }

  _endGame(won) {
    this.running = false;
    this.ui.showGameOver({ won, size: this.player.size, score: this.score });
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.running) this._update(dt);
    this.world.update(dt);
    this.wake.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const steer = this.input.steer;
    this.player.updatePlayer(dt, steer);
    this._containInBounds(this.player);
    this._emitWake(steer);

    const aiList = this.entities.filter((e) => !e.isPlayer);
    for (const ai of aiList) {
      ai.updateAI(dt, { player: this.player, boundaryRadius: BOUNDARY_RADIUS, neighbors: aiList });
      this._containInBounds(ai);
    }

    this._resolveEating(aiList, dt);
    this._updateCamera(dt);
    this._updateHud(aiList);
    this.indicators.update(aiList, this.player, this.camera);

    if (this.player.size >= WIN_SIZE) {
      this._endGame(true);
    }
  }

  _emitWake(steer) {
    const player = this.player;
    const dashing = player.dashTimer > 0;
    if (!steer.boost && !dashing) return;

    const tailPos = player.position.clone().addScaledVector(player.forward, -player.radius * 1.15);
    const backVelocity = player.forward.clone().multiplyScalar(-1.4);
    const puffs = dashing ? 4 : 2;
    for (let i = 0; i < puffs; i++) {
      this.wake.emit(tailPos, backVelocity, Math.max(0.5, player.displaySize * 0.4));
    }
  }

  _containInBounds(entity) {
    const p = entity.position;
    const dist = p.length();
    if (dist > BOUNDARY_RADIUS * 1.02) {
      p.multiplyScalar((BOUNDARY_RADIUS * 1.02) / dist);
    }
    const floorY = this.world.floorY + entity.radius * 0.4;
    if (p.y < floorY) p.y = floorY;
  }

  _resolveEating(aiList, dt) {
    const player = this.player;
    for (const ai of [...aiList]) {
      const dist = ai.position.distanceTo(player.position);
      const threshold = player.radius * 0.85 + ai.radius * 0.55;
      if (dist > threshold) continue;

      if (player.size > ai.size * EAT_RATIO) {
        player.grow(ai.size * 0.24);
        this.score += 1;
        this._removeAI(ai);
        this._spawnAI(randomSpawnSize(player.size));
      } else if (ai.size > player.size * EAT_RATIO) {
        this._endGame(false);
        return;
      } else {
        const away = new THREE.Vector3().subVectors(player.position, ai.position);
        if (away.lengthSq() > 0.0001) {
          away.normalize();
          player.position.addScaledVector(away, 1.5 * dt);
        }
      }
    }
  }

  _updateCamera(dt) {
    const player = this.player;
    const dist = 7 + player.size * 1.7;
    const height = 2.4 + player.size * 0.7;
    const desired = player.position
      .clone()
      .addScaledVector(player.forward, -dist)
      .addScaledVector(new THREE.Vector3(0, 1, 0), height);

    this._cameraPos.lerp(desired, 1 - Math.pow(0.001, dt));
    this.camera.position.copy(this._cameraPos);

    const lookTarget = player.position.clone().addScaledVector(player.forward, 4);
    this.camera.lookAt(lookTarget);
  }

  _updateHud(aiList) {
    let danger = false;
    for (const ai of aiList) {
      if (ai.size > this.player.size * EAT_RATIO) {
        const dist = ai.position.distanceTo(this.player.position);
        if (dist < 14 + ai.size * 1.3) {
          danger = true;
          break;
        }
      }
    }
    this.ui.updateHud({ size: this.player.size, score: this.score, danger, dashReadiness: this.player.dashReadiness });
  }
}
