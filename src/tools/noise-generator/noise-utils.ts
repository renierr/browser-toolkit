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

  private checkActive(type: string) {
    return () => this.isPlaying && this.currentNoiseType === type;
  }

  play(type: string) {
    this.engine.initContext();
    if (this.isPlaying) {
      this.stop();
    }

    this.isPlaying = true;
    this.currentNoiseType = type;

    switch (type) {
      case 'white':
      case 'pink':
      case 'brown':
        this.engine.createNoiseLayer({
          type: type as 'white' | 'pink' | 'brown',
          gain: 1.0,
        });
        break;
      case 'rain':
        playRain(this.engine, false, this.checkActive('rain'));
        break;
      case 'forest':
        playForest(this.engine, this.checkActive('forest'));
        break;
      case 'waves':
        playWaves(this.engine);
        break;
      case 'fire':
        playFire(this.engine, this.checkActive('fire'));
        break;
      case 'night':
        playNight(this.engine, this.checkActive('night'));
        break;
      case 'fan':
        playFan(this.engine);
        break;
      case 'thunder':
        playThunderstorm(this.engine, this.checkActive('thunder'));
        break;
      case 'cafe':
        playCafe(this.engine, this.checkActive('cafe'));
        break;
      case 'underwater':
        playUnderwater(this.engine, this.checkActive('underwater'));
        break;
      case 'train':
        playTrain(this.engine, this.checkActive('train'));
        break;
      case 'chimes':
        playWindChimes(this.engine, this.checkActive('chimes'));
        break;
      case 'waterfall':
        playWaterfall(this.engine);
        break;
      case 'cityRain':
        playCityRain(this.engine, this.checkActive('cityRain'));
        break;
      case 'greenNoise':
        playGreenNoise(this.engine);
        break;
      case 'airplane':
        playAirplane(this.engine, this.checkActive('airplane'));
        break;
      case 'catPurr':
        playCatPurr(this.engine, this.checkActive('catPurr'));
        break;
      case 'asmr':
        playASMR(this.engine, this.checkActive('asmr'));
        break;
      case 'space':
        playSpace(this.engine);
        break;
      default:
        this.engine.createNoiseLayer({
          type: 'pink',
          gain: 1.0,
        });
    }
  }

  stop() {
    this.engine.stop();
    this.isPlaying = false;
  }

  setVolume(value: number) {
    this.engine.setVolume(value);
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getCurrentType() {
    return this.currentNoiseType;
  }

  cleanup() {
    this.stop();
    if (this.engine.ctx) {
      this.engine.ctx.close();
      this.engine.ctx = null;
    }
  }
}
