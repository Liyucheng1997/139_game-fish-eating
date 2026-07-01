import * as THREE from "three";
import { randRange } from "./utils.js";

function makeSandTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#cbb079";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.3 + 0.2;
    const shade = Math.random() * 60 - 30;
    ctx.fillStyle = `rgba(${140 + shade}, ${118 + shade * 0.8}, ${78 + shade * 0.6}, ${Math.random() * 0.5 + 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // soft ripple bands
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(90,70,40,${Math.random() * 0.08 + 0.02})`;
    ctx.lineWidth = Math.random() * 6 + 2;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + randRange(-30, 30), size * 0.7, y + randRange(-30, 30), size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRock(radius) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const jitter = 1 + (Math.random() - 0.5) * 0.45;
    pos.setXYZ(i, pos.getX(i) * jitter, pos.getY(i) * jitter, pos.getZ(i) * jitter);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5b5248, roughness: 0.95, metalness: 0.02 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildSeaweedBlade(height) {
  const segs = 7;
  const positions = [];
  const uvs = [];
  const indices = [];
  const baseWidth = height * 0.09;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = baseWidth * (1 - t * 0.8);
    positions.push(-w, t * height, 0, w, t * height, 0);
    uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.segs = segs;
  geo.userData.height = height;
  return geo;
}

export class World {
  constructor(scene, { boundaryRadius = 46 } = {}) {
    this.scene = scene;
    this.boundaryRadius = boundaryRadius;
    this.floorY = -boundaryRadius * 0.92;
    this.time = 0;

    this._setupLightingAndFog();
    this._buildFloor();
    this._buildRocks();
    this._buildSeaweed();
    this._buildBubbles();
  }

  _setupLightingAndFog() {
    const fogColor = new THREE.Color(0x0a3f52);
    this.scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.016);
    this.scene.background = fogColor;

    const hemi = new THREE.HemisphereLight(0x8fd8e8, 0x30261a, 1.1);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xdff6ff, 1.6);
    sun.position.set(this.boundaryRadius * 0.4, this.boundaryRadius * 0.9, this.boundaryRadius * 0.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    const shadowExtent = this.boundaryRadius * 1.1;
    sun.shadow.camera.left = -shadowExtent;
    sun.shadow.camera.right = shadowExtent;
    sun.shadow.camera.top = shadowExtent;
    sun.shadow.camera.bottom = -shadowExtent;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = this.boundaryRadius * 3;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);
    this.scene.add(sun.target);

    const fill = new THREE.AmbientLight(0x224a5c, 0.55);
    this.scene.add(fill);
  }

  _buildFloor() {
    const size = this.boundaryRadius * 3.2;
    const geo = new THREE.PlaneGeometry(size, size, 80, 80);
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const duneHeight =
        Math.sin(x * 0.05 + 1.3) * 1.4 +
        Math.cos(y * 0.045 - 0.7) * 1.1 +
        Math.sin((x + y) * 0.09) * 0.6;
      pos.setZ(i, duneHeight);
    }
    geo.computeVertexNormals();

    const texture = makeSandTexture();
    texture.repeat.set(size / 18, size / 18);
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = this.floorY;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floorMesh = floor;
  }

  _buildRocks() {
    const group = new THREE.Group();
    const count = 26;
    for (let i = 0; i < count; i++) {
      const r = randRange(0.8, 3.2);
      const rock = buildRock(r);
      const dist = randRange(this.boundaryRadius * 0.15, this.boundaryRadius * 1.1);
      const angle = Math.random() * Math.PI * 2;
      rock.position.set(Math.cos(angle) * dist, this.floorY + r * 0.25, Math.sin(angle) * dist);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.scale.setScalar(randRange(0.8, 1.3));
      group.add(rock);
    }
    this.scene.add(group);
  }

  _buildSeaweed() {
    this.seaweedBlades = [];
    const clusterCount = 22;
    const material = new THREE.MeshStandardMaterial({
      color: 0x1f7a4a,
      roughness: 0.6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });

    for (let c = 0; c < clusterCount; c++) {
      const dist = randRange(this.boundaryRadius * 0.2, this.boundaryRadius * 1.05);
      const angle = Math.random() * Math.PI * 2;
      const cx = Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist;
      const bladesInCluster = 4 + Math.floor(Math.random() * 4);
      for (let b = 0; b < bladesInCluster; b++) {
        const height = randRange(2.5, 5.5);
        const geo = buildSeaweedBlade(height);
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(cx + randRange(-0.6, 0.6), this.floorY, cz + randRange(-0.6, 0.6));
        mesh.rotation.y = Math.random() * Math.PI * 2;
        mesh.userData.phase = Math.random() * Math.PI * 2;
        mesh.userData.speed = randRange(0.5, 0.9);
        mesh.userData.baseX = geo.getAttribute("position").array.slice();
        mesh.castShadow = false;
        this.scene.add(mesh);
        this.seaweedBlades.push(mesh);
      }
    }
  }

  _buildBubbles() {
    const count = 160;
    const geo = new THREE.SphereGeometry(1, 6, 6);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xdfffff,
      transparent: true,
      opacity: 0.35,
      roughness: 0.05,
      metalness: 0,
    });
    this.bubbles = new THREE.InstancedMesh(geo, mat, count);
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._bubbleData = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const dist = randRange(0, this.boundaryRadius * 1.1);
      const angle = Math.random() * Math.PI * 2;
      const data = {
        baseX: Math.cos(angle) * dist,
        baseZ: Math.sin(angle) * dist,
        y: randRange(this.floorY, this.floorY + this.boundaryRadius * 2),
        speed: randRange(1.2, 3.0),
        scale: randRange(0.04, 0.16),
        phase: Math.random() * Math.PI * 2,
      };
      this._bubbleData.push(data);
      dummy.position.set(data.baseX, data.y, data.baseZ);
      dummy.scale.setScalar(data.scale);
      dummy.updateMatrix();
      this.bubbles.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(this.bubbles);
  }

  update(dt) {
    this.time += dt;

    for (const mesh of this.seaweedBlades) {
      const posAttr = mesh.geometry.getAttribute("position");
      const base = mesh.userData.baseX;
      const segs = mesh.geometry.userData.segs;
      const height = mesh.geometry.userData.height;
      const t = this.time * mesh.userData.speed + mesh.userData.phase;
      for (let i = 0; i <= segs; i++) {
        const frac = i / segs;
        const sway = Math.sin(t + frac * 2.4) * frac * frac * height * 0.22;
        posAttr.setX(i * 2, base[i * 2 * 3] + sway);
        posAttr.setX(i * 2 + 1, base[(i * 2 + 1) * 3] + sway);
      }
      posAttr.needsUpdate = true;
    }

    const dummy = new THREE.Object3D();
    const topY = this.floorY + this.boundaryRadius * 2;
    for (let i = 0; i < this._bubbleData.length; i++) {
      const data = this._bubbleData[i];
      data.y += data.speed * dt;
      if (data.y > topY) data.y = this.floorY;
      const drift = Math.sin(this.time * 0.6 + data.phase) * 0.6;
      dummy.position.set(data.baseX + drift, data.y, data.baseZ + Math.cos(this.time * 0.5 + data.phase) * 0.6);
      dummy.scale.setScalar(data.scale);
      dummy.updateMatrix();
      this.bubbles.setMatrixAt(i, dummy.matrix);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }
}
