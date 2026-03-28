import { createMarkdownRenderer } from '../../js/markdown-renderer';

type Guide = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  contentPath: string;
  images?: string[];
};

type Category = {
  id: string;
  name: string;
  icon: string;
};

type IndexData = {
  categories: Category[];
  guides: Guide[];
};

const BASE_PATH = '/survival-guide/';
const renderer = createMarkdownRenderer();

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return q.length / t.length;
  let qi = 0;
  let score = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 1;
      qi++;
    }
  }
  return qi === q.length ? score / t.length : 0;
}

export default function init(): () => void {
  let indexData: IndexData | null = null;
  let activeCategory = 'all';
  let activeGuideId: string | null = null;
  let loadedGuides: Map<string, string> = new Map();

  const searchInput = document.getElementById('sg-search') as HTMLInputElement;
  const clearSearchBtn = document.getElementById('sg-clear-search');
  const categoriesContainer = document.getElementById('sg-categories');
  const guideList = document.getElementById('sg-guide-list');
  const guideDetail = document.getElementById('sg-guide-detail');
  const detailEmpty = document.getElementById('sg-detail-empty');
  const detailContent = document.getElementById('sg-detail-content');
  const guideTitle = document.getElementById('sg-guide-title');
  const guideTags = document.getElementById('sg-guide-tags');
  const guideImages = document.getElementById('sg-guide-images');
  const guideBody = document.getElementById('sg-guide-body');
  const backBtn = document.getElementById('sg-back-btn');

  async function loadIndex(): Promise<void> {
    try {
      const res = await fetch(BASE_PATH + 'index.json');
      if (!res.ok) throw new Error('Failed to load index');
      indexData = await res.json();
      renderCategories();
      renderGuideList();
    } catch (e) {
      console.error('[SurvivalGuide] Failed to load index:', e);
      if (guideList)
        guideList.innerHTML = '<div class="text-center text-error p-4">Failed to load guides</div>';
    }
  }

  function getCategoryCount(categoryId: string): number {
    if (!indexData) return 0;
    if (categoryId === 'all') return indexData.guides.length;
    return indexData.guides.filter((g) => g.category === categoryId).length;
  }

  function renderCategories(): void {
    if (!indexData || !categoriesContainer) return;

    const btns = indexData.categories
      .map((cat) => {
        const count = getCategoryCount(cat.id);
        return `
        <button class="btn btn-sm btn-ghost sg-category-btn" data-category="${cat.id}">
          ${cat.name} <span class="badge badge-sm sg-cat-count" data-count-category="${cat.id}">${count}</span>
        </button>
      `;
      })
      .join('');

    const totalCount = getCategoryCount('all');

    categoriesContainer.innerHTML = `
      <button class="btn btn-sm btn-ghost sg-category-btn ${activeCategory === 'all' ? 'sg-category-active' : ''}" data-category="all">
        All <span id="sg-total-count" class="badge badge-sm">${totalCount}</span>
      </button>
      ${btns}
    `;

    categoriesContainer.querySelectorAll('.sg-category-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        activeCategory = target.dataset.category || 'all';
        updateCategoryButtons();
        renderGuideList();
      });
    });
  }

  function updateCategoryButtons(): void {
    if (!categoriesContainer) return;
    categoriesContainer.querySelectorAll('.sg-category-btn').forEach((btn) => {
      const b = btn as HTMLButtonElement;
      if (b.dataset.category === activeCategory) {
        b.classList.add('sg-category-active', 'btn-primary');
        b.classList.remove('btn-ghost');
      } else {
        b.classList.remove('sg-category-active', 'btn-primary');
        b.classList.add('btn-ghost');
      }
    });
  }

  function getFilteredGuides(): Guide[] {
    if (!indexData) return [];
    const query = searchInput.value.trim().toLowerCase();

    return indexData.guides.filter((guide) => {
      const matchesCategory = activeCategory === 'all' || guide.category === activeCategory;

      if (!query) return matchesCategory;

      const score =
        fuzzyScore(query, guide.title) +
        fuzzyScore(query, guide.excerpt) +
        guide.tags.reduce((sum, tag) => sum + fuzzyScore(query, tag), 0);

      return matchesCategory && score > 0;
    });
  }

  function updateCategoryCounts(): void {
    if (!indexData || !categoriesContainer) return;
    const query = searchInput.value.trim().toLowerCase();

    const totalCountEl = document.getElementById('sg-total-count');
    if (totalCountEl) {
      const totalFiltered = getFilteredGuides().length;
      totalCountEl.textContent = totalFiltered.toString();
    }

    const data = indexData;
    const container = categoriesContainer;
    data.categories.forEach((cat) => {
      const countEl = container.querySelector(`.sg-cat-count[data-count-category="${cat.id}"]`);
      if (countEl) {
        let count: number;
        if (!query) {
          count = data.guides.filter((g) => g.category === cat.id).length;
        } else {
          count = data.guides.filter((g) => {
            const matchesCategory = g.category === cat.id;
            if (!matchesCategory) return false;
            const score =
              fuzzyScore(query, g.title) +
              fuzzyScore(query, g.excerpt) +
              g.tags.reduce((sum, tag) => sum + fuzzyScore(query, tag), 0);
            return score > 0;
          }).length;
        }
        countEl.textContent = count.toString();
      }
    });
  }

  function renderGuideList(): void {
    if (!guideList) return;
    const guides = getFilteredGuides();

    updateCategoryCounts();

    if (guides.length === 0) {
      guideList.innerHTML =
        '<div class="text-center text-base-content/50 py-10">No guides found</div>';
      return;
    }

    guideList.innerHTML = guides
      .map(
        (guide) => `
        <div class="sg-guide-card ${activeGuideId === guide.id ? 'sg-active' : ''}" data-guide-id="${guide.id}">
          <div class="font-semibold text-sm">${guide.title}</div>
          <div class="text-xs text-base-content/60 line-clamp-2">${guide.excerpt}</div>
          <div class="flex flex-wrap gap-1 mt-2">
            ${guide.tags
              .slice(0, 3)
              .map((tag) => `<span class="badge badge-xs badge-outline">${tag}</span>`)
              .join('')}
          </div>
        </div>
      `
      )
      .join('');

    guideList.querySelectorAll('.sg-guide-card').forEach((card) => {
      card.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const guideId = target.dataset.guideId;
        if (guideId) await selectGuide(guideId);
      });
    });
  }

  async function selectGuide(guideId: string): Promise<void> {
    activeGuideId = guideId;
    const guide = indexData?.guides.find((g) => g.id === guideId);
    if (!guide) return;

    if (!detailEmpty || !detailContent || !guideTitle || !guideTags || !guideImages || !guideBody)
      return;

    detailEmpty.classList.add('hidden');
    detailContent.classList.remove('hidden');

    guideTitle.textContent = guide.title;

    guideTags.innerHTML = guide.tags
      .map((tag) => `<span class="badge badge-sm badge-outline">${tag}</span>`)
      .join('');

    guideImages.innerHTML = '';

    if (guide.images && guide.images.length > 0) {
      guideImages.classList.remove('hidden');
      for (const img of guide.images) {
        const imgEl = document.createElement('img');
        imgEl.src = BASE_PATH + img;
        imgEl.alt = guide.title;
        imgEl.className = 'w-full rounded-lg';
        imgEl.loading = 'lazy';
        guideImages.appendChild(imgEl);
      }
    } else {
      guideImages.classList.add('hidden');
    }

    let content = loadedGuides.get(guideId);
    if (!content) {
      try {
        const res = await fetch(BASE_PATH + guide.contentPath);
        if (res.ok) {
          content = await res.text();
          loadedGuides.set(guideId, content);
        }
      } catch (e) {
        console.error('[SurvivalGuide] Failed to load guide:', e);
        content = '<p class="text-error">Failed to load content</p>';
      }
    }

    guideBody.innerHTML = content ? renderer.render(content) : '';

    renderGuideList();

    if (window.innerWidth < 768 && guideList && guideDetail) {
      guideList.classList.add('hidden');
      guideDetail.classList.remove('hidden');
    }
  }

  function handleSearch(): void {
    const hasQuery = searchInput.value.trim().length > 0;
    if (clearSearchBtn) {
      clearSearchBtn.classList.toggle('hidden', !hasQuery);
    }
    renderGuideList();
  }

  function showListView(): void {
    if (guideList && guideDetail) {
      guideList.classList.remove('hidden');
      guideDetail.classList.add('hidden');
    }
  }

  searchInput?.addEventListener('input', handleSearch);
  clearSearchBtn?.addEventListener('click', () => {
    searchInput.value = '';
    handleSearch();
  });
  backBtn?.addEventListener('click', showListView);

  loadIndex();

  return () => {
    searchInput?.removeEventListener('input', handleSearch);
    clearSearchBtn?.removeEventListener('click', () => {
      searchInput.value = '';
      handleSearch();
    });
    backBtn?.removeEventListener('click', showListView);
  };
}
