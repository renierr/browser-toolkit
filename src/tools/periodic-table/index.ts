import { elements, categoryColors } from './elements';
import type { Element } from './types';

// noinspection JSUnusedGlobalSymbols
export function init(): () => void {
  const grid = document.getElementById('periodic-table-grid');
  const searchInput = document.getElementById('element-search') as HTMLInputElement;
  const detailCard = document.getElementById('selected-element-card');
  const emptySelection = document.getElementById('empty-selection');
  const canvas = document.getElementById('atomic-canvas') as HTMLCanvasElement;
  const legendBtns = document.querySelectorAll('.legend-btn');
  const clearBtn = document.getElementById('clear-filter');
  let animationId: number;
  let activeCategory: string | null = null;

  function renderGrid(filter = ''): void {
    if (!grid) return;
    grid.innerHTML = '';

    elements.forEach((el) => {
      const matchesText =
        !filter ||
        el.name.toLowerCase().includes(filter.toLowerCase()) ||
        el.symbol.toLowerCase().includes(filter.toLowerCase());
      const matchesCategory = !activeCategory || el.category === activeCategory;

      if (!matchesText || !matchesCategory) {
        return;
      }

      const card = document.createElement('div');
      card.className = `element-card border p-1 rounded flex flex-col items-center justify-center text-center ${categoryColors[el.category] || 'bg-base-200'}`;
      card.style.gridColumn = el.x.toString();
      card.style.gridRow = el.y.toString();
      card.dataset.number = el.number.toString();

      card.innerHTML = `
        <span class="text-[10px] font-bold self-start leading-none">${el.number}</span>
        <span class="text-lg font-black leading-tight">${el.symbol}</span>
        <span class="text-[8px] truncate w-full">${el.name}</span>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.element-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        showDetails(el);
      });

      grid.appendChild(card);
    });
  }

  function showDetails(el: Element): void {
    if (!detailCard || !emptySelection) return;
    emptySelection.classList.add('hidden');
    detailCard.classList.remove('hidden');

    const nameEl = document.getElementById('detail-name');
    const categoryEl = document.getElementById('detail-category');
    const symbolEl = document.getElementById('detail-symbol');
    const numberEl = document.getElementById('detail-number');
    const massEl = document.getElementById('detail-mass');
    const configEl = document.getElementById('detail-config');
    const enEl = document.getElementById('detail-electronegativity');
    const densityEl = document.getElementById('detail-density');
    const shellsEl = document.getElementById('detail-shells');
    const isotopesEl = document.getElementById('isotopes-list');
    const symbolBox = document.getElementById('detail-symbol-box');

    if (nameEl) nameEl.textContent = el.name;
    if (categoryEl) categoryEl.textContent = el.category.replace('-', ' ');
    if (symbolEl) symbolEl.textContent = el.symbol;
    if (numberEl) numberEl.textContent = el.number.toString();
    if (massEl) massEl.textContent = el.mass.toString();
    if (configEl) configEl.textContent = el.config;
    if (enEl) enEl.textContent = el.electronegativity?.toString() || 'N/A';
    if (densityEl) densityEl.textContent = el.density ? `${el.density} g/cm³` : 'N/A';

    if (symbolBox) {
      symbolBox.className = `w-16 h-16 flex flex-col items-center justify-center border-4 rounded-lg ${categoryColors[el.category]}`;
    }

    if (shellsEl) {
      shellsEl.innerHTML = el.shells
        .map((s) => `<div class="badge badge-outline">${s}</div>`)
        .join('');
    }

    if (isotopesEl) {
      isotopesEl.innerHTML = el.isotopes
        .map(
          (iso) => `
        <tr>
          <td>${iso.isotope}</td>
          <td>${iso.mass}</td>
          <td>${iso.abundance}</td>
        </tr>
      `
        )
        .join('');
    }

    startVisualization(el);
  }

  function startVisualization(el: Element): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (animationId) cancelAnimationFrame(animationId);

    const dpr = window.devicePixelRatio || 1;
    const size = 300;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let angle = 0;

    function animate(): void {
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      const centerX = size / 2;
      const centerY = size / 2;

      // Nucleus
      ctx.beginPath();
      ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444'; // Red for protons
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX + 5, centerY - 2, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6'; // Blue for neutrons
      ctx.fill();

      // Shells and Electrons
      el.shells.forEach((electronCount, shellIdx) => {
        const radius = 40 + shellIdx * 25;
        const shellAngleOffset = angle * (1 / (shellIdx + 1));

        // Draw Orbit
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)';
        ctx.stroke();

        // Draw Electrons
        for (let i = 0; i < electronCount; i++) {
          const electronAngle = ((Math.PI * 2) / electronCount) * i + shellAngleOffset;
          const ex = centerX + Math.cos(electronAngle) * radius;
          const ey = centerY + Math.sin(electronAngle) * radius;

          ctx.beginPath();
          ctx.arc(ex, ey, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981'; // Green for electrons
          ctx.fill();

          // Glow
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#10b981';
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      angle += 0.01;
      animationId = requestAnimationFrame(animate);
    }

    animate();
  }

  renderGrid();

  const onSearchInput = (): void => {
    renderGrid(searchInput.value);
  };

  const onLegendClick = (btn: HTMLButtonElement): void => {
    const category = btn.dataset.category || null;
    if (activeCategory === category) {
      activeCategory = null;
    } else {
      activeCategory = category;
    }

    updateLegendStyles();

    if (clearBtn) {
      if (activeCategory) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    }

    renderGrid(searchInput.value);
  };

  const updateLegendStyles = (): void => {
    legendBtns.forEach((b) => {
      if (b instanceof HTMLElement) {
        if (b.dataset.category === activeCategory) {
          b.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
        } else {
          b.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
        }
      }
    });
  };

  const onClearFilter = (): void => {
    activeCategory = null;
    updateLegendStyles();
    if (clearBtn) clearBtn.classList.add('hidden');
    renderGrid(searchInput.value);
  };

  const onLegendClickWrapper = (e: Event): void => {
    const btn = e.currentTarget as HTMLButtonElement;
    onLegendClick(btn);
  };

  searchInput?.addEventListener('input', onSearchInput);
  legendBtns.forEach((btn) => {
    if (btn instanceof HTMLButtonElement) {
      btn.addEventListener('click', onLegendClickWrapper);
    }
  });
  clearBtn?.addEventListener('click', onClearFilter);

  return () => {
    if (animationId) cancelAnimationFrame(animationId);
    searchInput?.removeEventListener('input', onSearchInput);
    legendBtns.forEach((btn) => {
      if (btn instanceof HTMLButtonElement) {
        btn.removeEventListener('click', onLegendClickWrapper);
      }
    });
    clearBtn?.removeEventListener('click', onClearFilter);
  };
}
