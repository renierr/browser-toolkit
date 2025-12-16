export function setTheme(mode: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', mode === 'dark');

  // Save to localStorage
  localStorage.setItem('theme', mode);

  // Update icon
  const icon = document.getElementById('theme-toggle-icon');
  if (icon) {
    icon.textContent = mode === 'dark' ? '☀️' : '🌙';
  }
}

export function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  // Remove old listeners by cloning
  const newBtn = btn.cloneNode(true) as HTMLElement;
  btn.parentNode?.replaceChild(newBtn, btn);

  const themeToggleFunc = () => {
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  };

  newBtn.addEventListener('click', themeToggleFunc);
  const icon = document.getElementById('theme-toggle-icon');
  if (icon) {
    icon.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
  }
}
