import {
  maxReadableSlopeDegrees,
  sampleTerrainHeightAt,
  sampleTerrainLedgeBottomHeightAt,
  sampleTerrainLedgeTopHeightAt,
  sampleTerrainNoise,
  sampleTerrainNormalAt,
  sampleTerrainRouteTintAt,
  sampleTerrainSlopeDegreesAt,
  sampleTerrainStampHeight,
  terrainBlockerStamps,
  terrainHeightStamps,
  terrainLedgeThickness,
  terrainLedgeWalls,
  terrainRampBlockWidthScale,
  terrainRampSideWalls,
  terrainRouteStamps,
  type TerrainHeightStamp,
} from "../src/game/terrain.js";

declare const console: {
  log(message: string): void;
};

class Vec3 {
  x = 0;
  y = 0;
  z = 0;

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  normalize() {
    const length = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= length;
    this.y /= length;
    this.z /= length;
    return this;
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFinite(value: number, label: string) {
  assert(Number.isFinite(value), `${label} must be finite`);
}

function verifyStamps() {
  assert(terrainHeightStamps.length >= 4, "terrain should have multiple height stamps");
  assert(terrainBlockerStamps.length >= 1, "terrain should have blocker stamps");
  assert(terrainRouteStamps.length >= 1, "terrain should have route tint stamps");

  for (const stamp of terrainHeightStamps) {
    assert(stamp.height > 0, "height stamps should raise the terrain");
    if (stamp.kind === "plateau") {
      assert(stamp.width > 0 && stamp.depth > 0, "plateau stamps need positive dimensions");
      const centerHeight = sampleTerrainStampHeight(stamp, stamp.x, stamp.z);
      const nearCenter = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, stamp.width * 0.12, 0);
      const nearCenterHeight = sampleTerrainStampHeight(stamp, nearCenter.x, nearCenter.z);
      const outsideHeight = sampleTerrainStampHeight(stamp, stamp.x + stamp.width, stamp.z + stamp.depth);
      assert(Math.abs(centerHeight - nearCenterHeight) < 0.08, "plateau tops should be flat enough to read as mesas");
      assert(centerHeight > outsideHeight, "plateau center should be higher than its outer edge");
    } else if (stamp.kind === "ramp") {
      assert(stamp.width > 0 && stamp.depth > 0, "ramp stamps need positive dimensions");
      const lower = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, 0, -stamp.depth * 0.38);
      const upper = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, 0, stamp.depth * 0.38);
      const lowerHeight = sampleTerrainStampHeight(stamp, lower.x, lower.z);
      const upperHeight = sampleTerrainStampHeight(stamp, upper.x, upper.z);
      assert(upperHeight > lowerHeight, "ramp high end should be above its low end");
      assert(upperHeight <= stamp.height, "ramp stamp should not exceed its authored height");
      const center = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, 0, 0);
      const side = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, stamp.width * 0.5, 0);
      const centerHeight = sampleTerrainStampHeight(stamp, center.x, center.z);
      const sideHeight = sampleTerrainStampHeight(stamp, side.x, side.z);
      assert(sideHeight <= centerHeight * 0.08, "ramp sides should taper low instead of popping the player up");
    } else {
      assert(false, "clean terrain should avoid smooth hill stamps");
    }
  }

  for (let i = 0; i < terrainBlockerStamps.length; i += 1) {
    const blocker = terrainBlockerStamps[i];
    assert(blocker.radius > 0.5, "blockers need a readable radius");
    assert(Math.hypot(blocker.x, blocker.z) > blocker.radius + 8, "blockers should not crowd the start area");
    for (let j = i + 1; j < terrainBlockerStamps.length; j += 1) {
      const other = terrainBlockerStamps[j];
      const distance = Math.hypot(blocker.x - other.x, blocker.z - other.z);
      assert(distance > blocker.radius + other.radius + 2, "blocker stamps should not overlap");
    }
  }

  for (const route of terrainRouteStamps) {
    assert(route.width > 0, "route stamps need positive width");
    assert(route.strength > 0 && route.strength <= 1, "route stamp strength should be normalized");
  }
}

function verifySamples() {
  for (let x = -70; x <= 70; x += 10) {
    for (let z = -70; z <= 70; z += 10) {
      const height = sampleTerrainHeightAt(x, z);
      assertFinite(height, `height at ${x},${z}`);
      assert(height >= 0, "terrain height should never go below the playable floor");
      assert(height <= 3.35, "terrain height should stay readable for arcade movement");
    }
  }

  const startHeight = sampleTerrainHeightAt(0, 0);
  assert(startHeight >= 0 && startHeight < 0.5, "start area should stay low and readable");
  assert(sampleTerrainNoise(13, -9) === 0, "clean-shape terrain should not use procedural height noise");

  const firstStamp = terrainHeightStamps[0] as TerrainHeightStamp;
  const raisedHeight = sampleTerrainHeightAt(firstStamp.x, firstStamp.z);
  assert(raisedHeight > startHeight, "a stamped high area should be above the start area");
}

function verifyNormals() {
  for (const [x, z] of [
    [0, 0],
    [-27, -20],
    [28, 24],
    [15, -6],
  ]) {
    const normal = sampleTerrainNormalAt(x, z, new Vec3());
    const length = Math.hypot(normal.x, normal.y, normal.z);
    assert(Math.abs(length - 1) < 0.0001, "terrain normal should be normalized");
    assert(normal.y > 0.45, "terrain normal should point mostly upward");
  }
}

function verifySlopeBounds() {
  let maxSlope = 0;
  for (let x = -70; x <= 70; x += 5) {
    for (let z = -70; z <= 70; z += 5) {
      if (isNearHardLedge(x, z) || isNearPlateauBoundary(x, z) || isNearRampBoundary(x, z)) continue;
      const slope = sampleTerrainSlopeDegreesAt(x, z);
      assertFinite(slope, `slope at ${x},${z}`);
      maxSlope = Math.max(maxSlope, slope);
    }
  }
  assert(
    maxSlope <= maxReadableSlopeDegrees,
    `terrain slope should stay readable; max ${maxSlope.toFixed(2)} exceeds ${maxReadableSlopeDegrees}`,
  );
}

function isNearHardLedge(x: number, z: number) {
  return terrainLedgeWalls.some((wall) => distanceToTerrainLedgeWall(x, z, wall) <= terrainLedgeThickness + 1.2);
}

function isNearPlateauBoundary(x: number, z: number) {
  for (const stamp of terrainHeightStamps) {
    if (stamp.kind !== "plateau") continue;
    const local = terrainWorldToLocal(stamp.x, stamp.z, stamp.rotation, x, z);
    const halfWidth = stamp.width * 0.5 * 0.9;
    const halfDepth = stamp.depth * 0.5 * 0.86;
    const insideExpanded = Math.abs(local.x) <= halfWidth + 3.2 && Math.abs(local.z) <= halfDepth + 3.2;
    const distanceToBoundary = Math.min(
      Math.abs(Math.abs(local.x) - halfWidth),
      Math.abs(Math.abs(local.z) - halfDepth),
    );
    if (insideExpanded && distanceToBoundary <= 3.2) {
      return true;
    }
  }
  return false;
}

function isNearRampBoundary(x: number, z: number) {
  for (const stamp of terrainHeightStamps) {
    if (stamp.kind !== "ramp") continue;
    const local = terrainWorldToLocal(stamp.x, stamp.z, stamp.rotation, x, z);
    const halfWidth = stamp.width * 0.5 * terrainRampBlockWidthScale;
    const halfDepth = stamp.depth * 0.5;
    const insideExpanded = Math.abs(local.x) <= halfWidth + 1.8 && Math.abs(local.z) <= halfDepth + 1.8;
    const distanceToBoundary = Math.min(
      Math.abs(Math.abs(local.x) - halfWidth),
      Math.abs(Math.abs(local.z) - halfDepth),
    );
    if (insideExpanded && distanceToBoundary <= 1.8) {
      return true;
    }
  }
  return false;
}

function distanceToTerrainLedgeWall(x: number, z: number, wall: { x1: number; z1: number; x2: number; z2: number }) {
  const segmentX = wall.x2 - wall.x1;
  const segmentZ = wall.z2 - wall.z1;
  const lengthSq = segmentX * segmentX + segmentZ * segmentZ || 1;
  const t = Math.max(0, Math.min(1, ((x - wall.x1) * segmentX + (z - wall.z1) * segmentZ) / lengthSq));
  const closestX = wall.x1 + segmentX * t;
  const closestZ = wall.z1 + segmentZ * t;
  return Math.hypot(x - closestX, z - closestZ);
}

function verifyRouteTint() {
  const centerTint = sampleTerrainRouteTintAt(0, 0);
  const outerTint = sampleTerrainRouteTintAt(20, 20);
  assert(centerTint > outerTint, "route tint should be strongest near route bands");
  assert(centerTint <= 1, "route tint should stay normalized");
  assert(outerTint >= 0, "route tint should not go negative");
}

function verifyLedgeWalls() {
  const plateauCount = terrainHeightStamps.filter((stamp) => stamp.kind === "plateau").length;
  assert(terrainLedgeWalls.length === plateauCount * 36, "plateaus should generate continuous hard ledge walls");
  assert(terrainLedgeThickness > 0, "ledge collision thickness should be positive");
  assert(
    terrainRampSideWalls.length === terrainHeightStamps.filter((stamp) => stamp.kind === "ramp").length * 2,
    "ramps should expose two solid side walls for wedge-block collision",
  );
  for (const wall of terrainRampSideWalls) {
    const length = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
    const normalLength = Math.hypot(wall.normalX, wall.normalZ);
    const lowHeight = sampleTerrainHeightAt(wall.x1, wall.z1);
    const highHeight = sampleTerrainHeightAt(wall.x2, wall.z2);
    assert(length > 4, "ramp side walls should span the ramp body");
    assert(Math.abs(normalLength - 1) < 0.0001, "ramp side wall normals should be normalized");
    assert(wall.topY > 0, "ramp side walls should carry the ramp top height for one-way collision");
    assert(highHeight > lowHeight, "ramp side wall clearance should follow the ramp slope");
  }

  for (const wall of terrainLedgeWalls) {
    const length = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
    const normalLength = Math.hypot(wall.normalX, wall.normalZ);
    assert(length > 0.4, "ledge wall segments should have readable length");
    assert(Math.abs(normalLength - 1) < 0.0001, "ledge wall normals should be normalized");
    assertFinite(wall.x1, "ledge wall x1");
    assertFinite(wall.z1, "ledge wall z1");
    assertFinite(wall.x2, "ledge wall x2");
    assertFinite(wall.z2, "ledge wall z2");
  }

  const tallWalls = terrainLedgeWalls.filter((wall) => {
    const midpointX = (wall.x1 + wall.x2) * 0.5;
    const midpointZ = (wall.z1 + wall.z2) * 0.5;
    const topHeight = sampleTerrainLedgeTopHeightAt(midpointX, midpointZ, wall);
    const bottomHeight = sampleTerrainLedgeBottomHeightAt(midpointX, midpointZ, topHeight, wall);
    return topHeight - bottomHeight >= 1.1;
  }).length;
  assert(tallWalls >= Math.floor(terrainLedgeWalls.length * 0.85), "most ledge walls should render as tall vertical faces");

  const stitchedWalls = terrainLedgeWalls.filter((wall) => {
    const midpointX = (wall.x1 + wall.x2) * 0.5;
    const midpointZ = (wall.z1 + wall.z2) * 0.5;
    const surfaceHeight = sampleTerrainHeightAt(midpointX - wall.normalX * 0.45, midpointZ - wall.normalZ * 0.45);
    const wallTopHeight = sampleTerrainLedgeTopHeightAt(midpointX, midpointZ, wall);
    return Math.abs(wallTopHeight - surfaceHeight) <= 0.24;
  }).length;
  assert(stitchedWalls >= Math.floor(terrainLedgeWalls.length * 0.8), "ledge wall tops should visually stitch to mesa surfaces");
}

function terrainLocalToWorld(centerX: number, centerZ: number, rotation: number, localX: number, localZ: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: centerX + localX * cos - localZ * sin,
    z: centerZ + localX * sin + localZ * cos,
  };
}

function terrainWorldToLocal(centerX: number, centerZ: number, rotation: number, x: number, z: number) {
  const dx = x - centerX;
  const dz = z - centerZ;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: dx * cos + dz * sin,
    z: -dx * sin + dz * cos,
  };
}

verifyStamps();
verifySamples();
verifyNormals();
verifySlopeBounds();
verifyRouteTint();
verifyLedgeWalls();

console.log(
  `Terrain verified: ${terrainHeightStamps.length} height stamps, ${terrainRouteStamps.length} route stamps, ${terrainBlockerStamps.length} blockers, ${terrainLedgeWalls.length} ledges.`,
);
