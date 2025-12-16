import type { SiteConfig } from './types';

/* copy to site.config.ts to customize */
export const siteConfig = {
  title: 'Vanilla Toolkit',
  description: 'Collection of useful vanilla JavaScript tools – no framework, easily extendable',
  logoPath: '/favicon.svg',
  logoAlt: 'Vanilla Toolkit',
  footerText: '© 2025 <span class="font-semibold text-brand">Vanilla Toolkit</span> Made with ❤️',
  showExamples: true, // override me to remove the example tools
  toolSections: {
    general: {
      title: 'General',
      description: 'General helper and Utilities.',
    },
    examples: {
      title: 'Examples',
      description: 'Demo-Tools, to show some tools and structure.',
    },
  },
} satisfies SiteConfig;
