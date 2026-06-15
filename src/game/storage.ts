import type { BestRun, CharacterId, RunSummary } from "./types";

export interface GameSettings {
  sound: boolean;
  screenShake: boolean;
  damageNumbers: boolean;
  reduceParticles: boolean;
  terrainEnabled: boolean;
  terrainDebug: boolean;
}

const settingsKey = "survivorlike.settings";
const bestRunKey = "survivorlike.bestRun";
const metaKey = "survivorlike.meta";
const selectedCharacterKey = "survivorlike.selectedCharacter";

export interface MetaProgression {
  coins: number;
  healthLevel: number;
  speedLevel: number;
  pickupLevel: number;
  rerollLevel: number;
}

export const defaultSettings: GameSettings = {
  sound: true,
  screenShake: true,
  damageNumbers: true,
  reduceParticles: false,
  terrainEnabled: true,
  terrainDebug: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(settingsKey);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: GameSettings) {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

export function loadBestRun(): BestRun | null {
  try {
    const raw = localStorage.getItem(bestRunKey);
    return raw ? (JSON.parse(raw) as BestRun) : null;
  } catch {
    return null;
  }
}

export function maybeSaveBestRun(summary: RunSummary): BestRun | null {
  const current = loadBestRun();
  const isBetter =
    !current ||
    summary.time > current.time ||
    summary.kills > current.kills ||
    summary.level > current.level ||
    summary.bosses > current.bosses;

  if (!isBetter) return current;

  const best: BestRun = {
    ...summary,
    achievedAt: new Date().toISOString(),
  };
  localStorage.setItem(bestRunKey, JSON.stringify(best));
  return best;
}

export function loadMetaProgression(): MetaProgression {
  try {
    const raw = localStorage.getItem(metaKey);
    if (!raw) return createDefaultMeta();
    return { ...createDefaultMeta(), ...JSON.parse(raw) };
  } catch {
    return createDefaultMeta();
  }
}

export function saveMetaProgression(meta: MetaProgression) {
  localStorage.setItem(metaKey, JSON.stringify(meta));
}

export function loadSelectedCharacter(): CharacterId {
  const value = localStorage.getItem(selectedCharacterKey);
  if (value === "scout" || value === "bulwark" || value === "stormcaller") return value;
  return "bonker";
}

export function saveSelectedCharacter(id: CharacterId) {
  localStorage.setItem(selectedCharacterKey, id);
}

function createDefaultMeta(): MetaProgression {
  return {
    coins: 0,
    healthLevel: 0,
    speedLevel: 0,
    pickupLevel: 0,
    rerollLevel: 0,
  };
}
