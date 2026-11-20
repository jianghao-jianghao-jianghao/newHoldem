import * as THREE from 'three';
import type { Card } from '../shared/types';
import type { ChipDenom, ProceduralTexturePack } from './proceduralTextures';

export const TABLE_RX = 4.35;
export const TABLE_RZ = 2.42;
export const CHIP_RADIUS = 0.122;
export const CHIP_HEIGHT = 0.027;
export const CARD_WIDTH = 0.43;
export const CARD_HEIGHT = 0.018;
export const CARD_DEPTH = 0.60;

export interface ChipColumnItem {
  denom: ChipDenom;
  columnIndex: number;
  levelIndex: number;
}

const DENOMS_DESC: ChipDenom[] = [1000, 500, 100, 25, 5];

/**
 * Breaks a chip amount down into balanced, realistic multi-column casino chip barrels.
 * Small-to-mid stacks expand into tactile mixed denominations rather than 1-2 lonely chips,
 * while massive pots scale smoothly into full multi-barrel casino towers.
 */
export function breakdownChipsForStack(
  amount: number,
  maxColumns: number = 4,
  maxPerColumn: number = 10
): ChipDenom[][] {
  if (amount <= 0 || maxColumns <= 0 || maxPerColumn <= 0) return [];

  const capacity = maxColumns * maxPerColumn;
  const counts: Record<ChipDenom, number> = {
    1000: 0,
    500: 0,
    100: 0,
    25: 0,
    5: 0,
  };

  let remaining = Math.floor(amount);
  for (const d of DENOMS_DESC) {
    if (remaining >= d) {
      const q = Math.floor(remaining / d);
      counts[d] = q;
      remaining -= q * d;
    }
  }

  let totalChips =
    counts[1000] + counts[500] + counts[100] + counts[25] + counts[5];

  if (totalChips === 0) {
    return [[5]];
  }

  // Enrich sparse stacks (e.g. 2000 -> 2x1000) into realistic multi-denomination casino barrels
  const desiredChips = Math.min(
    capacity,
    Math.max(1, Math.round(3 + Math.log2(Math.max(5, amount / 5)) * 2.15))
  );

  while (totalChips < desiredChips) {
    let splitApplied = false;

    if (
      (counts[1000] > 1 || (counts[1000] === 1 && amount < 2400)) &&
      totalChips + 1 <= capacity
    ) {
      counts[1000] -= 1;
      counts[500] += 2;
      totalChips += 1;
      splitApplied = true;
    } else if (
      counts[500] > 0 &&
      (counts[500] > 1 || counts[100] < 4) &&
      totalChips + 4 <= capacity
    ) {
      counts[500] -= 1;
      counts[100] += 5;
      totalChips += 4;
      splitApplied = true;
    } else if (
      counts[100] > 0 &&
      (counts[100] > 2 || counts[25] < 6) &&
      totalChips + 3 <= capacity
    ) {
      counts[100] -= 1;
      counts[25] += 4;
      totalChips += 3;
      splitApplied = true;
    } else if (
      counts[25] > 0 &&
      counts[5] < 10 &&
      totalChips + 4 <= capacity
    ) {
      counts[25] -= 1;
      counts[5] += 5;
      totalChips += 4;
      splitApplied = true;
    }

    if (!splitApplied) break;
  }

  // If ultra-large pot exceeds capacity, scale counts proportionally down to capacity
  if (totalChips > capacity) {
    const scale = capacity / totalChips;
    const scaled: Record<ChipDenom, number> = {
      1000: 0,
      500: 0,
      100: 0,
      25: 0,
      5: 0,
    };
    let used = 0;
    for (const d of DENOMS_DESC) {
      if (counts[d] > 0 && used < capacity) {
        const keep = Math.min(
          capacity - used,
          Math.max(1, Math.floor(counts[d] * scale))
        );
        scaled[d] = keep;
        used += keep;
      }
    }
    while (used < capacity) {
      scaled[1000] += 1;
      used += 1;
    }
    Object.assign(counts, scaled);
  }

  // Build ordered barrels (low-to-high denom or distinct denom columns first)
  const columns: ChipDenom[][] = [];
  const denomsAsc: ChipDenom[] = [5, 25, 100, 500, 1000];
  for (const d of denomsAsc) {
    let left = counts[d];
    while (left > 0) {
      const take = Math.min(left, maxPerColumn);
      columns.push(Array.from({ length: take }, () => d));
      left -= take;
    }
  }

  // Merge excess columns neatly so total columns never exceed maxColumns
  while (columns.length > maxColumns) {
    // Pick the two shortest columns that fit together in <= maxPerColumn
    let bestA = -1;
    let bestB = -1;
    let bestSum = Infinity;
    for (let i = 0; i < columns.length; i++) {
      for (let j = i + 1; j < columns.length; j++) {
        const sum = columns[i].length + columns[j].length;
        if (sum <= maxPerColumn && sum < bestSum) {
          bestSum = sum;
          bestA = i;
          bestB = j;
        }
      }
    }
    if (bestA !== -1 && bestB !== -1) {
      // Place higher denominations at the bottom of the merged barrel for visual stability
      const merged = [...columns[bestA], ...columns[bestB]].sort((a, b) => b - a);
      columns[bestA] = merged;
      columns.splice(bestB, 1);
    } else {
      // Rebalance across maxColumns barrels
      const flat = columns.flat().sort((a, b) => b - a);
      columns.length = 0;
      for (let i = 0; i < flat.length && columns.length < maxColumns; i += maxPerColumn) {
        columns.push(flat.slice(i, i + maxPerColumn));
      }
      break;
    }
  }

  // Keep barrels centered visually: taller/richer barrels toward middle/back
  return columns;
}

function createEllipseShape(rx: number, rz: number, segments = 64): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * rz;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

function createEllipseRingShape(
  outerRx: number,
  outerRz: number,
  innerRx: number,
  innerRz: number,
  segments = 64
): THREE.Shape {
  const outer = createEllipseShape(outerRx, outerRz, segments);
  const hole = new THREE.Path();
  for (let i = 0; i <= segments; i++) {
    const a = -(i / segments) * Math.PI * 2;
    const x = Math.cos(a) * innerRx;
    const y = Math.sin(a) * innerRz;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  outer.holes.push(hole);
  return outer;
}

function normalizeShapeUVs(
  geo: THREE.BufferGeometry,
  rx: number,
  rz: number
): void {
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uvs[i * 2] = (x + rx) / (2 * rx);
    uvs[i * 2 + 1] = (y + rz) / (2 * rz);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function createRoundedRectShape(
  width: number,
  depth: number,
  radius: number
): THREE.Shape {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hw * 0.45, hd * 0.45);
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}

/**
 * Builds a beveled casino clay chip BufferGeometry using LatheGeometry
 * with 2 clean material groups: group 0 = outer knurled wall, group 1 = top/bottom beveled inlay faces.
 */
function createBeveledChipGeometry(): THREE.BufferGeometry {
  const r = CHIP_RADIUS;
  const hh = CHIP_HEIGHT / 2;
  const profile = [
    new THREE.Vector2(0, -hh),
    new THREE.Vector2(r * 0.62, -hh),
    new THREE.Vector2(r * 0.65, -hh + 0.0011),
    new THREE.Vector2(r * 0.92, -hh),
    new THREE.Vector2(r, -hh + 0.0036),
    new THREE.Vector2(r, hh - 0.0036),
    new THREE.Vector2(r * 0.92, hh),
    new THREE.Vector2(r * 0.65, hh - 0.0011),
    new THREE.Vector2(r * 0.62, hh),
    new THREE.Vector2(0, hh),
  ];

  const lathe = new THREE.LatheGeometry(profile, 36);
  const raw = lathe.toNonIndexed();
  lathe.dispose();
  raw.computeVertexNormals();

  const pos = raw.attributes.position;
  const norm = raw.attributes.normal;

  const sidePos: number[] = [];
  const sideNorm: number[] = [];
  const sideUv: number[] = [];

  const capPos: number[] = [];
  const capNorm: number[] = [];
  const capUv: number[] = [];

  for (let i = 0; i < pos.count; i += 3) {
    const y0 = pos.getY(i);
    const y1 = pos.getY(i + 1);
    const y2 = pos.getY(i + 2);

    const r0 = Math.hypot(pos.getX(i), pos.getZ(i));
    const r1 = Math.hypot(pos.getX(i + 1), pos.getZ(i + 1));
    const r2 = Math.hypot(pos.getX(i + 2), pos.getZ(i + 2));

    const spanY = Math.max(y0, y1, y2) - Math.min(y0, y1, y2);
    const avgR = (r0 + r1 + r2) / 3;
    const isSideWall = spanY > 0.005 && avgR > r * 0.955;

    if (isSideWall) {
      const angles: number[] = [];
      for (let k = 0; k < 3; k++) {
        const vx = pos.getX(i + k);
        const vz = pos.getZ(i + k);
        angles.push(Math.atan2(vx, vz));
      }
      // Unwrap seam triangles across -PI/+PI
      for (let k = 1; k < 3; k++) {
        if (angles[k] - angles[0] > Math.PI) angles[k] -= Math.PI * 2;
        else if (angles[k] - angles[0] < -Math.PI) angles[k] += Math.PI * 2;
      }

      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        sidePos.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
        sideNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
        sideUv.push(angles[k] / (Math.PI * 2) + 0.5, (pos.getY(idx) + hh) / CHIP_HEIGHT);
      }
    } else {
      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        const vx = pos.getX(idx);
        const vz = pos.getZ(idx);
        capPos.push(vx, pos.getY(idx), vz);
        capNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
        capUv.push(vx / (2 * r) + 0.5, -vz / (2 * r) + 0.5);
      }
    }
  }

  raw.dispose();

  const geo = new THREE.BufferGeometry();
  const totalPos = new Float32Array(sidePos.length + capPos.length);
  totalPos.set(sidePos, 0);
  totalPos.set(capPos, sidePos.length);

  const totalNorm = new Float32Array(sideNorm.length + capNorm.length);
  totalNorm.set(sideNorm, 0);
  totalNorm.set(capNorm, sideNorm.length);

  const totalUv = new Float32Array(sideUv.length + capUv.length);
  totalUv.set(sideUv, 0);
  totalUv.set(capUv, sideUv.length);

  geo.setAttribute('position', new THREE.BufferAttribute(totalPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(totalNorm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(totalUv, 2));

  const totalVerts = sidePos.length / 3 + capPos.length / 3;
  const seqIdx = new Uint16Array(totalVerts);
  for (let i = 0; i < totalVerts; i++) seqIdx[i] = i;
  geo.setIndex(new THREE.BufferAttribute(seqIdx, 1));

  const sideVertCount = sidePos.length / 3;
  const capVertCount = capPos.length / 3;
  geo.clearGroups();
  geo.addGroup(0, sideVertCount, 0);
  geo.addGroup(sideVertCount, capVertCount, 1);
  geo.computeTangents();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds a rounded-corner extruded playing card BufferGeometry lying flat in XZ
 * with 3 clean material groups: group 0 = cardstock edge/bevel, group 1 = +Y face, group 2 = -Y back.
 */
function createRoundedCardGeometry(): THREE.BufferGeometry {
  const bevel = 0.0018;
  const innerDepth = CARD_HEIGHT - bevel * 2;
  const shape = createRoundedRectShape(
    CARD_WIDTH - bevel * 2,
    CARD_DEPTH - bevel * 2,
    0.028
  );

  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: innerDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  extruded.translate(0, 0, -innerDepth / 2);
  extruded.rotateX(-Math.PI / 2);

  const raw = extruded.index ? extruded.toNonIndexed() : extruded;
  if (raw !== extruded) extruded.dispose();
  raw.computeVertexNormals();

  const pos = raw.attributes.position;
  const norm = raw.attributes.normal;

  const edgePos: number[] = [];
  const edgeNorm: number[] = [];
  const edgeUv: number[] = [];

  const frontPos: number[] = [];
  const frontNorm: number[] = [];
  const frontUv: number[] = [];

  const backPos: number[] = [];
  const backNorm: number[] = [];
  const backUv: number[] = [];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const faceN = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    vA.fromBufferAttribute(pos, i);
    vB.fromBufferAttribute(pos, i + 1);
    vC.fromBufferAttribute(pos, i + 2);
    ab.subVectors(vB, vA);
    ac.subVectors(vC, vA);
    faceN.crossVectors(ab, ac).normalize();

    if (faceN.y > 0.85) {
      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        const vx = pos.getX(idx);
        const vz = pos.getZ(idx);
        frontPos.push(vx, pos.getY(idx), vz);
        frontNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
        frontUv.push(vx / CARD_WIDTH + 0.5, 0.5 - vz / CARD_DEPTH);
      }
    } else if (faceN.y < -0.85) {
      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        const vx = pos.getX(idx);
        const vz = pos.getZ(idx);
        backPos.push(vx, pos.getY(idx), vz);
        backNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
        backUv.push(0.5 - vx / CARD_WIDTH, 0.5 - vz / CARD_DEPTH);
      }
    } else {
      const angles: number[] = [];
      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        angles.push(Math.atan2(pos.getZ(idx), pos.getX(idx)));
      }
      for (let k = 1; k < 3; k++) {
        if (angles[k] - angles[0] > Math.PI) angles[k] -= Math.PI * 2;
        else if (angles[k] - angles[0] < -Math.PI) angles[k] += Math.PI * 2;
      }
      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        edgePos.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
        edgeNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
        edgeUv.push(
          (angles[k] / (Math.PI * 2) + 0.5) * 4,
          (pos.getY(idx) + CARD_HEIGHT / 2) / CARD_HEIGHT
        );
      }
    }
  }

  raw.dispose();

  const geo = new THREE.BufferGeometry();
  const totalPos = new Float32Array(edgePos.length + frontPos.length + backPos.length);
  totalPos.set(edgePos, 0);
  totalPos.set(frontPos, edgePos.length);
  totalPos.set(backPos, edgePos.length + frontPos.length);

  const totalNorm = new Float32Array(edgeNorm.length + frontNorm.length + backNorm.length);
  totalNorm.set(edgeNorm, 0);
  totalNorm.set(frontNorm, edgeNorm.length);
  totalNorm.set(backNorm, edgeNorm.length + frontNorm.length);

  const totalUv = new Float32Array(edgeUv.length + frontUv.length + backUv.length);
  totalUv.set(edgeUv, 0);
  totalUv.set(frontUv, edgeUv.length);
  totalUv.set(backUv, edgeUv.length + frontUv.length);

  geo.setAttribute('position', new THREE.BufferAttribute(totalPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(totalNorm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(totalUv, 2));

  const totalVerts = totalPos.length / 3;
  const seqIdx = new Uint16Array(totalVerts);
  for (let i = 0; i < totalVerts; i++) seqIdx[i] = i;
  geo.setIndex(new THREE.BufferAttribute(seqIdx, 1));

  const edgeCount = edgePos.length / 3;
  const frontCount = frontPos.length / 3;
  const backCount = backPos.length / 3;

  geo.clearGroups();
  geo.addGroup(0, edgeCount, 0);
  geo.addGroup(edgeCount, frontCount, 1);
  geo.addGroup(edgeCount + frontCount, backCount, 2);
  geo.computeTangents();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export interface PokerModelsDisposable {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Composite 7-part luxury casino poker table grounded on pedestal base.
 * Felt playing surface sits flush at y = 0.
 */
export function buildPokerTableGroup(
  textures: ProceduralTexturePack
): PokerModelsDisposable {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // 1. Baize Felt Playing Surface (y = 0)
  const feltShape = createEllipseShape(TABLE_RX, TABLE_RZ, 72);
  const feltGeo = new THREE.ShapeGeometry(feltShape, 48);
  normalizeShapeUVs(feltGeo, TABLE_RX, TABLE_RZ);
  feltGeo.rotateX(-Math.PI / 2);
  geometries.push(feltGeo);

  const feltMat = new THREE.MeshStandardMaterial({
    map: textures.feltColor,
    bumpMap: textures.feltBump,
    bumpScale: 0.008,
    roughness: 0.92,
    metalness: 0.02,
  });
  materials.push(feltMat);

  const feltMesh = new THREE.Mesh(feltGeo, feltMat);
  feltMesh.position.y = 0;
  feltMesh.receiveShadow = true;
  group.add(feltMesh);

  // 2. Walnut Racetrack Inner Bezel
  const raceShape = createEllipseRingShape(
    TABLE_RX + 0.16,
    TABLE_RZ + 0.16,
    TABLE_RX - 0.02,
    TABLE_RZ - 0.02,
    72
  );
  const raceGeo = new THREE.ExtrudeGeometry(raceShape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 48,
  });
  normalizeShapeUVs(raceGeo, TABLE_RX + 0.16, TABLE_RZ + 0.16);
  raceGeo.rotateX(-Math.PI / 2);
  geometries.push(raceGeo);

  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodColor,
    bumpMap: textures.woodBump,
    bumpScale: 0.01,
    roughness: 0.36,
    metalness: 0.08,
  });
  materials.push(woodMat);

  const raceMesh = new THREE.Mesh(raceGeo, woodMat);
  raceMesh.position.y = -0.025;
  raceMesh.castShadow = true;
  raceMesh.receiveShadow = true;
  group.add(raceMesh);

  // 3. Padded Espresso Leather Armrest Rail
  const railShape = createEllipseRingShape(
    TABLE_RX + 0.44,
    TABLE_RZ + 0.44,
    TABLE_RX + 0.14,
    TABLE_RZ + 0.14,
    72
  );
  const railGeo = new THREE.ExtrudeGeometry(railShape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.038,
    bevelSize: 0.036,
    bevelSegments: 4,
    curveSegments: 52,
  });
  normalizeShapeUVs(railGeo, TABLE_RX + 0.44, TABLE_RZ + 0.44);
  railGeo.rotateX(-Math.PI / 2);
  geometries.push(railGeo);

  const leatherMat = new THREE.MeshStandardMaterial({
    map: textures.leatherColor,
    roughness: 0.56,
    metalness: 0.05,
  });
  materials.push(leatherMat);

  const railMesh = new THREE.Mesh(railGeo, leatherMat);
  railMesh.position.y = -0.015;
  railMesh.castShadow = true;
  railMesh.receiveShadow = true;
  group.add(railMesh);

  // 4. Under-table Mahogany Apron Skirt (top sits strictly at y = -0.02 below felt)
  const apronShape = createEllipseShape(TABLE_RX + 0.36, TABLE_RZ + 0.36, 64);
  const apronGeo = new THREE.ExtrudeGeometry(apronShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 42,
  });
  apronGeo.rotateX(-Math.PI / 2);
  geometries.push(apronGeo);

  const apronMesh = new THREE.Mesh(apronGeo, woodMat);
  apronMesh.position.y = -0.22;
  apronMesh.castShadow = true;
  apronMesh.receiveShadow = true;
  group.add(apronMesh);

  // 5. Brushed Brass Trim Collars
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a853,
    roughness: 0.24,
    metalness: 0.9,
  });
  materials.push(brassMat);

  const cupGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.015, 24);
  geometries.push(cupGeo);

  const cupAngles = [0.16, 0.38, 0.62, 0.84, 1.16, 1.38, 1.62, 1.84];
  for (const frac of cupAngles) {
    const a = frac * Math.PI;
    const cx = Math.cos(a) * (TABLE_RX + 0.07);
    const cz = Math.sin(a) * (TABLE_RZ + 0.07);
    const cup = new THREE.Mesh(cupGeo, brassMat);
    cup.position.set(cx, 0.033, cz);
    cup.receiveShadow = true;
    group.add(cup);
  }

  // 6. Sculpted Pedestal Column
  const pedPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(1.32, 0.0),
    new THREE.Vector2(1.28, 0.09),
    new THREE.Vector2(0.56, 0.28),
    new THREE.Vector2(0.48, 0.92),
    new THREE.Vector2(0.86, 1.05),
    new THREE.Vector2(0.0, 1.05),
  ];
  const pedGeo = new THREE.LatheGeometry(pedPoints, 32);
  geometries.push(pedGeo);

  const pedMesh = new THREE.Mesh(pedGeo, woodMat);
  pedMesh.position.y = -1.24;
  pedMesh.castShadow = true;
  pedMesh.receiveShadow = true;
  group.add(pedMesh);

  const footRingGeo = new THREE.TorusGeometry(1.28, 0.028, 12, 48);
  footRingGeo.rotateX(Math.PI / 2);
  geometries.push(footRingGeo);
  const footRing = new THREE.Mesh(footRingGeo, brassMat);
  footRing.position.y = -1.16;
  group.add(footRing);

  // 7. Ground Floor Studio Plane & Contact Shadow
  const floorGeo = new THREE.CircleGeometry(18, 48);
  floorGeo.rotateX(-Math.PI / 2);
  geometries.push(floorGeo);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x07090a,
    roughness: 0.95,
    metalness: 0.05,
  });
  materials.push(floorMat);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -1.25;
  floor.receiveShadow = true;
  group.add(floor);

  const shadowGeo = new THREE.PlaneGeometry(11.4, 7.2);
  shadowGeo.rotateX(-Math.PI / 2);
  geometries.push(shadowGeo);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  materials.push(shadowMat);
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = -1.242;
  group.add(shadowPlane);

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

/**
 * Composite 5-part procedural Casino Dealer Shoe seated on the felt.
 */
export function buildDealerShoeGroup(
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean
): PokerModelsDisposable {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const shadowGeo = new THREE.PlaneGeometry(0.95, 0.72);
  shadowGeo.rotateX(-Math.PI / 2);
  geometries.push(shadowGeo);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  materials.push(shadowMat);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.002;
  group.add(shadow);

  const baseGeo = new THREE.BoxGeometry(0.68, 0.025, 0.44);
  geometries.push(baseGeo);
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc99c47,
    roughness: 0.25,
    metalness: 0.9,
  });
  materials.push(brassMat);
  const base = new THREE.Mesh(baseGeo, brassMat);
  base.position.y = 0.0125;
  base.castShadow = true;
  group.add(base);

  const chuteShape = new THREE.Shape();
  chuteShape.moveTo(-0.3, 0);
  chuteShape.lineTo(0.28, 0);
  chuteShape.lineTo(0.32, 0.09);
  chuteShape.lineTo(-0.18, 0.27);
  chuteShape.lineTo(-0.3, 0.27);
  chuteShape.closePath();

  const chuteGeo = new THREE.ExtrudeGeometry(chuteShape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  chuteGeo.translate(0, 0, -0.18);
  geometries.push(chuteGeo);

  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodColor,
    roughness: 0.34,
    metalness: 0.1,
  });
  materials.push(woodMat);
  const chute = new THREE.Mesh(chuteGeo, woodMat);
  chute.position.y = 0.025;
  chute.castShadow = true;
  chute.receiveShadow = true;
  group.add(chute);

  const deckGeo = new THREE.BoxGeometry(0.42, 0.16, 0.31);
  geometries.push(deckGeo);
  const deckMat = new THREE.MeshStandardMaterial({
    map: textures.cardBack,
    roughness: 0.45,
    metalness: 0.02,
  });
  materials.push(deckMat);
  const deckBlock = new THREE.Mesh(deckGeo, deckMat);
  deckBlock.position.set(0.03, 0.125, 0);
  deckBlock.rotation.z = -0.32;
  deckBlock.castShadow = true;
  group.add(deckBlock);

  const lidGeo = new THREE.BoxGeometry(0.46, 0.016, 0.37);
  geometries.push(lidGeo);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e2a25,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: isSoftwareGl ? 0.42 : 0.72,
    clearcoat: isSoftwareGl ? 0 : 1.0,
  });
  materials.push(glassMat);
  const lid = new THREE.Mesh(lidGeo, glassMat);
  lid.position.set(-0.02, 0.22, 0);
  lid.rotation.z = -0.34;
  group.add(lid);

  const rollerGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.38, 16);
  rollerGeo.rotateX(Math.PI / 2);
  geometries.push(rollerGeo);
  const roller = new THREE.Mesh(rollerGeo, brassMat);
  roller.position.set(0.31, 0.055, 0);
  group.add(roller);

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export type TableMarkerVariant = 'dealer' | 'sb' | 'bb';

/**
 * Composite 3-part Casino Table Marker Puck for Dealer ("D 庄"), Small Blind ("SB 小盲"), and Big Blind ("BB 大盲").
 */
export function buildTableMarkerButtonGroup(
  variant: TableMarkerVariant = 'dealer',
  contactShadowTex?: THREE.CanvasTexture
): PokerModelsDisposable {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const palette =
    variant === 'sb'
      ? {
          bodyHex: 0x0a485e,
          rimHex: 0x89d6eb,
          bgCss: '#0A485E',
          ringCss: '#9EE2F5',
          mainText: 'SB',
          subText: '小盲',
          textCss: '#FFFFFF',
          subCss: '#D8F5FD',
          radius: 0.205,
        }
      : variant === 'bb'
        ? {
            bodyHex: 0x8b1712,
            rimHex: 0xebc163,
            bgCss: '#8B1712',
            ringCss: '#F4CE74',
            mainText: 'BB',
            subText: '大盲',
            textCss: '#FFFFFF',
            subCss: '#FDE8B2',
            radius: 0.205,
          }
        : {
            bodyHex: 0xefe7d5,
            rimHex: 0xd4a44a,
            bgCss: '#EFE7D5',
            ringCss: '#B88424',
            mainText: 'D',
            subText: '庄家',
            textCss: '#0B0D11',
            subCss: '#3E2D0E',
            radius: 0.205,
          };

  const r = palette.radius;

  // Grounding contact shadow disc beneath puck so it pops crisply off the dark felt
  if (contactShadowTex) {
    const shGeo = new THREE.PlaneGeometry(r * 2.75, r * 2.75);
    shGeo.rotateX(-Math.PI / 2);
    geometries.push(shGeo);
    const shMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    materials.push(shMat);
    const shMesh = new THREE.Mesh(shGeo, shMat);
    shMesh.position.set(-0.014, 0.002, -0.018);
    group.add(shMesh);
  }

  const bodyGeo = new THREE.CylinderGeometry(r, r * 1.03, 0.044, 40);
  geometries.push(bodyGeo);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: palette.bodyHex,
    roughness: 0.34,
    metalness: 0.08,
  });
  materials.push(bodyMat);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.022;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const rimGeo = new THREE.TorusGeometry(r - 0.003, 0.016, 12, 40);
  rimGeo.rotateX(Math.PI / 2);
  geometries.push(rimGeo);
  const rimMat = new THREE.MeshStandardMaterial({
    color: palette.rimHex,
    roughness: 0.22,
    metalness: 0.85,
  });
  materials.push(rimMat);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.y = 0.042;
  group.add(rim);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = palette.bgCss;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle radial sheen inside puck face
  const grad = ctx.createRadialGradient(112, 104, 12, 128, 128, 126);
  grad.addColorStop(0, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Outer notched casino ring
  ctx.strokeStyle = palette.ringCss;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = palette.ringCss;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.arc(128, 128, 94, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.fillStyle = palette.textCss;
  ctx.font = variant === 'dealer'
    ? '900 108px "Plus Jakarta Sans", sans-serif'
    : '900 88px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(palette.mainText, 128, 98);

  ctx.fillStyle = palette.subCss;
  ctx.font = '800 48px "Noto Sans SC", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(palette.subText, 128, 174);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const faceGeo = new THREE.CircleGeometry(r - 0.015, 40);
  faceGeo.rotateX(-Math.PI / 2);
  geometries.push(faceGeo);
  const faceMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: new THREE.Color(0xd6d2ca),
    roughness: 0.84,
    metalness: 0,
    envMapIntensity: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  materials.push(faceMat);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.y = 0.045;
  group.add(face);

  return {
    group,
    dispose: () => {
      tex.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

/**
 * Composite 3-part Dealer Button Puck ("D 庄").
 */
export function buildDealerButtonGroup(
  contactShadowTex?: THREE.CanvasTexture
): PokerModelsDisposable {
  return buildTableMarkerButtonGroup('dealer', contactShadowTex);
}

/**
 * Shared factory for beveled clay casino chips and linen-textured rounded playing cards.
 */
export interface SharedAssetFactory {
  chipGeometry: THREE.BufferGeometry;
  cardGeometry: THREE.BufferGeometry;
  impactRingGeometry: THREE.PlaneGeometry;
  chipMaterials: Record<ChipDenom, THREE.MeshPhysicalMaterial[]>;
  cardEdgeMaterial: THREE.MeshPhysicalMaterial;
  cardBackMaterial: THREE.MeshPhysicalMaterial;
  getCardMaterials: (card: Card | null) => THREE.Material[];
  createChipMesh: (denom: ChipDenom) => THREE.Mesh;
  createCardMesh: (card: Card | null) => THREE.Mesh;
  dispose: () => void;
}

export function createSharedAssetFactory(
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean = false
): SharedAssetFactory {
  const chipGeometry = createBeveledChipGeometry();
  const cardGeometry = createRoundedCardGeometry();

  const impactRingGeometry = new THREE.PlaneGeometry(0.46, 0.46);
  impactRingGeometry.rotateX(-Math.PI / 2);

  // Backface-culled twin drop-shadow planes give every 3D card deep tactile edge elevation
  const cardShadowUpGeo = new THREE.PlaneGeometry(CARD_WIDTH * 1.24, CARD_DEPTH * 1.2);
  cardShadowUpGeo.rotateX(-Math.PI / 2); // normal +Y (visible when card is face-up)
  const cardShadowDownGeo = new THREE.PlaneGeometry(CARD_WIDTH * 1.24, CARD_DEPTH * 1.2);
  cardShadowDownGeo.rotateX(Math.PI / 2); // normal -Y (visible when card is face-down, rotZ = PI)

  const cardShadowMaterial = new THREE.MeshBasicMaterial({
    map: textures.cardDropShadow,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const denoms: ChipDenom[] = [5, 25, 100, 500, 1000];
  const chipMaterials = {} as Record<ChipDenom, THREE.MeshPhysicalMaterial[]>;

  for (const d of denoms) {
    const tex = textures.chipTextures[d];
    const sideMat = new THREE.MeshPhysicalMaterial({
      map: tex.side,
      bumpMap: isSoftwareGl ? null : tex.sideBump,
      bumpScale: isSoftwareGl ? 0 : 0.0038,
      roughness: 0.54,
      metalness: 0.04,
      clearcoat: isSoftwareGl ? 0 : 0.14,
      clearcoatRoughness: 0.48,
    });
    const capMat = new THREE.MeshPhysicalMaterial({
      map: tex.top,
      bumpMap: isSoftwareGl ? null : tex.topBump,
      bumpScale: isSoftwareGl ? 0 : 0.0032,
      roughness: 0.5,
      metalness: 0.04,
      clearcoat: isSoftwareGl ? 0 : 0.24,
      clearcoatRoughness: 0.38,
    });
    chipMaterials[d] = [sideMat, capMat];
  }

  // Champagne-gilt beveled cardstock rim with anisotropic brushed highlights during movement/flip
  const cardEdgeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd9c291,
    metalness: 0.65,
    roughness: 0.24,
    anisotropy: isSoftwareGl ? 0 : 0.9,
    anisotropyRotation: 0,
    clearcoat: isSoftwareGl ? 0 : 0.52,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.45,
  });

  // Velvet emerald & brushed-gold guilloche card back with anisotropic satin sheen
  const cardBackMaterial = new THREE.MeshPhysicalMaterial({
    map: textures.cardBack,
    bumpMap: isSoftwareGl ? null : textures.cardLinenBump,
    bumpScale: isSoftwareGl ? 0 : 0.0042,
    roughnessMap: isSoftwareGl ? null : textures.cardRoughness,
    roughness: 0.78,
    metalness: 0.08,
    anisotropy: isSoftwareGl ? 0 : 0.55,
    anisotropyRotation: Math.PI * 0.25,
    clearcoat: isSoftwareGl ? 0 : 0.34,
    clearcoatRoughness: 0.3,
    sheen: isSoftwareGl ? 0 : 0.42,
    sheenRoughness: 0.58,
    sheenColor: new THREE.Color(0xd4a853),
  });

  const faceMaterialCache = new Map<string, THREE.MeshPhysicalMaterial>();

  const getCardMaterials = (card: Card | null): THREE.Material[] => {
    if (!card) {
      return [cardEdgeMaterial, cardBackMaterial, cardBackMaterial];
    }
    const key = card.joker ? `joker_${card.joker}` : `${card.rank}_${card.suit}`;
    let frontMat = faceMaterialCache.get(key);
    if (!frontMat) {
      frontMat = new THREE.MeshPhysicalMaterial({
        map: textures.getCardFace(card),
        color: new THREE.Color(0xf6f3ed),
        bumpMap: isSoftwareGl ? null : textures.cardLinenBump,
        bumpScale: isSoftwareGl ? 0 : 0.0007,
        roughnessMap: isSoftwareGl ? null : textures.cardRoughness,
        roughness: 0.88,
        metalness: 0,
        anisotropy: 0,
        clearcoat: 0,
        sheen: 0,
        envMapIntensity: 0.14,
      });
      faceMaterialCache.set(key, frontMat);
    }
    return [cardEdgeMaterial, frontMat, cardBackMaterial];
  };

  return {
    chipGeometry,
    cardGeometry,
    impactRingGeometry,
    chipMaterials,
    cardEdgeMaterial,
    cardBackMaterial,
    getCardMaterials,
    createChipMesh: (denom: ChipDenom) => {
      const m = new THREE.Mesh(chipGeometry, chipMaterials[denom]);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    },
    createCardMesh: (card: Card | null) => {
      const m = new THREE.Mesh(cardGeometry, getCardMaterials(card));
      m.castShadow = true;
      m.receiveShadow = true;

      // Face-up underside edge drop shadow (culled automatically when card flips face-down)
      const shadowUp = new THREE.Mesh(cardShadowUpGeo, cardShadowMaterial);
      shadowUp.position.set(-0.022, -CARD_HEIGHT / 2 - 0.003, -0.028);
      shadowUp.renderOrder = 1;
      m.add(shadowUp);

      // Face-down underside edge drop shadow (culled automatically when card is face-up)
      const shadowDown = new THREE.Mesh(cardShadowDownGeo, cardShadowMaterial);
      shadowDown.position.set(0.022, CARD_HEIGHT / 2 + 0.003, -0.028);
      shadowDown.renderOrder = 1;
      m.add(shadowDown);

      return m;
    },
    dispose: () => {
      chipGeometry.dispose();
      cardGeometry.dispose();
      impactRingGeometry.dispose();
      cardShadowUpGeo.dispose();
      cardShadowDownGeo.dispose();
      cardShadowMaterial.dispose();
      for (const d of denoms) {
        chipMaterials[d][0].dispose();
        chipMaterials[d][1].dispose();
      }
      cardEdgeMaterial.dispose();
      cardBackMaterial.dispose();
      for (const fm of faceMaterialCache.values()) {
        fm.dispose();
      }
      faceMaterialCache.clear();
    },
  };
}
