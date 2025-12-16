import { createElement } from 'lucide';
import * as Lucide from 'lucide';

const DEFAULT_ICON_ID = 'wrench';

/**
 * Extensible icon registry:
 * - The template registers a default set of icons below (works out of the box).
 * - Derived projects can register additional icons via registerToolIcons(...)
 *   without forking this file.
 */
type LucideIcon = Parameters<typeof createElement>[0];
type IconRegistry = Record<string, LucideIcon>;
const ICONS: IconRegistry = Object.create(null);

function normalizeIconId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Register additional icons (or override existing IDs).
 *
 * Example (in a derived project entry file):
 *   import { registerToolIcons } from './js/tool-icons';
 *   import { AlarmClock } from 'lucide';
 *   registerToolIcons({ alarmclock: AlarmClock });
 */
export function registerToolIcons(extra: IconRegistry): void {
  for (const [id, icon] of Object.entries(extra)) {
    ICONS[normalizeIconId(id)] = icon;
  }
}
/**
 * Return all currently registered icon IDs (including derived-project registrations).
 * The list is sorted for stable display in demos and docs.
 */
export function getRegisteredToolIconIds(): string[] {
  return Object.keys(ICONS).sort((a, b) => a.localeCompare(b));
}

// Register built-in template icons
registerToolIcons({
  // General / tools
  wrench: Lucide.Wrench,
  settings: Lucide.Settings,
  sliders: Lucide.SlidersHorizontal,
  hammer: Lucide.Hammer,
  ruler: Lucide.Ruler,

  // Data / text
  calculator: Lucide.Calculator,
  clipboard: Lucide.Clipboard,
  copy: Lucide.Copy,
  scantext: Lucide.ScanText,
  filetext: Lucide.FileText,
  filejson: Lucide.FileJson,
  filecode: Lucide.FileCode2,
  folder: Lucide.Folder,

  // UI / navigation
  search: Lucide.Search,
  filter: Lucide.Filter,
  list: Lucide.List,
  grid: Lucide.Grid3X3,

  // IO / sharing
  download: Lucide.Download,
  upload: Lucide.Upload,
  share: Lucide.Share2,
  link: Lucide.Link,

  // Security
  shield: Lucide.Shield,
  lock: Lucide.Lock,
  key: Lucide.KeyRound,

  // Status / info
  info: Lucide.Info,
  help: Lucide.HelpCircle,
  warning: Lucide.AlertTriangle,
  success: Lucide.CheckCircle2,
  error: Lucide.XCircle,

  // Fun / highlight
  sparkles: Lucide.Sparkles,

  // Files / images
  image: Lucide.Image,
  file: Lucide.File,
  fileimage: Lucide.FileImage,
  fileadd: Lucide.FilePlus2,
  filedownload: Lucide.FileDown,
});

export function renderToolIconSvg(iconId?: string, className = 'w-6 h-6'): string {
  const normalized = iconId ? normalizeIconId(iconId) : '';
  const picked = ICONS[normalized] ?? ICONS[DEFAULT_ICON_ID];

  // If even the default icon is not registered, render nothing.
  if (!picked) return '';

  const svgEl = createElement(picked, {
    class: className,
    'aria-hidden': 'true',
    focusable: 'false',
  });

  return new XMLSerializer().serializeToString(svgEl);
}
