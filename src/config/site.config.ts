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
    images: {
      title: 'Image Tools',
      description: 'Tools for image processing and metadata management.',
    },
    media: {
      title: 'Media Tools',
      description: 'Tools for processing videos, and audio.',
    },
    pdf: {
      title: 'PDF Tools',
      description: 'PDF-Tools, Viewers and Editors.',
    },
    utilities: {
      title: 'Utilities',
      description: 'useful tools for coding and development.',
    },
  },
} satisfies SiteConfig;
