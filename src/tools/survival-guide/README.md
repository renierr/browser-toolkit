# Survival Guide Tool

An offline-first survival guide that provides critical information for wilderness, emergency, and disaster situations. All content is stored locally and works without internet access.

## For AI Agents: Adding New Guides

### Overview

The survival guide consists of:

- **Tool code**: `src/tools/survival-guide/` (TypeScript + HTML)
- **Content**: `public/survival-guide/` (Markdown files + index)

### Adding a New Guide

#### Step 1: Create Guide Folder

Create a new folder in the appropriate category:

```
public/survival-guide/
├── index.json
├── fire/
│   ├── bow-drill/
│   │   └── content.md
│   └── new-guide/          <-- create this
│       └── content.md      <-- create this
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

#### Step 3: Update index.json

Add the guide entry to `public/survival-guide/index.json`:

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

### index.json Schema

```typescript
type Guide = {
  id: string; // Unique ID (e.g., "fire-bow-drill")
  title: string; // Display title
  excerpt: string; // Brief description for search results
  category: string; // Category ID from categories array
  tags: string[]; // Search keywords
  contentPath: string; // Path to content.md (from public/survival-guide/)
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

Place images in the guide folder:

```
public/survival-guide/
├── fire/
│   └── bow-drill/
│       ├── content.md
│       └── diagram.jpg
```

Reference in content.md:

```markdown
![Description of image](bow-drill/diagram.jpg)
```

To display images in the UI, add them to index.json:

```json
{
  "id": "fire-bow-drill",
  "title": "Bow Drill",
  "contentPath": "fire/bow-drill/content.md",
  "images": ["fire/bow-drill/diagram.jpg"]
}
```

### Adding a New Category

1. Add to `categories` array in index.json:

```json
{
  "id": "new-category",
  "name": "New Category Name",
  "icon": "icon-name"
}
```

2. Create folder structure:

```
public/survival-guide/new-category/
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

After adding a guide:

1. Run `pnpm tsc` to check for TypeScript errors
2. Verify the guide appears in the tool
3. Test search functionality works
4. Test category filtering works
