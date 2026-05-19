import { siteContext } from '../../config';
import { buildTool, parseToolConfig } from '../tool-config.ts';
import { isDev } from '../utils.ts';
import type { Tool, ToolModule } from '../types.ts';

const descModules = import.meta.glob('@tools/**/config.json', { eager: true });
const assetModules = import.meta.glob(['@tools/**/*.html', '@tools/**/*.css', '@css/**/*.css'], {
  query: '?raw',
  import: 'default',
});
const scriptModules = import.meta.glob('@tools/**/index.ts');

function toCssAliasKey(moduleKey: string): string | null {
  const marker = '/src/css/';

  if (moduleKey.startsWith('@css/')) return moduleKey;
  if (moduleKey.startsWith('src/css/')) return `@css/${moduleKey.substring('src/css/'.length)}`;

  const markerIndex = moduleKey.indexOf(marker);
  if (markerIndex >= 0) {
    return `@css/${moduleKey.substring(markerIndex + marker.length)}`;
  }

  return null;
}

function getAssetString(moduleValue: unknown): string {
  if (typeof moduleValue === 'string') return moduleValue;
  if (
    typeof moduleValue === 'object' &&
    moduleValue !== null &&
    'default' in moduleValue &&
    typeof (moduleValue as { default: unknown }).default === 'string'
  ) {
    return (moduleValue as { default: string }).default;
  }

  return '';
}

export async function buildToolsList(): Promise<Tool[]> {
  const result: Tool[] = [];

  for (const pathKey in descModules) {
    const match = pathKey.match(/(.+)\/([^/]+)\/config\.json$/);
    if (!match) {
      console.warn('[script] unexpected module key, skipping:', pathKey);
      continue;
    }

    const prefix = match[1];
    const folder = match[2];

    const rawDesc = (descModules[pathKey] as { default?: unknown }).default;
    const toolConfig = parseToolConfig(rawDesc, folder, { strict: isDev, sourceId: pathKey });

    if (!siteContext.config.showExamples && toolConfig.example) continue;
    if (toolConfig.draft && !isDev) continue;

    const toolFolderPrefix = `${prefix}/${folder}/`;
    const assetKeys = Object.keys(assetModules).filter((k) => {
      if (k.startsWith(toolFolderPrefix)) return true;
      return toCssAliasKey(k) !== null;
    });

    let loadHtml:
      | (() => Promise<string | { template: string; partials: Record<string, string> }>)
      | undefined;

    if (assetKeys.length > 0) {
      loadHtml = async () => {
        const results: Record<string, string> = {};
        await Promise.all(
          assetKeys.map(async (key) => {
            const importerOrValue = assetModules[key];
            const content =
              typeof importerOrValue === 'function' ? await importerOrValue() : importerOrValue;
            const fileName = key.startsWith(toolFolderPrefix)
              ? key.substring(toolFolderPrefix.length)
              : (toCssAliasKey(key) ?? key);
            results[fileName] = getAssetString(content);
          })
        );

        return {
          template: results['template.html'] || '',
          partials: results,
        };
      };
    }

    const scriptKey = Object.keys(scriptModules).find((k) => k === `${prefix}/${folder}/index.ts`);
    let loadScript: (() => Promise<ToolModule>) | undefined;
    if (scriptKey) {
      loadScript = scriptModules[scriptKey] as () => Promise<ToolModule>;
    }

    result.push(buildTool({ folder, html: '', loadHtml, loadScript, config: toolConfig }));
  }

  return result;
}
