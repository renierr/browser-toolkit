import { createElement, createIcons, icons as LucideIcons } from 'lucide';

// copy from lucide because of wired naming change for icons - we like to use the same for html replacement and icons
const toPascalCase = (name: string) =>
  name.replace(/(\w)(\w*)(_|-|\s*)/g, (_, g1, g2) => g1.toUpperCase() + g2.toLowerCase());

export const toLucideId = (name: string): string => {
  if (!name) return '';

  return (
    name
      // split lower->Upper (fooBar -> foo-Bar)
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      // split acronym->Word (XMLHttp -> XML-Http)
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      // replace any non-alphanumeric run with a single hyphen
      .replace(/[^A-Za-z0-9]+/g, '-')
      // collapse multiple hyphens, trim edges, and lowercase
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
  );
};

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
    ICONS[id] = icon;
  }
}
/**
 * Return all currently registered icon IDs (including derived-project registrations).
 * The list is sorted for stable display in demos and docs.
 */
export function getRegisteredToolIconIds(): string[] {
  return Object.keys(ICONS)
    .map((id) => toLucideId(id))
    .sort((a, b) => a.localeCompare(b));
}

// Register all lucide icons by default
registerToolIcons(LucideIcons);

export function renderToolIconSvg(iconId?: string, className = 'w-6 h-6'): string {
  const svgEl = iconSvgElement(iconId, className);
  if (!svgEl) return '';

  return new XMLSerializer().serializeToString(svgEl);
}

export function iconSvgElement(iconId?: string, className = 'w-6 h-6'): SVGElement | null {
  const pascalCase = iconId ? toPascalCase(iconId) : '';
  const picked = ICONS[pascalCase] ?? ICONS[DEFAULT_ICON_ID];

  // If even the default icon is not registered, render nothing.
  if (!picked) return null;

  return createElement(picked, {
    class: className,
    'aria-hidden': 'true',
    focusable: 'false',
  });
}

/* Observe DOM changes and re-run createIcons when new elements with `data-lucide` are added. */
let lastCreateIconsAt = 0;
const iconObserver = new MutationObserver((mutations) => {
  if (Date.now() - lastCreateIconsAt < 200) return; // debounce if called multiple times in short timespan

  for (const m of mutations) {
    if (m.addedNodes.length === 0) continue;

    // Quick check: any added node or its descendants contain the `data-lucide` attribute?
    const found = Array.from(m.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      if (node.matches('[data-lucide]')) return true;
      return node.querySelector('[data-lucide]') !== null;
    });

    if (found) {
      iconObserver.disconnect();
      try {
        createIcons({ icons: ICONS, attrs: { class: 'icon' } });
      } finally {
        // re-start observing if body still exists
        if (document.body) {
          iconObserver.observe(document.body, { childList: true, subtree: true });
        }
      }

      break;
    }
  }
});

export const setupLucideCreateIcons = () => {
  // Observe the whole document body for added nodes (subtree)
  if (document.body) {
    iconObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('beforeunload', () => iconObserver.disconnect(), { once: true });
  }

  // initial run
  createIcons({ icons: ICONS });
};
