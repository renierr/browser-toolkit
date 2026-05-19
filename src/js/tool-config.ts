import type { ShareTargetConfig, Tool, ToolModule } from './types';

export type ToolConfig = {
  name: string;
  description: string;
  draft: boolean;
  example: boolean;

  tags: string[];
  keywords: string[];
  icon?: string;

  order: number;
  sectionId: string;

  hideHeader?: boolean;
  hideFooter?: boolean;

  /**
   * Optional share target configuration.
   * If defined, this tool will receive shared files matching the specified MIME types.
   */
  shareTarget?: ShareTargetConfig;

  requiresBackend?: boolean;
};

type BuildToolParams = {
  folder: string;
  html: string;
  loadHtml?: () => Promise<string | { template: string; partials: Record<string, string> }>;
  loadScript?: () => Promise<ToolModule>;
  config: ToolConfig;
};

const DEFAULTS: Omit<ToolConfig, 'name'> = {
  description: 'No description',
  draft: false,
  example: false,
  tags: [],
  keywords: [],
  order: 0,
  sectionId: 'utilities',
  shareTarget: undefined,
  requiresBackend: false,
};

type ParseOptions = {
  strict?: boolean; // in dev: true => throw on invalid fields
  sourceId?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function typeOf(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function failOrSkip(message: string, strict: boolean): void {
  if (strict) throw new Error(message);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x) => typeof x === 'string') as string[];
  return out.length === v.length ? out : undefined;
}

export function parseToolConfig(
  raw: unknown,
  fallbackName: string,
  options: ParseOptions = {}
): ToolConfig {
  const strict = options.strict ?? false;
  const ctx = options.sourceId ? `Tool config (${options.sourceId})` : 'Tool config';

  if (!isRecord(raw)) {
    failOrSkip(`${ctx}: Expected a JSON object, got ${typeOf(raw)}.`, strict);
    return { name: fallbackName, ...DEFAULTS, sectionId: 'utilities' };
  }

  const errors: string[] = [];

  // Helper to check types and collect errors
  const check = (field: string, type: string, value: unknown) => {
    if (value !== undefined && typeOf(value) !== type) {
      errors.push(`Field "${field}" must be a ${type}, got ${typeOf(value)}.`);
    }
  };

  check('name', 'string', raw.name);
  check('description', 'string', raw.description);
  check('draft', 'boolean', raw.draft);
  check('example', 'boolean', raw.example);
  check('requiresBackend', 'boolean', raw.requiresBackend);
  check('icon', 'string', raw.icon);
  check('order', 'number', raw.order);
  check('sectionId', 'string', raw.sectionId);
  check('hideHeader', 'boolean', raw.hideHeader);
  check('hideFooter', 'boolean', raw.hideFooter);

  if (raw.tags !== undefined && !asStringArray(raw.tags)) {
    errors.push(`Field "tags" must be a string array.`);
  }
  if (raw.keywords !== undefined && !asStringArray(raw.keywords)) {
    errors.push(`Field "keywords" must be a string array.`);
  }

  if (raw.shareTarget !== undefined) {
    if (!isRecord(raw.shareTarget)) {
      errors.push(`Field "shareTarget" must be an object.`);
    } else if (!asStringArray(raw.shareTarget.accept)) {
      errors.push(`Field "shareTarget.accept" must be a string array.`);
    }
  }

  if (errors.length > 0 && strict) {
    throw new Error(`${ctx} validation failed:\n- ${errors.join('\n- ')}`);
  } else if (errors.length > 0) {
    console.warn(`${ctx} validation warnings:\n- ${errors.join('\n- ')}`);
  }

  const name = asString(raw.name)?.trim() || fallbackName;
  const description = asString(raw.description)?.trim() || DEFAULTS.description;
  const sectionId = asString(raw.sectionId)?.trim() || 'utilities';

  // Parse shareTarget config
  let shareTarget: ShareTargetConfig | undefined = undefined;
  if (isRecord(raw.shareTarget) && asStringArray(raw.shareTarget.accept)) {
    shareTarget = { accept: asStringArray(raw.shareTarget.accept)! };
  }

  return {
    name,
    description,
    draft: asBool(raw.draft) ?? DEFAULTS.draft,
    example: asBool(raw.example) ?? DEFAULTS.example,
    tags: asStringArray(raw.tags) ?? DEFAULTS.tags,
    keywords: asStringArray(raw.keywords) ?? DEFAULTS.keywords,
    icon: asString(raw.icon),
    order: asNumber(raw.order) ?? DEFAULTS.order,
    sectionId,
    hideHeader: asBool(raw.hideHeader),
    hideFooter: asBool(raw.hideFooter),
    shareTarget,
    requiresBackend: asBool(raw.requiresBackend) ?? DEFAULTS.requiresBackend,
  };
}

export function buildTool({ folder, html, loadHtml, loadScript, config }: BuildToolParams): Tool {
  return {
    name: config.name,
    description: config.description,
    path: folder,
    html,
    loadHtml,
    loadScript,
    draft: config.draft,
    example: config.example,
    icon: config.icon,
    order: config.order,
    sectionId: config.sectionId,
    hideHeader: config.hideHeader,
    hideFooter: config.hideFooter,
    shareTarget: config.shareTarget,
    requiresBackend: config.requiresBackend,
  };
}
