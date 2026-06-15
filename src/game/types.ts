import type * as THREE from "three";

export type EnemyKind = "basic" | "heavy" | "swarmer" | "dasher" | "spitter" | "shieldbearer" | "boss";
export type GameMode = "start" | "running" | "level-up" | "paused" | "dead";
export type WeaponId = "mace" | "hammer" | "rock" | "slam" | "boomerang" | "lightning";
export type CharacterId = "bonker" | "scout" | "bulwark" | "stormcaller";
export type UpgradeId = string;

export interface Enemy {
  kind: EnemyKind;
  mesh: THREE.Mesh;
  healthBar: HTMLElement;
  healthFill: HTMLElement;
  velocity: THREE.Vector3;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  damage: number;
  xp: number;
  hitCooldown: number;
  flashTime: number;
  dashCharge: number;
  dashCooldown: number;
  attackCharge: number;
  attackCooldown: number;
  attackTarget: THREE.Vector3;
  pathTimer: number;
  pathSide: -1 | 1;
  pathNormalX: number;
  pathNormalZ: number;
  rampRouteTimer: number;
  rampRouteIndex: number;
  rampRouteDirection: -1 | 0 | 1;
  baseColor: THREE.Color;
}

export interface XpGem {
  mesh: THREE.Mesh;
  value: number;
  velocity: THREE.Vector3;
}

export interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity?: number;
}

export interface FloatingText {
  element: HTMLElement;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  radius: number;
  life: number;
  pierce: number;
  weaponId: WeaponId;
  hitEnemies: Set<Enemy>;
  returning?: boolean;
  origin?: THREE.Vector3;
  maxDistance?: number;
}

export interface HostileProjectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  radius: number;
  life: number;
}

export interface Upgrade {
  id: UpgradeId;
  title: string;
  icon: string;
  description: string;
  available?: () => boolean;
  apply: () => void;
}

export interface BestRun {
  time: number;
  kills: number;
  level: number;
  bosses: number;
  topWeapon: WeaponId;
  topWeaponDamage: number;
  achievedAt: string;
}

export interface RunSummary {
  time: number;
  kills: number;
  level: number;
  bosses: number;
  topWeapon: WeaponId;
  topWeaponDamage: number;
}
