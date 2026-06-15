export type TerrainPlateauStamp = {
  kind: "plateau";
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  height: number;
  edge?: number;
};

export type TerrainHillStamp = {
  kind: "hill";
  x: number;
  z: number;
  radius: number;
  height: number;
};

export type TerrainRampStamp = {
  kind: "ramp";
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  height: number;
  edge?: number;
};

export type TerrainHeightStamp = TerrainPlateauStamp | TerrainHillStamp | TerrainRampStamp;

export type TerrainBlockerStamp = {
  x: number;
  z: number;
  radius: number;
  rotation: number;
};

export type TerrainRouteStamp = {
  axis: "x" | "z";
  center: number;
  width: number;
  strength: number;
};

export type TerrainLedgeWall = {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  normalX: number;
  normalZ: number;
  topY: number;
};

export const maxReadableSlopeDegrees = 17;
export const terrainLedgeThickness = 0.44;
export const terrainRampBlockWidthScale = 0.66;

export const terrainHeightStamps: TerrainHeightStamp[] = [
  { kind: "plateau", x: -27, z: -20, width: 27, depth: 21, rotation: 0.18, height: 2.76, edge: 13.5 },
  { kind: "plateau", x: 28, z: -22, width: 25, depth: 22, rotation: -0.24, height: 2.42, edge: 13 },
  { kind: "plateau", x: -30, z: 25, width: 26, depth: 21, rotation: -0.12, height: 2.5, edge: 13.2 },
  { kind: "plateau", x: 29, z: 24, width: 28, depth: 20, rotation: 0.22, height: 2.68, edge: 13.6 },
  { kind: "plateau", x: 0, z: -39, width: 34, depth: 14, rotation: 0, height: 1.72, edge: 11.4 },
  { kind: "plateau", x: 0, z: 40, width: 34, depth: 14, rotation: 0, height: 1.72, edge: 11.4 },
  { kind: "ramp", x: -3.5087, z: -14.2007, width: 15, depth: 24, rotation: 1.7508, height: 2.76, edge: 10.4 },
  { kind: "ramp", x: 29.7014, z: -0.3231, width: 15, depth: 24, rotation: 2.9016, height: 2.42, edge: 10.2 },
  { kind: "ramp", x: -29.5391, z: 3.7621, width: 15, depth: 24, rotation: -0.12, height: 2.5, edge: 10.5 },
  { kind: "ramp", x: 5.4294, z: 16.6798, width: 15, depth: 24, rotation: -1.3508, height: 2.68, edge: 10.5 },
];

export const terrainBlockerStamps: TerrainBlockerStamp[] = [
  { x: -22, z: -13, radius: 2.1, rotation: 0.2 },
  { x: 24, z: -17, radius: 2.45, rotation: 1.1 },
  { x: -26, z: 22, radius: 2.35, rotation: 2.4 },
  { x: 28, z: 20, radius: 2.15, rotation: 0.8 },
  { x: 6, z: 30, radius: 1.9, rotation: 1.8 },
];

export const terrainRouteStamps: TerrainRouteStamp[] = [
  { axis: "x", center: 0, width: 8.4, strength: 0.3 },
  { axis: "z", center: 0, width: 8.4, strength: 0.3 },
];

export const terrainLedgeWalls = createTerrainLedgeWalls();
export const terrainRampSideWalls = createTerrainRampSideWalls();

export function sampleTerrainLedgeTopHeightAt(x: number, z: number, wall: TerrainLedgeWall) {
  const insideX = x - wall.normalX * 1.6;
  const insideZ = z - wall.normalZ * 1.6;
  return Math.max(wall.topY, sampleTerrainHeightAt(x, z), sampleTerrainHeightAt(insideX, insideZ)) + 0.02;
}

export function sampleTerrainLedgeBottomHeightAt(x: number, z: number, topY: number, wall: TerrainLedgeWall) {
  const outsideX = x + wall.normalX * 2.2;
  const outsideZ = z + wall.normalZ * 2.2;
  const outsideY = sampleTerrainHeightAt(outsideX, outsideZ) - 0.08;
  return Math.max(0.02, Math.min(outsideY, topY - 1.35));
}

export function sampleTerrainHeightAt(x: number, z: number) {
  let height = 0;
  for (const stamp of terrainHeightStamps) {
    height = Math.max(height, sampleTerrainStampHeight(stamp, x, z));
  }
  return Math.max(0, height);
}

export function sampleTerrainStampHeight(stamp: TerrainHeightStamp, x: number, z: number) {
  if (stamp.kind === "plateau") {
    return cleanPlateau(
      x,
      z,
      stamp.x,
      stamp.z,
      stamp.width,
      stamp.depth,
      stamp.rotation,
      stamp.height,
      stamp.edge,
    );
  }
  if (stamp.kind === "ramp") {
    return cleanRamp(x, z, stamp.x, stamp.z, stamp.width, stamp.depth, stamp.rotation, stamp.height);
  }
  return 0;
}

export function sampleTerrainNoise(x: number, z: number) {
  void x;
  void z;
  return 0;
}

export function sampleTerrainRouteTintAt(x: number, z: number) {
  let tint = 0;
  for (const stamp of terrainRouteStamps) {
    const coordinate = stamp.axis === "x" ? x : z;
    const falloff = 1 - Math.abs(coordinate - stamp.center) / (stamp.width * 0.5);
    tint = Math.max(tint, clamp01(falloff) * stamp.strength);
  }
  return tint;
}

type NormalTarget = {
  set: (x: number, y: number, z: number) => NormalTarget;
  normalize: () => NormalTarget;
};

export function sampleTerrainNormalAt<T extends NormalTarget>(x: number, z: number, target: T) {
  const normal = sampleTerrainNormalComponentsAt(x, z);
  target.set(normal.x, normal.y, normal.z).normalize();
  return target;
}

export function sampleTerrainNormalComponentsAt(x: number, z: number) {
  const sampleDistance = 0.8;
  const heightLeft = sampleTerrainHeightAt(x - sampleDistance, z);
  const heightRight = sampleTerrainHeightAt(x + sampleDistance, z);
  const heightBack = sampleTerrainHeightAt(x, z - sampleDistance);
  const heightForward = sampleTerrainHeightAt(x, z + sampleDistance);
  const xComponent = heightLeft - heightRight;
  const yComponent = sampleDistance * 2;
  const zComponent = heightBack - heightForward;
  const length = Math.hypot(xComponent, yComponent, zComponent) || 1;
  return {
    x: xComponent / length,
    y: yComponent / length,
    z: zComponent / length,
  };
}

export function sampleTerrainSlopeDegreesAt(x: number, z: number) {
  const normal = sampleTerrainNormalComponentsAt(x, z);
  return radiansToDegrees(Math.acos(clamp01(normal.y)));
}

function createTerrainLedgeWalls() {
  const walls: TerrainLedgeWall[] = [];
  for (const stamp of terrainHeightStamps) {
    if (stamp.kind !== "plateau") continue;
    const halfWidth = stamp.width * 0.5 * 0.9;
    const halfDepth = stamp.depth * 0.5 * 0.86;
    addPlateauLedgeSide(walls, stamp, "x", -halfDepth, halfWidth * 2, 10, 0, -1);
    addPlateauLedgeSide(walls, stamp, "x", halfDepth, halfWidth * 2, 10, 0, 1);
    addPlateauLedgeSide(walls, stamp, "z", -halfWidth, halfDepth * 2, 8, -1, 0);
    addPlateauLedgeSide(walls, stamp, "z", halfWidth, halfDepth * 2, 8, 1, 0);
  }
  return walls;
}

function createTerrainRampSideWalls() {
  const walls: TerrainLedgeWall[] = [];
  for (const stamp of terrainHeightStamps) {
    if (stamp.kind !== "ramp") continue;
    const halfWidth = stamp.width * 0.5 * terrainRampBlockWidthScale;
    const halfDepth = stamp.depth * 0.5;
    for (const side of [-1, 1] as const) {
      const start = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, halfWidth * side, -halfDepth);
      const end = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, halfWidth * side, halfDepth);
      const normal = rotateTerrainDirection(stamp.rotation, side, 0);
      walls.push({
        x1: start.x,
        z1: start.z,
        x2: end.x,
        z2: end.z,
        normalX: normal.x,
        normalZ: normal.z,
        topY: stamp.height,
      });
    }
  }
  return walls;
}

function addPlateauLedgeSide(
  walls: TerrainLedgeWall[],
  stamp: TerrainPlateauStamp,
  axis: "x" | "z",
  fixedCoordinate: number,
  span: number,
  segments: number,
  localNormalX: number,
  localNormalZ: number,
) {
  const halfSpan = span * 0.5;
  const topY = sampleTerrainHeightAt(stamp.x, stamp.z);
  for (let i = 0; i < segments; i += 1) {
    const a = lerp(-halfSpan, halfSpan, i / segments);
    const b = lerp(-halfSpan, halfSpan, (i + 1) / segments);
    const startLocalX = axis === "x" ? a : fixedCoordinate;
    const startLocalZ = axis === "x" ? fixedCoordinate : a;
    const endLocalX = axis === "x" ? b : fixedCoordinate;
    const endLocalZ = axis === "x" ? fixedCoordinate : b;
    const start = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, startLocalX, startLocalZ);
    const end = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, endLocalX, endLocalZ);
    const normal = rotateTerrainDirection(stamp.rotation, localNormalX, localNormalZ);
    walls.push({
      x1: start.x,
      z1: start.z,
      x2: end.x,
      z2: end.z,
      normalX: normal.x,
      normalZ: normal.z,
      topY,
    });
  }
}

function cleanPlateau(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  rotation: number,
  height: number,
  edge = 5.5,
) {
  void edge;
  const local = toLocalTerrainPoint(x, z, centerX, centerZ, rotation);
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  return Math.abs(local.x) <= halfWidth * 0.9 && Math.abs(local.z) <= halfDepth * 0.86 ? height : 0;
}

function cleanRamp(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  rotation: number,
  height: number,
) {
  const local = toLocalTerrainPoint(x, z, centerX, centerZ, rotation);
  const halfWidth = width * 0.5 * terrainRampBlockWidthScale;
  const halfDepth = depth * 0.5;
  if (Math.abs(local.x) > halfWidth || Math.abs(local.z) > halfDepth) return 0;
  const lengthT = clamp01((local.z + halfDepth) / depth);
  return height * lengthT;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function radiansToDegrees(value: number) {
  return value * (180 / Math.PI);
}

function toLocalTerrainPoint(x: number, z: number, centerX: number, centerZ: number, rotation: number) {
  const dx = x - centerX;
  const dz = z - centerZ;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: dx * cos + dz * sin,
    z: -dx * sin + dz * cos,
  };
}

function terrainLocalToWorld(centerX: number, centerZ: number, rotation: number, localX: number, localZ: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: centerX + localX * cos - localZ * sin,
    z: centerZ + localX * sin + localZ * cos,
  };
}

function rotateTerrainDirection(rotation: number, x: number, z: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: x * cos - z * sin,
    z: x * sin + z * cos,
  };
}
