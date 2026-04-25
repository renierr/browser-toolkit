export const isDarkMode = () => document.documentElement.getAttribute('data-theme') === 'dark';

export function setTheme(mode: string) {
  // daisyUI uses data-theme attribute on html element
  if (mode) {
    document.documentElement.setAttribute('data-theme', mode);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Save to localStorage
  localStorage.setItem('theme', mode || '');
}

export function setupThemeToggle() {
  const themeToggleCheckbox = document.getElementById('theme-toggle') as HTMLInputElement | null;
  if (!themeToggleCheckbox) return;

  const themeToggleFunc = (ev: Event): void => {
    const checked = (ev.currentTarget as HTMLInputElement).checked;
    const next = checked ? 'dark' : 'light';
    setTheme(next);
  };

  themeToggleCheckbox.addEventListener('change', themeToggleFunc);

  const stored = localStorage.getItem('theme');
  if (stored) {
    themeToggleCheckbox.checked = stored === 'dark';
    setTheme(stored);
  } else {
    themeToggleCheckbox.checked = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(themeToggleCheckbox.checked ? 'dark' : 'light');
  }
}

export function applyThemeColor(color: string) {
  const meta = document.getElementById('meta-theme-color') as HTMLMetaElement | null;
  if (meta && color) {
    meta.setAttribute('content', color);
  }
}
