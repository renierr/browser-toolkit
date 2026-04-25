import figlet from 'figlet';

export type LayoutOptions = {
  horizontalLayout: string;
  verticalLayout: string;
};

export function createGenerator() {
  const loadedFonts = new Set<string>();
  const fontModules = import.meta.glob('./node_modules/figlet/importable-fonts/*.js');

  async function ensureFontLoaded(fontName: string): Promise<void> {
    if (loadedFonts.has(fontName)) return;

    try {
      const path = `./node_modules/figlet/importable-fonts/${fontName}.js`;
      const loader = fontModules[path];

      if (!loader) {
        throw new Error(`Font module not found for: ${fontName}`);
      }

      const fontData = (await loader()) as { default: string };
      figlet.parseFont(fontName, fontData.default);
      loadedFonts.add(fontName);
    } catch (error) {
      console.error(`[AsciiArt] Failed to load font: ${fontName}`, error);
      throw error;
    }
  }

  return {
    async generate(text: string, fontName: string, options: LayoutOptions): Promise<string> {
      await ensureFontLoaded(fontName);

      return new Promise((resolve, reject) => {
        figlet.text(
          text,
          {
            font: fontName as any,
            horizontalLayout: options.horizontalLayout as any,
            verticalLayout: options.verticalLayout as any,
          },
          (err, data) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(data || '');
          }
        );
      });
    },
  };
}
