import type { GameSettings } from "./storage";

type SoundName = "hit" | "pickup" | "level" | "hammer" | "bossSpawn" | "bossDeath" | "hurt" | "death";

export class GameAudio {
  private context: AudioContext | null = null;
  private settings: GameSettings;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  setSettings(settings: GameSettings) {
    this.settings = settings;
  }

  play(name: SoundName) {
    if (!this.settings.sound) return;
    const context = this.getContext();
    if (!context) return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);

    const preset = this.getPreset(name);
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.start, now);
    oscillator.frequency.exponentialRampToValueAtTime(preset.end, now + preset.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(preset.volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    oscillator.start(now);
    oscillator.stop(now + preset.duration + 0.02);
  }

  private getContext() {
    if (this.context) return this.context;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    this.context = new AudioContextCtor();
    return this.context;
  }

  private getPreset(name: SoundName) {
    switch (name) {
      case "pickup":
        return { type: "sine" as OscillatorType, start: 760, end: 1180, duration: 0.08, volume: 0.045 };
      case "level":
        return { type: "triangle" as OscillatorType, start: 420, end: 980, duration: 0.24, volume: 0.06 };
      case "hammer":
        return { type: "square" as OscillatorType, start: 150, end: 70, duration: 0.13, volume: 0.055 };
      case "bossSpawn":
        return { type: "sawtooth" as OscillatorType, start: 90, end: 180, duration: 0.45, volume: 0.05 };
      case "bossDeath":
        return { type: "triangle" as OscillatorType, start: 520, end: 110, duration: 0.5, volume: 0.075 };
      case "hurt":
        return { type: "sawtooth" as OscillatorType, start: 180, end: 95, duration: 0.1, volume: 0.04 };
      case "death":
        return { type: "sawtooth" as OscillatorType, start: 220, end: 45, duration: 0.55, volume: 0.06 };
      case "hit":
      default:
        return { type: "square" as OscillatorType, start: 260, end: 130, duration: 0.055, volume: 0.03 };
    }
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
