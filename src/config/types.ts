/**
 * Site-wide configuration options.
 *
 * Override in src/config/site.config.ts for derived projects.
 */
export interface SiteConfig {
  /**
   * Site title (e.g. "Browser Tools").
   */
  title: string;

  /**
   * Site description (e.g. "A collection of browser tools").
   */
  description?: string;

  /**
   * Footer text (e.g. "© 2025 Browser Tools Made with ❤️").
   */
  footerText?: string;

  /**
   * Path/URL to the header logo (e.g. "/favicon.svg").
   */
  logoPath?: string;

  /**
   * Accessible alt text for the logo image.
   */
  logoAlt?: string;

  /**
   * Show/hide the "Examples" section in the sidebar.
   * Mainly used for the base projects and demo/example purpose,
   * should be set to false in derived projects.
   */
  showExamples: boolean;

  /**
   * Sections to group tools into.
   *
   * title: Title of the section.
   * description: Optional description of the section.
   *
   * the order is determined by the order of the keys in the object.
   */
  toolSections?: Record<
    string,
    {
      title: string;
      description?: string;
    }
  >;
}

// Extension-Point for derived projects
declare global {
  interface SiteContextCustom {}
}

export interface SiteContext extends SiteContextCustom {
  config: SiteConfig;
}

export {};
