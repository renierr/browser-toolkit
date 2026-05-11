# Survival Guide Tool

An offline-first survival guide that provides critical information for wilderness, emergency, and disaster situations. All content is stored locally and works without internet access.

## IMPORTANT: Multi-Language Support

This survival guide supports **multiple languages**. English (`en`) is the default/base language. German (`de`) is also fully supported.

### For AI Agents: Adding New Guides

**ALWAYS provide BOTH translations when adding new content:**

1. **Create content in English first** (`public/survival-guide/en/`)
2. **Then translate to German** (`public/survival-guide/de/`)

This applies to:

- Guide content (`content.md`)
- Categories in `index.json` (translate `name` field)
- Guide entries in `index.json` (translate `title` and `excerpt`)

### Folder Structure

```
public/survival-guide/
├── languages.json           # Language definitions
├── en/                     # English (default)
│   ├── index.json
│   └── [category]/[guide]/content.md
└── de/                     # German (translated)
    ├── index.json
    └── [category]/[guide]/content.md
```

### Overview

The survival guide consists of:

- **Tool code**: `src/tools/survival-guide/` (TypeScript + HTML)
- **Content**: `public/survival-guide/` (Markdown files + index)

### Adding a New Guide

#### Step 1: Create Guide Folder (BOTH Languages)

Create a new folder in BOTH language folders:

```
public/survival-guide/
├── en/
│   ├── index.json
│   ├── fire/
│   │   ├── bow-drill/
│   │   │   └── content.md
│   │   └── new-guide/          <-- create this (English)
│   │       └── content.md
└── de/
    ├── index.json
    ├── fire/
    │   └── new-guide/          <-- create this (German)
    │       └── content.md
```

#### Step 2: Write Content

Create `content.md` with the guide content. Supported markdown:

```markdown
# Title

Introduction paragraph.

## Section

- Bullet points
- With multiple items

### Nested Steps

1. First step
2. Second step

:::tip
Use tip containers for helpful hints.
:::

:::warning
Use warning containers for important cautions.
:::

:::error
Use error containers for critical warnings.
:::

- [ ] Task list
- [ ] Items

> Blockquote for emphasis
```

**Available Containers:**

- `:::tip` - Helpful hints
- `:::warning` - Important cautions
- `:::error` - Critical warnings
- `:::note` - General notes
- `:::success` - Success messages
- `:::info` - Information

#### Step 3: Update index.json (BOTH Languages)

Add the guide entry to **BOTH** `public/survival-guide/en/index.json` AND `public/survival-guide/de/index.json`:

**English (`en/index.json`):**

```json
{
  "categories": [{ "id": "fire", "name": "Fire Starting", "icon": "flame" }],
  "guides": [
    {
      "id": "fire-new-guide",
      "title": "New Guide Title",
      "excerpt": "Brief description (1-2 sentences) for search and display.",
      "category": "fire",
      "tags": ["tag1", "tag2", "relevant-keywords"],
      "contentPath": "fire/new-guide/content.md"
    }
  ]
}
```

**German (`de/index.json`) - TRANSLATED:**

```json
{
  "categories": [{ "id": "fire", "name": "Feuer machen", "icon": "flame" }],
  "guides": [
    {
      "id": "fire-new-guide",
      "title": "Neuer Leitfaden Titel",
      "excerpt": "Kurze Beschreibung (1-2 Sätze) für Suche und Anzeige.",
      "category": "fire",
      "tags": ["tag1", "tag2", "relevant-keywords"],
      "contentPath": "fire/new-guide/content.md"
    }
  ]
}
```

### index.json Schema

```typescript
type Guide = {
  id: string; // Unique ID (e.g., "fire-bow-drill")
  title: string; // Display title (TRANSLATED in de/index.json)
  excerpt: string; // Brief description for search results (TRANSLATED in de/index.json)
  category: string; // Category ID from categories array (same across languages)
  tags: string[]; // Search keywords (can be same or translated)
  contentPath: string; // Path to content.md (relative to language folder, e.g., "fire/bow-drill/content.md")
};

type Category = {
  id: string; // Unique ID (e.g., "fire")
  name: string; // Display name (e.g., "Fire Starting")
  icon: string; // Lucide icon name
};

type IndexData = {
  categories: Category[];
  guides: Guide[];
};
```

### Adding Images

**Prefer SVG format** - SVGs scale perfectly on all screen sizes and work well for diagrams, illustrations, and charts.

Place images in the guide folder:

```
public/survival-guide/
├── fire/
│   └── bow-drill/
│       ├── content.md
│       └── diagram.svg
```

#### Display in Text

Reference images inline in your content.md where they are most relevant. Use path relative to public folder:

```markdown
![Description of image](./survival-guide/fire/bow-drill/diagram.svg)
```

The path starts with `./survival-guide/` followed by the path to the image file.

**Note:** Only use inline images in markdown. The `images` array in index.json is deprecated.

### Adding a New Category (BOTH Languages)

1. Add to `categories` array in **BOTH** `en/index.json` AND `de/index.json`:

**English (`en/index.json`):**

```json
{
  "id": "new-category",
  "name": "New Category Name",
  "icon": "icon-name"
}
```

**German (`de/index.json`) - TRANSLATED:**

```json
{
  "id": "new-category",
  "name": "Neue Kategorie Name",
  "icon": "icon-name"
}
```

2. Create folder structure in BOTH languages:

```
public/survival-guide/en/new-category/
└── new-guide/
    └── content.md

public/survival-guide/de/new-category/
└── new-guide/
    └── content.md
```

### Content Guidelines

- **Keep guides focused**: One specific skill/topic per guide
- **Use clear structure**: Steps, tips, warnings
- **Include checklists**: Use task lists for procedural guides
- **Add search tags**: Include relevant keywords for discoverability
- **Write for survival context**: Assume reader is in emergency situation

### Lucide Icons

Available icons for categories (from Lucide icon set):

- flame, droplet, heart-pulse, home, compass, utensils, radio, cloud, backpack, etc.

### Example Guide Structure

```markdown
# Guide Title

Brief introduction - what this guide covers and why it matters.

## What You Need

- Item 1: Description
- Item 2: Description

:::tip
Helpful hint about materials or preparation.
:::

## Steps

1. **Step one**
   - Sub-step detail
   - More detail

2. **Step two**
   - Detail

:::warning
Important caution or warning.
:::

## Troubleshooting

- **Problem**: Solution
- **Problem**: Solution

## Related Guides

- [Link to related guide](#)
```

### Verification

After adding a guide (in BOTH languages):

1. Run `bun x tsc` to check for TypeScript errors
2. Verify the guide appears in English
3. Switch to German and verify the translated guide appears
4. Test search functionality works in both languages
5. Test category filtering works in both languages
