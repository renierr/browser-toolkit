import { readString } from './types';

export interface SidModule {
  title: string;
  author: string;
  released: string;
  initAddr: number;
  playAddr: number;
  songs: number;
  startSong: number;
  speed: number;
  dataOffset: number;
  loadAddr: number;
  data: Uint8Array;
}

export class SidParser {
  private data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  public parse(): SidModule {
    if (this.data.length < 118) throw new Error('Invalid SID size');
    const magic = readString(this.data, 0, 4);
    if (magic !== 'PSID' && magic !== 'RSID') throw new Error('Not a SID file, magic: ' + magic);

    const dataOffset = (this.data[6] << 8) | this.data[7];

    let loadAddr = (this.data[8] << 8) | this.data[9];
    const initAddr = (this.data[10] << 8) | this.data[11];
    const playAddr = (this.data[12] << 8) | this.data[13];
    const songs = (this.data[14] << 8) | this.data[15];
    const startSong = (this.data[16] << 8) | this.data[17];
    const speed =
      (this.data[18] << 24) | (this.data[19] << 16) | (this.data[20] << 8) | this.data[21];

    const title = readString(this.data, 22, 32).trim();
    const author = readString(this.data, 54, 32).trim();
    const released = readString(this.data, 86, 32).trim();

    let romData = this.data.slice(dataOffset);
    if (loadAddr === 0) {
      // Address prepended to data
      loadAddr = romData[0] | (romData[1] << 8);
      romData = romData.slice(2);
    }

    return {
      title,
      author,
      released,
      initAddr: initAddr === 0 ? loadAddr : initAddr,
      playAddr: playAddr,
      songs,
      startSong,
      speed,
      dataOffset,
      loadAddr,
      data: romData,
    };
  }
}
