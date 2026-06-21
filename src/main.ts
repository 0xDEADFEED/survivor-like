import "./styles.css";
import * as THREE from "three";
import { GameAudio } from "./game/audio";
import { config, getWaveConfig } from "./game/config";
import {
  loadBestRun,
  loadMetaProgression,
  loadSelectedCharacter,
  loadSettings,
  maybeSaveBestRun,
  saveMetaProgression,
  saveSelectedCharacter,
  saveSettings,
  type GameSettings,
} from "./game/storage";
import {
  sampleTerrainHeightAt,
  isTerrainRampAt,
  sampleTerrainLedgeBottomHeightAt,
  sampleTerrainLedgeTopHeightAt,
  sampleTerrainNormalAt,
  sampleTerrainRouteTintAt,
  sampleTerrainSlopeDegreesAt,
  terrainBlockerStamps,
  terrainHeightStamps,
  terrainLedgeThickness,
  terrainLedgeWalls,
  terrainRampBlockWidthScale,
  terrainRampSideWalls,
  terrainRouteStamps,
  type TerrainBlockerStamp,
  type TerrainHeightStamp,
  type TerrainLedgeWall,
} from "./game/terrain";
import type {
  CharacterId,
  Enemy,
  EnemyKind,
  FloatingText,
  GameMode,
  HostileProjectile,
  Particle,
  Projectile,
  RunSummary,
  Upgrade,
  UpgradeId,
  WeaponId,
  XpGem,
} from "./game/types";

const canvas = requireElement<HTMLCanvasElement>("#game");
const timeEl = requireElement<HTMLElement>("#time");
const killsEl = requireElement<HTMLElement>("#kills");
const levelEl = requireElement<HTMLElement>("#level");
const healthFill = requireElement<HTMLElement>("#health-fill");
const xpFill = requireElement<HTMLElement>("#xp-fill");
const combatLayer = requireElement<HTMLElement>("#combat-layer");
const toastEl = requireElement<HTMLElement>("#toast");
const bossBar = requireElement<HTMLElement>("#boss-bar");
const bossName = requireElement<HTMLElement>("#boss-name");
const bossFill = requireElement<HTMLElement>("#boss-fill");
const startOverlay = requireElement<HTMLElement>("#start");
const startButton = requireElement<HTMLButtonElement>("#start-button");
const bestRunEl = requireElement<HTMLElement>("#best-run");
const characterSelect = requireElement<HTMLElement>("#character-select");
const metaShop = requireElement<HTMLElement>("#meta-shop");
const levelUpOverlay = requireElement<HTMLElement>("#level-up");
const levelUpTitle = requireElement<HTMLElement>("#level-up-title");
const upgradeCards = requireElement<HTMLElement>("#upgrade-cards");
const rerollButton = requireElement<HTMLButtonElement>("#reroll-button");
const skipButton = requireElement<HTMLButtonElement>("#skip-button");
const pauseOverlay = requireElement<HTMLElement>("#pause");
const pauseStats = requireElement<HTMLElement>("#pause-stats");
const pauseUpgrades = requireElement<HTMLElement>("#pause-upgrades");
const soundToggle = requireElement<HTMLInputElement>("#sound-toggle");
const shakeToggle = requireElement<HTMLInputElement>("#shake-toggle");
const damageToggle = requireElement<HTMLInputElement>("#damage-toggle");
const particlesToggle = requireElement<HTMLInputElement>("#particles-toggle");
const terrainToggle = requireElement<HTMLInputElement>("#terrain-toggle");
const terrainDebugToggle = requireElement<HTMLInputElement>("#terrain-debug-toggle");
const resumeButton = requireElement<HTMLButtonElement>("#resume-button");
const pauseRestartButton = requireElement<HTMLButtonElement>("#pause-restart-button");
const returnStartButton = requireElement<HTMLButtonElement>("#return-start-button");
const deathOverlay = requireElement<HTMLElement>("#death");
const deathStats = requireElement<HTMLElement>("#death-stats");
const bestRunNote = requireElement<HTMLElement>("#best-run-note");
const restartButton = requireElement<HTMLButtonElement>("#restart-button");

function requireElement<T extends HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required DOM node: ${selector}`);
  }
  return element;
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151b22);
scene.fog = new THREE.Fog(0x151b22, 34, 92);

const camera = new THREE.PerspectiveCamera(
  52,
  window.innerWidth / window.innerHeight,
  0.1,
  160,
);
camera.position.set(0, 12.5, 19);

const keys = new Set<string>();
const enemies: Enemy[] = [];
const gems: XpGem[] = [];
const particles: Particle[] = [];
const floatingTexts: FloatingText[] = [];
const projectiles: Projectile[] = [];
const hostileProjectiles: HostileProjectile[] = [];
const spawnGates: THREE.Vector3[] = [];
const spawnGateDebugMarkers: THREE.Mesh[] = [];
const terrainAnchors: TerrainAnchor[] = [];
const terrainBlockers: TerrainBlocker[] = [];
const terrainAccentMeshes: THREE.Object3D[] = [];
const terrainStampDebugMarkers: THREE.Line[] = [];
const terrainLedgeDebugMarkers: THREE.Line[] = [];
const terrainWallCellSize = 12;
const terrainLedgeWallGrid = new Map<string, QueryableTerrainLedgeWall[]>();
const terrainRampSideWallGrid = new Map<string, QueryableTerrainLedgeWall[]>();
const terrainWallQueryScratch: QueryableTerrainLedgeWall[] = [];
let terrainWallQueryId = 0;
let terrainMesh: THREE.Mesh | undefined;
let terrainDebugMesh: THREE.Mesh | undefined;
let terrainSampleMarker: THREE.Mesh | undefined;
let terrainSampleLine: THREE.Mesh | undefined;
let terrainNormalArrow: THREE.ArrowHelper | undefined;
let playerCollisionMarker: THREE.Mesh | undefined;
let playerGroundShadow: THREE.Mesh | undefined;
const clock = new THREE.Clock();
const cameraLookTarget = new THREE.Vector3(0, 0.45, 0);
const settings = loadSettings();
const metaProgression = loadMetaProgression();
let selectedCharacter: CharacterId = loadSelectedCharacter();
const audio = new GameAudio(settings);
const debugStartTime = getDebugNumberParam("debugTime", 0, 0, 600);
const debugStartLevel = getDebugNumberParam("debugLevel", 1, 1, 50);
const debugStartEnemies = getDebugNumberParam("debugEnemies", 0, 0, 180);
const debugStartX = getDebugNumberParam("debugX", 0, -68, 68);
const debugStartZ = getDebugNumberParam("debugZ", 0, -68, 68);

const player = {
  group: new THREE.Group(),
  velocity: new THREE.Vector3(),
  radius: config.player.radius,
  speed: config.player.speed,
  health: config.player.health,
  maxHealth: config.player.health,
  xp: 0,
  xpToNext: config.player.xpToNext,
  level: 1,
  pickupRadius: config.player.pickupRadius,
  damageMultiplier: 1,
  knockbackMultiplier: 1,
  dashBurst: 0,
  pickupPulse: 0,
  verticalOffset: 0,
  verticalVelocity: 0,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  grounded: true,
  landingSquash: 0,
  landingCarryTimer: 0,
  lastJumpBoost: 1,
};
let playerBodyMaterial: THREE.MeshStandardMaterial | undefined;
let playerFaceMaterial: THREE.MeshStandardMaterial | undefined;
let playerDamageFlashTimer = 0;

const weapon = {
  maceCount: config.weapons.mace.count,
  damage: config.weapons.mace.damage,
  orbitRadius: config.weapons.mace.orbitRadius,
  maceRadius: config.weapons.mace.radius,
  spinSpeed: config.weapons.mace.spinSpeed,
  angle: 0,
  maces: [] as THREE.Mesh[],
};

const ownedWeapons = new Set<WeaponId>(["mace", "hammer"]);
const weaponDamage = new Map<WeaponId, number>();

const hammer = {
  group: new THREE.Group(),
  timer: config.weapons.hammer.timer,
  cooldown: config.weapons.hammer.cooldown,
  swingTime: 0,
  duration: config.weapons.hammer.duration,
  directionAngle: 0,
  radius: config.weapons.hammer.radius,
  arcWidth: config.weapons.hammer.arcWidth,
  damage: config.weapons.hammer.damage,
  swingsPerAttack: 1,
  pendingSwings: 0,
  swingSpacing: config.weapons.hammer.swingSpacing,
  shockwave: false,
  hitEnemies: new Set<Enemy>(),
};

const rockToss = {
  timer: config.weapons.rock.timer,
  cooldown: config.weapons.rock.cooldown,
  damage: config.weapons.rock.damage,
  speed: config.weapons.rock.speed,
  pierce: config.weapons.rock.pierce,
  split: false,
};

const groundSlam = {
  timer: config.weapons.slam.timer,
  cooldown: config.weapons.slam.cooldown,
  radius: config.weapons.slam.radius,
  damage: config.weapons.slam.damage,
};

const boomerangAxe = {
  timer: config.weapons.boomerang.timer,
  cooldown: config.weapons.boomerang.cooldown,
  damage: config.weapons.boomerang.damage,
  speed: config.weapons.boomerang.speed,
  maxDistance: config.weapons.boomerang.maxDistance,
  pierce: config.weapons.boomerang.pierce,
};

const lightningZap = {
  timer: config.weapons.lightning.timer,
  cooldown: config.weapons.lightning.cooldown,
  damage: config.weapons.lightning.damage,
  range: config.weapons.lightning.range,
  chains: config.weapons.lightning.chains,
};

const evolutions = {
  fireTrails: false,
  pickupPulse: false,
  dashBurst: false,
  damageGlow: false,
};

const upgradesTaken = new Map<UpgradeId, number>();
const upgradeLabels = new Map<UpgradeId, string>();

let gameMode: GameMode = "start";
let runTime = 0;
let spawnTimer = 0;
let eliteTimer = 18;
let nextBossTime = config.waves.firstBossTime;
let currentWaveName = "Basic Pressure";
let kills = 0;
let bossesDefeated = 0;
let runCoins = 0;
let rerollsRemaining = 1;
let currentLevelChoices: Upgrade[] = [];
let bossWarningShown = false;
let toastTimer = 0;
let cameraShake = 0;
let hitStop = 0;
let hurtSoundCooldown = 0;
let airSkimEffectCooldown = 0;
let playerLedgeImpactCooldown = 0;
let combatOverlayTimer = 0;
let hudTimer = 0;
let lastFrame = 0;
let restorePointerLockAfterLevelUp = false;

const tmpVec = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();
const cameraPlanarOffset = new THREE.Vector3(0, 0, 19);
const cameraDesiredOffset = new THREE.Vector3();
const cameraDesiredPosition = new THREE.Vector3();
let cameraYaw = 0;
let cameraPitch = 0.55;
const cameraMouseYawSensitivity = 0.0021;
const cameraMousePitchSensitivity = 0.00145;
const playerTerrainCollisionInfo: TerrainCollisionInfo = {
  hit: false,
  ledge: false,
  x: 0,
  z: 0,
  normalX: 0,
  normalZ: 0,
  push: 0,
};
const terrainUp = new THREE.Vector3(0, 1, 0);
const terrainEffectNormal = new THREE.Vector3();
const terrainEffectTangent = new THREE.Vector3();
const terrainEffectSide = new THREE.Vector3();
const terrainEffectMatrix = new THREE.Matrix4();
const terrainPlanarNormal = new THREE.Vector3(0, 0, 1);
const enemyFlashColor = new THREE.Color(0xfff1a5);
const screenProjectVector = new THREE.Vector3();
const screenProjection = {
  x: 0,
  y: 0,
  visible: false,
};
const terrainBlockerCollisionScale = 0.78;
const terrainBlockerFootprintScale = 1.08;
const playerJumpSpeed = 7.4;
const playerJumpGravity = 18.5;
const playerJumpBufferSeconds = 0.13;
const playerCoyoteSeconds = 0.1;
const playerAirControl = 0.68;
const playerLandingSpeedThreshold = -4.2;
const playerLandingCarrySeconds = 0.18;
const playerLandingBonkRadius = 2.35;
const playerLandingBonkDamage = 12;
const playerAirSkimHeight = 0.55;
const playerSlopeJumpMaxLift = 1.22;
const playerSlopeJumpMaxCarry = 1.16;
const playerLedgeImpactMinSpeed = 3.4;
const playerLedgeImpactCooldownSeconds = 0.18;
const playerLedgeDropHeight = 0.75;
const rampSideStepClearance = 0.12;
const rampSideJumpClearance = 0.38;
const playerDamageFlashDuration = 0.22;
const enemyTouchVerticalTolerance = 1.25;
const enemySpawnRingMinDistance = 27;
const enemySpawnRingMaxDistance = 39;
const bossSpawnRingMinDistance = 38;
const bossSpawnRingMaxDistance = 50;
const enemySpawnWorldLimit = 70;
const maxLiveParticles = 180;
const maxFloatingTexts = 70;

type TerrainBlocker = TerrainBlockerStamp & {
  mesh: THREE.Group;
  footprint: THREE.Mesh;
  debug: THREE.Mesh;
  collisionRadius: number;
};

type TerrainCollisionInfo = {
  hit: boolean;
  ledge: boolean;
  x: number;
  z: number;
  normalX: number;
  normalZ: number;
  push: number;
};

type TerrainAnchor = {
  object: THREE.Object3D;
  x: number;
  z: number;
  yOffset: number;
  alignToNormal?: boolean;
  yaw?: number;
};

type QueryableTerrainLedgeWall = TerrainLedgeWall & {
  queryId?: number;
};

buildTerrainWallGrid(terrainLedgeWalls, terrainLedgeWallGrid);
buildTerrainWallGrid(terrainRampSideWalls, terrainRampSideWallGrid);

const enemyMaterial = new THREE.MeshStandardMaterial({
  color: 0xd94b35,
  roughness: 0.72,
  metalness: 0.02,
});
const heavyMaterial = new THREE.MeshStandardMaterial({
  color: 0x8f3f92,
  roughness: 0.8,
  metalness: 0.04,
});
const swarmerMaterial = new THREE.MeshStandardMaterial({
  color: 0xf08f3c,
  roughness: 0.68,
  metalness: 0.02,
});
const dasherMaterial = new THREE.MeshStandardMaterial({
  color: 0xf0c24b,
  emissive: 0x3c2700,
  emissiveIntensity: 0.18,
  roughness: 0.55,
  metalness: 0.03,
});
const spitterMaterial = new THREE.MeshStandardMaterial({
  color: 0x5fd176,
  emissive: 0x0d3a1b,
  emissiveIntensity: 0.22,
  roughness: 0.6,
  metalness: 0.03,
});
const shieldbearerMaterial = new THREE.MeshStandardMaterial({
  color: 0xb74b58,
  roughness: 0.78,
  metalness: 0.04,
});
const shieldPlateMaterial = new THREE.MeshStandardMaterial({
  color: 0xd6d0b7,
  roughness: 0.48,
  metalness: 0.28,
});
const bossMaterial = new THREE.MeshStandardMaterial({
  color: 0x7a4be8,
  emissive: 0x1d0d43,
  emissiveIntensity: 0.2,
  roughness: 0.82,
  metalness: 0.04,
});
const gemMaterial = new THREE.MeshStandardMaterial({
  color: 0x37d6ef,
  emissive: 0x12616e,
  emissiveIntensity: 0.75,
  roughness: 0.38,
  metalness: 0.1,
});
const particleMaterial = new THREE.MeshBasicMaterial({
  color: 0xffe27a,
  transparent: true,
  opacity: 1,
});
const playerShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x07100c,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const maceMaterial = new THREE.MeshStandardMaterial({
  color: 0xf3cf5e,
  emissive: 0x513600,
  emissiveIntensity: 0.2,
  roughness: 0.52,
  metalness: 0.2,
});
const trailMaterial = new THREE.MeshBasicMaterial({
  color: 0xff8b3d,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
const impactMaterial = new THREE.MeshBasicMaterial({
  color: 0xfff0a6,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const landingBonkMaterial = new THREE.MeshBasicMaterial({
  color: 0xffcf5f,
  transparent: true,
  opacity: 0.58,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x9aa19a,
  roughness: 0.86,
  metalness: 0.02,
});
const axeMaterial = new THREE.MeshStandardMaterial({
  color: 0xcfd5d1,
  emissive: 0x1c2a2d,
  emissiveIntensity: 0.18,
  roughness: 0.42,
  metalness: 0.18,
});
const lightningMaterial = new THREE.MeshBasicMaterial({
  color: 0x8be9ff,
  transparent: true,
  opacity: 0.74,
  depthWrite: false,
});
const enemyShotMaterial = new THREE.MeshBasicMaterial({
  color: 0x9cff8e,
  transparent: true,
  opacity: 0.86,
  depthWrite: false,
});
const dangerTelegraphMaterial = new THREE.MeshBasicMaterial({
  color: 0xff6f5f,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});
const enemyGeometryByKind: Record<EnemyKind, THREE.BufferGeometry> = {
  basic: new THREE.IcosahedronGeometry(0.78, 1),
  heavy: new THREE.DodecahedronGeometry(1.15, 0),
  swarmer: new THREE.ConeGeometry(0.55, 1.05, 5),
  dasher: new THREE.ConeGeometry(0.72, 1.35, 5),
  spitter: new THREE.TetrahedronGeometry(0.88, 0),
  shieldbearer: new THREE.DodecahedronGeometry(1.08, 0),
  boss: new THREE.DodecahedronGeometry(1.85, 0),
};
const shieldPlateGeometry = new THREE.BoxGeometry(1.35, 0.72, 0.18);
const gemGeometry = new THREE.OctahedronGeometry(0.32, 0);
const rockProjectileGeometry = new THREE.DodecahedronGeometry(0.34, 0);
const rockSplitProjectileGeometry = new THREE.DodecahedronGeometry(0.22, 0);
const boomerangProjectileGeometry = new THREE.ConeGeometry(0.44, 0.82, 4);
const hostileProjectileGeometry = new THREE.OctahedronGeometry(0.3, 0);
const terrainMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  flatShading: true,
  roughness: 0.96,
  metalness: 0,
});
const terrainDebugMaterial = new THREE.MeshBasicMaterial({
  color: 0x9debd6,
  transparent: true,
  opacity: 0.28,
  wireframe: true,
  depthWrite: false,
});
const terrainStampDebugMaterial = new THREE.LineBasicMaterial({
  color: 0xb9f7a1,
  transparent: true,
  opacity: 0.86,
  depthWrite: false,
});
const terrainLedgeDebugMaterial = new THREE.LineBasicMaterial({
  color: 0xffd866,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});
const blockerDebugMaterial = new THREE.MeshBasicMaterial({
  color: 0xffd866,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const blockerFootprintMaterial = new THREE.MeshBasicMaterial({
  color: 0x1b241f,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const terrainMesaTopMaterial = new THREE.MeshStandardMaterial({
  color: 0xa5ad73,
  roughness: 0.84,
  metalness: 0,
  flatShading: true,
});
const terrainRampDeckMaterial = new THREE.MeshStandardMaterial({
  color: 0xa79a62,
  roughness: 0.88,
  metalness: 0,
  flatShading: true,
  side: THREE.DoubleSide,
});
const terrainRampSideMaterial = new THREE.MeshStandardMaterial({
  color: 0x121c18,
  roughness: 0.94,
  metalness: 0.01,
  flatShading: true,
  side: THREE.DoubleSide,
});
const spawnGateMaterial = new THREE.MeshStandardMaterial({
  color: 0x374049,
  emissive: 0x141820,
  emissiveIntensity: 0.15,
  roughness: 0.72,
  metalness: 0.04,
});
const spawnGateGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xff7a5c,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
  side: THREE.DoubleSide,
});

setupWorld();
setupPlayer();
setupHammer();
syncMaces();
bindEvents();
syncSettingsControls();
updateBestRunPanel();
renderCharacterSelect();
updateMetaShop();
updateHud();
requestAnimationFrame(loop);

function setupWorld() {
  const hemiLight = new THREE.HemisphereLight(0xd7f7ff, 0x253317, 1.75);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight(0xfff0c0, 3.15);
  sun.position.set(-18, 28, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  scene.add(sun);

  rebuildTerrainMesh();
  addTerrainAccents();
  rebuildTerrainLedgeWalls();

  addSpawnGates();
  addTerrainBlockers();

  for (let i = 0; i < 36; i += 1) {
    addArenaProp(i);
  }
}

function rebuildTerrainMesh() {
  const geometry = createTerrainGeometry(150, 46);
  if (!terrainMesh) {
    terrainMesh = new THREE.Mesh(geometry, terrainMaterial);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
  } else {
    terrainMesh.geometry.dispose();
    terrainMesh.geometry = geometry;
  }

  if (!terrainDebugMesh) {
    terrainDebugMesh = new THREE.Mesh(geometry.clone(), terrainDebugMaterial);
    terrainDebugMesh.position.y = 0.025;
    scene.add(terrainDebugMesh);
  } else {
    terrainDebugMesh.geometry.dispose();
    terrainDebugMesh.geometry = geometry.clone();
  }
  terrainDebugMesh.visible = settings.terrainEnabled && settings.terrainDebug;
  setupTerrainDebugMarkers();
  rebuildTerrainStampDebugMarkers();
  updateTerrainDebug();
}

function createTerrainGeometry(size: number, segments: number) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const lowColor = new THREE.Color(0x334833);
  const routeColor = new THREE.Color(0x95885d);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, 0);
    const color = lowColor.clone();
    color.lerp(routeColor, sampleTerrainRouteTintAt(x, z) * 1.18);
    colors.push(color.r, color.g, color.b);
  }
  positions.needsUpdate = true;
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const facetedGeometry = geometry.toNonIndexed();
  geometry.dispose();
  facetedGeometry.computeVertexNormals();
  return facetedGeometry;
}

function addTerrainAccents() {
  for (const stamp of terrainHeightStamps) {
    if (stamp.kind === "plateau") {
      addPlateauAccentBands(stamp);
    } else if (stamp.kind === "ramp") {
      addRampAccentBands(stamp);
    }
  }
  addTerrainLedgeWallMeshes();
  updateTerrainAccentMeshes();
}

function addTerrainLedgeWallMeshes() {
  const geometry = createTerrainLedgeWallMeshGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const wallMesh = new THREE.Mesh(geometry, material);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallMesh.visible = settings.terrainEnabled;
  scene.add(wallMesh);
  terrainAccentMeshes.push(wallMesh);
}

function createTerrainLedgeWallMeshGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const faceColor = new THREE.Color(0x203124);
  const edgeHighlight = new THREE.Color(0x3a4a32);

  for (let i = 0; i < terrainLedgeWalls.length; i += 1) {
    const wall = terrainLedgeWalls[i];
    const top0 = sampleLedgeTopHeight(wall.x1, wall.z1, wall);
    const top1 = sampleLedgeTopHeight(wall.x2, wall.z2, wall);
    const bottom0 = sampleLedgeBottomHeight(wall.x1, wall.z1, top0, wall);
    const bottom1 = sampleLedgeBottomHeight(wall.x2, wall.z2, top1, wall);

    positions.push(
      wall.x1, top0, wall.z1,
      wall.x2, top1, wall.z2,
      wall.x2, bottom1, wall.z2,
      wall.x1, top0, wall.z1,
      wall.x2, bottom1, wall.z2,
      wall.x1, bottom0, wall.z1,
    );

    const color = faceColor.clone().lerp(edgeHighlight, i % 2 === 0 ? 0.1 : 0.22);
    for (let vertex = 0; vertex < 6; vertex += 1) {
      colors.push(color.r, color.g, color.b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function sampleLedgeTopHeight(x: number, z: number, wall: TerrainLedgeWall) {
  return sampleTerrainLedgeTopHeightAt(x, z, wall);
}

function sampleLedgeBottomHeight(x: number, z: number, topY: number, wall: TerrainLedgeWall) {
  return sampleTerrainLedgeBottomHeightAt(x, z, topY, wall);
}

function addPlateauAccentBands(stamp: Extract<TerrainHeightStamp, { kind: "plateau" }>) {
  addPlateauMesaCap(stamp);
}

function addPlateauMesaCap(stamp: Extract<TerrainHeightStamp, { kind: "plateau" }>) {
  const capWidth = stamp.width * 0.9;
  const capDepth = stamp.depth * 0.86;
  const topY = sampleTerrainHeight(stamp.x, stamp.z) + 0.045;
  const cap = new THREE.Mesh(
    createPlateauTopGeometry(stamp, capWidth, capDepth, topY),
    terrainMesaTopMaterial.clone(),
  );
  cap.castShadow = true;
  cap.receiveShadow = true;
  cap.visible = settings.terrainEnabled;
  scene.add(cap);
  terrainAccentMeshes.push(cap);
}

function createPlateauTopGeometry(
  stamp: Extract<TerrainHeightStamp, { kind: "plateau" }>,
  width: number,
  depth: number,
  topY: number,
) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const corners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ].map((point) => terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, point.x, point.z));
  const positions = [
    corners[0].x, topY, corners[0].z,
    corners[2].x, topY, corners[2].z,
    corners[1].x, topY, corners[1].z,
    corners[0].x, topY, corners[0].z,
    corners[3].x, topY, corners[3].z,
    corners[2].x, topY, corners[2].z,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addRampAccentBands(stamp: Extract<TerrainHeightStamp, { kind: "ramp" }>) {
  addRampWedge(stamp);
}

function addRampWedge(stamp: Extract<TerrainHeightStamp, { kind: "ramp" }>) {
  const wedge = new THREE.Mesh(createRampWedgeGeometry(stamp), [
    terrainRampDeckMaterial.clone(),
    terrainRampSideMaterial.clone(),
  ]);
  wedge.castShadow = true;
  wedge.receiveShadow = false;
  wedge.visible = settings.terrainEnabled;
  scene.add(wedge);
  terrainAccentMeshes.push(wedge);
}

function createRampWedgeGeometry(stamp: Extract<TerrainHeightStamp, { kind: "ramp" }>) {
  const halfWidth = stamp.width * 0.5 * terrainRampBlockWidthScale;
  const halfDepth = stamp.depth * 0.5;
  const baseY = 0.025;
  const lowY = 0.055;
  const highY = stamp.height + 0.055;
  const positions: number[] = [];

  const makePoint = (localX: number, y: number, localZ: number) => {
    const world = terrainLocalToWorld(stamp.x, stamp.z, stamp.rotation, localX, localZ);
    return { x: world.x, y, z: world.z };
  };
  const lowLeft = makePoint(-halfWidth, lowY, -halfDepth);
  const lowRight = makePoint(halfWidth, lowY, -halfDepth);
  const highLeft = makePoint(-halfWidth, highY, halfDepth);
  const highRight = makePoint(halfWidth, highY, halfDepth);
  const lowLeftBase = makePoint(-halfWidth, baseY, -halfDepth);
  const lowRightBase = makePoint(halfWidth, baseY, -halfDepth);
  const highLeftBase = makePoint(-halfWidth, baseY, halfDepth);
  const highRightBase = makePoint(halfWidth, baseY, halfDepth);

  const pushPoint = (point: { x: number; y: number; z: number }) => {
    positions.push(point.x, point.y, point.z);
  };
  const pushTriangle = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
  ) => {
    pushPoint(a);
    pushPoint(b);
    pushPoint(c);
  };
  const pushQuad = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
    d: { x: number; y: number; z: number },
  ) => {
    pushTriangle(a, b, c);
    pushTriangle(a, c, d);
  };

  pushTriangle(lowLeft, highRight, lowRight);
  pushTriangle(lowLeft, highLeft, highRight);
  const topVertexCount = 6;

  pushQuad(lowLeft, lowLeftBase, highLeftBase, highLeft);
  pushQuad(lowRight, highRight, highRightBase, lowRightBase);
  pushQuad(highLeft, highLeftBase, highRightBase, highRight);
  pushQuad(lowLeft, lowRight, lowRightBase, lowLeftBase);
  pushQuad(lowLeftBase, lowRightBase, highRightBase, highLeftBase);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.clearGroups();
  geometry.addGroup(0, topVertexCount, 0);
  geometry.addGroup(topVertexCount, positions.length / 3 - topVertexCount, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function updateTerrainAccentMeshes() {
  for (const mesh of terrainAccentMeshes) {
    mesh.visible = settings.terrainEnabled;
  }
}

function setupTerrainDebugMarkers() {
  if (!terrainSampleMarker) {
    terrainSampleMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 0.92, 32),
      new THREE.MeshBasicMaterial({
        color: 0xf3cf5e,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    terrainSampleMarker.rotation.x = -Math.PI / 2;
    scene.add(terrainSampleMarker);
  }

  if (!terrainSampleLine) {
    terrainSampleLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1, 0.08),
      new THREE.MeshBasicMaterial({
        color: 0xf3cf5e,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    scene.add(terrainSampleLine);
  }

  if (!terrainNormalArrow) {
    terrainNormalArrow = new THREE.ArrowHelper(terrainUp, new THREE.Vector3(), 1.25, 0xf3cf5e, 0.32, 0.16);
    scene.add(terrainNormalArrow);
  }

  if (!playerCollisionMarker) {
    playerCollisionMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.04, 40),
      new THREE.MeshBasicMaterial({
        color: 0x72e7f1,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    playerCollisionMarker.scale.setScalar(player.radius);
    scene.add(playerCollisionMarker);
  }
}

function updateTerrainDebug() {
  const visible = settings.terrainEnabled && settings.terrainDebug;
  if (terrainDebugMesh) terrainDebugMesh.visible = visible;
  if (terrainNormalArrow) terrainNormalArrow.visible = visible;
  if (playerCollisionMarker) playerCollisionMarker.visible = visible;
  updateTerrainStampDebugMarkers();
  updateTerrainLedgeDebugMarkers();
  updateTerrainAccentMeshes();
  updateTerrainBlockers();
  updateSpawnGateDebugMarkers();
  if (!terrainSampleMarker || !terrainSampleLine) return;

  terrainSampleMarker.visible = visible;
  terrainSampleLine.visible = visible;
  if (!visible) return;

  const x = player.group.position.x;
  const z = player.group.position.z;
  const y = sampleTerrainHeight(x, z);
  const normal = sampleTerrainNormal(x, z, terrainEffectNormal);
  if (playerCollisionMarker) {
    playerCollisionMarker.position.set(x, y + 0.065, z);
    alignPlanarMeshToTerrain(playerCollisionMarker, x, z);
  }
  terrainSampleMarker.position.set(x, y + 0.035, z);
  alignPlanarMeshToTerrain(terrainSampleMarker, x, z);
  terrainSampleLine.position.set(x, y * 0.5, z);
  terrainSampleLine.scale.set(1, Math.max(y, 0.08), 1);
  if (terrainNormalArrow) {
    const arrowX = x + 1.15;
    const arrowZ = z + 0.2;
    terrainNormalArrow.position.set(arrowX, sampleTerrainHeight(arrowX, arrowZ) + 0.14, arrowZ);
    terrainNormalArrow.setDirection(normal);
    terrainNormalArrow.setLength(1.25, 0.32, 0.16);
  }
}

function rebuildTerrainStampDebugMarkers() {
  for (const marker of terrainStampDebugMarkers) {
    scene.remove(marker);
    marker.geometry.dispose();
  }
  terrainStampDebugMarkers.length = 0;

  for (const stamp of terrainHeightStamps) {
    const marker = new THREE.Line(
      createTerrainStampDebugGeometry(stamp),
      terrainStampDebugMaterial.clone(),
    );
    marker.visible = settings.terrainEnabled && settings.terrainDebug;
    scene.add(marker);
    terrainStampDebugMarkers.push(marker);
  }
}

function rebuildTerrainLedgeWalls() {
  for (const marker of terrainLedgeDebugMarkers) {
    scene.remove(marker);
    marker.geometry.dispose();
  }
  terrainLedgeDebugMarkers.length = 0;

  for (const wall of terrainLedgeWalls) {
    terrainLedgeDebugMarkers.push(new THREE.Line(createTerrainLedgeDebugGeometry(wall), terrainLedgeDebugMaterial.clone()));
    scene.add(terrainLedgeDebugMarkers[terrainLedgeDebugMarkers.length - 1]);
  }

  updateTerrainLedgeDebugMarkers();
}

function createTerrainLedgeDebugGeometry(wall: TerrainLedgeWall) {
  return new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(wall.x1, sampleTerrainHeight(wall.x1, wall.z1) + 0.18, wall.z1),
    new THREE.Vector3(wall.x2, sampleTerrainHeight(wall.x2, wall.z2) + 0.18, wall.z2),
  ]);
}

function updateTerrainLedgeDebugMarkers() {
  const visible = settings.terrainEnabled && settings.terrainDebug;
  for (const marker of terrainLedgeDebugMarkers) {
    marker.visible = visible;
  }
}

function updateTerrainStampDebugMarkers() {
  const visible = settings.terrainEnabled && settings.terrainDebug;
  for (const marker of terrainStampDebugMarkers) {
    marker.visible = visible;
  }
}

function createTerrainStampDebugGeometry(stamp: TerrainHeightStamp) {
  const points = stamp.kind === "plateau"
    ? createPlateauStampDebugPoints(stamp)
    : stamp.kind === "ramp"
      ? createRampStampDebugPoints(stamp)
      : createHillStampDebugPoints(stamp);
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createPlateauStampDebugPoints(stamp: Extract<TerrainHeightStamp, { kind: "plateau" }>) {
  return createRectStampDebugPoints(stamp.x, stamp.z, stamp.width, stamp.depth, stamp.rotation, 12);
}

function createHillStampDebugPoints(stamp: Extract<TerrainHeightStamp, { kind: "hill" }>) {
  const points: THREE.Vector3[] = [];
  const segments = 56;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = stamp.x + Math.cos(angle) * stamp.radius;
    const z = stamp.z + Math.sin(angle) * stamp.radius;
    points.push(new THREE.Vector3(x, sampleTerrainHeight(x, z) + 0.075, z));
  }
  return points;
}

function createRampStampDebugPoints(stamp: Extract<TerrainHeightStamp, { kind: "ramp" }>) {
  const points = createRectStampDebugPoints(stamp.x, stamp.z, stamp.width, stamp.depth, stamp.rotation, 12);
  const halfDepth = stamp.depth * 0.5;
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    points.push(createTerrainStampDebugPoint(
      stamp.x,
      stamp.z,
      stamp.rotation,
      0,
      THREE.MathUtils.lerp(-halfDepth, halfDepth, t),
    ));
  }
  return points;
}

function createRectStampDebugPoints(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  rotation: number,
  segmentsPerSide: number,
) {
  const points: THREE.Vector3[] = [];
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const corners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ] as const;

  for (let side = 0; side < corners.length; side += 1) {
    const start = corners[side];
    const end = corners[(side + 1) % corners.length];
    for (let i = 0; i < segmentsPerSide; i += 1) {
      const t = i / segmentsPerSide;
      points.push(createTerrainStampDebugPoint(
        centerX,
        centerZ,
        rotation,
        THREE.MathUtils.lerp(start[0], end[0], t),
        THREE.MathUtils.lerp(start[1], end[1], t),
      ));
    }
  }
  points.push(points[0].clone());
  return points;
}

function createTerrainStampDebugPoint(
  centerX: number,
  centerZ: number,
  rotation: number,
  localX: number,
  localZ: number,
) {
  const { x, z } = terrainLocalToWorld(centerX, centerZ, rotation, localX, localZ);
  return new THREE.Vector3(x, sampleTerrainHeight(x, z) + 0.075, z);
}

function terrainLocalToWorld(centerX: number, centerZ: number, rotation: number, localX: number, localZ: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: centerX + localX * cos - localZ * sin,
    z: centerZ + localX * sin + localZ * cos,
  };
}

function alignPlanarMeshToTerrain(mesh: THREE.Object3D, x: number, z: number) {
  const normal = sampleTerrainNormal(x, z, terrainEffectNormal);
  mesh.quaternion.setFromUnitVectors(terrainPlanarNormal, normal);
}

function alignLineMeshToTerrain(mesh: THREE.Object3D, x: number, z: number, directionX: number, directionZ: number) {
  const normal = sampleTerrainNormal(x, z, terrainEffectNormal);
  terrainEffectTangent.set(directionX, 0, directionZ);
  if (terrainEffectTangent.lengthSq() <= 0.0001) {
    terrainEffectTangent.set(1, 0, 0);
  }
  terrainEffectTangent.projectOnPlane(normal).normalize();
  terrainEffectSide.crossVectors(terrainEffectTangent, normal).normalize();
  terrainEffectMatrix.makeBasis(terrainEffectTangent, normal, terrainEffectSide);
  mesh.quaternion.setFromRotationMatrix(terrainEffectMatrix);
}

function alignObjectToTerrain(mesh: THREE.Object3D, x: number, z: number, yaw: number) {
  const normal = sampleTerrainNormal(x, z, terrainEffectNormal);
  terrainEffectTangent.set(Math.sin(yaw), 0, Math.cos(yaw));
  terrainEffectTangent.projectOnPlane(normal);
  if (terrainEffectTangent.lengthSq() <= 0.0001) {
    terrainEffectTangent.set(1, 0, 0).projectOnPlane(normal);
  }
  terrainEffectTangent.normalize();
  terrainEffectSide.crossVectors(terrainEffectTangent, normal).normalize();
  terrainEffectMatrix.makeBasis(terrainEffectSide, normal, terrainEffectTangent);
  mesh.quaternion.setFromRotationMatrix(terrainEffectMatrix);
}

function anchorToTerrain(
  object: THREE.Object3D,
  x: number,
  z: number,
  yOffset = 0,
  options: { alignToNormal?: boolean; yaw?: number } = {},
) {
  terrainAnchors.push({ object, x, z, yOffset, ...options });
  updateTerrainAnchor(terrainAnchors[terrainAnchors.length - 1]);
}

function updateTerrainAnchors() {
  for (const anchor of terrainAnchors) {
    updateTerrainAnchor(anchor);
  }
  for (const gate of spawnGates) {
    gate.y = sampleTerrainHeight(gate.x, gate.z);
  }
}

function updateTerrainAnchor(anchor: TerrainAnchor) {
  anchor.object.position.x = anchor.x;
  anchor.object.position.y = sampleTerrainHeight(anchor.x, anchor.z) + anchor.yOffset;
  anchor.object.position.z = anchor.z;
  if (anchor.alignToNormal) {
    alignObjectToTerrain(anchor.object, anchor.x, anchor.z, anchor.yaw ?? 0);
  }
}

function updateTerrainBlockers() {
  for (const blocker of terrainBlockers) {
    const y = sampleTerrainHeight(blocker.x, blocker.z);
    blocker.mesh.visible = settings.terrainEnabled;
    blocker.footprint.visible = settings.terrainEnabled;
    blocker.debug.visible = settings.terrainEnabled && settings.terrainDebug;
    blocker.footprint.position.set(blocker.x, y + 0.028, blocker.z);
    blocker.debug.position.set(blocker.x, y + 0.045, blocker.z);
    alignPlanarMeshToTerrain(blocker.footprint, blocker.x, blocker.z);
    alignPlanarMeshToTerrain(blocker.debug, blocker.x, blocker.z);
  }
}

function updateSpawnGateDebugMarkers() {
  const visible = settings.terrainEnabled && settings.terrainDebug;
  for (let i = 0; i < spawnGateDebugMarkers.length; i += 1) {
    const marker = spawnGateDebugMarkers[i];
    const gate = spawnGates[i];
    if (!gate) {
      marker.visible = false;
      continue;
    }

    marker.visible = visible;
    marker.position.set(gate.x, sampleTerrainHeight(gate.x, gate.z) + 0.055, gate.z);
    alignPlanarMeshToTerrain(marker, gate.x, gate.z);
  }
}

function getTerrainBlockerHit(position: THREE.Vector3, radius: number) {
  if (!settings.terrainEnabled) return undefined;

  for (const blocker of terrainBlockers) {
    const distance = Math.hypot(position.x - blocker.x, position.z - blocker.z);
    if (distance <= blocker.collisionRadius + radius) {
      return blocker;
    }
  }
  for (const wall of queryTerrainWallGrid(terrainLedgeWallGrid, position.x, position.z, radius + terrainLedgeThickness)) {
    if (distanceToTerrainLedgeWall(position.x, position.z, wall) <= radius + terrainLedgeThickness) {
      return wall;
    }
  }
  for (const wall of queryTerrainWallGrid(terrainRampSideWallGrid, position.x, position.z, radius + terrainLedgeThickness)) {
    if (distanceToTerrainLedgeWall(position.x, position.z, wall) <= radius + terrainLedgeThickness) {
      return wall;
    }
  }
  return undefined;
}

function resolveTerrainBlockers(
  position: THREE.Vector3,
  radius: number,
  velocity?: THREE.Vector3,
  strength = 1,
  collisionInfo?: TerrainCollisionInfo,
  dropFromHeight = 0,
  actorHeight = dropFromHeight,
) {
  if (!settings.terrainEnabled) return false;

  if (collisionInfo) {
    collisionInfo.hit = false;
    collisionInfo.ledge = false;
    collisionInfo.push = 0;
  }

  let resolved = false;
  for (const blocker of terrainBlockers) {
    let dx = position.x - blocker.x;
    let dz = position.z - blocker.z;
    let distanceSq = dx * dx + dz * dz;
    const minDistance = blocker.collisionRadius + radius;
    if (distanceSq >= minDistance * minDistance) continue;

    if (distanceSq <= 0.0001) {
      dx = 1;
      dz = 0;
      distanceSq = 1;
    }

    const distance = Math.sqrt(distanceSq);
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const push = (minDistance - distance) * strength;
    position.x += normalX * push;
    position.z += normalZ * push;
    recordTerrainCollision(collisionInfo, false, blocker.x + normalX * blocker.collisionRadius, blocker.z + normalZ * blocker.collisionRadius, normalX, normalZ, push);

    if (velocity) {
      const inwardSpeed = velocity.x * normalX + velocity.z * normalZ;
      if (inwardSpeed < 0) {
        velocity.x -= normalX * inwardSpeed;
        velocity.z -= normalZ * inwardSpeed;
      }
    }

    resolved = true;
  }

  for (const wall of queryTerrainWallGrid(terrainLedgeWallGrid, position.x, position.z, radius + terrainLedgeThickness)) {
    if (velocity && dropFromHeight >= wall.topY - 0.28 && velocity.x * wall.normalX + velocity.z * wall.normalZ > 0.02) {
      continue;
    }

    const closest = closestPointOnTerrainLedge(position.x, position.z, wall);
    const wallTopHeight = sampleTerrainLedgeTopHeightAt(closest.x, closest.z, wall);
    if (actorHeight >= wallTopHeight - 0.18) {
      continue;
    }

    let dx = position.x - closest.x;
    let dz = position.z - closest.z;
    let distanceSq = dx * dx + dz * dz;
    const minDistance = radius + terrainLedgeThickness;
    if (distanceSq >= minDistance * minDistance) continue;

    if (distanceSq <= 0.0001) {
      dx = wall.normalX;
      dz = wall.normalZ;
      distanceSq = 1;
    }

    const distance = Math.sqrt(distanceSq);
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const push = (minDistance - distance) * strength;
    position.x += normalX * push;
    position.z += normalZ * push;
    recordTerrainCollision(collisionInfo, true, closest.x, closest.z, normalX, normalZ, push);

    if (velocity) {
      const inwardSpeed = velocity.x * normalX + velocity.z * normalZ;
      if (inwardSpeed < 0) {
        velocity.x -= normalX * inwardSpeed;
        velocity.z -= normalZ * inwardSpeed;
      }
    }

    resolved = true;
  }
  for (const wall of queryTerrainWallGrid(terrainRampSideWallGrid, position.x, position.z, radius + terrainLedgeThickness)) {
    if (velocity && velocity.x * wall.normalX + velocity.z * wall.normalZ > 0.02) {
      continue;
    }

    const closest = closestPointOnTerrainLedge(position.x, position.z, wall);
    const wallHeight = sampleTerrainHeight(closest.x, closest.z);
    const alreadyAboveRampSide = dropFromHeight >= wallHeight + rampSideStepClearance;
    const jumpingAboveRampSide = actorHeight >= wallHeight + rampSideJumpClearance;
    if (alreadyAboveRampSide || jumpingAboveRampSide) {
      continue;
    }

    let dx = position.x - closest.x;
    let dz = position.z - closest.z;
    let distanceSq = dx * dx + dz * dz;
    const minDistance = radius + terrainLedgeThickness;
    if (distanceSq >= minDistance * minDistance) continue;

    if (distanceSq <= 0.0001) {
      dx = wall.normalX;
      dz = wall.normalZ;
      distanceSq = 1;
    }

    const distance = Math.sqrt(distanceSq);
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const push = (minDistance - distance) * strength;
    position.x += normalX * push;
    position.z += normalZ * push;
    recordTerrainCollision(collisionInfo, true, closest.x, closest.z, normalX, normalZ, push);

    if (velocity) {
      const inwardSpeed = velocity.x * normalX + velocity.z * normalZ;
      if (inwardSpeed < 0) {
        velocity.x -= normalX * inwardSpeed;
        velocity.z -= normalZ * inwardSpeed;
      }
    }

    resolved = true;
  }
  return resolved;
}

function recordTerrainCollision(
  collisionInfo: TerrainCollisionInfo | undefined,
  ledge: boolean,
  x: number,
  z: number,
  normalX: number,
  normalZ: number,
  push: number,
) {
  if (!collisionInfo || push < collisionInfo.push) return;
  collisionInfo.hit = true;
  collisionInfo.ledge = ledge;
  collisionInfo.x = x;
  collisionInfo.z = z;
  collisionInfo.normalX = normalX;
  collisionInfo.normalZ = normalZ;
  collisionInfo.push = push;
}

function buildTerrainWallGrid(walls: TerrainLedgeWall[], grid: Map<string, QueryableTerrainLedgeWall[]>) {
  grid.clear();
  for (const wall of walls as QueryableTerrainLedgeWall[]) {
    const minX = Math.min(wall.x1, wall.x2) - terrainLedgeThickness;
    const maxX = Math.max(wall.x1, wall.x2) + terrainLedgeThickness;
    const minZ = Math.min(wall.z1, wall.z2) - terrainLedgeThickness;
    const maxZ = Math.max(wall.z1, wall.z2) + terrainLedgeThickness;
    const minCellX = Math.floor(minX / terrainWallCellSize);
    const maxCellX = Math.floor(maxX / terrainWallCellSize);
    const minCellZ = Math.floor(minZ / terrainWallCellSize);
    const maxCellZ = Math.floor(maxZ / terrainWallCellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = terrainWallCellKey(cellX, cellZ);
        const cell = grid.get(key);
        if (cell) {
          cell.push(wall);
        } else {
          grid.set(key, [wall]);
        }
      }
    }
  }
}

function queryTerrainWallGrid(
  grid: Map<string, QueryableTerrainLedgeWall[]>,
  x: number,
  z: number,
  radius: number,
) {
  terrainWallQueryScratch.length = 0;
  terrainWallQueryId += 1;
  const minCellX = Math.floor((x - radius) / terrainWallCellSize);
  const maxCellX = Math.floor((x + radius) / terrainWallCellSize);
  const minCellZ = Math.floor((z - radius) / terrainWallCellSize);
  const maxCellZ = Math.floor((z + radius) / terrainWallCellSize);
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const cell = grid.get(terrainWallCellKey(cellX, cellZ));
      if (!cell) continue;
      for (const wall of cell) {
        if (wall.queryId === terrainWallQueryId) continue;
        wall.queryId = terrainWallQueryId;
        terrainWallQueryScratch.push(wall);
      }
    }
  }
  return terrainWallQueryScratch;
}

function terrainWallCellKey(cellX: number, cellZ: number) {
  return `${cellX},${cellZ}`;
}

function distanceToTerrainLedgeWall(x: number, z: number, wall: TerrainLedgeWall) {
  const closest = closestPointOnTerrainLedge(x, z, wall);
  return Math.hypot(x - closest.x, z - closest.z);
}

function closestPointOnTerrainLedge(x: number, z: number, wall: TerrainLedgeWall) {
  const segmentX = wall.x2 - wall.x1;
  const segmentZ = wall.z2 - wall.z1;
  const lengthSq = segmentX * segmentX + segmentZ * segmentZ || 1;
  const t = THREE.MathUtils.clamp(((x - wall.x1) * segmentX + (z - wall.z1) * segmentZ) / lengthSq, 0, 1);
  return {
    x: wall.x1 + segmentX * t,
    z: wall.z1 + segmentZ * t,
    t,
  };
}

function sampleTerrainHeight(x: number, z: number) {
  if (!settings.terrainEnabled) return 0;
  return sampleTerrainHeightAt(x, z);
}

function sampleTerrainNormal(x: number, z: number, target = new THREE.Vector3()) {
  if (!settings.terrainEnabled) return target.copy(terrainUp);
  return sampleTerrainNormalAt(x, z, target);
}

function addSpawnGates() {
  const radius = 55;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const gatePosition = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    gatePosition.y = sampleTerrainHeight(gatePosition.x, gatePosition.z);
    spawnGates.push(gatePosition);

    const group = new THREE.Group();
    anchorToTerrain(group, gatePosition.x, gatePosition.z);
    group.rotation.y = -angle + Math.PI / 2;

    const leftPillar = createGatePillar(-1.05);
    const rightPillar = createGatePillar(1.05);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3, 0.38, 0.55), spawnGateMaterial.clone());
    lintel.position.set(0, 2.65, 0);
    lintel.castShadow = true;
    lintel.receiveShadow = true;

    const glow = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.08, 24), spawnGateGlowMaterial.clone());
    glow.position.set(0, 1.28, -0.04);
    glow.rotation.y = Math.PI / 2;

    group.add(leftPillar, rightPillar, lintel, glow);
    scene.add(group);

    const debugMarker = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.82, 36), blockerDebugMaterial.clone());
    debugMarker.scale.set(1.05, 1.05, 1.05);
    debugMarker.visible = false;
    scene.add(debugMarker);
    spawnGateDebugMarkers.push(debugMarker);
  }
  updateSpawnGateDebugMarkers();
}

function createGatePillar(x: number) {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 2.65, 0.62), spawnGateMaterial.clone());
  pillar.position.set(x, 1.28, 0);
  pillar.castShadow = true;
  pillar.receiveShadow = true;
  return pillar;
}

function addTerrainBlockers() {
  for (const blocker of terrainBlockerStamps) {
    const group = new THREE.Group();

    const mainRock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(blocker.radius * 0.86, 0),
      new THREE.MeshStandardMaterial({ color: 0x59615d, roughness: 0.9, metalness: 0.02 }),
    );
    mainRock.position.set(0, blocker.radius * 0.62, 0);
    mainRock.scale.set(1.12, 0.92, 0.86);
    mainRock.castShadow = true;
    mainRock.receiveShadow = true;

    const sideRock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(blocker.radius * 0.48, 0),
      new THREE.MeshStandardMaterial({ color: 0x4d5754, roughness: 0.92, metalness: 0.01 }),
    );
    sideRock.position.set(blocker.radius * 0.54, blocker.radius * 0.35, blocker.radius * 0.34);
    sideRock.scale.set(0.92, 0.82, 1.08);
    sideRock.castShadow = true;
    sideRock.receiveShadow = true;

    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(blocker.radius * 0.28, blocker.radius * 1.25, 5),
      new THREE.MeshStandardMaterial({ color: 0x3d6d54, roughness: 0.88 }),
    );
    shard.position.set(-blocker.radius * 0.68, blocker.radius * 0.64, blocker.radius * 0.1);
    shard.rotation.z = -0.2;
    shard.castShadow = true;
    shard.receiveShadow = true;

    group.add(mainRock, sideRock, shard);
    anchorToTerrain(group, blocker.x, blocker.z, 0, { alignToNormal: true, yaw: blocker.rotation });
    scene.add(group);

    const footprint = new THREE.Mesh(new THREE.CircleGeometry(1, 48), blockerFootprintMaterial.clone());
    footprint.scale.setScalar(blocker.radius * terrainBlockerFootprintScale);
    scene.add(footprint);

    const debug = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.02, 48), blockerDebugMaterial.clone());
    const collisionRadius = blocker.radius * terrainBlockerCollisionScale;
    debug.scale.setScalar(collisionRadius);
    scene.add(debug);

    terrainBlockers.push({
      x: blocker.x,
      z: blocker.z,
      radius: blocker.radius,
      rotation: blocker.rotation,
      collisionRadius,
      mesh: group,
      footprint,
      debug,
    });
  }

  updateTerrainBlockers();
}

function addArenaProp(index: number) {
  const angle = index * 1.7;
  const distance = 14 + ((index * 9) % 48);
  const x = Math.cos(angle) * distance + Math.sin(index * 0.9) * 5;
  const z = Math.sin(angle) * distance + Math.cos(index * 1.1) * 5;
  const height = 0.28 + ((index * 17) % 8) * 0.035;
  const geometry =
    index % 3 === 0
      ? new THREE.ConeGeometry(0.28 + (index % 2) * 0.08, height * 2.4, 5)
      : new THREE.DodecahedronGeometry(0.34 + (index % 4) * 0.05, 0);
  const material = new THREE.MeshStandardMaterial({
    color: index % 3 === 0 ? 0x3a644d : 0x4e5753,
    roughness: 0.9,
  });
  const prop = new THREE.Mesh(geometry, material);
  anchorToTerrain(prop, x, z, height * 0.5, { alignToNormal: true, yaw: angle });
  if (index % 3 !== 0) {
    prop.scale.y = 0.38;
  }
  prop.castShadow = true;
  prop.receiveShadow = true;
  scene.add(prop);
}

function setupPlayer() {
  playerBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x56d486,
    roughness: 0.58,
    metalness: 0.02,
  });
  playerFaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff2bb,
    roughness: 0.45,
  });

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.58, 0.75, 4, 8),
    playerBodyMaterial,
  );
  body.position.y = 0.82;
  body.castShadow = true;
  body.receiveShadow = true;

  const face = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.58, 4),
    playerFaceMaterial,
  );
  face.position.set(0, 0.9, 0.68);
  face.rotation.x = Math.PI / 2;
  face.castShadow = true;

  player.group.add(body, face);
  player.group.position.set(debugStartX, sampleTerrainHeight(debugStartX, debugStartZ), debugStartZ);
  scene.add(player.group);

  playerGroundShadow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), playerShadowMaterial.clone());
  playerGroundShadow.rotation.x = -Math.PI / 2;
  playerGroundShadow.renderOrder = -1;
  scene.add(playerGroundShadow);
}

function setupHammer() {
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 1.75, 6),
    new THREE.MeshStandardMaterial({
      color: 0x8b6b46,
      roughness: 0.72,
      metalness: 0.02,
    }),
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.x = 0.72;
  handle.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.48, 0.58),
    new THREE.MeshStandardMaterial({
      color: 0xe8d37a,
      emissive: 0x3e2b07,
      emissiveIntensity: 0.12,
      roughness: 0.46,
      metalness: 0.08,
    }),
  );
  head.position.x = 1.58;
  head.castShadow = true;
  head.receiveShadow = true;

  hammer.group.add(handle, head);
  hammer.group.visible = false;
  scene.add(hammer.group);
}

function syncMaces() {
  while (weapon.maces.length < weapon.maceCount) {
    const mace = new THREE.Mesh(
      new THREE.IcosahedronGeometry(weapon.maceRadius, 1),
      maceMaterial,
    );
    mace.castShadow = true;
    mace.receiveShadow = true;
    scene.add(mace);
    weapon.maces.push(mace);
  }

  while (weapon.maces.length > weapon.maceCount) {
    const mace = weapon.maces.pop();
    if (mace) {
      scene.remove(mace);
      mace.geometry.dispose();
    }
  }
}

function bindEvents() {
  window.addEventListener("keydown", (event) => {
    keys.add(event.key.toLowerCase());
    if (event.key === " " && gameMode === "running" && !event.repeat) {
      event.preventDefault();
      queuePlayerJump();
    }
    if ((event.key.toLowerCase() === "p" || event.key === "Escape") && gameMode === "running") {
      pauseRun();
    } else if ((event.key.toLowerCase() === "p" || event.key === "Escape") && gameMode === "paused") {
      resumeRun();
    }
    if ((event.key === "Enter" || event.key === " ") && gameMode === "start") {
      beginRun();
    }
    if (event.key === " " && gameMode === "dead") {
      restart();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  window.addEventListener("pointermove", (event) => {
    if (gameMode === "running") {
      const absMovementX = Math.abs(event.movementX);
      const absMovementY = Math.abs(event.movementY);
      const pitchMovement = absMovementX > absMovementY * 3 && absMovementY <= 2 ? 0 : event.movementY;
      cameraYaw -= event.movementX * cameraMouseYawSensitivity;
      cameraPitch = THREE.MathUtils.clamp(
        cameraPitch + pitchMovement * cameraMousePitchSensitivity,
        0.38,
        0.78,
      );
    }
  });

  canvas.addEventListener("click", () => {
    requestCameraPointerLock();
  });

  window.addEventListener("blur", handlePageInactive);
  window.addEventListener("pagehide", handlePageInactive);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      handlePageInactive();
    }
  });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  startButton.addEventListener("click", beginRun);
  rerollButton.addEventListener("click", rerollLevelUpChoices);
  skipButton.addEventListener("click", skipLevelUpChoice);
  resumeButton.addEventListener("click", resumeRun);
  pauseRestartButton.addEventListener("click", restartRunFromOverlay);
  returnStartButton.addEventListener("click", returnToStart);
  restartButton.addEventListener("click", restartRunFromOverlay);

  for (const toggle of [soundToggle, shakeToggle, damageToggle, particlesToggle, terrainToggle, terrainDebugToggle]) {
    toggle.addEventListener("change", updateSettingsFromControls);
  }
}

function requestCameraPointerLock() {
  if (
    gameMode !== "running" ||
    document.pointerLockElement === canvas ||
    document.visibilityState !== "visible" ||
    !document.hasFocus()
  ) {
    return;
  }
  try {
    canvas.requestPointerLock();
  } catch {
    // Pointer lock requires browser support and a user gesture; normal mouse-look still works without it.
  }
}

function releaseCameraPointerLock() {
  if (document.pointerLockElement === canvas) {
    try {
      document.exitPointerLock();
    } catch {
      // Some browsers can reject unlock while already transitioning.
    }
  }
}

function handlePageInactive() {
  restorePointerLockAfterLevelUp = false;
  releaseCameraPointerLock();
}

function restoreLevelUpPointerLock() {
  if (!restorePointerLockAfterLevelUp) return;
  restorePointerLockAfterLevelUp = false;
  requestCameraPointerLock();
}

function loop(now: number) {
  const rawDelta = Math.min((now - lastFrame) / 1000 || 0, 0.05);
  lastFrame = now;
  clock.getDelta();
  const delta = hitStop > 0 ? rawDelta * 0.18 : rawDelta;
  hitStop = Math.max(0, hitStop - rawDelta);

  if (gameMode === "running") {
    updateGame(delta);
  } else {
    updatePausedMotion(delta);
  }

  updateCamera(delta);
  updatePlayerDamageFlash(rawDelta);
  updateTerrainDebug();
  updateCombatOverlays(rawDelta);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function updateGame(delta: number) {
  runTime += delta;
  spawnTimer -= delta;
  eliteTimer -= delta;
  cameraShake = Math.max(0, cameraShake - delta * 2.4);
  hurtSoundCooldown = Math.max(0, hurtSoundCooldown - delta);
  airSkimEffectCooldown = Math.max(0, airSkimEffectCooldown - delta);
  updateToast(delta);
  updateBossWarning();

  updatePlayer(delta);
  updateMaces(delta);
  updateHammer(delta);
  updateRockToss(delta);
  updateGroundSlam(delta);
  updateBoomerangAxe(delta);
  updateLightningZap(delta);
  updateProjectiles(delta);
  updateHostileProjectiles(delta);
  updateEnemies(delta);
  updateGems(delta);
  updateParticles(delta);
  spawnEnemies();
  hudTimer -= delta;
  if (hudTimer <= 0) {
    updateHud();
    hudTimer = 0.1;
  }
}

function updatePausedMotion(delta: number) {
  weapon.angle += delta * weapon.spinSpeed * 0.28;
  updateMaceTransforms();
  updateParticles(delta);
  for (const gem of gems) {
    gem.mesh.rotation.y += delta * 1.4;
  }
}

function updatePlayer(delta: number) {
  player.landingCarryTimer = Math.max(0, player.landingCarryTimer - delta);
  playerLedgeImpactCooldown = Math.max(0, playerLedgeImpactCooldown - delta);
  const previousGroundHeight = sampleTerrainHeight(player.group.position.x, player.group.position.z);
  const previousWorldHeight = previousGroundHeight + player.verticalOffset;
  const input = tmpVec.set(0, 0, 0);
  if (keys.has("w") || keys.has("arrowup")) input.z -= 1;
  if (keys.has("s") || keys.has("arrowdown")) input.z += 1;
  if (keys.has("a") || keys.has("arrowleft")) input.x -= 1;
  if (keys.has("d") || keys.has("arrowright")) input.x += 1;

  if (input.lengthSq() > 0) {
    const inputRight = input.x;
    const inputForward = -input.z;
    const cameraRightX = Math.cos(cameraYaw);
    const cameraRightZ = -Math.sin(cameraYaw);
    const cameraForwardX = -Math.sin(cameraYaw);
    const cameraForwardZ = -Math.cos(cameraYaw);
    input.set(
      cameraRightX * inputRight + cameraForwardX * inputForward,
      0,
      cameraRightZ * inputRight + cameraForwardZ * inputForward,
    ).normalize();
    const carryBoost = player.grounded ? 1 + (player.landingCarryTimer / playerLandingCarrySeconds) * 0.12 : 1;
    const speed = player.speed * getTerrainMoveSpeedMultiplier(input.x, input.z) * carryBoost;
    const desiredVelocity = tmpVecB.copy(input).multiplyScalar(player.grounded ? speed : speed * playerAirControl);
    if (player.grounded) {
      player.velocity.copy(desiredVelocity);
    } else {
      player.velocity.lerp(desiredVelocity, 1 - Math.pow(0.015, delta));
    }
    if (evolutions.dashBurst && Math.random() < delta * 14) {
      spawnDashBurst(player.group.position);
    }
  } else if (player.grounded) {
    const friction = player.landingCarryTimer > 0 ? 0.08 : 0.0005;
    player.velocity.multiplyScalar(Math.pow(friction, delta));
  } else {
    player.velocity.multiplyScalar(Math.pow(0.12, delta));
  }

  const speedBeforeCollision = player.velocity.length();
  player.group.position.addScaledVector(player.velocity, delta);
  player.group.position.x = THREE.MathUtils.clamp(player.group.position.x, -70, 70);
  player.group.position.z = THREE.MathUtils.clamp(player.group.position.z, -70, 70);
  resolveTerrainBlockers(
    player.group.position,
    player.radius,
    player.velocity,
    1,
    playerTerrainCollisionInfo,
    previousGroundHeight,
    previousWorldHeight,
  );
  if (
    playerTerrainCollisionInfo.hit &&
    playerTerrainCollisionInfo.ledge &&
    speedBeforeCollision >= playerLedgeImpactMinSpeed &&
    playerLedgeImpactCooldown <= 0
  ) {
    spawnLedgeImpactEffect(playerTerrainCollisionInfo, speedBeforeCollision);
    cameraShake = Math.max(cameraShake, 0.035);
    playerLedgeImpactCooldown = playerLedgeImpactCooldownSeconds;
  }
  player.group.position.x = THREE.MathUtils.clamp(player.group.position.x, -70, 70);
  player.group.position.z = THREE.MathUtils.clamp(player.group.position.z, -70, 70);
  const nextGroundHeight = sampleTerrainHeight(player.group.position.x, player.group.position.z);
  if (!player.grounded) {
    player.verticalOffset = previousWorldHeight - nextGroundHeight;
  } else if (previousGroundHeight - nextGroundHeight >= playerLedgeDropHeight) {
    player.grounded = false;
    player.coyoteTimer = 0;
    player.verticalOffset = previousWorldHeight - nextGroundHeight;
    player.verticalVelocity = Math.min(player.verticalVelocity, -0.8);
    spawnLedgeDropEffect(player.group.position, previousGroundHeight);
  }
  updatePlayerVertical(delta);
  player.group.position.y = sampleTerrainHeight(player.group.position.x, player.group.position.z) + player.verticalOffset;
  updatePlayerSquash(delta);
  updatePlayerGroundShadow();

  const faceDirection = player.velocity.lengthSq() > 0.08
    ? tmpVecB.copy(player.velocity)
    : tmpVecB.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  if (faceDirection.lengthSq() > 0.001) {
    player.group.rotation.y = Math.atan2(faceDirection.x, faceDirection.z);
  }

  player.pickupPulse = Math.max(0, player.pickupPulse - delta * 3.5);
}

function queuePlayerJump() {
  player.jumpBufferTimer = playerJumpBufferSeconds;
}

function getTerrainMoveSpeedMultiplier(directionX: number, directionZ: number) {
  if (!settings.terrainEnabled || !player.grounded) return 1;
  const normal = sampleTerrainNormal(player.group.position.x, player.group.position.z, terrainEffectNormal);
  const uphill = -(normal.x * directionX + normal.z * directionZ) / Math.max(normal.y, 0.2);
  return THREE.MathUtils.clamp(1 - uphill * 0.34, 0.92, 1.08);
}

function getTerrainJumpBoost() {
  if (!settings.terrainEnabled || player.velocity.lengthSq() <= 4) {
    return { lift: 1, carry: 1 };
  }
  const normal = sampleTerrainNormal(player.group.position.x, player.group.position.z, terrainEffectNormal);
  const moveX = player.velocity.x;
  const moveZ = player.velocity.z;
  const moveLength = Math.hypot(moveX, moveZ) || 1;
  const directionX = moveX / moveLength;
  const directionZ = moveZ / moveLength;
  const uphill = -(normal.x * directionX + normal.z * directionZ) / Math.max(normal.y, 0.2);
  const boost = THREE.MathUtils.clamp((uphill - 0.035) / 0.16, 0, 1);
  return {
    lift: THREE.MathUtils.lerp(1, playerSlopeJumpMaxLift, boost),
    carry: THREE.MathUtils.lerp(1, playerSlopeJumpMaxCarry, boost),
  };
}

function updatePlayerVertical(delta: number) {
  player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - delta);
  if (player.grounded) {
    player.coyoteTimer = playerCoyoteSeconds;
  } else {
    player.coyoteTimer = Math.max(0, player.coyoteTimer - delta);
  }

  if (player.jumpBufferTimer > 0 && (player.grounded || player.coyoteTimer > 0)) {
    player.grounded = false;
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    const jumpBoost = getTerrainJumpBoost();
    player.lastJumpBoost = jumpBoost.lift;
    player.verticalVelocity = playerJumpSpeed * jumpBoost.lift;
    player.verticalOffset = Math.max(player.verticalOffset, 0.04);
    if (player.velocity.lengthSq() > 4) {
      player.velocity.multiplyScalar(1.06 * jumpBoost.carry).clampLength(0, player.speed * 1.42);
    }
    spawnJumpDust(player.group.position, jumpBoost.lift > 1.06 ? 1.05 : 0.75);
    if (jumpBoost.lift > 1.06) {
      spawnSlopeJumpEffect(player.group.position, jumpBoost.lift);
      player.landingCarryTimer = Math.max(player.landingCarryTimer, playerLandingCarrySeconds * 0.65);
    }
  }

  if (!player.grounded) {
    player.verticalVelocity -= playerJumpGravity * delta;
    player.verticalOffset += player.verticalVelocity * delta;
    if (player.verticalOffset <= 0) {
      const landingVelocity = player.verticalVelocity;
      player.verticalOffset = 0;
      player.verticalVelocity = 0;
      player.grounded = true;
      player.coyoteTimer = playerCoyoteSeconds;
      if (landingVelocity < playerLandingSpeedThreshold) {
        player.landingSquash = 0.55;
        if (player.velocity.lengthSq() > 4) {
          player.velocity.multiplyScalar(1.08).clampLength(0, player.speed * 1.35);
          player.landingCarryTimer = playerLandingCarrySeconds;
        }
        spawnJumpDust(player.group.position, 0.62);
        triggerLandingBonk();
        cameraShake = Math.max(cameraShake, 0.018);
      }
    }
  } else {
    player.verticalOffset = 0;
    player.verticalVelocity = 0;
  }
}

function updatePlayerSquash(delta: number) {
  player.landingSquash = Math.max(0, player.landingSquash - delta * 7.2);
  const jumpStretch = player.grounded ? 0 : THREE.MathUtils.clamp(player.verticalVelocity / playerJumpSpeed, -0.45, 1) * 0.05;
  const squash = player.landingSquash;
  player.group.scale.set(
    1 + squash * 0.05 - jumpStretch * 0.45,
    1 - squash * 0.07 + jumpStretch,
    1 + squash * 0.05 - jumpStretch * 0.45,
  );
}

function updatePlayerGroundShadow() {
  if (!playerGroundShadow) return;
  const groundY = sampleTerrainHeight(player.group.position.x, player.group.position.z);
  playerGroundShadow.position.set(player.group.position.x, groundY + 0.035, player.group.position.z);
  alignPlanarMeshToTerrain(playerGroundShadow, player.group.position.x, player.group.position.z);
  const heightFade = THREE.MathUtils.clamp(player.verticalOffset / 2.3, 0, 1);
  const scale = player.radius * (1.15 + heightFade * 0.34);
  playerGroundShadow.scale.set(scale, scale, scale);
  const material = playerGroundShadow.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    material.opacity = 0.34 - heightFade * 0.18;
  }
}

function triggerLandingBonk() {
  let hitCount = 0;
  for (const enemy of enemies) {
    const distance = horizontalDistance(enemy.mesh.position, player.group.position);
    if (distance > playerLandingBonkRadius + enemy.radius) continue;
    const falloff = 1 - THREE.MathUtils.clamp(distance / (playerLandingBonkRadius + enemy.radius), 0, 1);
    const damage = playerLandingBonkDamage * (0.45 + falloff * 0.55) * player.damageMultiplier;
    damageEnemy(enemy, damage, player.group.position, "slam");
    const push = tmpVec.subVectors(enemy.mesh.position, player.group.position);
    push.y = 0;
    if (push.lengthSq() > 0.0001) {
      enemy.mesh.position.addScaledVector(push.normalize(), (0.16 + falloff * 0.16) * player.knockbackMultiplier);
      enemy.velocity.addScaledVector(push, (3.6 + falloff * 3.2) * player.knockbackMultiplier);
    }
    hitCount += 1;
  }

  if (hitCount > 0) {
    cameraShake = Math.max(cameraShake, 0.1);
    spawnLandingBonkEffect(player.group.position, playerLandingBonkRadius * 0.78);
  }
}

function updateMaces(delta: number) {
  if (!ownedWeapons.has("mace")) return;
  weapon.angle += delta * weapon.spinSpeed;
  updateMaceTransforms();

  for (const enemy of enemies) {
    enemy.hitCooldown = Math.max(0, enemy.hitCooldown - delta);
    if (enemy.hitCooldown > 0) continue;

    for (const mace of weapon.maces) {
      const distance = horizontalDistance(enemy.mesh.position, mace.position);
      if (distance <= enemy.radius + weapon.maceRadius * 1.35) {
        damageEnemy(enemy, weapon.damage * player.damageMultiplier, mace.position, "mace");
        enemy.hitCooldown = 0.12;
        break;
      }
    }
  }
}

function updateHammer(delta: number) {
  if (!ownedWeapons.has("hammer")) {
    hammer.group.visible = false;
    return;
  }
  hammer.timer -= delta;

  if (hammer.swingTime <= 0 && hammer.pendingSwings > 0) {
    hammer.pendingSwings -= 1;
    beginHammerSwing(true);
  } else if (hammer.swingTime <= 0 && hammer.timer <= 0) {
    beginHammerSwing(false);
  }

  if (hammer.swingTime <= 0) {
    hammer.group.visible = false;
    return;
  }

  hammer.swingTime -= delta;
  const progress = 1 - THREE.MathUtils.clamp(hammer.swingTime / hammer.duration, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  const arcOffset = THREE.MathUtils.lerp(-hammer.arcWidth, hammer.arcWidth, eased);
  const currentAngle = hammer.directionAngle + arcOffset;

  hammer.group.visible = true;
  hammer.group.position.set(
    player.group.position.x,
    player.group.position.y + 0.96 + Math.sin(progress * Math.PI) * 0.18,
    player.group.position.z,
  );
  hammer.group.rotation.set(0, Math.PI / 2 - currentAngle, Math.sin(progress * Math.PI) * -0.18);

  const attackX = Math.cos(currentAngle);
  const attackZ = Math.sin(currentAngle);
  for (const enemy of enemies) {
    if (hammer.hitEnemies.has(enemy)) continue;

    const toEnemy = tmpVecB.subVectors(enemy.mesh.position, player.group.position);
    toEnemy.y = 0;
    const distance = toEnemy.length();
    if (distance > hammer.radius + enemy.radius || distance < 0.001) continue;

    const alignment = (attackX * toEnemy.x + attackZ * toEnemy.z) / distance;
    if (alignment > 0.38) {
      hammer.hitEnemies.add(enemy);
      damageEnemy(enemy, hammer.damage * player.damageMultiplier, player.group.position, "hammer");
      spawnImpactRing(enemy.mesh.position, 1.25);
    }
  }
}

function beginHammerSwing(isChainSwing: boolean) {
  const target = findNearestEnemy(hammer.radius + 4);
  if (target) {
    const toTarget = tmpVec.subVectors(target.mesh.position, player.group.position);
    hammer.directionAngle = Math.atan2(toTarget.z, toTarget.x);
  } else {
    hammer.directionAngle = Math.PI / 2 - player.group.rotation.y;
  }

  hammer.swingTime = hammer.duration;
  hammer.timer = isChainSwing ? hammer.swingSpacing : hammer.cooldown;
  if (!isChainSwing) {
    hammer.pendingSwings = hammer.swingsPerAttack - 1;
  }
  if (hammer.shockwave) {
    spawnImpactRing(player.group.position, 2.1);
    for (const enemy of enemies) {
      const distance = horizontalDistance(enemy.mesh.position, player.group.position);
      if (distance <= 2.6 + enemy.radius) {
        damageEnemy(enemy, hammer.damage * 0.34 * player.damageMultiplier, player.group.position, "hammer");
      }
    }
  }
  hammer.hitEnemies.clear();
  cameraShake = Math.max(cameraShake, 0.12);
  audio.play("hammer");
}

function findNearestEnemy(maxDistance = Infinity) {
  let nearest: Enemy | undefined;
  let nearestDistance = maxDistance;
  for (const enemy of enemies) {
    const distance = horizontalDistance(enemy.mesh.position, player.group.position);
    if (distance < nearestDistance) {
      nearest = enemy;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function updateRockToss(delta: number) {
  if (!ownedWeapons.has("rock")) return;
  rockToss.timer -= delta;
  if (rockToss.timer > 0) return;

  const target = findNearestEnemy(18);
  if (!target) return;

  const direction = tmpVec.subVectors(target.mesh.position, player.group.position);
  direction.y = 0;
  if (direction.lengthSq() <= 0.001) return;
  direction.normalize();
  spawnProjectile({
    weaponId: "rock",
    geometry: rockProjectileGeometry,
    material: rockMaterial.clone(),
    position: player.group.position.clone().add(new THREE.Vector3(0, 0.78, 0)),
    velocity: direction.multiplyScalar(rockToss.speed),
    damage: rockToss.damage,
    radius: 0.42,
    life: 2.1,
    pierce: rockToss.pierce,
  });
  rockToss.timer = rockToss.cooldown;
}

function updateGroundSlam(delta: number) {
  if (!ownedWeapons.has("slam")) return;
  groundSlam.timer -= delta;
  if (groundSlam.timer > 0) return;

  spawnImpactRing(player.group.position, groundSlam.radius);
  cameraShake = Math.max(cameraShake, 0.34);
  hitStop = Math.max(hitStop, 0.018);
  for (const enemy of enemies) {
    const distance = horizontalDistance(enemy.mesh.position, player.group.position);
    if (distance <= groundSlam.radius + enemy.radius) {
      damageEnemy(enemy, groundSlam.damage * player.damageMultiplier, player.group.position, "slam");
    }
  }
  groundSlam.timer = groundSlam.cooldown;
}

function updateBoomerangAxe(delta: number) {
  if (!ownedWeapons.has("boomerang")) return;
  boomerangAxe.timer -= delta;
  if (boomerangAxe.timer > 0) return;

  const target = findNearestEnemy(20);
  if (!target) return;

  const origin = player.group.position.clone();
  const direction = tmpVec.subVectors(target.mesh.position, origin);
  direction.y = 0;
  if (direction.lengthSq() <= 0.001) return;
  direction.normalize();
  spawnProjectile({
    weaponId: "boomerang",
    geometry: boomerangProjectileGeometry,
    material: axeMaterial.clone(),
    position: origin.clone().add(new THREE.Vector3(0, 0.75, 0)),
    velocity: direction.multiplyScalar(boomerangAxe.speed),
    damage: boomerangAxe.damage,
    radius: 0.55,
    life: 2.6,
    pierce: boomerangAxe.pierce,
    origin,
    maxDistance: boomerangAxe.maxDistance,
  });
  boomerangAxe.timer = boomerangAxe.cooldown;
}

function updateLightningZap(delta: number) {
  if (!ownedWeapons.has("lightning")) return;
  lightningZap.timer -= delta;
  if (lightningZap.timer > 0) return;

  const hit = new Set<Enemy>();
  let source = player.group.position.clone();
  for (let i = 0; i < lightningZap.chains; i += 1) {
    const target = findNearestEnemyFrom(source, lightningZap.range, hit);
    if (!target) break;
    hit.add(target);
    spawnLightningBeam(source, target.mesh.position);
    damageEnemy(target, lightningZap.damage * player.damageMultiplier, source, "lightning");
    source = target.mesh.position.clone();
  }

  if (hit.size > 0) {
    cameraShake = Math.max(cameraShake, 0.12);
    lightningZap.timer = lightningZap.cooldown;
  }
}

function updateProjectiles(delta: number) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    projectile.life -= delta;

    if (projectile.weaponId === "boomerang" && projectile.origin && projectile.maxDistance) {
      const distanceFromOrigin = horizontalDistance(projectile.mesh.position, projectile.origin);
      if (!projectile.returning && distanceFromOrigin >= projectile.maxDistance) {
        projectile.returning = true;
      }
      if (projectile.returning) {
        const toPlayer = tmpVec.subVectors(player.group.position, projectile.mesh.position);
        toPlayer.y = 0;
        if (toPlayer.lengthSq() > 0.001) {
          projectile.velocity.lerp(toPlayer.normalize().multiplyScalar(boomerangAxe.speed), 1 - Math.pow(0.02, delta));
        }
      }
    }

    projectile.mesh.position.addScaledVector(projectile.velocity, delta);
    projectile.mesh.rotation.x += delta * 8;
    projectile.mesh.rotation.y += delta * 10;

    const blockerHit = getTerrainBlockerHit(projectile.mesh.position, projectile.radius);
    if (blockerHit) {
      spawnImpactRing(projectile.mesh.position, 0.72);
      if (projectile.weaponId === "boomerang" && projectile.origin) {
        projectile.returning = true;
        projectile.pierce = Math.max(0, projectile.pierce - 1);
      } else {
        projectile.pierce = 0;
      }
    }

    if (!blockerHit) {
      for (const enemy of enemies) {
        if (projectile.hitEnemies.has(enemy)) continue;
        const distance = horizontalDistance(projectile.mesh.position, enemy.mesh.position);
        if (distance <= projectile.radius + enemy.radius) {
          projectile.hitEnemies.add(enemy);
          projectile.pierce -= 1;
          damageEnemy(enemy, projectile.damage * player.damageMultiplier, projectile.mesh.position, projectile.weaponId);
          if (rockToss.split && projectile.weaponId === "rock") {
            spawnRockSplit(projectile.mesh.position, projectile.velocity);
          }
          if (projectile.pierce <= 0) break;
        }
      }
    }

    const returned =
      projectile.weaponId === "boomerang" &&
      projectile.returning &&
      horizontalDistance(projectile.mesh.position, player.group.position) < 0.85;
    if (projectile.life <= 0 || projectile.pierce <= 0 || returned) {
      removeProjectile(i);
    }
  }
}

function updateHostileProjectiles(delta: number) {
  for (let i = hostileProjectiles.length - 1; i >= 0; i -= 1) {
    const projectile = hostileProjectiles[i];
    projectile.life -= delta;
    projectile.mesh.position.addScaledVector(projectile.velocity, delta);
    projectile.mesh.rotation.x += delta * 7;
    projectile.mesh.rotation.y += delta * 9;

    if (getTerrainBlockerHit(projectile.mesh.position, projectile.radius)) {
      spawnImpactRing(projectile.mesh.position, 0.78);
      cameraShake = Math.max(cameraShake, 0.07);
      removeHostileProjectile(i);
      continue;
    }

    const distance = horizontalDistance(projectile.mesh.position, player.group.position);
    if (distance <= projectile.radius + player.radius) {
      hurtPlayer(projectile.damage);
      spawnImpactRing(projectile.mesh.position, 0.9);
      cameraShake = Math.max(cameraShake, 0.16);
      removeHostileProjectile(i);
      continue;
    }

    if (projectile.life <= 0 || Math.abs(projectile.mesh.position.x) > 90 || Math.abs(projectile.mesh.position.z) > 90) {
      removeHostileProjectile(i);
    }
  }
}

function spawnProjectile(config: {
  weaponId: WeaponId;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  radius: number;
  life: number;
  pierce: number;
  origin?: THREE.Vector3;
  maxDistance?: number;
}) {
  const mesh = new THREE.Mesh(config.geometry, config.material);
  mesh.position.copy(config.position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  projectiles.push({
    mesh,
    velocity: config.velocity.clone(),
    damage: config.damage,
    radius: config.radius,
    life: config.life,
    pierce: config.pierce,
    weaponId: config.weaponId,
    hitEnemies: new Set(),
    origin: config.origin,
    maxDistance: config.maxDistance,
  });
}

function spawnRockSplit(position: THREE.Vector3, velocity: THREE.Vector3) {
  if (Math.random() > 0.35) return;
  const baseAngle = Math.atan2(velocity.z, velocity.x);
  for (const offset of [-0.72, 0.72]) {
    const angle = baseAngle + offset;
    spawnProjectile({
      weaponId: "rock",
      geometry: rockSplitProjectileGeometry,
      material: rockMaterial.clone(),
      position: position.clone(),
      velocity: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(rockToss.speed * 0.82),
      damage: rockToss.damage * 0.45,
      radius: 0.28,
      life: 1.2,
      pierce: 1,
    });
  }
}

function removeProjectile(index: number) {
  const projectile = projectiles[index];
  scene.remove(projectile.mesh);
  projectiles.splice(index, 1);
}

function spawnHostileProjectile(position: THREE.Vector3, velocity: THREE.Vector3, damage: number) {
  const mesh = new THREE.Mesh(hostileProjectileGeometry, enemyShotMaterial.clone());
  mesh.position.copy(position);
  mesh.position.y = position.y + 0.12;
  scene.add(mesh);
  hostileProjectiles.push({
    mesh,
    velocity: velocity.clone(),
    damage,
    radius: 0.36,
    life: 3,
  });
}

function removeHostileProjectile(index: number) {
  const projectile = hostileProjectiles[index];
  scene.remove(projectile.mesh);
  hostileProjectiles.splice(index, 1);
}

function findNearestEnemyFrom(position: THREE.Vector3, maxDistance: number, ignored = new Set<Enemy>()) {
  let nearest: Enemy | undefined;
  let nearestDistance = maxDistance;
  for (const enemy of enemies) {
    if (ignored.has(enemy)) continue;
    const distance = horizontalDistance(enemy.mesh.position, position);
    if (distance < nearestDistance) {
      nearest = enemy;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function spawnLightningBeam(from: THREE.Vector3, to: THREE.Vector3) {
  const midpoint = from.clone().lerp(to, 0.5);
  const length = horizontalDistance(from, to);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(length, 0.06, 0.06), lightningMaterial.clone());
  beam.position.set(midpoint.x, sampleTerrainHeight(midpoint.x, midpoint.z) + 1.05, midpoint.z);
  beam.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
  scene.add(beam);
  particles.push({
    mesh: beam,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0.16,
    maxLife: 0.16,
    gravity: 0,
  });
}

function updateMaceTransforms() {
  const count = weapon.maces.length;
  const bob = Math.sin(runTime * 7) * 0.08;
  for (let i = 0; i < count; i += 1) {
    const angle = weapon.angle + (i / count) * Math.PI * 2;
    const x = player.group.position.x + Math.cos(angle) * weapon.orbitRadius;
    const z = player.group.position.z + Math.sin(angle) * weapon.orbitRadius;
    const mace = weapon.maces[i];
    mace.position.set(x, player.group.position.y + 0.72 + bob, z);
    mace.rotation.x += 0.12;
    mace.rotation.y -= 0.16;
    if (evolutions.fireTrails && Math.random() < 0.34) {
      spawnMaceTrail(mace.position);
    }
  }
}

function updateEnemies(delta: number) {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    const toPlayer = tmpVec.subVectors(player.group.position, enemy.mesh.position);
    toPlayer.y = 0;
    const playerDistance = Math.max(toPlayer.length(), 0.0001);
    const direction = toPlayer.divideScalar(playerDistance);

    if (enemy.kind === "dasher") {
      updateDasherIntent(enemy, direction, playerDistance, delta);
    } else if (enemy.kind === "spitter") {
      updateSpitterIntent(enemy, direction, playerDistance, delta);
    } else if (enemy.kind === "shieldbearer") {
      updateShieldbearerIntent(enemy, direction, playerDistance, delta);
    } else {
      tmpVecB.copy(direction).multiplyScalar(enemy.speed);
      enemy.velocity.lerp(tmpVecB, 1 - Math.pow(0.03, delta));
    }
    slowEnemyForTerrainClimb(enemy);
    enemy.mesh.position.addScaledVector(enemy.velocity, delta);
    enemy.mesh.position.x = THREE.MathUtils.clamp(enemy.mesh.position.x, -72, 72);
    enemy.mesh.position.z = THREE.MathUtils.clamp(enemy.mesh.position.z, -72, 72);
    const targetY = config.enemies[enemy.kind].y + sampleTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z);
    enemy.mesh.position.y = THREE.MathUtils.lerp(enemy.mesh.position.y, targetY, 1 - Math.pow(0.015, delta));
    enemy.mesh.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.z);
    enemy.mesh.rotation.x = Math.sin(runTime * enemy.speed * 0.25) * 0.08;

    if (enemy.flashTime > 0) {
      enemy.flashTime -= delta;
      const material = enemy.mesh.material as THREE.MeshStandardMaterial;
      material.color.lerpColors(enemyFlashColor, enemy.baseColor, 1 - enemy.flashTime / 0.1);
    }

    const touchDistance = enemy.radius + player.radius;
    const verticalSeparation = Math.abs(enemy.mesh.position.y - player.group.position.y);
    if (playerDistance < touchDistance && verticalSeparation < enemyTouchVerticalTolerance) {
      const push = (touchDistance - playerDistance) * 0.55;
      enemy.mesh.position.addScaledVector(direction, -push);
      if (canPlayerSkimEnemy(enemy)) {
        skimEnemy(enemy, direction);
      } else {
        hurtPlayer(enemy.damage * delta);
      }
    }

    if (enemy.hp <= 0) {
      killEnemy(i);
    }
  }
}

function slowEnemyForTerrainClimb(enemy: Enemy) {
  if (!settings.terrainEnabled) return;

  const speed = enemy.velocity.length();
  if (speed <= 0.01) return;

  const directionX = enemy.velocity.x / speed;
  const directionZ = enemy.velocity.z / speed;
  const currentHeight = sampleTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z);
  const lookAhead = enemy.radius + 0.45;
  const aheadX = enemy.mesh.position.x + directionX * lookAhead;
  const aheadZ = enemy.mesh.position.z + directionZ * lookAhead;
  if (
    isTerrainRampAt(enemy.mesh.position.x, enemy.mesh.position.z, enemy.radius) ||
    isTerrainRampAt(aheadX, aheadZ, enemy.radius)
  ) {
    return;
  }

  const aheadHeight = sampleTerrainHeight(aheadX, aheadZ);
  const climb = Math.max(0, aheadHeight - currentHeight);
  let multiplier = climb > 0.08 ? THREE.MathUtils.clamp(1 - climb * 0.12, 0.68, 0.92) : 1;

  for (const blocker of terrainBlockers) {
    const distance = Math.hypot(aheadX - blocker.x, aheadZ - blocker.z);
    if (distance < blocker.collisionRadius + enemy.radius + 0.55) {
      multiplier = Math.min(multiplier, 0.76);
      break;
    }
  }

  if (multiplier < 1) {
    enemy.velocity.multiplyScalar(multiplier);
  }
}

function updateDasherIntent(
  enemy: Enemy,
  direction: THREE.Vector3,
  distance: number,
  delta: number,
) {
  enemy.dashCooldown -= delta;

  if (enemy.dashCharge > 0) {
    enemy.dashCharge -= delta;
    enemy.velocity.multiplyScalar(Math.pow(0.02, delta));
    enemy.mesh.scale.setScalar(1 + Math.sin(runTime * 30) * 0.08);

    if (enemy.dashCharge <= 0) {
      enemy.velocity.copy(direction).multiplyScalar(enemy.speed * 3.2);
      enemy.dashCooldown = 2.2;
      enemy.mesh.scale.setScalar(1);
    }
    return;
  }

  enemy.mesh.scale.setScalar(1);
  if (enemy.dashCooldown <= 0 && distance < 16) {
    enemy.dashCharge = 0.5;
    enemy.velocity.multiplyScalar(0.25);
    return;
  }

  tmpVecB.copy(direction).multiplyScalar(enemy.speed);
  enemy.velocity.lerp(tmpVecB, 1 - Math.pow(0.04, delta));
}

function updateSpitterIntent(
  enemy: Enemy,
  direction: THREE.Vector3,
  distance: number,
  delta: number,
) {
  enemy.attackCooldown -= delta;

  if (enemy.attackCharge > 0) {
    enemy.attackCharge -= delta;
    enemy.velocity.multiplyScalar(Math.pow(0.015, delta));
    enemy.mesh.scale.setScalar(1 + Math.sin(runTime * 26) * 0.07);

    if (enemy.attackCharge <= 0) {
      const shotDirection = tmpVecB.subVectors(enemy.attackTarget, enemy.mesh.position);
      shotDirection.y = 0;
      if (shotDirection.lengthSq() <= 0.001) {
        shotDirection.copy(direction);
      } else {
        shotDirection.normalize();
      }
      spawnHostileProjectile(enemy.mesh.position, shotDirection.multiplyScalar(9.4), enemy.damage);
      spawnImpactRing(enemy.mesh.position, 0.7);
      enemy.attackCooldown = 2.45 + Math.random() * 0.45;
      enemy.mesh.scale.setScalar(1);
    }
    return;
  }

  enemy.mesh.scale.setScalar(1);
  if (enemy.attackCooldown <= 0 && distance < 19) {
    enemy.attackCharge = 0.62;
    enemy.attackTarget.copy(player.group.position);
    enemy.velocity.multiplyScalar(0.2);
    spawnDangerLine(enemy.mesh.position, enemy.attackTarget);
    return;
  }

  tmpVecB.copy(direction).multiplyScalar(enemy.speed * 0.92);
  enemy.velocity.lerp(tmpVecB, 1 - Math.pow(0.035, delta));
}

function updateShieldbearerIntent(
  enemy: Enemy,
  direction: THREE.Vector3,
  distance: number,
  delta: number,
) {
  const speed = distance < 5 ? enemy.speed * 1.25 : enemy.speed;
  tmpVecB.copy(direction).multiplyScalar(speed);
  enemy.velocity.lerp(tmpVecB, 1 - Math.pow(0.045, delta));
  enemy.mesh.scale.set(1.05, 1, 1.05);
  const shieldPlate = enemy.mesh.getObjectByName("shield-plate");
  if (shieldPlate) {
    const recover = 1 - Math.pow(0.03, delta);
    shieldPlate.scale.x = THREE.MathUtils.lerp(shieldPlate.scale.x, 1, recover);
    shieldPlate.scale.y = THREE.MathUtils.lerp(shieldPlate.scale.y, 1, recover);
    shieldPlate.scale.z = THREE.MathUtils.lerp(shieldPlate.scale.z, 1, recover);
  }
}

function canPlayerSkimEnemy(enemy: Enemy) {
  if (player.grounded || player.verticalOffset < playerAirSkimHeight) return false;
  if (enemy.kind === "boss") return false;
  return true;
}

function skimEnemy(enemy: Enemy, directionToPlayer: THREE.Vector3) {
  enemy.velocity.addScaledVector(directionToPlayer, -3.2 * player.knockbackMultiplier);
  enemy.mesh.position.addScaledVector(directionToPlayer, -0.08 * player.knockbackMultiplier);
  enemy.flashTime = Math.max(enemy.flashTime, 0.06);
  if (airSkimEffectCooldown <= 0) {
    spawnAirSkimEffect(enemy.mesh.position);
    airSkimEffectCooldown = 0.11;
  }
}

function spawnAirSkimEffect(position: THREE.Vector3) {
  const material = particleMaterial.clone();
  material.color.set(0x9be9ff);
  material.opacity = 0.72;
  const chip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.11, 0), material);
  chip.position.copy(position);
  chip.position.y = sampleTerrainHeight(chip.position.x, chip.position.z) + 0.58;
  scene.add(chip);
  particles.push({
    mesh: chip,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 3.2,
      1.1 + Math.random() * 0.8,
      (Math.random() - 0.5) * 3.2,
    ),
    life: 0.2,
    maxLife: 0.2,
    gravity: 2.3,
  });
}

function updateGems(delta: number) {
  for (let i = gems.length - 1; i >= 0; i -= 1) {
    const gem = gems[i];
    const toPlayer = tmpVec.subVectors(player.group.position, gem.mesh.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();

    if (distance < player.pickupRadius) {
      const pull = THREE.MathUtils.mapLinear(distance, 0, player.pickupRadius, 25, 7);
      gem.velocity.lerp(toPlayer.normalize().multiplyScalar(pull), 1 - Math.pow(0.02, delta));
    } else {
      gem.velocity.multiplyScalar(Math.pow(0.1, delta));
    }

    gem.mesh.position.addScaledVector(gem.velocity, delta);
    gem.mesh.position.y =
      sampleTerrainHeight(gem.mesh.position.x, gem.mesh.position.z) + 0.38 + Math.sin(runTime * 4 + gem.mesh.id) * 0.08;
    gem.mesh.rotation.y += delta * 2.2;
    gem.mesh.rotation.x += delta * 1.1;

    if (distance < player.radius + 0.42) {
      gainXp(gem.value);
      if (evolutions.pickupPulse) {
        player.pickupPulse = 1;
        spawnImpactRing(player.group.position, 1.5);
      }
      scene.remove(gem.mesh);
      gems.splice(i, 1);
    }
  }
}

function updateParticles(delta: number) {
  trimParticleBudget();
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= delta;
    particle.velocity.y -= delta * (particle.gravity ?? 6);
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    const t = Math.max(particle.life / particle.maxLife, 0);
    particle.mesh.scale.setScalar(0.3 + t * 0.7);
    const material = particle.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = t;
    if (particle.life <= 0) {
      scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      particles.splice(i, 1);
    }
  }
}

function trimParticleBudget() {
  while (particles.length > maxLiveParticles) {
    const particle = particles.shift();
    if (!particle) return;
    scene.remove(particle.mesh);
    particle.mesh.geometry.dispose();
  }
}

function updateCombatOverlays(delta: number) {
  updateEnemyHealthBars();
  combatOverlayTimer -= delta;
  if (combatOverlayTimer <= 0) {
    updateBossBar();
    combatOverlayTimer = 0.05;
  }
  updateFloatingTexts(delta);
}

function updateEnemyHealthBars() {
  for (const enemy of enemies) {
    if (!shouldShowEnemyHealthBar(enemy.kind)) {
      enemy.healthBar.style.display = "none";
      continue;
    }

    screenProjectVector.copy(enemy.mesh.position);
    screenProjectVector.y += enemy.radius * 1.55 + 0.6;
    const projected = projectToScreen(screenProjectVector);
    if (!projected.visible) {
      enemy.healthBar.style.display = "none";
      continue;
    }

    enemy.healthBar.style.display = "block";
    enemy.healthBar.style.transform = `translate3d(${projected.x}px, ${projected.y}px, 0) translate(-50%, -50%)`;
    enemy.healthFill.style.transform = `scaleX(${THREE.MathUtils.clamp(enemy.hp / enemy.maxHp, 0, 1)})`;
  }
}

function shouldShowEnemyHealthBar(kind: EnemyKind) {
  return kind === "heavy" || kind === "shieldbearer";
}

function updateBossBar() {
  const boss = enemies.find((enemy) => enemy.kind === "boss");
  if (!boss) {
    bossBar.classList.add("hidden");
    return;
  }

  bossName.textContent = "Mini-Boss";
  bossFill.style.transform = `scaleX(${THREE.MathUtils.clamp(boss.hp / boss.maxHp, 0, 1)})`;
  bossBar.classList.remove("hidden");
}

function updateFloatingTexts(delta: number) {
  for (let i = floatingTexts.length - 1; i >= 0; i -= 1) {
    const text = floatingTexts[i];
    text.life -= delta;
    text.position.addScaledVector(text.velocity, delta);
    const projected = projectToScreen(text.position);
    const t = Math.max(text.life / text.maxLife, 0);

    if (!projected.visible || text.life <= 0) {
      text.element.remove();
      floatingTexts.splice(i, 1);
      continue;
    }

    text.element.style.left = `${projected.x}px`;
    text.element.style.top = `${projected.y}px`;
    text.element.style.opacity = String(t);
    text.element.style.transform = `translate(-50%, -50%) scale(${0.82 + (1 - t) * 0.34})`;
  }
}

function spawnDamageNumber(position: THREE.Vector3, amount: number, big = false) {
  if (!settings.damageNumbers) return;
  while (floatingTexts.length >= maxFloatingTexts) {
    const oldest = floatingTexts.shift();
    oldest?.element.remove();
  }
  const element = document.createElement("div");
  element.className = `damage-number ${big ? "big" : ""}`;
  element.textContent = String(Math.ceil(amount));
  combatLayer.append(element);
  floatingTexts.push({
    element,
    position: position.clone().add(new THREE.Vector3(0, 1.25 + Math.random() * 0.3, 0)),
    velocity: new THREE.Vector3((Math.random() - 0.5) * 0.55, 1.8 + Math.random() * 0.6, 0),
    life: 0.72,
    maxLife: 0.72,
  });
}

function projectToScreen(position: THREE.Vector3) {
  const projected = screenProjectVector.copy(position).project(camera);
  const visible =
    projected.z > -1 &&
    projected.z < 1 &&
    projected.x > -1.2 &&
    projected.x < 1.2 &&
    projected.y > -1.2 &&
    projected.y < 1.2;
  screenProjection.x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  screenProjection.y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  screenProjection.visible = visible;
  return screenProjection;
}

function spawnEnemies() {
  const wave = getWaveConfig(runTime);
  if (wave.name !== currentWaveName) {
    showToast(wave.name);
  }
  currentWaveName = wave.name;
  const targetCount = Math.min(wave.targetCount + Math.floor(runTime / 5), 190);
  const spawnDelay = Math.max(0.13, wave.spawnDelay - runTime * 0.0015);

  if (spawnTimer <= 0 && enemies.length < targetCount) {
    const count = wave.batchSize;
    for (let i = 0; i < count; i += 1) {
      spawnEnemy(pickEnemyKind(wave.weights));
    }
    spawnTimer = spawnDelay;
  }

  if (eliteTimer <= 0) {
    spawnEnemy(wave.eliteKind);
    eliteTimer = wave.eliteDelay;
  }

  if (runTime >= nextBossTime && runTime >= config.waves.firstBossTime) {
    const boss = spawnEnemy("boss");
    spawnImpactRing(boss.mesh.position, 4.8);
    showToast("Boss Incoming");
    audio.play("bossSpawn");
    nextBossTime += config.waves.bossInterval;
    bossWarningShown = false;
    spawnTimer = Math.min(spawnTimer, 0.2);
  }
}

function updateBossWarning() {
  if (bossWarningShown || nextBossTime < config.waves.firstBossTime) return;
  const timeUntilBoss = nextBossTime - runTime;
  if (timeUntilBoss > 0 && timeUntilBoss <= 10) {
    bossWarningShown = true;
    showToast("Boss Incoming");
    audio.play("bossSpawn");
  }
}

function pickEnemyKind(weights: Array<[EnemyKind, number]>) {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [kind, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return weights[0][0];
}

function spawnEnemy(kind: EnemyKind) {
  const position = getEnemySpawnPosition(kind);

  const minutes = runTime / 60;
  const scaling = 1 + minutes * 0.7;
  const enemyConfig = config.enemies[kind];
  const geometry = enemyGeometryByKind[kind];
  const material = createEnemyMaterial(kind);
  const hp = enemyConfig.hp * scaling;
  const speed = enemyConfig.speed + minutes * 0.25;
  const radius = enemyConfig.radius;
  const damage = enemyConfig.damage;
  const xp = enemyConfig.xp;
  const y = enemyConfig.y;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.position.y = y + sampleTerrainHeight(mesh.position.x, mesh.position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (kind === "shieldbearer") {
    const shieldPlate = new THREE.Mesh(shieldPlateGeometry, shieldPlateMaterial.clone());
    shieldPlate.name = "shield-plate";
    shieldPlate.position.set(0, 0.12, 0.85);
    shieldPlate.castShadow = true;
    shieldPlate.receiveShadow = true;
    mesh.add(shieldPlate);
  }
  scene.add(mesh);
  const { healthBar, healthFill: enemyHealthFill } = createEnemyHealthBar(kind);

  const enemy: Enemy = {
    kind,
    mesh,
    healthBar,
    healthFill: enemyHealthFill,
    velocity: new THREE.Vector3(),
    hp,
    maxHp: hp,
    speed,
    radius,
    damage,
    xp,
    hitCooldown: 0,
    flashTime: 0,
    dashCharge: 0,
    dashCooldown: kind === "dasher" ? 1.2 : 0,
    attackCharge: 0,
    attackCooldown: kind === "spitter" ? 1.1 + Math.random() * 0.8 : 0,
    attackTarget: new THREE.Vector3(),
    baseColor: material.color.clone(),
  };
  enemies.push(enemy);
  return enemy;
}

function createEnemyMaterial(kind: EnemyKind) {
  switch (kind) {
    case "heavy":
      return heavyMaterial.clone();
    case "swarmer":
      return swarmerMaterial.clone();
    case "dasher":
      return dasherMaterial.clone();
    case "spitter":
      return spitterMaterial.clone();
    case "shieldbearer":
      return shieldbearerMaterial.clone();
    case "boss":
      return bossMaterial.clone();
    case "basic":
      return enemyMaterial.clone();
  }
}

function getEnemySpawnPosition(kind: EnemyKind) {
  const enemyRadius = config.enemies[kind].radius;
  const minDistance = kind === "boss" ? bossSpawnRingMinDistance : enemySpawnRingMinDistance;
  const maxDistance = kind === "boss" ? bossSpawnRingMaxDistance : enemySpawnRingMaxDistance;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = THREE.MathUtils.lerp(minDistance, maxDistance, Math.random());
    const candidate = new THREE.Vector3(
      player.group.position.x + Math.cos(angle) * distance,
      0,
      player.group.position.z + Math.sin(angle) * distance,
    );
    if (!isSpawnPositionInWorld(candidate, enemyRadius)) continue;
    if (!getTerrainBlockerHit(candidate, enemyRadius)) {
      return candidate;
    }
  }

  const fallbackAngle = Math.atan2(-player.group.position.z, -player.group.position.x) + (Math.random() - 0.5) * 1.4;
  const fallback = new THREE.Vector3(
    player.group.position.x + Math.cos(fallbackAngle) * minDistance,
    0,
    player.group.position.z + Math.sin(fallbackAngle) * minDistance,
  );
  clampSpawnPositionToWorld(fallback, enemyRadius);
  return getNearestUnblockedPosition(fallback, enemyRadius);
}

function isSpawnPositionInWorld(position: THREE.Vector3, radius: number) {
  const limit = enemySpawnWorldLimit - radius;
  return Math.abs(position.x) <= limit && Math.abs(position.z) <= limit;
}

function clampSpawnPositionToWorld(position: THREE.Vector3, radius: number) {
  const limit = enemySpawnWorldLimit - radius;
  position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
  position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
}

function getNearestUnblockedPosition(position: THREE.Vector3, radius: number) {
  let hit = getTerrainBlockerHit(position, radius);
  let attempts = 0;
  while (hit && attempts < terrainBlockers.length + terrainLedgeWalls.length) {
    const resolved = resolveTerrainBlockers(position, radius, undefined, 1);
    if (!resolved) break;
    hit = getTerrainBlockerHit(position, radius);
    attempts += 1;
  }
  clampSpawnPositionToWorld(position, radius);
  return position;
}

function createEnemyHealthBar(kind: EnemyKind) {
  const healthBar = document.createElement("div");
  healthBar.className = `enemy-bar ${
    kind === "boss" ? "boss" : kind === "heavy" || kind === "shieldbearer" ? "elite" : ""
  }`;
  const healthFillEl = document.createElement("b");
  healthBar.append(healthFillEl);
  combatLayer.append(healthBar);
  return { healthBar, healthFill: healthFillEl };
}

function damageEnemy(enemy: Enemy, amount: number, source: THREE.Vector3, weaponId: WeaponId) {
  const finalAmount = applyEnemyDamageRules(enemy, amount, source, weaponId);
  recordWeaponDamage(weaponId, Math.min(finalAmount, Math.max(enemy.hp, 0)));
  enemy.hp -= finalAmount;
  audio.play("hit");
  enemy.flashTime = 0.1;
  spawnDamageNumber(enemy.mesh.position, finalAmount, enemy.kind === "boss" || finalAmount > 70);
  const knock = tmpVec.subVectors(enemy.mesh.position, source);
  knock.y = 0;
  if (knock.lengthSq() > 0) {
    enemy.mesh.position.addScaledVector(knock.normalize(), 0.22 * player.knockbackMultiplier);
    enemy.velocity.addScaledVector(knock, 2.7 * player.knockbackMultiplier);
  }
  cameraShake = Math.max(cameraShake, 0.08);
  applyHitStop(weaponId, enemy.hp <= 0);
  spawnImpactRing(enemy.mesh.position, enemy.hp <= 0 ? 1.7 : 1);
  spawnHitParticles(enemy.mesh.position, enemy.hp <= 0 ? 10 : 4);
}

function applyEnemyDamageRules(enemy: Enemy, amount: number, source: THREE.Vector3, weaponId: WeaponId) {
  if (enemy.kind !== "shieldbearer" || weaponId === "slam" || weaponId === "lightning") {
    return amount;
  }

  const toPlayer = tmpVecB.subVectors(player.group.position, enemy.mesh.position);
  toPlayer.y = 0;
  const toSource = tmpVec.subVectors(source, enemy.mesh.position);
  toSource.y = 0;
  if (toPlayer.lengthSq() <= 0.001 || toSource.lengthSq() <= 0.001) return amount;

  const frontDot = toPlayer.normalize().dot(toSource.normalize());
  if (frontDot <= 0.35) return amount;

  spawnImpactRing(enemy.mesh.position, 0.78);
  const shieldPlate = enemy.mesh.getObjectByName("shield-plate");
  if (shieldPlate) {
    shieldPlate.scale.set(1.14, 1.14, 1.14);
  }
  return amount * 0.42;
}

function applyHitStop(weaponId: WeaponId, killed: boolean) {
  if (killed) {
    hitStop = Math.max(hitStop, weaponId === "mace" || weaponId === "lightning" ? 0.018 : 0.025);
    return;
  }

  if (weaponId === "mace" || weaponId === "lightning") return;
  hitStop = Math.max(hitStop, weaponId === "hammer" || weaponId === "slam" ? 0.012 : 0.008);
}

function recordWeaponDamage(weaponId: WeaponId, amount: number) {
  weaponDamage.set(weaponId, (weaponDamage.get(weaponId) ?? 0) + Math.max(0, amount));
}

function killEnemy(index: number) {
  const enemy = enemies[index];
  kills += 1;
  dropXp(enemy.mesh.position, enemy.xp);
  const killedBoss = enemy.kind === "boss";
  if (enemy.kind === "boss") {
    bossesDefeated += 1;
    runCoins += 25;
    audio.play("bossDeath");
    dropBossReward(enemy.mesh.position);
    spawnHitParticles(enemy.mesh.position, 44);
    spawnImpactRing(enemy.mesh.position, 3.6);
    cameraShake = Math.max(cameraShake, 0.7);
    hitStop = Math.max(hitStop, 0.08);
  } else {
    spawnHitParticles(enemy.mesh.position, enemy.kind === "heavy" ? 24 : 14);
  }
  scene.remove(enemy.mesh);
  enemy.healthBar.remove();
  enemies.splice(index, 1);
  cameraShake = Math.max(cameraShake, 0.18);
  if (killedBoss) {
    showToast("Boss Defeated");
    showLevelUp("Boss Reward");
  }
}

function dropXp(position: THREE.Vector3, value: number) {
  const gem = new THREE.Mesh(gemGeometry, gemMaterial.clone());
  gem.position.copy(position);
  gem.position.y = sampleTerrainHeight(gem.position.x, gem.position.z) + 0.42;
  gem.scale.setScalar(value >= 10 ? 1.75 : value >= 5 ? 1.28 : 1);
  gem.castShadow = true;
  scene.add(gem);
  gems.push({
    mesh: gem,
    value,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      0,
      (Math.random() - 0.5) * 3,
    ),
  });
}

function dropBossReward(position: THREE.Vector3) {
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const rewardPosition = position
      .clone()
      .add(new THREE.Vector3(Math.cos(angle) * 1.2, 0, Math.sin(angle) * 1.2));
    dropXp(rewardPosition, i === 0 ? 18 : 8);
  }
}

function spawnImpactRing(position: THREE.Vector3, scale = 1) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.56, 32), impactMaterial.clone());
  ring.position.copy(position);
  ring.position.y = sampleTerrainHeight(ring.position.x, ring.position.z) + 0.08;
  alignPlanarMeshToTerrain(ring, ring.position.x, ring.position.z);
  ring.scale.setScalar(scale);
  scene.add(ring);
  particles.push({
    mesh: ring,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0.28,
    maxLife: 0.28,
    gravity: 0,
  });
}

function spawnLedgeImpactEffect(collision: TerrainCollisionInfo, speed: number) {
  if (settings.reduceParticles && Math.random() < 0.35) return;
  const x = collision.x + collision.normalX * 0.08;
  const z = collision.z + collision.normalZ * 0.08;
  const tangentX = -collision.normalZ;
  const tangentZ = collision.normalX;
  const slashMaterial = impactMaterial.clone();
  slashMaterial.color.set(0xf1d46f);
  slashMaterial.opacity = 0.5;
  const slash = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.035, 0.055), slashMaterial);
  slash.position.set(x, sampleTerrainHeight(x, z) + 0.42, z);
  slash.rotation.y = Math.atan2(tangentX, tangentZ);
  scene.add(slash);
  particles.push({
    mesh: slash,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0.16,
    maxLife: 0.16,
    gravity: 0,
  });

  const chipCount = settings.reduceParticles ? 2 : 5;
  const chipSpeed = THREE.MathUtils.clamp(speed * 0.28, 0.8, 2.2);
  for (let i = 0; i < chipCount; i += 1) {
    const side = (Math.random() - 0.5) * 1.2;
    const material = particleMaterial.clone();
    material.color.set(0x9a946b);
    material.opacity = 0.72;
    const chip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07 + Math.random() * 0.04, 0), material);
    chip.position.set(
      x + tangentX * side * 0.24,
      sampleTerrainHeight(x, z) + 0.28 + Math.random() * 0.18,
      z + tangentZ * side * 0.24,
    );
    scene.add(chip);
    particles.push({
      mesh: chip,
      velocity: new THREE.Vector3(
        collision.normalX * (chipSpeed + Math.random() * 0.8) + tangentX * side,
        0.35 + Math.random() * 0.45,
        collision.normalZ * (chipSpeed + Math.random() * 0.8) + tangentZ * side,
      ),
      life: 0.2 + Math.random() * 0.1,
      maxLife: 0.3,
      gravity: 2,
    });
  }
}

function spawnLedgeDropEffect(position: THREE.Vector3, previousGroundHeight: number) {
  if (settings.reduceParticles && Math.random() < 0.55) return;
  const material = impactMaterial.clone();
  material.color.set(0xbfc38a);
  material.opacity = 0.32;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.46, 24), material);
  ring.position.set(position.x, previousGroundHeight + 0.05, position.z);
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  particles.push({
    mesh: ring,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0.18,
    maxLife: 0.18,
    gravity: 0,
  });
}

function spawnLandingBonkEffect(position: THREE.Vector3, radius: number) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.52, radius, 36), landingBonkMaterial.clone());
  ring.position.copy(position);
  ring.position.y = sampleTerrainHeight(ring.position.x, ring.position.z) + 0.13;
  alignPlanarMeshToTerrain(ring, ring.position.x, ring.position.z);
  scene.add(ring);
  particles.push({
    mesh: ring,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0.24,
    maxLife: 0.24,
    gravity: 0,
  });

  const sparks = settings.reduceParticles ? 2 : 5;
  for (let i = 0; i < sparks; i += 1) {
    const angle = (i / sparks) * Math.PI * 2 + Math.random() * 0.25;
    const sparkMaterial = particleMaterial.clone();
    sparkMaterial.color.set(0xffcf5f);
    sparkMaterial.opacity = 0.62;
    const spark = new THREE.Mesh(new THREE.TetrahedronGeometry(0.075, 0), sparkMaterial);
    const sparkX = position.x + Math.cos(angle) * radius * 0.28;
    const sparkZ = position.z + Math.sin(angle) * radius * 0.28;
    spark.position.set(sparkX, sampleTerrainHeight(sparkX, sparkZ) + 0.18, sparkZ);
    scene.add(spark);
    particles.push({
      mesh: spark,
      velocity: new THREE.Vector3(
        Math.cos(angle) * (1.7 + Math.random() * 1.2),
        0.36 + Math.random() * 0.48,
        Math.sin(angle) * (1.7 + Math.random() * 1.2),
      ),
      life: 0.14 + Math.random() * 0.08,
      maxLife: 0.22,
      gravity: 2.2,
    });
  }
}

function spawnMaceTrail(position: THREE.Vector3) {
  if (settings.reduceParticles && Math.random() < 0.65) return;
  const trail = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), trailMaterial.clone());
  trail.position.copy(position);
  trail.position.y = sampleTerrainHeight(trail.position.x, trail.position.z) + 0.1;
  alignPlanarMeshToTerrain(trail, trail.position.x, trail.position.z);
  scene.add(trail);
  particles.push({
    mesh: trail,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0.22,
    maxLife: 0.22,
    gravity: 0,
  });
}

function spawnDangerLine(from: THREE.Vector3, to: THREE.Vector3) {
  const midpoint = from.clone().lerp(to, 0.5);
  const length = horizontalDistance(from, to);
  if (length <= 0.01) return;
  const line = new THREE.Mesh(new THREE.BoxGeometry(length, 0.035, 0.035), dangerTelegraphMaterial.clone());
  line.position.set(midpoint.x, sampleTerrainHeight(midpoint.x, midpoint.z) + 0.12, midpoint.z);
  alignLineMeshToTerrain(line, midpoint.x, midpoint.z, to.x - from.x, to.z - from.z);
  scene.add(line);
  particles.push({
    mesh: line,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0.62,
    maxLife: 0.62,
    gravity: 0,
  });
}

function spawnDashBurst(position: THREE.Vector3) {
  if (settings.reduceParticles && Math.random() < 0.65) return;
  const material = particleMaterial.clone();
  material.color.set(0x78edf2);
  material.opacity = 0.72;
  const burst = new THREE.Mesh(new THREE.TetrahedronGeometry(0.1, 0), material);
  burst.position.copy(position);
  burst.position.y = sampleTerrainHeight(burst.position.x, burst.position.z) + 0.18;
  scene.add(burst);
  particles.push({
    mesh: burst,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2.4,
      0.6 + Math.random() * 0.6,
      (Math.random() - 0.5) * 2.4,
    ),
    life: 0.28,
    maxLife: 0.28,
    gravity: 1.5,
  });
}

function spawnSlopeJumpEffect(position: THREE.Vector3, lift: number) {
  if (settings.reduceParticles && Math.random() < 0.45) return;
  const material = particleMaterial.clone();
  material.color.set(0x8ff2d0);
  material.opacity = 0.78;
  const count = THREE.MathUtils.clamp(Math.round(3 + (lift - 1) * 18), 3, 7);
  const speed = player.velocity.length();
  const forwardX = speed > 0.01 ? player.velocity.x / speed : Math.sin(player.group.rotation.y);
  const forwardZ = speed > 0.01 ? player.velocity.z / speed : Math.cos(player.group.rotation.y);
  const sideX = -forwardZ;
  const sideZ = forwardX;
  for (let i = 0; i < count; i += 1) {
    const side = (i - (count - 1) * 0.5) / Math.max(1, count - 1);
    const spark = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09, 0), material.clone());
    const sparkX = position.x - forwardX * 0.35 + sideX * side * 0.65;
    const sparkZ = position.z - forwardZ * 0.35 + sideZ * side * 0.65;
    spark.position.set(sparkX, sampleTerrainHeight(sparkX, sparkZ) + 0.16, sparkZ);
    scene.add(spark);
    particles.push({
      mesh: spark,
      velocity: new THREE.Vector3(
        -forwardX * (1.8 + lift) + sideX * side * 1.2,
        0.75 + (lift - 1) * 1.4,
        -forwardZ * (1.8 + lift) + sideZ * side * 1.2,
      ),
      life: 0.24,
      maxLife: 0.24,
      gravity: 1.8,
    });
  }
}

function spawnJumpDust(position: THREE.Vector3, scale = 1) {
  if (settings.reduceParticles && Math.random() < 0.45) return;
  const ringMaterial = impactMaterial.clone();
  ringMaterial.color.set(0xd8d2a7);
  ringMaterial.opacity = 0.38;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.52, 28), ringMaterial);
  ring.position.copy(position);
  ring.position.y = sampleTerrainHeight(ring.position.x, ring.position.z) + 0.065;
  alignPlanarMeshToTerrain(ring, ring.position.x, ring.position.z);
  ring.scale.setScalar(scale);
  scene.add(ring);
  particles.push({
    mesh: ring,
    velocity: new THREE.Vector3(0, 0, 0),
    life: 0.22,
    maxLife: 0.22,
    gravity: 0,
  });

  const count = settings.reduceParticles ? 3 : 7;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dustMaterial = particleMaterial.clone();
    dustMaterial.color.set(0xb5b08d);
    dustMaterial.opacity = 0.52;
    const dust = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07 + Math.random() * 0.04, 0), dustMaterial);
    const dustX = position.x + Math.cos(angle) * 0.35 * scale;
    const dustZ = position.z + Math.sin(angle) * 0.35 * scale;
    dust.position.set(dustX, sampleTerrainHeight(dustX, dustZ) + 0.12, dustZ);
    scene.add(dust);
    particles.push({
      mesh: dust,
      velocity: new THREE.Vector3(
        Math.cos(angle) * (1.1 + Math.random() * 1.4) * scale,
        0.35 + Math.random() * 0.35,
        Math.sin(angle) * (1.1 + Math.random() * 1.4) * scale,
      ),
      life: 0.2 + Math.random() * 0.12,
      maxLife: 0.32,
      gravity: 1.8,
    });
  }
}

function spawnHitParticles(position: THREE.Vector3, count: number) {
  const particleCount = settings.reduceParticles ? Math.ceil(count * 0.35) : count;
  for (let i = 0; i < particleCount; i += 1) {
    const particle = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12, 0), particleMaterial.clone());
    particle.position.copy(position);
    particle.position.y += 0.45;
    scene.add(particle);
    particles.push({
      mesh: particle,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        2 + Math.random() * 4,
        (Math.random() - 0.5) * 8,
      ),
      life: 0.32 + Math.random() * 0.22,
      maxLife: 0.54,
    });
  }
}

function hurtPlayer(amount: number) {
  player.health = Math.max(0, player.health - amount);
  playerDamageFlashTimer = playerDamageFlashDuration;
  cameraShake = Math.max(cameraShake, 0.22);
  if (hurtSoundCooldown <= 0 && player.health > 0) {
    audio.play("hurt");
    hurtSoundCooldown = 0.42;
  }
  if (player.health <= 0 && gameMode === "running") {
    die();
  }
}

function updatePlayerDamageFlash(delta: number) {
  if (!playerBodyMaterial || !playerFaceMaterial) return;

  playerDamageFlashTimer = Math.max(0, playerDamageFlashTimer - delta);
  const flash = playerDamageFlashTimer / playerDamageFlashDuration;
  const intensity = Math.pow(flash, 0.55);
  for (const material of [playerBodyMaterial, playerFaceMaterial]) {
    material.emissive.setRGB(intensity, 0, 0);
    material.emissiveIntensity = 1.35 * intensity;
  }
}

function gainXp(amount: number) {
  player.xp += amount;
  audio.play("pickup");
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.floor(player.xpToNext * 1.22 + 6);
    audio.play("level");
    showLevelUp("Pick a power");
    break;
  }
}

function showLevelUp(title = "Pick a power") {
  restorePointerLockAfterLevelUp = document.pointerLockElement === canvas;
  gameMode = "level-up";
  releaseCameraPointerLock();
  levelUpOverlay.classList.remove("hidden");
  levelUpTitle.textContent = title;
  currentLevelChoices = pickUpgrades(3);
  renderLevelUpChoices();
}

function renderLevelUpChoices() {
  upgradeCards.innerHTML = "";
  for (const upgrade of currentLevelChoices) {
    const card = document.createElement("button");
    card.className = "upgrade-card";
    card.type = "button";
    card.innerHTML = `
      <span class="upgrade-icon" aria-hidden="true">${upgrade.icon}</span>
      <h2>${upgrade.title}</h2>
      <p>${upgrade.description}</p>
    `;
    card.addEventListener("click", () => chooseUpgrade(upgrade));
    upgradeCards.append(card);
  }
  rerollButton.textContent = `Reroll (${rerollsRemaining})`;
  rerollButton.disabled = rerollsRemaining <= 0;
  skipButton.textContent = "Skip (+5 coins, heal)";
}

function chooseUpgrade(upgrade: Upgrade) {
  upgrade.apply();
  recordUpgrade(upgrade.id, upgrade.title);
  syncMaces();
  updateWeaponVisuals();
  levelUpOverlay.classList.add("hidden");
  gameMode = "running";
  updateHud();
  restoreLevelUpPointerLock();
}

function rerollLevelUpChoices() {
  if (gameMode !== "level-up" || rerollsRemaining <= 0) return;
  rerollsRemaining -= 1;
  currentLevelChoices = pickUpgrades(3);
  renderLevelUpChoices();
}

function skipLevelUpChoice() {
  if (gameMode !== "level-up") return;
  runCoins += 5;
  player.health = Math.min(player.maxHealth, player.health + Math.ceil(player.maxHealth * 0.18));
  levelUpOverlay.classList.add("hidden");
  gameMode = "running";
  showToast("+5 Coins");
  updateHud();
  restoreLevelUpPointerLock();
}

function pickUpgrades(count: number) {
  const upgrades: Upgrade[] = [
    {
      id: "unlock-hammer",
      title: "Unlock Bonk Hammer",
      icon: "H",
      description: "Adds a heavy auto-swinging close-range hammer.",
      available: () => !ownedWeapons.has("hammer"),
      apply: () => unlockWeapon("hammer"),
    },
    {
      id: "unlock-rock",
      title: "Unlock Rock Toss",
      icon: "R",
      description: "Auto-throws chunky rocks at nearby enemies.",
      available: () => !ownedWeapons.has("rock"),
      apply: () => unlockWeapon("rock"),
    },
    {
      id: "unlock-slam",
      title: "Unlock Ground Slam",
      icon: "S",
      description: "Periodically blasts enemies around you.",
      available: () => !ownedWeapons.has("slam"),
      apply: () => unlockWeapon("slam"),
    },
    {
      id: "unlock-boomerang",
      title: "Unlock Boomerang Axe",
      icon: "B",
      description: "Throws a returning axe through crowds.",
      available: () => !ownedWeapons.has("boomerang"),
      apply: () => unlockWeapon("boomerang"),
    },
    {
      id: "unlock-lightning",
      title: "Unlock Lightning Zap",
      icon: "L",
      description: "Chains lightning through nearby enemies.",
      available: () => !ownedWeapons.has("lightning"),
      apply: () => unlockWeapon("lightning"),
    },
    {
      id: "mace-count",
      title: "+1 Orbiting Mace",
      icon: "O",
      description: "Adds another chunky mace to the orbit.",
      available: () => ownedWeapons.has("mace"),
      apply: () => {
        weapon.maceCount = Math.min(weapon.maceCount + 1, config.weapons.mace.maxCount);
      },
    },
    {
      id: "mace-radius",
      title: "+12% Mace Orbit",
      icon: "O",
      description: "Maces sweep a wider circle around you.",
      available: () => ownedWeapons.has("mace"),
      apply: () => {
        weapon.orbitRadius *= 1.12;
      },
    },
    {
      id: "mace-fire-damage",
      title: "Hotter Maces",
      icon: "F",
      description: "Fire-trail maces hit harder.",
      available: () => evolutions.fireTrails,
      apply: () => {
        weapon.damage *= 1.18;
        evolutions.damageGlow = true;
      },
    },
    {
      id: "hammer-arc",
      title: "+18% Hammer Arc",
      icon: "A",
      description: "Hammer swings cover a wider angle.",
      available: () => ownedWeapons.has("hammer"),
      apply: () => {
        hammer.arcWidth *= 1.18;
      },
    },
    {
      id: "hammer-cooldown",
      title: "-15% Hammer Cooldown",
      icon: "!",
      description: "The Bonk Hammer swings more often.",
      available: () => ownedWeapons.has("hammer"),
      apply: () => {
        hammer.cooldown *= 0.85;
      },
    },
    {
      id: "hammer-shockwave",
      title: "Hammer Shockwave",
      icon: "~",
      description: "Hammer swings emit a short-range pulse.",
      available: () => ownedWeapons.has("hammer") && !hammer.shockwave,
      apply: () => {
        hammer.shockwave = true;
      },
    },
    {
      id: "rock-pierce",
      title: "+1 Rock Pierce",
      icon: "R",
      description: "Rock Toss punches through one more enemy.",
      available: () => ownedWeapons.has("rock"),
      apply: () => {
        rockToss.pierce += 1;
      },
    },
    {
      id: "rock-split",
      title: "Splitting Rocks",
      icon: "Y",
      description: "Some rocks split into smaller side rocks.",
      available: () => ownedWeapons.has("rock") && !rockToss.split,
      apply: () => {
        rockToss.split = true;
      },
    },
    {
      id: "rock-speed",
      title: "+20% Rock Speed",
      icon: ">",
      description: "Thrown rocks fly faster and farther.",
      available: () => ownedWeapons.has("rock"),
      apply: () => {
        rockToss.speed *= 1.2;
      },
    },
    {
      id: "slam-radius",
      title: "+20% Slam Radius",
      icon: "S",
      description: "Ground Slam reaches a wider area.",
      available: () => ownedWeapons.has("slam"),
      apply: () => {
        groundSlam.radius *= 1.2;
      },
    },
    {
      id: "slam-cooldown",
      title: "-18% Slam Cooldown",
      icon: "S",
      description: "Ground Slam fires more often.",
      available: () => ownedWeapons.has("slam"),
      apply: () => {
        groundSlam.cooldown *= 0.82;
      },
    },
    {
      id: "slam-damage",
      title: "+25% Slam Damage",
      icon: "S",
      description: "Ground Slam hits harder.",
      available: () => ownedWeapons.has("slam"),
      apply: () => {
        groundSlam.damage *= 1.25;
      },
    },
    {
      id: "axe-pierce",
      title: "+2 Axe Pierce",
      icon: "B",
      description: "Boomerang Axe cuts through more enemies.",
      available: () => ownedWeapons.has("boomerang"),
      apply: () => {
        boomerangAxe.pierce += 2;
      },
    },
    {
      id: "axe-range",
      title: "+20% Axe Range",
      icon: "B",
      description: "Boomerang Axe travels farther before returning.",
      available: () => ownedWeapons.has("boomerang"),
      apply: () => {
        boomerangAxe.maxDistance *= 1.2;
      },
    },
    {
      id: "axe-cooldown",
      title: "-15% Axe Cooldown",
      icon: "B",
      description: "Boomerang Axe launches more often.",
      available: () => ownedWeapons.has("boomerang"),
      apply: () => {
        boomerangAxe.cooldown *= 0.85;
      },
    },
    {
      id: "lightning-chain",
      title: "+1 Lightning Chain",
      icon: "L",
      description: "Lightning Zap jumps to one more enemy.",
      available: () => ownedWeapons.has("lightning"),
      apply: () => {
        lightningZap.chains += 1;
      },
    },
    {
      id: "lightning-range",
      title: "+20% Zap Range",
      icon: "L",
      description: "Lightning finds targets from farther away.",
      available: () => ownedWeapons.has("lightning"),
      apply: () => {
        lightningZap.range *= 1.2;
      },
    },
    {
      id: "lightning-cooldown",
      title: "-15% Zap Cooldown",
      icon: "L",
      description: "Lightning Zap fires more often.",
      available: () => ownedWeapons.has("lightning"),
      apply: () => {
        lightningZap.cooldown *= 0.85;
      },
    },
    {
      id: "damage",
      title: "+20% Damage",
      icon: "X",
      description: "All weapon hits land harder and burn brighter.",
      apply: () => {
        player.damageMultiplier *= 1.2;
        evolutions.damageGlow = true;
      },
    },
    {
      id: "spin-speed",
      title: "+15% Spin Speed",
      icon: ">",
      description: "Orbiting maces sweep crowds faster and leave fire trails.",
      apply: () => {
        weapon.spinSpeed *= 1.15;
        evolutions.fireTrails = true;
      },
    },
    {
      id: "move-speed",
      title: "+10% Move Speed",
      icon: "^",
      description: "Move faster and leave a dash burst while moving.",
      apply: () => {
        player.speed *= 1.1;
        evolutions.dashBurst = true;
      },
    },
    {
      id: "pickup-radius",
      title: "+25% Pickup Radius",
      icon: "+",
      description: "XP gems start flying sooner and pulse on pickup.",
      apply: () => {
        player.pickupRadius *= 1.25;
        evolutions.pickupPulse = true;
      },
    },
    {
      id: "max-health",
      title: "+20 Max Health",
      icon: "H",
      description: "Increase max health and heal by 20.",
      apply: () => {
        player.maxHealth += 20;
        player.health = Math.min(player.maxHealth, player.health + 20);
      },
    },
    {
      id: "knockback",
      title: "+15% Knockback",
      icon: "<",
      description: "Hits shove enemies away harder and the hammer double-swings.",
      apply: () => {
        player.knockbackMultiplier *= 1.15;
        hammer.swingsPerAttack = 2;
      },
    },
    {
      id: "attack-size",
      title: "+10% Attack Size",
      icon: "*",
      description: "Maces and hammer swings grow to cover more space.",
      apply: () => {
        weapon.maceRadius *= 1.1;
        weapon.orbitRadius *= 1.05;
        hammer.radius *= 1.1;
        for (const mace of weapon.maces) {
          mace.scale.multiplyScalar(1.1);
        }
      },
    },
  ];

  const valid = upgrades.filter((upgrade) => {
    if (upgrade.id === "mace-count") return weapon.maceCount < config.weapons.mace.maxCount;
    if (upgrade.available && !upgrade.available()) return false;
    return true;
  });

  const selected: Upgrade[] = [];
  const unlocks = valid.filter((upgrade) => upgrade.id.startsWith("unlock-"));
  if (unlocks.length > 0 && selected.length < count) {
    const index = Math.floor(Math.random() * unlocks.length);
    const unlock = unlocks[index];
    selected.push(unlock);
    valid.splice(valid.indexOf(unlock), 1);
  }

  while (selected.length < count && valid.length > 0) {
    const index = Math.floor(Math.random() * valid.length);
    selected.push(valid[index]);
    valid.splice(index, 1);
  }
  return selected;
}

function unlockWeapon(id: WeaponId) {
  ownedWeapons.add(id);
  weaponDamage.set(id, weaponDamage.get(id) ?? 0);
  if (id === "hammer") hammer.timer = 0.2;
  if (id === "rock") rockToss.timer = 0.2;
  if (id === "slam") groundSlam.timer = 1;
  if (id === "boomerang") boomerangAxe.timer = 0.7;
  if (id === "lightning") lightningZap.timer = 0.6;
}

function recordUpgrade(id: UpgradeId, title: string) {
  upgradeLabels.set(id, title.replace(/^[+0-9% -]+/, ""));
  upgradesTaken.set(id, (upgradesTaken.get(id) ?? 0) + 1);
}

function updateWeaponVisuals() {
  const glowPower = evolutions.damageGlow
    ? THREE.MathUtils.clamp(0.2 + (player.damageMultiplier - 1) * 0.5, 0.2, 0.85)
    : 0.2;
  maceMaterial.color.set(evolutions.damageGlow ? 0xffdd66 : 0xf3cf5e);
  maceMaterial.emissive.set(evolutions.damageGlow ? 0x6b2300 : 0x513600);
  maceMaterial.emissiveIntensity = glowPower;

  const hammerHead = hammer.group.children[1] as THREE.Mesh | undefined;
  if (hammerHead?.material instanceof THREE.MeshStandardMaterial) {
    hammerHead.material.color.set(evolutions.damageGlow ? 0xffe08a : 0xe8d37a);
    hammerHead.material.emissive.set(evolutions.damageGlow ? 0x663100 : 0x3e2b07);
    hammerHead.material.emissiveIntensity = glowPower * 0.75;
  }
}

function updateCamera(delta: number) {
  void delta;
  const groundHeight = sampleTerrainHeight(player.group.position.x, player.group.position.z);
  const air = THREE.MathUtils.clamp(player.verticalOffset / 2.2, 0, 1);
  const terrainLift = THREE.MathUtils.clamp(groundHeight * 0.28, 0, 0.85);
  const cameraBackX = Math.sin(cameraYaw);
  const cameraBackZ = Math.cos(cameraYaw);
  const cameraDistance = THREE.MathUtils.mapLinear(cameraPitch, 0.38, 0.78, 15.5, 23.5);
  const cameraHeight = Math.tan(cameraPitch) * cameraDistance;

  cameraDesiredOffset.set(
    cameraBackX * cameraDistance,
    0,
    cameraBackZ * cameraDistance,
  );
  cameraPlanarOffset.copy(cameraDesiredOffset);

  cameraDesiredPosition.set(
    player.group.position.x + cameraPlanarOffset.x,
    groundHeight + cameraHeight + terrainLift + air * 1.35,
    player.group.position.z + cameraPlanarOffset.z,
  );
  camera.position.copy(cameraDesiredPosition);

  const shake = settings.screenShake && cameraShake > 0 ? cameraShake * cameraShake : 0;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
  }

  cameraLookTarget.copy(
    tmpVecB.set(
      player.group.position.x,
      groundHeight + 1.05 + terrainLift * 0.25 + player.verticalOffset * 0.35,
      player.group.position.z,
    ),
  );
  camera.lookAt(cameraLookTarget);
}

function updateHud() {
  timeEl.textContent = formatTime(runTime);
  killsEl.textContent = String(kills);
  levelEl.textContent = String(player.level);
  healthFill.style.transform = `scaleX(${THREE.MathUtils.clamp(player.health / player.maxHealth, 0, 1)})`;
  xpFill.style.transform = `scaleY(${THREE.MathUtils.clamp(player.xp / player.xpToNext, 0, 1)})`;
}

function showToast(message: string, duration = 2.2) {
  toastEl.textContent = message;
  toastTimer = duration;
  toastEl.classList.remove("hidden");
}

function updateToast(delta: number) {
  if (toastTimer <= 0) return;
  toastTimer -= delta;
  if (toastTimer <= 0) {
    toastEl.classList.add("hidden");
  }
}

function syncSettingsControls() {
  soundToggle.checked = settings.sound;
  shakeToggle.checked = settings.screenShake;
  damageToggle.checked = settings.damageNumbers;
  particlesToggle.checked = settings.reduceParticles;
  terrainToggle.checked = settings.terrainEnabled;
  terrainDebugToggle.checked = settings.terrainDebug;
}

function updateSettingsFromControls() {
  applySettings({
    sound: soundToggle.checked,
    screenShake: shakeToggle.checked,
    damageNumbers: damageToggle.checked,
    reduceParticles: particlesToggle.checked,
    terrainEnabled: terrainToggle.checked,
    terrainDebug: terrainDebugToggle.checked,
  });
}

function applySettings(nextSettings: GameSettings) {
  const terrainChanged =
    settings.terrainEnabled !== nextSettings.terrainEnabled ||
    settings.terrainDebug !== nextSettings.terrainDebug;
  settings.sound = nextSettings.sound;
  settings.screenShake = nextSettings.screenShake;
  settings.damageNumbers = nextSettings.damageNumbers;
  settings.reduceParticles = nextSettings.reduceParticles;
  settings.terrainEnabled = nextSettings.terrainEnabled;
  settings.terrainDebug = nextSettings.terrainDebug;
  saveSettings(settings);
  audio.setSettings(settings);
  if (terrainChanged) {
    rebuildTerrainMesh();
    updateTerrainAnchors();
    updateTerrainBlockers();
    player.group.position.y = sampleTerrainHeight(player.group.position.x, player.group.position.z);
    for (const enemy of enemies) {
      enemy.mesh.position.y = config.enemies[enemy.kind].y + sampleTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z);
    }
  }
  syncSettingsControls();
  updatePauseCodex();
}

function updateBestRunPanel() {
  const best = loadBestRun();
  if (!best) {
    bestRunEl.innerHTML = "<strong>Best Run</strong>No run recorded yet.";
    return;
  }

  bestRunEl.innerHTML = `<strong>Best Run</strong>${formatTime(best.time)} | Level ${best.level} | ${best.kills} kills | ${best.bosses} bosses | ${weaponName(best.topWeapon)}`;
}

function renderCharacterSelect() {
  const ids = Object.keys(config.characters) as CharacterId[];
  characterSelect.innerHTML = "";
  for (const id of ids) {
    const character = config.characters[id];
    const card = document.createElement("button");
    card.className = `character-card ${id === selectedCharacter ? "selected" : ""}`;
    card.type = "button";
    card.innerHTML = `<strong>${character.name}</strong><span>${character.description}</span>`;
    card.addEventListener("click", () => {
      selectedCharacter = id;
      saveSelectedCharacter(id);
      renderCharacterSelect();
    });
    characterSelect.append(card);
  }
}

function updateMetaShop() {
  const items = [
    {
      id: "healthLevel" as const,
      label: "Starting Health",
      value: `Level ${metaProgression.healthLevel}`,
      cost: getMetaCost(metaProgression.healthLevel),
      max: 8,
    },
    {
      id: "speedLevel" as const,
      label: "Move Speed",
      value: `Level ${metaProgression.speedLevel}`,
      cost: getMetaCost(metaProgression.speedLevel),
      max: 6,
    },
    {
      id: "pickupLevel" as const,
      label: "Pickup Radius",
      value: `Level ${metaProgression.pickupLevel}`,
      cost: getMetaCost(metaProgression.pickupLevel),
      max: 6,
    },
    {
      id: "rerollLevel" as const,
      label: "Run Rerolls",
      value: `Level ${metaProgression.rerollLevel}`,
      cost: getMetaCost(metaProgression.rerollLevel),
      max: 5,
    },
  ];

  metaShop.innerHTML = `<div class="shop-header">${metaProgression.coins} coins</div>`;
  for (const item of items) {
    const maxed = metaProgression[item.id] >= item.max;
    const button = document.createElement("button");
    button.className = "shop-button";
    button.type = "button";
    button.disabled = maxed || metaProgression.coins < item.cost;
    button.innerHTML = `${item.label}<span>${item.value} | ${maxed ? "Max" : `${item.cost} coins`}</span>`;
    button.addEventListener("click", () => buyMetaUpgrade(item.id, item.max));
    metaShop.append(button);
  }
}

function buyMetaUpgrade(key: "healthLevel" | "speedLevel" | "pickupLevel" | "rerollLevel", max: number) {
  const cost = getMetaCost(metaProgression[key]);
  if (metaProgression[key] >= max || metaProgression.coins < cost) return;
  metaProgression.coins -= cost;
  metaProgression[key] += 1;
  saveMetaProgression(metaProgression);
  updateMetaShop();
}

function getMetaCost(level: number) {
  return 20 + level * 15;
}

function pauseRun() {
  gameMode = "paused";
  keys.clear();
  releaseCameraPointerLock();
  updatePauseCodex();
  pauseOverlay.classList.remove("hidden");
}

function resumeRun() {
  if (gameMode !== "paused") return;
  gameMode = "running";
  pauseOverlay.classList.add("hidden");
}

function updatePauseCodex() {
  if (gameMode !== "paused" && pauseOverlay.classList.contains("hidden")) return;

  const stats = [
    ["Character", config.characters[selectedCharacter].name],
    ["Damage", `${Math.round(player.damageMultiplier * 100)}%`],
    ["Move", player.speed.toFixed(1)],
    ["Weapons", String(ownedWeapons.size)],
    ["Wave", currentWaveName],
    ["Pickup", player.pickupRadius.toFixed(1)],
    ["Knockback", `${Math.round(player.knockbackMultiplier * 100)}%`],
    ["Rerolls", String(rerollsRemaining)],
    ["Coins", String(runCoins)],
    ["Enemies", String(enemies.length)],
    ["Bosses", String(bossesDefeated)],
    ["Terrain", settings.terrainEnabled ? `On (${player.group.position.y.toFixed(2)})` : "Flat"],
    ["Slope", settings.terrainEnabled ? `${sampleTerrainSlopeDegreesAt(player.group.position.x, player.group.position.z).toFixed(1)} deg` : "0.0 deg"],
    ["Hop", player.grounded ? "Grounded" : `${player.verticalOffset.toFixed(1)}m`],
    ["Jump Boost", `${Math.round(player.lastJumpBoost * 100)}%`],
    ["Blockers", settings.terrainEnabled ? String(terrainBlockers.length) : "Off"],
    ["T Data", settings.terrainEnabled ? `${terrainHeightStamps.length}+${terrainRouteStamps.length}` : "Off"],
    ["T Debug", settings.terrainDebug ? "Visible" : "Off"],
  ];

  pauseStats.innerHTML = stats
    .map(([label, value]) => `<div class="codex-stat"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  const upgradeEntries =
    upgradesTaken.size > 0
      ? Array.from(upgradesTaken.entries()).map(
          ([id, count]) =>
            `<div class="codex-entry"><span>${upgradeName(id)}</span><strong>Level ${count}</strong></div>`,
        )
      : [`<div class="codex-entry"><span>Upgrades</span><strong>No picks yet</strong></div>`];

  const evolutionEntries = [
    ownedWeapons.has("mace") ? `Maces: ${weapon.maceCount}` : "",
    ownedWeapons.has("hammer") ? `Hammer: ${hammer.swingsPerAttack > 1 ? "Double" : "Single"}` : "",
    ownedWeapons.has("rock") ? `Rock Toss: pierce ${rockToss.pierce}` : "",
    ownedWeapons.has("slam") ? `Ground Slam: ${groundSlam.radius.toFixed(1)} radius` : "",
    ownedWeapons.has("boomerang") ? `Boomerang Axe: pierce ${boomerangAxe.pierce}` : "",
    ownedWeapons.has("lightning") ? `Lightning Zap: ${lightningZap.chains} chains` : "",
    evolutions.fireTrails ? "Mace fire trails" : "",
    evolutions.pickupPulse ? "XP pickup pulse" : "",
    evolutions.dashBurst ? "Dash burst" : "",
    evolutions.damageGlow ? "Damage glow" : "",
    hammer.swingsPerAttack > 1 ? "Hammer double-swing" : "",
  ]
    .filter(Boolean)
    .map((label) => `<div class="codex-entry"><span>Evolution</span><strong>${label}</strong></div>`);

  pauseUpgrades.innerHTML = [...upgradeEntries, ...evolutionEntries].join("");
}

function upgradeName(id: UpgradeId) {
  return upgradeLabels.get(id) ?? id.replaceAll("-", " ");
}

function getFavoriteWeapon() {
  let winner: WeaponId = "mace";
  let bestDamage = weaponDamage.get(winner) ?? 0;
  for (const [weaponId, damage] of weaponDamage.entries()) {
    if (damage > bestDamage) {
      winner = weaponId;
      bestDamage = damage;
    }
  }
  return { id: winner, name: weaponName(winner), damage: bestDamage };
}

function weaponName(id: WeaponId) {
  switch (id) {
    case "mace":
      return "Orbiting Maces";
    case "hammer":
      return "Bonk Hammer";
    case "rock":
      return "Rock Toss";
    case "slam":
      return "Ground Slam";
    case "boomerang":
      return "Boomerang Axe";
    case "lightning":
      return "Lightning Zap";
  }
}

function die() {
  gameMode = "dead";
  releaseCameraPointerLock();
  const favorite = getFavoriteWeapon();
  const earnedCoins = calculateRunCoins();
  metaProgression.coins += earnedCoins;
  saveMetaProgression(metaProgression);
  const summary: RunSummary = {
    time: runTime,
    kills,
    level: player.level,
    bosses: bossesDefeated,
    topWeapon: favorite.id,
    topWeaponDamage: favorite.damage,
  };
  const previousBest = loadBestRun();
  const best = maybeSaveBestRun(summary);
  const isNewBest =
    !previousBest ||
    best?.achievedAt !== previousBest.achievedAt ||
    best.time !== previousBest.time ||
    best.kills !== previousBest.kills;
  deathStats.textContent = `${formatTime(runTime)} survived | Level ${player.level} | ${kills} kills | ${bossesDefeated} bosses | +${earnedCoins} coins | Top weapon: ${favorite.name} (${Math.round(favorite.damage)} damage)`;
  bestRunNote.textContent = isNewBest ? "New best run recorded." : "Best run unchanged.";
  updateBestRunPanel();
  updateMetaShop();
  audio.play("death");
  deathOverlay.classList.remove("hidden");
}

function calculateRunCoins() {
  return runCoins + Math.floor(runTime / 8) + Math.floor(kills / 12) + bossesDefeated * 30;
}

function beginRun() {
  restart();
  spawnDebugStartEnemies();
  startOverlay.classList.add("hidden");
}

function restartRunFromOverlay() {
  restart();
  spawnDebugStartEnemies();
}

function spawnDebugStartEnemies() {
  if (debugStartEnemies <= 0) return;

  const wave = getWaveConfig(runTime);
  for (let i = 0; i < debugStartEnemies && enemies.length < 190; i += 1) {
    spawnEnemy(pickEnemyKind(wave.weights));
  }
  spawnTimer = 0.2;
}

function returnToStart() {
  restart();
  gameMode = "start";
  keys.clear();
  releaseCameraPointerLock();
  pauseOverlay.classList.add("hidden");
  deathOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
}

function restart() {
  const character = config.characters[selectedCharacter];
  for (const enemy of enemies.splice(0)) {
    scene.remove(enemy.mesh);
    enemy.healthBar.remove();
  }
  for (const gem of gems.splice(0)) {
    scene.remove(gem.mesh);
  }
  for (const particle of particles.splice(0)) {
    scene.remove(particle.mesh);
    particle.mesh.geometry.dispose();
  }
  for (const projectile of projectiles.splice(0)) {
    scene.remove(projectile.mesh);
  }
  for (const projectile of hostileProjectiles.splice(0)) {
    scene.remove(projectile.mesh);
  }
  for (const text of floatingTexts.splice(0)) {
    text.element.remove();
  }

  player.group.position.set(0, sampleTerrainHeight(0, 0), 0);
  player.velocity.set(0, 0, 0);
  player.speed = config.player.speed * character.speedMultiplier * (1 + metaProgression.speedLevel * 0.035);
  player.maxHealth = Math.round((config.player.health + metaProgression.healthLevel * 12) * character.healthMultiplier);
  player.health = player.maxHealth;
  player.xp = 0;
  player.xpToNext = config.player.xpToNext;
  player.level = debugStartLevel;
  player.pickupRadius = config.player.pickupRadius + character.pickupBonus + metaProgression.pickupLevel * 0.28;
  player.damageMultiplier = character.damageMultiplier;
  player.knockbackMultiplier = 1;
  player.dashBurst = 0;
  player.pickupPulse = 0;
  player.verticalOffset = 0;
  player.verticalVelocity = 0;
  player.coyoteTimer = playerCoyoteSeconds;
  player.jumpBufferTimer = 0;
  player.grounded = true;
  player.landingSquash = 0;
  player.landingCarryTimer = 0;
  player.lastJumpBoost = 1;
  playerLedgeImpactCooldown = 0;
  playerDamageFlashTimer = 0;
  updatePlayerDamageFlash(0);
  player.group.scale.set(1, 1, 1);
  updatePlayerGroundShadow();

  weapon.maceCount = config.weapons.mace.count;
  weapon.damage = config.weapons.mace.damage;
  weapon.orbitRadius = config.weapons.mace.orbitRadius;
  weapon.maceRadius = config.weapons.mace.radius;
  weapon.spinSpeed = config.weapons.mace.spinSpeed;
  weapon.angle = 0;
  for (const mace of weapon.maces) {
    mace.scale.setScalar(1);
  }
  syncMaces();
  ownedWeapons.clear();
  for (const weaponId of character.startingWeapons) {
    ownedWeapons.add(weaponId);
  }
  weaponDamage.clear();
  for (const weaponId of ownedWeapons) {
    weaponDamage.set(weaponId, 0);
  }

  runTime = debugStartTime;
  spawnTimer = 0;
  eliteTimer = debugStartTime > 0 ? 0.3 : 18;
  nextBossTime = getNextBossTimeAfter(runTime);
  currentWaveName = getWaveConfig(runTime).name;
  kills = 0;
  bossesDefeated = 0;
  runCoins = 0;
  rerollsRemaining = 1 + metaProgression.rerollLevel;
  currentLevelChoices = [];
  bossWarningShown = false;
  toastTimer = 0;
  toastEl.classList.add("hidden");
  cameraShake = 0;
  hitStop = 0;
  hurtSoundCooldown = 0;
  hammer.timer = config.weapons.hammer.timer;
  hammer.cooldown = config.weapons.hammer.cooldown;
  hammer.swingTime = 0;
  hammer.duration = config.weapons.hammer.duration;
  hammer.directionAngle = 0;
  hammer.radius = config.weapons.hammer.radius;
  hammer.arcWidth = config.weapons.hammer.arcWidth;
  hammer.damage = config.weapons.hammer.damage;
  hammer.swingsPerAttack = 1;
  hammer.pendingSwings = 0;
  hammer.swingSpacing = config.weapons.hammer.swingSpacing;
  hammer.shockwave = false;
  hammer.hitEnemies.clear();
  hammer.group.visible = false;
  rockToss.timer = config.weapons.rock.timer;
  rockToss.cooldown = config.weapons.rock.cooldown;
  rockToss.damage = config.weapons.rock.damage;
  rockToss.speed = config.weapons.rock.speed;
  rockToss.pierce = config.weapons.rock.pierce;
  rockToss.split = false;
  groundSlam.timer = config.weapons.slam.timer;
  groundSlam.cooldown = config.weapons.slam.cooldown;
  groundSlam.radius = config.weapons.slam.radius;
  groundSlam.damage = config.weapons.slam.damage;
  boomerangAxe.timer = config.weapons.boomerang.timer;
  boomerangAxe.cooldown = config.weapons.boomerang.cooldown;
  boomerangAxe.damage = config.weapons.boomerang.damage;
  boomerangAxe.speed = config.weapons.boomerang.speed;
  boomerangAxe.maxDistance = config.weapons.boomerang.maxDistance;
  boomerangAxe.pierce = config.weapons.boomerang.pierce;
  lightningZap.timer = config.weapons.lightning.timer;
  lightningZap.cooldown = config.weapons.lightning.cooldown;
  lightningZap.damage = config.weapons.lightning.damage;
  lightningZap.range = config.weapons.lightning.range;
  lightningZap.chains = config.weapons.lightning.chains;
  evolutions.fireTrails = false;
  evolutions.pickupPulse = false;
  evolutions.dashBurst = false;
  evolutions.damageGlow = false;
  upgradesTaken.clear();
  updateWeaponVisuals();
  gameMode = "running";
  startOverlay.classList.add("hidden");
  levelUpOverlay.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  deathOverlay.classList.add("hidden");
  bestRunNote.textContent = "";
  bossBar.classList.add("hidden");
  updateBestRunPanel();
  updateMetaShop();
  updateHud();
  updatePauseCodex();
}

function getDebugNumberParam(name: string, fallback: number, min: number, max: number) {
  const value = new URLSearchParams(window.location.search).get(name);
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return THREE.MathUtils.clamp(parsed, min, max);
}

function getNextBossTimeAfter(time: number) {
  if (time < config.waves.firstBossTime) return config.waves.firstBossTime;
  const intervalsPassed = Math.floor((time - config.waves.firstBossTime) / config.waves.bossInterval) + 1;
  return config.waves.firstBossTime + intervalsPassed * config.waves.bossInterval;
}

function horizontalDistance(a: THREE.Vector3, b: THREE.Vector3) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}


function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
