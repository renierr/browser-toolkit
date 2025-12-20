export function setTheme(mode: string) {
  // daisyUI uses data-theme attribute on html element
  if (mode) {
    document.documentElement.setAttribute('data-theme', mode);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Save to localStorage
  localStorage.setItem('theme', mode || '');

  // Update icon
  const icon = document.getElementById('theme-toggle-icon');
  if (icon) {
    // show sun for light-like themes, moon for dark-like themes
    const isDark =
      String(mode).toLowerCase().includes('dark') || String(mode).toLowerCase().includes('night');
    icon.textContent = isDark ? '☀️' : '🌙';
  }
}

export function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  // Remove old listeners by cloning
  const newBtn = btn.cloneNode(true) as HTMLElement;
  btn.parentNode?.replaceChild(newBtn, btn);

  const themeToggleFunc = () => {
    const current = document.documentElement.getAttribute('data-theme') || '';
    // Toggle between 'dark' and 'light' if present, otherwise set 'dark'
    const next = current.toLowerCase().includes('dark') ? 'light' : 'dark';
    setTheme(next);
  };

  newBtn.addEventListener('click', themeToggleFunc);

  const stored = localStorage.getItem('theme');
  if (stored) {
    setTheme(stored);
  } else {
    // initialize icon based on current data-theme or default
    const initial = document.documentElement.getAttribute('data-theme') || '';
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.textContent = String(initial).toLowerCase().includes('dark') ? '☀️' : '🌙';
  }
}
