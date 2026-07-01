import * as THREE from "three";
import { EAT_RATIO } from "../entities/FishEntity.js";

// A small billboarded dot hovering over every AI fish, color-coded relative to the
// player's current size (green = edible, red = dangerous, yellow = evenly matched).
// Perspective makes far-away fish look small regardless of their real size, so this
// gives the player a size-independent, always-legible read on who's prey and who isn't.
const COLORS = { edible: 0x36e07a, danger: 0xff4d4f, neutral: 0xffd23f };

export class IndicatorManager {
  constructor(scene) {
    this.scene = scene;
    this.geometry = new THREE.CircleGeometry(1, 20);
    this.materials = {
      edible: new THREE.MeshBasicMaterial({ color: COLORS.edible, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      danger: new THREE.MeshBasicMaterial({ color: COLORS.danger, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      neutral: new THREE.MeshBasicMaterial({ color: COLORS.neutral, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    };
    this.meshes = new Map();
  }

  _ensure(entity) {
    let mesh = this.meshes.get(entity.id);
    if (!mesh) {
      mesh = new THREE.Mesh(this.geometry, this.materials.neutral);
      mesh.renderOrder = 999;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.meshes.set(entity.id, mesh);
    }
    return mesh;
  }

  remove(entity) {
    const mesh = this.meshes.get(entity.id);
    if (mesh) {
      this.scene.remove(mesh);
      this.meshes.delete(entity.id);
    }
  }

  clear() {
    for (const mesh of this.meshes.values()) this.scene.remove(mesh);
    this.meshes.clear();
  }

  update(aiList, player, camera) {
    if (!player) return;
    for (const ai of aiList) {
      const mesh = this._ensure(ai);
      const dist = ai.position.distanceTo(camera.position);
      const visible = dist < 42 && dist > 0.6;
      mesh.visible = visible;
      if (!visible) continue;

      let category = "neutral";
      if (ai.size * EAT_RATIO < player.size) category = "edible";
      else if (player.size * EAT_RATIO < ai.size) category = "danger";
      mesh.material = this.materials[category];

      mesh.position.copy(ai.position);
      mesh.position.y += ai.radius + 0.55;
      mesh.quaternion.copy(camera.quaternion);

      const scale = THREE.MathUtils.clamp(dist * 0.012, 0.05, 0.24);
      mesh.scale.setScalar(scale);
    }
  }

  disposeAll() {
    this.clear();
    this.geometry.dispose();
    Object.values(this.materials).forEach((m) => m.dispose());
  }
}
