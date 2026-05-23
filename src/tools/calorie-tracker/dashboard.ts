import { drawTrendChart } from './chart';
import { getAllMeals, type Meal } from './db';

export type DashboardElements = {
  calorieCircle: SVGCircleElement;
  calConsumedText: HTMLSpanElement;
  calGoalText: HTMLSpanElement;
  calDeltaBadge: HTMLSpanElement;

  proteinConsumedText: HTMLSpanElement;
  proteinGoalText: HTMLSpanElement;
  proteinProgressBar: HTMLProgressElement;

  carbsConsumedText: HTMLSpanElement;
  carbsGoalText: HTMLSpanElement;
  carbsProgressBar: HTMLProgressElement;

  fatConsumedText: HTMLSpanElement;
  fatGoalText: HTMLSpanElement;
  fatProgressBar: HTMLProgressElement;

  summaryDateLabel: HTMLSpanElement;

  trendCanvas: HTMLCanvasElement;
  chartEmptyState: HTMLDivElement;

  logsTbody: HTMLTableSectionElement;
  logsEmptyState: HTMLDivElement;
  historyFilterSelect: HTMLSelectElement;
  historyDateFilter: HTMLInputElement;
};

// Store active preview URLs so they can be revoked on redraw
const activeObjectUrls: string[] = [];

/**
 * Revokes all created object URLs to prevent memory leaks.
 */
export function cleanupDashboardPreviews() {
  for (const url of activeObjectUrls) {
    URL.revokeObjectURL(url);
  }
  activeObjectUrls.length = 0;
}

/**
 * Dynamically builds HTML table rows for logged meals.
 */
export function renderHistoryLogs(
  meals: Meal[],
  elements: Pick<DashboardElements, 'logsTbody' | 'logsEmptyState'>
) {
  cleanupDashboardPreviews();

  const { logsTbody, logsEmptyState } = elements;

  if (meals.length === 0) {
    logsTbody.innerHTML = '';
    logsEmptyState.classList.remove('hidden');
    return;
  }
  logsEmptyState.classList.add('hidden');

  logsTbody.innerHTML = meals
    .map((m) => {
      let previewHtml = `<div class="w-10 h-10 rounded bg-base-200 border border-base-300 flex items-center justify-center opacity-45"><i data-lucide="image" class="w-5 h-5"></i></div>`;
      if (m.imageBlob) {
        const url = URL.createObjectURL(m.imageBlob);
        activeObjectUrls.push(url);
        previewHtml = `<img class="w-10 h-10 object-cover rounded border border-base-300 cursor-pointer hover:scale-110 active:scale-95 transition-all duration-200 show-details-img" data-id="${m.id}" src="${url}" alt="dish" title="Click to view details & large image" />`;
      }

      const dateStr = new Date(m.timestamp).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
      const dateDayStr = new Date(m.timestamp).toLocaleDateString();

      return `
      <tr class="hover:bg-base-200/50 transition-colors">
        <td>${previewHtml}</td>
        <td>
          <div class="font-extrabold text-sm text-base-content">${m.foodName}</div>
          <div class="text-[10px] opacity-40 font-bold">${dateDayStr} @ ${dateStr}</div>
          ${m.notes ? `<div class="text-[11px] opacity-60 mt-0.5 line-clamp-1 italic max-w-sm">${m.notes}</div>` : ''}
        </td>
        <td class="text-right font-black text-orange-500 text-sm">${m.calories} kcal</td>
        <td class="text-right hidden sm:table-cell text-xs opacity-75 font-semibold">${m.protein}g</td>
        <td class="text-right hidden sm:table-cell text-xs opacity-75 font-semibold">${m.carbs}g</td>
        <td class="text-right hidden sm:table-cell text-xs opacity-75 font-semibold">${m.fat}g</td>
        <td>
          <div class="flex gap-1 justify-center">
            <button class="btn btn-ghost btn-xs text-secondary export-pdf-btn" data-id="${m.id}" title="Export PDF Report">
              <i data-lucide="file-down" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn btn-ghost btn-xs edit-log-btn" data-id="${m.id}" title="Edit Log">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn btn-ghost btn-xs text-error delete-log-btn" data-id="${m.id}" title="Delete Log">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');
}

/**
 * Loads meals from IndexedDB, performs metrics aggregation, and renders progress gauges and history log.
 */
export async function loadAndRenderDashboard(
  db: IDBDatabase,
  settings: any,
  elements: DashboardElements
) {
  try {
    const all = await getAllMeals(db);

    // Apply History Duration Filters
    const filterType = elements.historyFilterSelect.value;
    let filtered = all;

    if (filterType === 'today') {
      const todayStr = new Date().toDateString();
      filtered = all.filter((m) => new Date(m.timestamp).toDateString() === todayStr);
    } else if (filterType === '7days') {
      const boundary = Date.now() - 7 * 24 * 60 * 60 * 1000;
      filtered = all.filter((m) => m.timestamp >= boundary);
    } else if (filterType === 'month') {
      const boundary = Date.now() - 30 * 24 * 60 * 60 * 1000;
      filtered = all.filter((m) => m.timestamp >= boundary);
    } else if (filterType === 'custom') {
      const dateFilterVal = elements.historyDateFilter.value;
      if (dateFilterVal) {
        const filterDateStr = new Date(dateFilterVal).toDateString();
        filtered = all.filter((m) => new Date(m.timestamp).toDateString() === filterDateStr);
      } else {
        filtered = [];
      }
    }

    // Sort logs newest first
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    // Build History Table
    renderHistoryLogs(filtered, {
      logsTbody: elements.logsTbody,
      logsEmptyState: elements.logsEmptyState,
    });

    // Aggregate Today's calorie metrics
    const todayDateStr = new Date().toDateString();
    const todayMeals = all.filter((m) => new Date(m.timestamp).toDateString() === todayDateStr);

    let todayCal = 0;
    let todayProt = 0;
    let todayCarb = 0;
    let todayFat = 0;

    for (const m of todayMeals) {
      todayCal += m.calories;
      todayProt += m.protein;
      todayCarb += m.carbs;
      todayFat += m.fat;
    }

    // Read preference goals from Settings class
    const calGoal = settings.get('calorieGoal', 2000);
    const proteinGoal = settings.get('proteinGoal', 130);
    const carbsGoal = settings.get('carbsGoal', 220);
    const fatGoal = settings.get('fatGoal', 70);

    // Update summaries text
    elements.calConsumedText.textContent = String(todayCal);
    elements.proteinConsumedText.textContent = String(todayProt);
    elements.carbsConsumedText.textContent = String(todayCarb);
    elements.fatConsumedText.textContent = String(todayFat);

    // Update Remaining Delta Badge
    if (todayCal <= calGoal) {
      const diff = calGoal - todayCal;
      elements.calDeltaBadge.textContent = `${diff} kcal remaining`;
      elements.calDeltaBadge.className =
        'text-xs font-semibold badge badge-success text-white px-3 py-1';
    } else {
      const excess = todayCal - calGoal;
      elements.calDeltaBadge.textContent = `${excess} kcal over goal`;
      elements.calDeltaBadge.className =
        'text-xs font-semibold badge badge-error text-white px-3 py-1';
    }

    // Circle Progression SVG calculation
    const percent = Math.min(1, todayCal / calGoal);
    const dashOffset = 440 - percent * 440;
    elements.calorieCircle.style.strokeDashoffset = String(dashOffset);

    // Progress bars
    elements.proteinProgressBar.value =
      proteinGoal > 0 ? Math.min(100, (todayProt / proteinGoal) * 100) : 0;
    elements.carbsProgressBar.value =
      carbsGoal > 0 ? Math.min(100, (todayCarb / carbsGoal) * 100) : 0;
    elements.fatProgressBar.value = fatGoal > 0 ? Math.min(100, (todayFat / fatGoal) * 100) : 0;

    elements.summaryDateLabel.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    // Delegate canvas trend charting to sub-module
    drawTrendChart(elements.trendCanvas, elements.chartEmptyState, all, calGoal);
  } catch (e) {
    console.error('[Calorie Tracker] Dashboard rendering failed:', e);
  }
}
