import * as THREE from "three";
import { FishRig } from "../fish/FishRig.js";
import { clamp, damp, randRange, hslToHex } from "../utils.js";

export const EAT_RATIO = 1.15; // predator must be this many times longer to eat prey

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);

const BASE_CRUISE = 3.0;
const BASE_SPRINT = 5.8;
const BASE_TURN_RATE = 2.6; // rad/s at size 1

const DASH_SPEED_MULT = 2.3; // relative to base cruise, instant burst
const DASH_DURATION = 0.35;
const DASH_COOLDOWN = 2.2;

function speedScale(size) {
  return 0.75 + 0.35 * Math.sqrt(size);
}
function turnScale(size) {
  return 1 / (0.6 + 0.55 * Math.sqrt(size));
}

let nextId = 1;

export class FishEntity {
  constructor({ isPlayer = false, size = 1, position = new THREE.Vector3(), heading = null, hue = null, aggression = 0.5 } = {}) {
    this.id = nextId++;
    this.isPlayer = isPlayer;
    this.size = size;
    this.displaySize = size;
    this.aggression = aggression;
    this.alive = true;
    this.state = "wander";

    this.hue = hue !== null ? hue : Math.random() * 360;
    const bodyColor = hslToHex(this.hue, 0.45, isPlayer ? 0.62 : 0.5);
    const finColor = hslToHex(this.hue, 0.5, isPlayer ? 0.4 : 0.32);

    this.rig = new FishRig({ length: 1, bodyColor, finColor, flex: 1 / (0.7 + 0.3 * Math.sqrt(size)) });
    this.object3D = new THREE.Group();
    this.object3D.add(this.rig.group);
    this.object3D.position.copy(position);

    this.forward = heading ? heading.clone().normalize() : new THREE.Vector3(Math.sin(Math.random() * Math.PI * 2), 0, Math.cos(Math.random() * Math.PI * 2));
    this.currentSpeed = BASE_CRUISE * speedScale(size) * 0.5;
    this.wanderTarget = position.clone();
    this._wanderTimer = 0;
    this._bank = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;

    this._applyOrientationInstant();
  }

  get position() {
    return this.object3D.position;
  }

  get radius() {
    return this.size * 0.5;
  }

  get dashReadiness() {
    return this.dashCooldown <= 0 ? 1 : 1 - this.dashCooldown / DASH_COOLDOWN;
  }

  grow(amount) {
    this.size += amount;
    this.rig.flex = 1 / (0.7 + 0.3 * Math.sqrt(this.size));
  }

  _applyOrientationInstant() {
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), this.forward.clone().negate(), WORLD_UP);
    this.object3D.quaternion.setFromRotationMatrix(m);
  }

  _finishStep(dt, targetSpeed, instant = false) {
    this.currentSpeed = instant ? targetSpeed : damp(this.currentSpeed, targetSpeed, 3.5, dt);
    this.object3D.position.addScaledVector(this.forward, this.currentSpeed * dt);

    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), this.forward.clone().negate(), WORLD_UP);
    const baseQuat = new THREE.Quaternion().setFromRotationMatrix(m);
    const bankQuat = new THREE.Quaternion().setFromAxisAngle(LOCAL_FORWARD, this._bank);
    baseQuat.multiply(bankQuat);
    this.object3D.quaternion.copy(baseQuat);

    this.displaySize = damp(this.displaySize, this.size, 3, dt);
    this.rig.group.scale.setScalar(this.displaySize);

    const cruise = BASE_CRUISE * speedScale(this.size);
    this.rig.update(dt, this.currentSpeed / cruise);
  }

  // --- Player control: mouse yaw/pitch directly steers the heading vector ---
  updatePlayer(dt, input) {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (input.dash && this.dashCooldown <= 0) {
      this.dashTimer = DASH_DURATION;
      this.dashCooldown = DASH_COOLDOWN;
    }
    const dashing = this.dashTimer > 0;
    if (dashing) this.dashTimer = Math.max(0, this.dashTimer - dt);

    const turn = turnScale(this.size) * (dashing ? 0.6 : 1); // committed lunge: harder to steer mid-dash
    const yawRate = -input.mouseX * 2.9 * turn;
    const pitchRate = -input.mouseY * 2.3 * turn;

    const oldForward = this.forward.clone();

    this.forward.applyAxisAngle(WORLD_UP, yawRate * dt);
    const right = new THREE.Vector3().crossVectors(this.forward, WORLD_UP).normalize();
    if (right.lengthSq() > 0.0001) {
      this.forward.applyAxisAngle(right, pitchRate * dt);
    }
    this.forward.y = clamp(this.forward.y, -0.82, 0.82);
    this.forward.normalize();

    const turnSign = -Math.sign(new THREE.Vector3().crossVectors(oldForward, this.forward).y || 0);
    const turnMag = oldForward.angleTo(this.forward) / Math.max(dt, 0.0001);
    this._bank = damp(this._bank, clamp(turnMag * 0.16, 0, 0.55) * turnSign, 6, dt);

    const boosting = input.boost;
    let targetSpeed = (boosting ? BASE_SPRINT : BASE_CRUISE) * speedScale(this.size);
    if (dashing) targetSpeed = BASE_CRUISE * DASH_SPEED_MULT * speedScale(this.size);
    this._finishStep(dt, targetSpeed, dashing);
  }

  // --- AI steering: weighted desired-direction blend, turn-rate limited ---
  updateAI(dt, ctx) {
    const { player, boundaryRadius, neighbors } = ctx;
    const pos = this.object3D.position;
    const desired = new THREE.Vector3();
    let hungry = false;
    let scared = false;

    // 1. stay inside the world bounds
    const distFromCenter = pos.length();
    if (distFromCenter > boundaryRadius * 0.8) {
      const pull = (distFromCenter - boundaryRadius * 0.8) / (boundaryRadius * 0.2);
      desired.addScaledVector(pos.clone().negate().normalize(), clamp(pull, 0, 1) * 3.0);
    }

    // 2. react to the player
    if (player && player.alive) {
      const toPlayer = new THREE.Vector3().subVectors(player.position, pos);
      const dist = toPlayer.length();
      const fleeRange = 4.5 + player.size * 0.5;
      const huntRange = 7.5 + this.size * 0.9;
      if (this.size * EAT_RATIO < player.size && dist < fleeRange) {
        // smaller than the player and nearby -> flee (only once the player is genuinely close, so it's catchable)
        const w = clamp(1 - dist / fleeRange, 0, 1);
        desired.addScaledVector(toPlayer.normalize(), -w * 2.4);
        scared = w > 0.15;
      } else if (this.size > player.size * EAT_RATIO && this.aggression > 0.4 && dist < huntRange) {
        // bigger than the player and aggressive enough -> hunt, but only once reasonably close
        const w = clamp(1 - dist / huntRange, 0, 1) * this.aggression;
        desired.addScaledVector(toPlayer.normalize(), w * 1.5);
        hungry = w > 0.2;
      }
    }

    // 3. keep some distance from crowding neighbors
    if (neighbors) {
      for (const other of neighbors) {
        if (other === this) continue;
        const away = new THREE.Vector3().subVectors(pos, other.position);
        const d = away.length();
        const minDist = this.radius + other.radius + 1.2;
        if (d < minDist && d > 0.0001) {
          desired.addScaledVector(away.normalize(), ((minDist - d) / minDist) * 1.1);
        }
      }
    }

    // 4. lazy wander toward a periodically-refreshed random target
    this._wanderTimer -= dt;
    if (this._wanderTimer <= 0 || this.wanderTarget.distanceTo(pos) < 2) {
      this._wanderTimer = randRange(3, 7);
      const r = boundaryRadius * 0.7;
      this.wanderTarget.set(randRange(-r, r), randRange(-r * 0.4, r * 0.4), randRange(-r, r));
    }
    desired.addScaledVector(new THREE.Vector3().subVectors(this.wanderTarget, pos).normalize(), 0.55);

    if (desired.lengthSq() < 1e-6) desired.copy(this.forward);
    desired.normalize();

    this.state = scared ? "flee" : hungry ? "hunt" : "wander";

    const turnRate = BASE_TURN_RATE * turnScale(this.size) * (scared ? 1.1 : 1);
    const oldForward = this.forward.clone();
    const angle = oldForward.angleTo(desired);
    const t = angle > 1e-4 ? clamp((turnRate * dt) / angle, 0, 1) : 0;
    const rotQuat = new THREE.Quaternion().setFromUnitVectors(oldForward, desired);
    const partial = new THREE.Quaternion().identity().slerp(rotQuat, t);
    this.forward.copy(oldForward).applyQuaternion(partial).normalize();

    const turnSign = -Math.sign(new THREE.Vector3().crossVectors(oldForward, this.forward).y || 0);
    const turnMag = angle * t / Math.max(dt, 0.0001);
    this._bank = damp(this._bank, clamp(turnMag * 0.16, 0, 0.5) * turnSign, 6, dt);

    let targetSpeed = BASE_CRUISE * speedScale(this.size) * 0.65;
    if (scared) {
      // Small fry are genuinely weak swimmers: the smaller they are relative to the
      // player, the slower their panic speed, so tiny prey are easy free food and only
      // near-equal-size fish require real effort (boost/dash) to run down.
      const sizeRatio = ctx.player ? clamp(this.size / ctx.player.size, 0.15, 1) : 1;
      targetSpeed = BASE_CRUISE * speedScale(this.size) * (0.45 + sizeRatio * 0.55);
    } else if (hungry) {
      const pos2 = this.object3D.position;
      const distToPlayer = ctx.player ? pos2.distanceTo(ctx.player.position) : Infinity;
      const lunging = distToPlayer < 2.6 + this.size * 0.5;
      targetSpeed = BASE_CRUISE * speedScale(this.size) * (lunging ? 1.3 : 1.1);
    }

    this._finishStep(dt, targetSpeed);
  }

  dispose() {
    this.rig.dispose();
  }
}
