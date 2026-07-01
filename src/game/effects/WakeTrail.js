import * as THREE from "three";
import { randRange } from "../utils.js";

// A small recycled pool of bubbles emitted behind a fish while it's boosting or
// dashing, so acceleration has a visible trail instead of being a silent number change.
export class WakeTrail {
  constructor(scene, count = 70) {
    const geometry = new THREE.SphereGeometry(1, 6, 6);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xeaffff,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0,
    });
    this.count = count;
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    this.particles = Array.from({ length: count }, () => ({
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      age: 0,
      maxAge: 1,
      baseScale: 0.05,
    }));
    this._cursor = 0;

    const dummy = new THREE.Object3D();
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, dummy.matrix);

    scene.add(this.mesh);
  }

  emit(position, backVelocity, scale = 1) {
    const p = this.particles[this._cursor];
    this._cursor = (this._cursor + 1) % this.count;
    p.active = true;
    p.age = 0;
    p.maxAge = randRange(0.4, 0.75);
    p.pos.copy(position);
    p.pos.x += randRange(-0.12, 0.12) * scale;
    p.pos.y += randRange(-0.12, 0.12) * scale;
    p.pos.z += randRange(-0.12, 0.12) * scale;
    p.vel.copy(backVelocity);
    p.vel.x += randRange(-0.5, 0.5);
    p.vel.y += randRange(0.2, 0.7);
    p.vel.z += randRange(-0.5, 0.5);
    p.baseScale = randRange(0.05, 0.1) * scale;
  }

  update(dt) {
    const dummy = new THREE.Object3D();
    let anyActive = false;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        dummy.position.set(0, -9999, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      anyActive = true;
      p.vel.y += dt * 0.4;
      p.pos.addScaledVector(p.vel, dt);
      const lifeT = p.age / p.maxAge;
      const scale = p.baseScale * (1 + lifeT * 1.4) * (1 - lifeT * 0.85);
      dummy.position.copy(p.pos);
      dummy.scale.setScalar(Math.max(scale, 0.0001));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    if (anyActive) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
