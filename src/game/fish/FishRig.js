import * as THREE from "three";
import { buildFishBodyGeometry, BONE_NAMES, BONE_S_POSITIONS, bodyRadiusAt } from "./FishGeometry.js";
import { createCaudalFin, createDorsalFin, createAnalFin, createPectoralFin, createEyes } from "./FishFins.js";

// Traveling-wave swim parameters per bone (tail -> head order, matching BONE_NAMES).
// Amplitude grows toward the tail and phase lags behind the head, so the wave
// visibly originates near the head and whips backward - how real fish swim.
const AMPLITUDE_FACTOR = { tail: 1.0, tailBase: 0.62, mid: 0.34, neck: 0.16, head: 0.06 };
const PHASE_LAG = { tail: 3.6, tailBase: 2.7, mid: 1.8, neck: 0.9, head: 0.0 };

export class FishRig {
  constructor({ length = 1, bodyColor = 0xffffff, finColor = 0x334455, flex = 1 } = {}) {
    this.length = length;
    this.flex = flex;
    this.phase = Math.random() * Math.PI * 2;
    this.finPhase = Math.random() * Math.PI * 2;

    this.group = new THREE.Group();

    // --- Skeleton ---
    const boneAbsZ = BONE_S_POSITIONS.map((s) => THREE.MathUtils.lerp(-0.5, 0.5, s) * length);
    this.bones = BONE_NAMES.map(() => new THREE.Bone());
    for (let i = this.bones.length - 1; i > 0; i--) {
      this.bones[i - 1].position.z = boneAbsZ[i - 1] - boneAbsZ[i];
      this.bones[i].add(this.bones[i - 1]);
    }
    this.bones[this.bones.length - 1].position.z = boneAbsZ[boneAbsZ.length - 1];
    this.boneByName = {};
    BONE_NAMES.forEach((name, i) => (this.boneByName[name] = this.bones[i]));

    const skeleton = new THREE.Skeleton(this.bones);

    // --- Body mesh ---
    const geometry = buildFishBodyGeometry({});
    geometry.scale(length, length, length);
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: bodyColor,
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.05,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    });
    this.bodyMesh = new THREE.SkinnedMesh(geometry, bodyMaterial);
    this.bodyMesh.add(this.bones[this.bones.length - 1]); // root bone = head
    this.bodyMesh.bind(skeleton);
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.group.add(this.bodyMesh);

    // --- Fins & eyes, attached directly to bones so they inherit the swim wave ---
    const headR = bodyRadiusAt(0.95);
    const neckR = bodyRadiusAt(0.73);
    const midR = bodyRadiusAt(0.5);
    const tailBaseR = bodyRadiusAt(0.27);

    this.caudalFin = createCaudalFin(finColor, length);
    this.caudalFin.position.set(0, 0, -0.02 * length);
    this.boneByName.tail.add(this.caudalFin);

    this.dorsalFin = createDorsalFin(finColor, length);
    this.dorsalFin.position.set(0, midR.ry * length * 0.92, 0);
    this.boneByName.mid.add(this.dorsalFin);

    this.analFin = createAnalFin(finColor, length);
    this.analFin.position.set(0, -tailBaseR.ry * length * 0.85, 0);
    this.boneByName.tailBase.add(this.analFin);

    this.pectoralL = createPectoralFin(finColor, length);
    this.pectoralL.position.set(-neckR.rx * length * 0.85, -neckR.ry * length * 0.15, 0);
    this.pectoralL.scale.x = -1;
    this.boneByName.neck.add(this.pectoralL);

    this.pectoralR = createPectoralFin(finColor, length);
    this.pectoralR.position.set(neckR.rx * length * 0.85, -neckR.ry * length * 0.15, 0);
    this.boneByName.neck.add(this.pectoralR);

    this.eyes = createEyes(headR.ry * length * 0.32);
    this.eyes.position.set(0, headR.ry * length * 0.25, length * 0.42);
    this.boneByName.head.add(this.eyes);
  }

  setColors(bodyColor, finColor) {
    this.bodyMesh.material.color.set(bodyColor);
    for (const fin of [this.caudalFin, this.dorsalFin, this.analFin, this.pectoralL, this.pectoralR]) {
      const c = new THREE.Color(finColor);
      const colorAttr = fin.geometry.getAttribute("color");
      for (let i = 0; i < colorAttr.count; i++) {
        colorAttr.setXYZ(i, c.r, c.g, c.b);
      }
      colorAttr.needsUpdate = true;
    }
  }

  // speedFactor: 0 = idle drift, 1 = normal cruise, >1 = sprinting
  update(dt, speedFactor = 0.4) {
    const freq = (1.1 + speedFactor * 2.6) * this.flex;
    const amp = (0.28 + speedFactor * 0.32) * this.flex;
    this.phase += dt * freq * Math.PI * 2 * 0.5;
    this.finPhase += dt * (freq * 0.5 + 0.5);

    for (const name of BONE_NAMES) {
      this.boneByName[name].rotation.y = amp * AMPLITUDE_FACTOR[name] * Math.sin(this.phase - PHASE_LAG[name]);
    }

    const flap = Math.sin(this.finPhase) * 0.16;
    this.pectoralL.rotation.z = flap;
    this.pectoralR.rotation.z = -flap;
  }

  dispose() {
    this.bodyMesh.geometry.dispose();
    this.bodyMesh.material.dispose();
    for (const fin of [this.caudalFin, this.dorsalFin, this.analFin, this.pectoralL, this.pectoralR]) {
      fin.geometry.dispose();
      fin.material.dispose();
    }
  }
}
