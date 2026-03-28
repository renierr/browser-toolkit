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

function parseMarkdown(text: string): string {
  let html = text;

  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  html = html.replace(/^\*\*\*(.*)$/gm, '<hr />');

  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-3]>)/g, '$1');
  html = html.replace(/(<\/h[1-3]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr \/>)<\/p>/g, '$1');

  return html;
}

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

  function renderCategories(): void {
    if (!indexData || !categoriesContainer) return;

    const btns = indexData.categories
      .map(
        (cat) => `
      <button class="btn btn-sm btn-ghost sg-category-btn" data-category="${cat.id}">
        ${cat.name}
      </button>
    `
      )
      .join('');

    categoriesContainer.innerHTML = `
      <button class="btn btn-sm btn-ghost sg-category-btn ${activeCategory === 'all' ? 'sg-category-active' : ''}" data-category="all">
        All
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

  function renderGuideList(): void {
    if (!guideList) return;
    const guides = getFilteredGuides();

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

    guideBody.innerHTML = content ? parseMarkdown(content) : '';

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
