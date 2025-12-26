import type {
  CommandsPlugin,
  DocumentManagerPlugin,
  EmbedPdfContainer,
  PluginRegistry,
  UIPlugin,
} from '@embedpdf/snippet';
import type { IconNode } from 'lucide';

export const getDocManager = async (registry: PluginRegistry) => {
  return registry
    ?.getPlugin<InstanceType<typeof DocumentManagerPlugin>>('document-manager')
    ?.provides();
};
export const getViewerUi = async (registry: PluginRegistry) => {
  return registry
    ?.getPlugin<InstanceType<typeof UIPlugin>>('ui')
    ?.provides();
}
export const getViewerCommands = async (registry: PluginRegistry) => {
  return registry
    ?.getPlugin<InstanceType<typeof CommandsPlugin>>('commands')
    ?.provides();
}

export function registerLucideIcon(viewer: EmbedPdfContainer, iconId: string, iconDef: IconNode | IconNode[]) {
  let children: readonly IconNode[] = [];

  console.log('registerLucideIcon', iconId, iconDef);
  if (Array.isArray(iconDef)) {
    // Check if it's an array of IconNode (children) or a single IconNode tuple
    const first = iconDef[0];

    // IconNode is [string, SVGProps]
    // If first element is a string, it's likely a single IconNode tuple: ['svg', attrs, children] or ['path', attrs]
    if (typeof first === 'string') {
        // It is a single IconNode tuple
        // Check if it has children at index 2
        const node = iconDef as any; // Cast to any to access index 2 safely if TS complains about tuple length
        if (node[2] && Array.isArray(node[2])) {
            children = node[2] as IconNode[];
        }
    } else {
        // If first element is NOT a string (it's an array or object), then iconDef is likely IconNode[] (array of children)
        children = iconDef as IconNode[];
    }
  }

  let paths: { d: string; stroke: string; fill: string; strokeWidth: string; strokeLinecap: string; strokeLinejoin: string }[] = [];

  if (children && children.length > 0) {
      paths = children.map((child) => {
        // child is IconNode which is [elementName, attrs]
        // We need to cast it to access elements by index safely if TS is confused
        const [tag, attrs] = child as unknown as [string, Record<string, any>];

        if (tag === 'path') {
          return {
            d: String(attrs.d || ''),
            stroke: 'currentColor',
            fill: 'none',
            strokeWidth: '2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
          };
        } else if (tag === 'polyline') {
          const rawPoints = String(attrs.points || '');
          const coords = rawPoints.trim().split(/[\s,]+/).filter((s: string) => s.length > 0);
          let d = '';
          for (let i = 0; i < coords.length; i += 2) {
            const x = coords[i];
            const y = coords[i + 1];
            if (x && y) {
              d += (d === '' ? 'M' : 'L') + x + ' ' + y;
            }
          }
          return {
            d: d,
            stroke: 'currentColor',
            fill: 'none',
            strokeWidth: '2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
          };
        }
        return null;
      }).filter((p): p is NonNullable<typeof p> => p !== null);
  }

  if (paths.length > 0) {
    viewer.registerIcon(iconId, {
      viewBox: '0 0 24 24',
      paths: paths
    });
  } else {
    console.warn(`Failed to register icon ${iconId}: No paths found in definition`, iconDef);
  }
}
