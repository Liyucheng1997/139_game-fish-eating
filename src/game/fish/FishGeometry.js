import * as THREE from "three";
import { sampleKeyframes } from "../utils.js";

// Bone positions along the spine, expressed as fraction of body length,
// ordered tail -> head. Skin weights below are indexed against this array,
// and FishRig.js must build its skeleton bones in this same order.
export const BONE_NAMES = ["tail", "tailBase", "mid", "neck", "head"];
export const BONE_S_POSITIONS = [0.04, 0.27, 0.5, 0.73, 0.95];

// Body cross-section radii as a fraction of total length, sampled along the
// spine (s=0 tail tip, s=1 nose tip). Fish are laterally compressed, so the
// vertical (height) radius is consistently larger than the horizontal (width) one.
const WIDTH_KEYS = [
  [0.0, 0.006],
  [0.05, 0.02],
  [0.18, 0.05],
  [0.38, 0.076],
  [0.54, 0.08],
  [0.7, 0.062],
  [0.86, 0.032],
  [0.95, 0.014],
  [1.0, 0.004],
];

const HEIGHT_KEYS = [
  [0.0, 0.009],
  [0.05, 0.032],
  [0.18, 0.088],
  [0.38, 0.128],
  [0.54, 0.138],
  [0.7, 0.1],
  [0.86, 0.048],
  [0.95, 0.02],
  [1.0, 0.004],
];

export function bodyRadiusAt(s) {
  return {
    rx: sampleKeyframes(WIDTH_KEYS, s),
    ry: sampleKeyframes(HEIGHT_KEYS, s),
  };
}

function computeSkinWeight(s) {
  const arr = BONE_S_POSITIONS;
  if (s <= arr[0]) return { i0: 0, i1: 0, w: 0 };
  if (s >= arr[arr.length - 1]) return { i0: arr.length - 1, i1: arr.length - 1, w: 0 };
  for (let i = 0; i < arr.length - 1; i++) {
    if (s >= arr[i] && s <= arr[i + 1]) {
      const w = (s - arr[i]) / (arr[i + 1] - arr[i]);
      return { i0: i, i1: i + 1, w };
    }
  }
  return { i0: arr.length - 1, i1: arr.length - 1, w: 0 };
}

/**
 * Builds a unit-length (nose to tail = 1.0), skinned, countershaded fish body.
 * Local axes: +Z = forward/head, +Y = up, +X = right.
 */
export function buildFishBodyGeometry({ segmentsAlong = 26, radialSegments = 12 } = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  const backColor = new THREE.Color(0x2b3a42);
  const bellyColor = new THREE.Color(0xf3ead2);

  for (let ring = 0; ring <= segmentsAlong; ring++) {
    const s = ring / segmentsAlong;
    const z = THREE.MathUtils.lerp(-0.5, 0.5, s);
    const rx = sampleKeyframes(WIDTH_KEYS, s);
    const ry = sampleKeyframes(HEIGHT_KEYS, s);
    const { i0, i1, w } = computeSkinWeight(s);

    for (let j = 0; j < radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      let cx = Math.cos(angle);
      let cy = Math.sin(angle);
      // Flatten the back slightly and round the belly a touch more (teardrop cross-section).
      const asym = cy >= 0 ? 0.88 : 1.08;
      const x = cx * rx * asym;
      const y = cy * ry * asym;

      positions.push(x, y, z);
      normals.push(0, 0, 0); // filled in later via computeVertexNormals
      uvs.push(j / radialSegments, s);

      const shade = THREE.MathUtils.clamp(cy * 0.5 + 0.5, 0, 1);
      const col = bellyColor.clone().lerp(backColor, shade);
      colors.push(col.r, col.g, col.b);

      skinIndices.push(i0, i1, 0, 0);
      skinWeights.push(1 - w, w, 0, 0);
    }
  }

  const verticesPerRing = radialSegments;
  for (let ring = 0; ring < segmentsAlong; ring++) {
    for (let j = 0; j < radialSegments; j++) {
      const jNext = (j + 1) % radialSegments;
      const a = ring * verticesPerRing + j;
      const b = ring * verticesPerRing + jNext;
      const c = (ring + 1) * verticesPerRing + j;
      const d = (ring + 1) * verticesPerRing + jNext;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}
