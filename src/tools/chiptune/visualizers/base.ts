export type VisualizerState = {
  freqData: Uint8Array;
  timeData: Uint8Array;
  bass: number;
};

export interface Visualizer {
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: VisualizerState
  ): void;
}
