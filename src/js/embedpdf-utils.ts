import {
  CommandsPlugin,
  DocumentManagerPlugin,
  EmbedPdfContainer,
  type PluginRegistry,
  UIPlugin,
  ExportPlugin,
  AnnotationPlugin
} from '@embedpdf/snippet';
import { FileImage, House, type IconNode } from 'lucide';
import { flattenAsImage } from '../tools/pdf-to-image';
import { showMessage } from './ui.ts';

export const getDocManager = async (registry: PluginRegistry) => {
  return registry.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)?.provides();
};
export const getViewerUi = async (registry: PluginRegistry) => {
  return registry.getPlugin<UIPlugin>(UIPlugin.id)?.provides();
};
export const getViewerCommands = async (registry: PluginRegistry) => {
  return registry.getPlugin<CommandsPlugin>(CommandsPlugin.id)?.provides();
};
export const getExportPlugin = async (registry: PluginRegistry) => {
  return registry.getPlugin<ExportPlugin>(ExportPlugin.id)?.provides();
};
export const getAnnotationPlugin = async (registry: PluginRegistry) => {
  return registry.getPlugin<AnnotationPlugin>(AnnotationPlugin.id)?.provides();
};


export function registerLucideIcon(
  viewer: EmbedPdfContainer,
  iconId: string,
  iconDef: IconNode | IconNode[]
) {
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

  let paths: {
    d: string;
    stroke: string;
    fill: string;
    strokeWidth: string;
    strokeLinecap: string;
    strokeLinejoin: string;
  }[] = [];

  if (children && children.length > 0) {
    paths = children
      .map((child) => {
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
            strokeLinejoin: 'round',
          };
        } else if (tag === 'polyline') {
          const rawPoints = String(attrs.points || '');
          const coords = rawPoints
            .trim()
            .split(/[\s,]+/)
            .filter((s: string) => s.length > 0);
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
            strokeLinejoin: 'round',
          };
        }
        return null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }

  if (paths.length > 0) {
    viewer.registerIcon(iconId, {
      viewBox: '0 0 24 24',
      paths: paths,
    });
  } else {
    console.warn(`Failed to register icon ${iconId}: No paths found in definition`, iconDef);
  }
}

export function injectStyles(viewer: EmbedPdfContainer) {
  const shadowRoot = viewer?.shadowRoot;
  if (shadowRoot) {
    const style = document.createElement('style');
    style.textContent = `
            [data-epdf-i="main-toolbar"] {
              flex-wrap: wrap !important;
              height: auto !important;
              min-height: 48px;
            }            
          `;
    shadowRoot.appendChild(style);
  }
}

export async function addFlattenAsImageCommand(viewer: EmbedPdfContainer) {
  const registry = await viewer.registry;
  if (registry) {
    const ui = await getViewerUi(registry);
    const commands = await getViewerCommands(registry);
    const docManager = await getDocManager(registry);
    const exportPlugin = await getExportPlugin(registry);

    if (commands && ui && docManager && exportPlugin) {
      registerLucideIcon(viewer, 'icon-flatten', FileImage);

      commands.registerCommand({
        id: 'app.flatten-pdf',
        label: 'Export as PDF Images',
        icon: 'icon-flatten',
        action: async () => {
          const activeDocId = docManager.getActiveDocumentId();
          if (!activeDocId) {
            showMessage('No active document to flatten.', { type: 'alert' });
            return;
          }
          const docState = docManager.getDocumentState(activeDocId);

          try {
            const buffer = await exportPlugin.saveAsCopy().toPromise();
            if (buffer) {
              const name = docState?.name || 'document.pdf';
              await flattenAsImage(buffer, name);
              showMessage(`PDF "${name}" flattened and downloaded.`, { timeoutMs: 5000 });
            } else {
              showMessage('Could not retrieve PDF data from the export plugin.', { type: 'alert' });
            }
          } catch (error) {
            console.error('Flattening failed', error);
            showMessage('Failed to flatten PDF: ' + (error as any).message, { type: 'alert' });
          }
        },
      });

      // Add to document-menu below export
      const schema = ui.getSchema();
      const menu = schema.menus['document-menu'];
      if (menu) {
        const items = JSON.parse(JSON.stringify(menu.items));
        const exportIndex = items.findIndex((item: any) => item.id === 'document:export');

        const flattenMenuItem = {
          type: 'command',
          id: 'app.flatten-pdf-menu-item',
          commandId: 'app.flatten-pdf',
        };

        if (exportIndex !== -1) {
          items.splice(exportIndex + 1, 0, flattenMenuItem);
        } else {
          items.push(flattenMenuItem);
        }

        ui.mergeSchema({
          menus: { 'document-menu': { ...menu, items } },
        });
      }
    }
  }
}

export async function addNavigateHomeCommand(viewer: EmbedPdfContainer) {
  const registry = await viewer.registry;
  if (registry) {
    const ui = await getViewerUi(registry);
    const commands = await getViewerCommands(registry);

    if (commands && ui) {
      // Register Home Icon (Lucide House)
      registerLucideIcon(viewer, 'icon-home', House);

      commands.registerCommand({
        id: 'app.go-home',
        label: 'Home',
        icon: 'icon-home',
        action: () => {
          window.location.href = './index.html';
        }
      });

      const schema = ui.getSchema();
      const toolbar = schema.toolbars['main-toolbar'];
      if (toolbar) {
        const items = JSON.parse(JSON.stringify(toolbar.items));
        const leftGroup = items.find((item: any) => item.id === 'left-group');

        const homeButton = {
          type: 'command-button',
          id: 'home-button',
          commandId: 'app.go-home',
          variant: 'icon'
        };

        if (leftGroup) {
          leftGroup.items.unshift(homeButton);
        } else {
          items.unshift(homeButton);
        }

        ui.mergeSchema({
          toolbars: { 'main-toolbar': { ...toolbar, items } }
        });
      }
    }
  }
}
