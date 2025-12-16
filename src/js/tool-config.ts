import type { Tool } from './types';

export type ToolConfig = {
  name: string;
  description: string;
  draft: boolean;
  example: boolean;

  tags: string[];
  keywords: string[];
  icon?: string;

  order: number;
  sectionId?: string;
};

type BuildToolParams = {
  folder: string;
  html: string;
  initScript?: () => void;
  config: ToolConfig;
};

const DEFAULTS: Omit<ToolConfig, 'name'> = {
  description: 'No description',
  draft: false,
  example: false,
  tags: [],
  keywords: [],
  order: 0,
  sectionId: undefined,
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
    return { name: fallbackName, ...DEFAULTS };
  }

  // Validate field types in strict mode
  if (raw.name !== undefined && typeof raw.name !== 'string') {
    failOrSkip(`${ctx}: Field "name" must be a string, got ${typeOf(raw.name)}.`, strict);
  }
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    failOrSkip(
      `${ctx}: Field "description" must be a string, got ${typeOf(raw.description)}.`,
      strict
    );
  }
  if (raw.draft !== undefined && typeof raw.draft !== 'boolean') {
    failOrSkip(`${ctx}: Field "draft" must be a boolean, got ${typeOf(raw.draft)}.`, strict);
  }
  if (raw.example !== undefined && typeof raw.example !== 'boolean') {
    failOrSkip(`${ctx}: Field "example" must be a boolean, got ${typeOf(raw.example)}.`, strict);
  }
  if (raw.tags !== undefined && !asStringArray(raw.tags)) {
    failOrSkip(`${ctx}: Field "tags" must be a string[], got ${typeOf(raw.tags)}.`, strict);
  }
  if (raw.keywords !== undefined && !asStringArray(raw.keywords)) {
    failOrSkip(`${ctx}: Field "keywords" must be a string[], got ${typeOf(raw.keywords)}.`, strict);
  }
  if (raw.icon !== undefined && typeof raw.icon !== 'string') {
    failOrSkip(`${ctx}: Field "icon" must be a string, got ${typeOf(raw.icon)}.`, strict);
  }
  if (raw.order !== undefined && typeof raw.order !== 'number') {
    failOrSkip(`${ctx}: Field "order" must be a number, got ${typeOf(raw.order)}.`, strict);
  }
  if (raw.sectionId !== undefined && typeof raw.sectionId !== 'string') {
    failOrSkip(`${ctx}: Field "sectionId" must be a string, got ${typeOf(raw.sectionId)}.`, strict);
  }

  const name = asString(raw.name)?.trim() || fallbackName;
  const description = asString(raw.description)?.trim() || DEFAULTS.description;
  const sectionId = asString(raw.sectionId)?.trim() || undefined;

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
  };
}

export function buildTool({ folder, html, initScript, config }: BuildToolParams): Tool {
  return {
    name: config.name,
    description: config.description,
    path: folder,
    html,
    script: initScript,
    draft: config.draft,
    example: config.example,
    icon: config.icon,
    order: config.order,
    sectionId: config.sectionId,
  };
}
