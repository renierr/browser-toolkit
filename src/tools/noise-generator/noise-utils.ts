import { NoiseEngine } from './noise-engine';
import { playRain } from './soundscapes/rain';
import { playWaves } from './soundscapes/waves';
import { playForest } from './soundscapes/forest';
import { playFire } from './soundscapes/fire';
import { playNight } from './soundscapes/night';
import { playFan } from './soundscapes/fan';
import { playThunderstorm } from './soundscapes/thunderstorm';
import { playCafe } from './soundscapes/cafe';
import { playUnderwater } from './soundscapes/underwater';
import { playTrain } from './soundscapes/train';
import { playWindChimes } from './soundscapes/windChimes';
import { playWaterfall } from './soundscapes/waterfall';
import { playCityRain } from './soundscapes/cityRain';
import { playGreenNoise } from './soundscapes/greenNoise';
import { playAirplane } from './soundscapes/airplane';
import { playCatPurr } from './soundscapes/catPurr';
import { playASMR } from './soundscapes/asmr';
import { playSpace } from './soundscapes/space';

export class NoiseGenerator {
  private engine: NoiseEngine;
  private currentNoiseType: string | null = null;
  private isPlaying = false;

  constructor(initialVolume: number = 0.5) {
    this.engine = new NoiseEngine(initialVolume);
  }

  private checkActive(type: string): () => boolean {
    return () => this.isPlaying && this.currentNoiseType === type;
  }

  play(type: string): void {
    this.engine.initContext();
    if (this.isPlaying) {
      this.stop();
    }

    this.isPlaying = true;
    this.currentNoiseType = type;

    void this._playAsync(type);
  }

  private async _playAsync(type: string): Promise<void> {
    try {
      await this.engine.initWorklet();
    } catch (error) {
      console.error('[NoiseGenerator] Failed to load noise worklet', error);
      return;
    }

    if (!this.isPlaying || this.currentNoiseType !== type) return;

    switch (type) {
      case 'white':
      case 'pink':
      case 'brown':
        await this.engine.createNoiseLayer({
          type: type as 'white' | 'pink' | 'brown',
          gain: 1.0,
        });
        break;
      case 'rain':
        await playRain(this.engine, false, this.checkActive('rain'));
        break;
      case 'forest':
        await playForest(this.engine, this.checkActive('forest'));
        break;
      case 'waves':
        await playWaves(this.engine, this.checkActive('waves'));
        break;
      case 'fire':
        await playFire(this.engine, this.checkActive('fire'));
        break;
      case 'night':
        await playNight(this.engine, this.checkActive('night'));
        break;
      case 'fan':
        await playFan(this.engine);
        break;
      case 'thunder':
        await playThunderstorm(this.engine, this.checkActive('thunder'));
        break;
      case 'cafe':
        playCafe(this.engine, this.checkActive('cafe'));
        break;
      case 'underwater':
        await playUnderwater(this.engine, this.checkActive('underwater'));
        break;
      case 'train':
        await playTrain(this.engine, this.checkActive('train'));
        break;
      case 'chimes':
        playWindChimes(this.engine, this.checkActive('chimes'));
        break;
      case 'waterfall':
        await playWaterfall(this.engine);
        break;
      case 'cityRain':
        await playCityRain(this.engine, this.checkActive('cityRain'));
        break;
      case 'greenNoise':
        await playGreenNoise(this.engine);
        break;
      case 'airplane':
        await playAirplane(this.engine, this.checkActive('airplane'));
        break;
      case 'catPurr':
        playCatPurr(this.engine, this.checkActive('catPurr'));
        break;
      case 'asmr':
        await playASMR(this.engine, this.checkActive('asmr'));
        break;
      case 'space':
        await playSpace(this.engine, this.checkActive('space'));
        break;
      default:
        await this.engine.createNoiseLayer({
          type: 'pink',
          gain: 1.0,
        });
    }
  }

  stop(): void {
    this.engine.stop();
    this.isPlaying = false;
  }

  setVolume(value: number): void {
    this.engine.setVolume(value);
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getCurrentType(): string | null {
    return this.currentNoiseType;
  }

  cleanup(): void {
    this.stop();
    if (this.engine.ctx) {
      this.engine.ctx.close();
      this.engine.ctx = null;
    }
  }
}
