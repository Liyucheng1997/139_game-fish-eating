import * as THREE from "three";

// Builds a flat, slightly translucent membrane mesh from a 2D contour.
// `mapTo3D(u, v)` places each contour point (u,v) into the fin's local 3D
// space; v=0 is treated as the root (attached, opaque) edge and higher v
// fades toward the tip (translucent), matching how real fin membranes look.
function buildFinGeometry(contour, mapTo3D, { color, tipAlpha = 0.5, maxV = 1 }) {
  const pts2D = contour.map(([u, v]) => new THREE.Vector2(u, v));
  const faces = THREE.ShapeUtils.triangulateShape(pts2D, []);

  const positions = [];
  const colors = [];
  const uvs = [];
  const baseColor = new THREE.Color(color);

  for (const [u, v] of contour) {
    const p = mapTo3D(u, v);
    positions.push(p.x, p.y, p.z);
    const alpha = THREE.MathUtils.lerp(1, tipAlpha, THREE.MathUtils.clamp(v / maxV, 0, 1));
    colors.push(baseColor.r, baseColor.g, baseColor.b, alpha);
    uvs.push((u + 1) * 0.5, v / maxV);
  }

  const indices = [];
  for (const [a, b, c] of faces) indices.push(a, b, c);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function finMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    roughness: 0.35,
    metalness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export function createCaudalFin(color, length = 1) {
  const span = 0.16 * length;
  const ext = 0.2 * length;
  const contour = [
    [-1.0, 0.0],
    [-1.0, 0.08],
    [-0.88, 0.62],
    [-0.32, 1.0],
    [0.0, 0.46],
    [0.32, 1.0],
    [0.88, 0.62],
    [1.0, 0.08],
    [1.0, 0.0],
  ];
  const geometry = buildFinGeometry(
    contour,
    (u, v) => new THREE.Vector3(0, u * span, -v * ext),
    { color, tipAlpha: 0.45, maxV: 1 }
  );
  return new THREE.Mesh(geometry, finMaterial());
}

export function createDorsalFin(color, length = 1) {
  const finLength = 0.3 * length;
  const finHeight = 0.14 * length;
  const contour = [
    [-1, 0],
    [-0.55, 0.55],
    [0.0, 0.85],
    [0.6, 0.5],
    [1, 0],
  ];
  const geometry = buildFinGeometry(
    contour,
    (u, v) => new THREE.Vector3(0, v * finHeight, (u * finLength) / 2),
    { color, tipAlpha: 0.4, maxV: 1 }
  );
  return new THREE.Mesh(geometry, finMaterial());
}

export function createAnalFin(color, length = 1) {
  const finLength = 0.16 * length;
  const finHeight = 0.08 * length;
  const contour = [
    [-1, 0],
    [-0.4, 0.6],
    [0.5, 0.7],
    [1, 0],
  ];
  const geometry = buildFinGeometry(
    contour,
    (u, v) => new THREE.Vector3(0, -v * finHeight, (u * finLength) / 2),
    { color, tipAlpha: 0.4, maxV: 1 }
  );
  return new THREE.Mesh(geometry, finMaterial());
}

// Returns a right-side pectoral fin mesh; mirror on X for the left side.
export function createPectoralFin(color, length = 1) {
  const finLength = 0.22 * length;
  const finWidth = 0.1 * length;
  const sweep = THREE.MathUtils.degToRad(30);
  const contour = [
    [0, -1],
    [0, 1],
    [0.6, 1.15],
    [1.0, 0.25],
    [0.7, -1.1],
  ];
  const geometry = buildFinGeometry(
    contour,
    (u, v) =>
      new THREE.Vector3(
        u * Math.cos(sweep) * finLength,
        v * finWidth * 0.5,
        -u * Math.sin(sweep) * finLength
      ),
    { color, tipAlpha: 0.4, maxV: 1 }
  );
  return new THREE.Mesh(geometry, finMaterial());
}

export function createEyes(radius = 1) {
  const group = new THREE.Group();
  const scleraGeo = new THREE.SphereGeometry(radius, 10, 8);
  const pupilGeo = new THREE.SphereGeometry(radius * 0.55, 8, 6);
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f0, roughness: 0.25, metalness: 0.05 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.15, metalness: 0.3 });

  for (const side of [-1, 1]) {
    const sclera = new THREE.Mesh(scleraGeo, scleraMat);
    sclera.position.set(side * radius * 0.9, 0, 0);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(side * radius * 0.35, 0, 0);
    sclera.add(pupil);
    sclera.castShadow = false;
    group.add(sclera);
  }
  return group;
}
