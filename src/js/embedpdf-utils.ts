import {
  CommandsPlugin,
  DocumentManagerPlugin,
  EmbedPdfContainer,
  type PluginRegistry,
  UIPlugin,
  ExportPlugin,
  AnnotationPlugin,
  type ToolbarItem,
  type GroupItem,
  type MenuItem,
} from '@embedpdf/snippet';
import { type AnnotationTool } from '@embedpdf/plugin-annotation';
import { PdfAnnotationSubtype, type PdfStampAnnoObject } from '@embedpdf/models';
import { FileImage, House, PenLine, type IconNode } from 'lucide';
import { flattenAsImage } from '../tools/pdf-to-image';
import { showMessage } from './ui.ts';
import { getAllSignatures as getStoredSignatures } from '../tools/signature-creator/signature-store.ts';
import type { SignatureData } from '../tools/signature-creator/signature-types.ts';

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
        const items = menu.items;
        const exportIndex = items.findIndex((item: MenuItem) => item.id === 'document:export');

        const flattenMenuItem = {
          type: 'command',
          id: 'app.flatten-pdf-menu-item',
          commandId: 'app.flatten-pdf',
        } as MenuItem;

        if (exportIndex !== -1) {
          items.splice(exportIndex + 1, 0, flattenMenuItem);
        } else {
          items.push(flattenMenuItem);
        }
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
        },
      });

      const schema = ui.getSchema();
      const toolbar = schema.toolbars['main-toolbar'];
      if (toolbar) {
        const items = toolbar.items;
        const leftGroup = items.find((item: ToolbarItem) => item.id === 'left-group') as GroupItem | undefined;

        const homeButton = {
          type: 'command-button',
          id: 'home-button',
          commandId: 'app.go-home',
          variant: 'icon',
        } as ToolbarItem;

        if (leftGroup) {
          leftGroup.items.unshift(homeButton);
        } else {
          items.unshift(homeButton);
        }
      }
    }
  }
}

const ADD_SIGNATURE_COMMAND_ID = 'annotation:add-signature';

/**
 * Represents the structure of a signature object for the selection dialog.
 */
interface Signature {
  name: string;
  dataUrl: string;
  createdAt: string;
}

/**
 * Fetches signatures from the signature creator tool's IndexedDB store.
 * @returns A promise that resolves to an array of signatures, sorted by creation date.
 */
async function getSignatures(): Promise<Signature[]> {
  try {
    const storedSignatures: SignatureData[] = await getStoredSignatures();

    return storedSignatures.map((sig) => ({
      name: `Signature from ${new Date(sig.timestamp).toLocaleString()}`,
      dataUrl: sig.image,
      createdAt: new Date(sig.timestamp).toISOString(),
    }));
  } catch (error) {
    console.error('Failed to read signatures from IndexedDB', error);
    showMessage('Could not load signatures.', { type: 'alert' });
    return [];
  }
}

/**
 * Creates and returns the signature selection dialog element.
 * It is created once and reused.
 * @returns The dialog element.
 */
function createSignatureDialog(): HTMLDialogElement {
  const DIALOG_ID = 'signature-selection-dialog';
  let dialog = document.getElementById(DIALOG_ID) as HTMLDialogElement;
  if (dialog) {
    return dialog;
  }

  const dialogHTML = `
    <dialog id="${DIALOG_ID}" class="modal">
      <div class="modal-box">
        <h3 class="font-bold text-lg">Select a Signature</h3>
        <p class="py-2 text-sm text-base-content/70">Click a signature to place it on the document.</p>
        <div id="signature-selection-list" class="py-4 grid grid-cols-2 gap-4 bg-base-200 rounded-box p-4 min-h-32"></div>
        <div class="modal-action">
          <form method="dialog">
            <button class="btn">Cancel</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>
  `;
  document.body.insertAdjacentHTML('beforeend', dialogHTML);
  return document.getElementById(DIALOG_ID) as HTMLDialogElement;
}

/**
 * Displays a modal dialog for selecting a signature.
 * @param signatures An array of available signatures.
 * @returns A promise that resolves with the data URL of the selected signature, or null if canceled.
 */
function showSignatureDialog(signatures: Signature[]): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = createSignatureDialog();
    const listElement = dialog.querySelector<HTMLDivElement>('#signature-selection-list');
    if (!listElement) {
      console.error('Signature dialog is missing the list element.');
      return resolve(null);
    }

    listElement.innerHTML = ''; // Clear previous items

    // This handler resolves with null if the dialog is closed without a selection (e.g., ESC key).
    const onDialogClose = () => {
      resolve(null);
    };
    dialog.addEventListener('close', onDialogClose, { once: true });

    if (signatures.length === 0) {
      listElement.innerHTML = `<p class="text-center col-span-2">No signatures found. Please create one using the "Signature Creator" tool first.</p>`;
    } else {
      signatures.forEach((sig) => {
        const item = document.createElement('div');
        item.className =
          'p-2 border border-base-300 rounded-lg cursor-pointer hover:bg-base-300 flex justify-center items-center bg-white';
        item.innerHTML = `<img src="${sig.dataUrl}" alt="${sig.name}" class="max-w-full h-auto max-h-24 object-contain" />`;
        item.addEventListener('click', () => {
          // A signature was clicked. Remove the 'close' listener to prevent the race condition.
          dialog.removeEventListener('close', onDialogClose);
          resolve(sig.dataUrl);
          dialog.close();
        });
        listElement.appendChild(item);
      });
    }

    dialog.showModal();
  });
}

/**
 * Registers a command and toolbar button to add a signature to the PDF.
 * The button is placed next to the "Add Image" (stamp) button.
 * @param viewer The EmbedPDF container instance.
 */
export async function addSignatureCommand(viewer: EmbedPdfContainer): Promise<void> {
  const registry = await viewer.registry;
  if (!registry) return;

  const annotationPlugin = await getAnnotationPlugin(registry);
  const commands = await getViewerCommands(registry);
  if (!annotationPlugin || !commands) {
    console.warn('AnnotationPlugin or CommandsPlugin not available, cannot add signature command.');
    return;
  }

  const SIGNATURE_TOOL_ID = 'stampSignature';

  annotationPlugin.addTool<AnnotationTool<PdfStampAnnoObject>>({
    id: SIGNATURE_TOOL_ID,
    name: 'Signature',
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
    },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      imageSrc: undefined
    },
    behavior: {
      deactivateToolAfterCreate: true
    }
  });

  // 1. Register the command logic
  commands.registerCommand({
    id: ADD_SIGNATURE_COMMAND_ID,
    label: 'Add Signature',
    icon: 'icon-signature',
    action: async (context) => {
      console.log('Add Signature command invoked', context);
      const signatures = await getSignatures();
      const selectedSignatureUrl = await showSignatureDialog(signatures);

      if (!selectedSignatureUrl) {
        return; // User cancelled
      }

      const signatureTool = annotationPlugin.getTool(SIGNATURE_TOOL_ID);
      (signatureTool?.defaults as any).imageSrc = selectedSignatureUrl;
      annotationPlugin.setActiveTool(SIGNATURE_TOOL_ID);
    },
  });

  // 2. Register the toolbar button
  const SIGNATURE_ICON_ID = 'icon-signature';
  registerLucideIcon(viewer, SIGNATURE_ICON_ID, PenLine);

  const ANNOTATION_TOOLBAR_ID = 'annotation-toolbar';
  const STAMP_BUTTON_ID = 'add-stamp';

  const ui = await getViewerUi(registry);
  if (!ui) {
    console.warn('UIPlugin not available, cannot add signature button.');
    return;
  }

  const schema = ui.getSchema();
  const toolbar = schema.toolbars?.[ANNOTATION_TOOLBAR_ID];

  if (toolbar) {
    const items = toolbar.items;
    const annotationToolsGroup = items.find(
      (item: ToolbarItem) => item.id === 'annotation-tools' && item.type === 'group'
    ) as GroupItem | undefined;

    if (annotationToolsGroup) {
      const stampButtonIndex = annotationToolsGroup.items.findIndex(
        (item: any) => item.id === STAMP_BUTTON_ID
      );

      const signatureButton = {
        type: 'command-button',
        id: ADD_SIGNATURE_COMMAND_ID + '-button',
        commandId: ADD_SIGNATURE_COMMAND_ID,
        variant: 'icon',
        categories: ['annotation', 'annotation-signature'],
      } as ToolbarItem;

      if (stampButtonIndex !== -1) {
        annotationToolsGroup.items.splice(stampButtonIndex + 1, 0, signatureButton );
      } else {
        console.warn(`'${STAMP_BUTTON_ID}' not found. Appending button to annotation tools group.`);
        annotationToolsGroup.items.push(signatureButton);
      }
    } else {
      console.warn(`Group 'annotation-tools' not found in '${ANNOTATION_TOOLBAR_ID}'.`);
    }
  } else {
    console.warn(`Toolbar '${ANNOTATION_TOOLBAR_ID}' not found. Cannot add signature button.`);
  }
}
