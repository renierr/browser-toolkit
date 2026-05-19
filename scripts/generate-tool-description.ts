import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteConfig } from '../src/config/site.config';
import { parseToolConfig, ToolConfig } from '../src/js/tool-config';

const ROOT_DIR = process.cwd();
const TOOLS_DIR = join(ROOT_DIR, 'src', 'tools');
const OUTPUT_FILE = join(ROOT_DIR, 'TOOLS.md');

const IS_CHECK_MODE = process.argv.includes('--check');

const SECTION_ORDER = Object.keys(siteConfig.toolSections) as string[];
const SECTION_TITLE = Object.fromEntries(
  Object.entries(siteConfig.toolSections).map(([id, cfg]) => [id, cfg.title])
);

type ToolMetadata = ToolConfig & { id: string };

/**
 * Read all tool config files and normalize the metadata.
 */
function readTools(): ToolMetadata[] {
  const toolFolders = readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const tools: ToolMetadata[] = [];
  const errors: string[] = [];

  for (const toolId of toolFolders) {
    const configPath = join(TOOLS_DIR, toolId, 'config.json');
    if (!existsSync(configPath)) {
      continue;
    }

    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      const config = parseToolConfig(raw, toolId, {
        strict: true,
        sourceId: `src/tools/${toolId}/config.json`,
      });

      tools.push({
        id: toolId,
        ...config,
      });
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Tool configuration validation failed:\n');
    errors.forEach((err) => console.error(`- ${err}`));
    process.exit(1);
  }

  return tools;
}

/**
 * Keep output deterministic to avoid noisy diffs.
 */
function sortTools(a: ToolMetadata, b: ToolMetadata): number {
  const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.order ?? Number.MAX_SAFE_INTEGER;

  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name);
}

/**
 * Render tools inventory to markdown.
 */
function renderMarkdown(tools: ToolMetadata[]): string {
  const lines: string[] = [];
  const totalBackend = tools.filter((t) => t.requiresBackend).length;
  const totalNormal = tools.length - totalBackend;

  lines.push('# Tools Inventory');
  lines.push('');
  lines.push('This file is generated from `src/tools/*/config.json`.');
  lines.push('Run `bun run generate:tool-description` after changing tool metadata.');
  lines.push('');
  lines.push(`- Total tools: **${tools.length}** (${totalNormal} normal, ${totalBackend} backend)`);
  lines.push(`- Sections: ${SECTION_ORDER.map((s) => `\`${s}\``).join(', ')}`);
  lines.push('- Source of truth: `src/tools/<tool-id>/config.json`');
  lines.push('');

  for (const sectionId of SECTION_ORDER) {
    const toolsInSection = tools.filter((tool) => tool.sectionId === sectionId).sort(sortTools);
    if (toolsInSection.length === 0) continue;

    lines.push(`## ${SECTION_TITLE[sectionId] ?? sectionId} (${toolsInSection.length})`);
    lines.push('');

    for (const tool of toolsInSection) {
      const orderText = String(tool.order);
      const canShareTarget =
        tool.shareTarget?.accept && tool.shareTarget.accept.length > 0 ? 'yes' : 'no';
      const shareTargetList =
        tool.shareTarget?.accept && tool.shareTarget.accept.length > 0
          ? tool.shareTarget.accept.map((accept) => `\`${accept}\``).join(', ')
          : '`none`';
      const backendBadge = tool.requiresBackend ? ' 🖥️ **(Backend)**' : '';

      lines.push(`### ${tool.name}${backendBadge} (\`${tool.id}\`)`);
      lines.push(`- Description: ${tool.description}`);
      lines.push(
        `- Metadata: Order \`${orderText}\`, icon \`${tool.icon ?? 'not set'}\`, share target capable \`${canShareTarget}\`, share target accepts ${shareTargetList}.`
      );
      lines.push(`- Source: \`src/tools/${tool.id}/config.json\``);
      lines.push('');
    }
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- `Order` uses the value from each config; default is `0`.');
  lines.push('- `Share target capable` is `yes` when `shareTarget.accept` has at least one entry.');
  lines.push('- Re-run `bun run generate:tool-description` whenever tool metadata changes.');

  return `${lines.join('\n')}\n`;
}

const tools = readTools();

if (IS_CHECK_MODE) {
  console.log(`✅ Validated ${tools.length} tools. No issues found.`);
  process.exit(0);
}

const markdown = renderMarkdown(tools);
writeFileSync(OUTPUT_FILE, markdown, 'utf-8');

console.log(`Generated TOOLS.md for ${tools.length} tools.`);
