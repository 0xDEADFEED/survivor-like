import type { CharacterId, EnemyKind, WeaponId } from "./types";

export const config = {
  player: {
    radius: 0.75,
    speed: 8.8,
    health: 120,
    xpToNext: 6,
    pickupRadius: 3.1,
  },
  characters: {
    bonker: {
      name: "The Bonker",
      description: "Balanced bruiser with mace and hammer.",
      healthMultiplier: 1,
      speedMultiplier: 1,
      pickupBonus: 0,
      damageMultiplier: 1,
      startingWeapons: ["mace", "hammer"],
    },
    scout: {
      name: "Scout",
      description: "Fast and fragile, starts with Boomerang Axe.",
      healthMultiplier: 0.82,
      speedMultiplier: 1.18,
      pickupBonus: 0.45,
      damageMultiplier: 0.95,
      startingWeapons: ["mace", "boomerang"],
    },
    bulwark: {
      name: "Bulwark",
      description: "Slow and sturdy, starts with Ground Slam.",
      healthMultiplier: 1.35,
      speedMultiplier: 0.9,
      pickupBonus: 0,
      damageMultiplier: 1.02,
      startingWeapons: ["mace", "slam"],
    },
    stormcaller: {
      name: "Stormcaller",
      description: "Fragile specialist, starts with Lightning Zap.",
      healthMultiplier: 0.9,
      speedMultiplier: 1.04,
      pickupBonus: 0.25,
      damageMultiplier: 1.08,
      startingWeapons: ["mace", "lightning"],
    },
  } satisfies Record<
    CharacterId,
    {
      name: string;
      description: string;
      healthMultiplier: number;
      speedMultiplier: number;
      pickupBonus: number;
      damageMultiplier: number;
      startingWeapons: WeaponId[];
    }
  >,
  weapons: {
    mace: {
      count: 1,
      damage: 30,
      orbitRadius: 2.35,
      radius: 0.38,
      spinSpeed: 2.8,
      maxCount: 8,
    },
    hammer: {
      timer: 1.4,
      cooldown: 2.35,
      duration: 0.34,
      radius: 3.15,
      arcWidth: 1.08,
      damage: 54,
      swingSpacing: 0.14,
    },
    rock: {
      timer: 0.8,
      cooldown: 1.55,
      damage: 46,
      speed: 13,
      pierce: 1,
    },
    slam: {
      timer: 2.7,
      cooldown: 4.2,
      radius: 4.2,
      damage: 62,
    },
    boomerang: {
      timer: 1.6,
      cooldown: 3.1,
      damage: 42,
      speed: 13,
      maxDistance: 9.5,
      pierce: 4,
    },
    lightning: {
      timer: 1.1,
      cooldown: 2.65,
      damage: 38,
      range: 8.5,
      chains: 3,
    },
  },
  enemies: {
    basic: { hp: 24, speed: 3.2, radius: 0.72, damage: 7, xp: 2, y: 0.65 },
    heavy: { hp: 120, speed: 2.2, radius: 1.1, damage: 15, xp: 8, y: 1.05 },
    swarmer: { hp: 12, speed: 5.3, radius: 0.48, damage: 5, xp: 1, y: 0.52 },
    dasher: { hp: 32, speed: 3.4, radius: 0.62, damage: 11, xp: 3, y: 0.66 },
    charger: { hp: 70, speed: 2.9, radius: 0.82, damage: 18, xp: 6, y: 0.82 },
    spitter: { hp: 42, speed: 2.55, radius: 0.68, damage: 13, xp: 4, y: 0.72 },
    warden: { hp: 135, speed: 1.8, radius: 1.02, damage: 12, xp: 10, y: 1 },
    shieldbearer: { hp: 155, speed: 1.95, radius: 1.05, damage: 16, xp: 10, y: 1.02 },
    boss: { hp: 520, speed: 1.7, radius: 1.75, damage: 22, xp: 30, y: 1.68 },
  },
  waves: {
    firstBossTime: 120,
    bossInterval: 60,
  },
};

export interface WaveConfig {
  name: string;
  targetCount: number;
  spawnDelay: number;
  batchSize: number;
  eliteDelay: number;
  eliteKind: EnemyKind;
  weights: Array<[EnemyKind, number]>;
}

export function getWaveConfig(runTime: number): WaveConfig {
  if (runTime < 30) {
    return {
      name: "Basic Pressure",
      targetCount: 28,
      spawnDelay: 0.76,
      batchSize: 1,
      eliteDelay: 18,
      eliteKind: "heavy",
      weights: [["basic", 1]],
    };
  }

  if (runTime < 60) {
    return {
      name: "Swarmer Pack",
      targetCount: 38,
      spawnDelay: 0.58,
      batchSize: 2,
      eliteDelay: 16,
      eliteKind: "spitter",
      weights: [
        ["basic", 0.62],
        ["swarmer", 0.3],
        ["spitter", 0.08],
      ],
    };
  }

  if (runTime < 90) {
    return {
      name: "Dasher Rush",
      targetCount: 48,
      spawnDelay: 0.48,
      batchSize: 2,
      eliteDelay: 14,
      eliteKind: "dasher",
      weights: [
        ["basic", 0.5],
        ["swarmer", 0.23],
        ["dasher", 0.12],
        ["charger", 0.05],
        ["spitter", 0.1],
      ],
    };
  }

  if (runTime < 120) {
    return {
      name: "Shield Crush",
      targetCount: 58,
      spawnDelay: 0.42,
      batchSize: 2,
      eliteDelay: 11,
      eliteKind: "shieldbearer",
      weights: [
        ["basic", 0.42],
        ["swarmer", 0.21],
        ["dasher", 0.12],
        ["charger", 0.07],
        ["spitter", 0.1],
        ["heavy", 0.08],
        ["warden", 0.04],
        ["shieldbearer", 0.03],
      ],
    };
  }

  return {
    name: "Mixed Mayhem",
    targetCount: 70,
    spawnDelay: 0.34,
    batchSize: runTime > 180 ? 4 : 3,
    eliteDelay: 9,
    eliteKind:
      Math.random() < 0.25
        ? "heavy"
        : Math.random() < 0.5
          ? "charger"
          : Math.random() < 0.76
            ? "warden"
            : "shieldbearer",
    weights: [
      ["basic", 0.34],
      ["swarmer", 0.18],
      ["dasher", 0.13],
      ["charger", 0.08],
      ["spitter", 0.12],
      ["heavy", 0.07],
      ["warden", 0.05],
      ["shieldbearer", 0.03],
    ],
  };
}
