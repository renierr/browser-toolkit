import type { SiteConfig } from './types';

/* copy to site.config.ts to customize */
export const siteConfig = {
  title: 'Browser Tools',
  description: 'Collection of useful tools running only in Browser - with offline support',
  logoPath: './favicon.svg',
  logoAlt: 'Browser Tools',
  footerText: '© 2025 <span class="font-semibold text-brand">Browser Tools</span>',
  showExamples: false,
  toolSections: {
    general: {
      title: 'General',
      description: 'General helper and Utilities.',
    },
    pdf: {
      title: 'PDF Tools',
      description: 'PDF-Tools, Viewers and Editors - 100% offline.',
    },
  },
} satisfies SiteConfig;
