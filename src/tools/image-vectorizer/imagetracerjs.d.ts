declare module 'imagetracerjs' {
  export function imagedataToSVG(imageData: ImageData, options?: any): string;
  export function imageToSVG(url: string, callback: (svg: string) => void, options?: any): void;
  const ImageTracer: {
    imagedataToSVG: typeof imagedataToSVG;
    imageToSVG: typeof imageToSVG;
  };
  export default ImageTracer;
}
