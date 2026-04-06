import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = process.cwd();
const TOOLS_DIR = join(ROOT_DIR, 'src', 'tools');
const OUTPUT_FILE = join(ROOT_DIR, 'TOOLS.md');

const SECTION_ORDER = ['general', 'images', 'media', 'pdf', 'utilities', 'devices'];
const SECTION_TITLE = {
  general: 'General',
  images: 'Images',
  media: 'Media',
  pdf: 'PDF',
  utilities: 'Utilities',
  devices: 'Devices',
};

/** @typedef {{name?: string, description?: string, icon?: string, order?: number, sectionId?: string, shareTarget?: {accept?: string[]}}} ToolConfig */

/**
 * Read all tool config files and normalize the metadata.
 * @returns {Array<{
 * id: string;
 * name: string;
 * description: string;
 * icon: string;
 * order: number | null;
 * sectionId: string;
 * shareTargetAccept: string[];
 * }>}
 */
function readTools() {
  const toolFolders = readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const tools = [];

  for (const toolId of toolFolders) {
    const configPath = join(TOOLS_DIR, toolId, 'config.json');
    if (!existsSync(configPath)) {
      continue;
    }
    /** @type {ToolConfig} */
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));

    tools.push({
      id: toolId,
      name: raw.name?.trim() || toolId,
      description: raw.description?.trim() || 'No description provided.',
      icon: raw.icon?.trim() || 'not set',
      order: typeof raw.order === 'number' ? raw.order : null,
      sectionId: raw.sectionId?.trim() || 'utilities',
      shareTargetAccept: Array.isArray(raw.shareTarget?.accept)
        ? raw.shareTarget.accept.filter((value) => typeof value === 'string' && value.trim().length > 0)
        : [],
    });
  }

  return tools;
}

/**
 * Keep output deterministic to avoid noisy diffs.
 * @param {ReturnType<typeof readTools>[number]} a
 * @param {ReturnType<typeof readTools>[number]} b
 */
function sortTools(a, b) {
  const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.order ?? Number.MAX_SAFE_INTEGER;

  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name);
}

/**
 * @param {ReturnType<typeof readTools>} tools
 * @returns {string}
 */
function renderMarkdown(tools) {
  const lines = [];

  lines.push('# Tools Inventory');
  lines.push('');
  lines.push('This file is generated from `src/tools/*/config.json`.');
  lines.push('Run `pnpm generate:tool-description` after changing tool metadata.');
  lines.push('');
  lines.push(`- Total tools: **${tools.length}**`);
  lines.push('- Sections: `general`, `images`, `media`, `pdf`, `utilities`, `devices`');
  lines.push('- Source of truth: `src/tools/<tool-id>/config.json`');
  lines.push('');

  for (const sectionId of SECTION_ORDER) {
    const toolsInSection = tools.filter((tool) => tool.sectionId === sectionId).sort(sortTools);
    if (toolsInSection.length === 0) continue;

    lines.push(`## ${SECTION_TITLE[sectionId] ?? sectionId} (${toolsInSection.length})`);
    lines.push('');

    for (const tool of toolsInSection) {
      const orderText = tool.order === null ? 'not set' : String(tool.order);
      const canShareTarget = tool.shareTargetAccept.length > 0 ? 'yes' : 'no';
      const shareTargetList =
        tool.shareTargetAccept.length > 0
          ? tool.shareTargetAccept.map((accept) => `\`${accept}\``).join(', ')
          : '`none`';

      lines.push(`### ${tool.name} (\`${tool.id}\`)`);
      lines.push(`- Description: ${tool.description}`);
      lines.push(
        `- Metadata: Order \`${orderText}\`, icon \`${tool.icon}\`, share target capable \`${canShareTarget}\`, share target accepts ${shareTargetList}.`
      );
      lines.push(`- Source: \`src/tools/${tool.id}/config.json\``);
      lines.push('');
    }
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- `Order` uses the value from each config; `not set` means the field is missing.');
  lines.push('- `Share target capable` is `yes` when `shareTarget.accept` has at least one entry.');
  lines.push('- Re-run `pnpm generate:tool-description` whenever tool metadata changes.');

  return `${lines.join('\n')}\n`;
}

const tools = readTools();
const markdown = renderMarkdown(tools);
writeFileSync(OUTPUT_FILE, markdown, 'utf-8');

console.log(`Generated TOOLS.md for ${tools.length} tools.`);

