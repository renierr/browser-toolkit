export function initOverviewScrollToTop(): void {
  const btn = document.getElementById('scroll-to-top') as HTMLButtonElement | null;
  if (!btn) return;

  const thresholdPx = 150;

  const setVisible = (visible: boolean): void => {
    btn.classList.toggle('opacity-0', !visible);
    btn.classList.toggle('pointer-events-none', !visible);
  };

  const update = (): void => {
    setVisible(window.scrollY > thresholdPx);
  };

  let scheduled = false;
  const onScroll = (): void => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  };

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
}
