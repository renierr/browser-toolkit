import { SyncManager } from '@js/sync';
import { showMessage } from '@js/ui';
import { getSettings } from '@js/settings';
import { setupImageIntake } from './image-helper';
import { performAIAnalysis } from './analysis';
import {
  loadAndRenderDashboard,
  cleanupDashboardPreviews,
  type DashboardElements,
} from './dashboard';
import { openDB, saveMeal, deleteMeal, getMealById, STORE_NAME, type Meal } from './db';

export default async function init() {
  const db = await openDB();

  // Root container
  const container = document.getElementById('tool-content') || document.body;

  // Initialize and bind shared Settings
  const settings = getSettings('calorie-tracker');
  const settingsCleanup = settings.bind(container);

  // Settings DOM elements
  const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
  const settingsToggleBtn = document.getElementById('settings-toggle-btn') as HTMLButtonElement;
  const settingsSaveBtn = document.getElementById('settings-save-btn') as HTMLButtonElement;

  // Sync Button
  const syncBtn = document.getElementById('sync-btn') as HTMLButtonElement;

  // Image Capture Elements
  const mealDropzone = document.getElementById('meal-dropzone') as HTMLDivElement;
  const dropzonePrompt = document.getElementById('dropzone-prompt') as HTMLDivElement;
  const dropzonePreview = document.getElementById('dropzone-preview') as HTMLImageElement;
  const fileInput = document.getElementById('dropzone-file-input') as HTMLInputElement;
  const pasteBtn = document.getElementById('paste-btn') as HTMLButtonElement;
  const clearImageBtn = document.getElementById('clear-image-btn') as HTMLButtonElement;
  const mealHintInput = document.getElementById('meal-hint-input') as HTMLTextAreaElement;
  const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;

  // Estimate Form DOM elements
  const aiLoadingOverlay = document.getElementById('ai-loading-overlay') as HTMLDivElement;
  const estimateEmptyState = document.getElementById('estimate-empty-state') as HTMLDivElement;
  const estimateFormContainer = document.getElementById(
    'estimate-form-container'
  ) as HTMLDivElement;
  const confidenceBadge = document.getElementById('ai-confidence-badge') as HTMLSpanElement;

  const editMealName = document.getElementById('edit-meal-name') as HTMLInputElement;
  const editMealCalories = document.getElementById('edit-meal-calories') as HTMLInputElement;
  const editMealProtein = document.getElementById('edit-meal-protein') as HTMLInputElement;
  const editMealCarbs = document.getElementById('edit-meal-carbs') as HTMLInputElement;
  const editMealFat = document.getElementById('edit-meal-fat') as HTMLInputElement;
  const editMealNotes = document.getElementById('edit-meal-notes') as HTMLTextAreaElement;
  const editMealPreview = document.getElementById('edit-meal-preview') as HTMLImageElement;

  const btnDiscardEstimate = document.getElementById('btn-discard-estimate') as HTMLButtonElement;
  const btnSaveEstimate = document.getElementById('btn-save-estimate') as HTMLButtonElement;
  const btnSaveText = document.getElementById('btn-save-text') as HTMLSpanElement;

  // Dashboard Aggregation Elements
  const dashboardElements: DashboardElements = {
    calorieCircle: document.getElementById(
      'calorie-progress-circle'
    ) as unknown as SVGCircleElement,
    calConsumedText: document.getElementById('summary-calories-consumed') as HTMLSpanElement,
    calGoalText: document.getElementById('summary-calories-goal') as HTMLSpanElement,
    calDeltaBadge: document.getElementById('calorie-delta-label') as HTMLSpanElement,

    proteinConsumedText: document.getElementById('summary-protein-consumed') as HTMLSpanElement,
    proteinGoalText: document.getElementById('summary-protein-goal') as HTMLSpanElement,
    proteinProgressBar: document.getElementById('protein-progress') as HTMLProgressElement,

    carbsConsumedText: document.getElementById('summary-carbs-consumed') as HTMLSpanElement,
    carbsGoalText: document.getElementById('summary-carbs-goal') as HTMLSpanElement,
    carbsProgressBar: document.getElementById('carbs-progress') as HTMLProgressElement,

    fatConsumedText: document.getElementById('summary-fat-consumed') as HTMLSpanElement,
    fatGoalText: document.getElementById('summary-fat-goal') as HTMLSpanElement,
    fatProgressBar: document.getElementById('fat-progress') as HTMLProgressElement,

    summaryDateLabel: document.getElementById('summary-date-label') as HTMLSpanElement,

    trendCanvas: document.getElementById('trend-chart') as HTMLCanvasElement,
    chartEmptyState: document.getElementById('chart-empty-state') as HTMLDivElement,

    logsTbody: document.getElementById('logs-tbody') as HTMLTableSectionElement,
    logsEmptyState: document.getElementById('logs-empty-state') as HTMLDivElement,
    historyDateFilter: document.getElementById('history-date-filter') as HTMLInputElement,
    btnClearFilter: document.getElementById('btn-clear-filter') as HTMLButtonElement,
  };

  // State Management
  let activeImageBlob: Blob | null = null;
  let editingMealId: number | undefined = undefined;
  let activeEstimateShortId = '';
  let hasBackend = false;

  // 1. Preferences Loading & Configuration
  const loadPreferences = () => {
    const calGoal = settings.get<number>('calorieGoal', 2000);
    const proteinGoal = settings.get<number>('proteinGoal', 130);
    const carbsGoal = settings.get<number>('carbsGoal', 220);
    const fatGoal = settings.get<number>('fatGoal', 70);

    dashboardElements.calGoalText.textContent = String(calGoal);
    dashboardElements.proteinGoalText.textContent = String(proteinGoal);
    dashboardElements.carbsGoalText.textContent = String(carbsGoal);
    dashboardElements.fatGoalText.textContent = String(fatGoal);
  };

  const savePreferences = () => {
    loadPreferences();
    settingsPanel.classList.add('hidden');
    showMessage('Preferences updated successfully!', { type: 'info', timeoutMs: 2500 });

    void loadAndRenderDashboard(db, settings, dashboardElements);
    void handleSync();
  };

  // 2. Sync Manager Integration
  const handleSync = async (manual = false) => {
    if (!hasBackend) return;
    const userId = settings.get<string>('userId', 'user-1').trim() || 'user-1';
    const toolId = `calorie-tracker-${userId}`;

    syncBtn.classList.add('syncing');
    syncBtn.disabled = true;

    try {
      const result = await SyncManager.sync(db, STORE_NAME, toolId, 'shortId', { manual });
      if (result.pulled > 0 || result.deleted > 0) {
        await loadAndRenderDashboard(db, settings, dashboardElements);
      }
    } catch (e) {
      console.warn('[Calorie Tracker] Sync connection failed:', e);
    } finally {
      syncBtn.classList.remove('syncing');
      syncBtn.disabled = false;
    }
  };

  // 3. Setup Aspect-Preserving Image Intake via sub-module
  const imageIntake = setupImageIntake(
    {
      mealDropzone,
      dropzonePrompt,
      dropzonePreview,
      fileInput,
      pasteBtn,
      clearImageBtn,
      analyzeBtn,
    },
    {
      onImageChanged: (blob) => {
        activeImageBlob = blob;
      },
    }
  );

  // 4. AI Nutritional Analysis
  const performAIAnalysisAction = async () => {
    if (!activeImageBlob) return;

    aiLoadingOverlay.classList.remove('hidden');
    estimateEmptyState.classList.add('hidden');
    estimateFormContainer.classList.add('hidden');

    try {
      const userHint = mealHintInput.value.trim();
      const parsed = await performAIAnalysis(activeImageBlob, userHint);

      // Populate verify form fields
      editMealName.value = parsed.foodName;
      editMealCalories.value = String(parsed.calories);
      editMealProtein.value = String(parsed.protein);
      editMealCarbs.value = String(parsed.carbs);
      editMealFat.value = String(parsed.fat);
      editMealNotes.value = parsed.notes;
      confidenceBadge.textContent = `${parsed.confidence}% AI Confidence`;

      // Assign visual preview
      editMealPreview.src = URL.createObjectURL(activeImageBlob);

      activeEstimateShortId = '';
      editingMealId = undefined;
      btnSaveText.textContent = 'Save & Log Meal';

      aiLoadingOverlay.classList.add('hidden');
      estimateFormContainer.classList.remove('hidden');
    } catch (error: any) {
      console.error('[Calorie Tracker] AI analysis failed:', error);
      aiLoadingOverlay.classList.add('hidden');
      estimateEmptyState.classList.remove('hidden');
      showMessage(`AI Analysis failed: ${error.message || 'Check your connection and API key.'}`, {
        type: 'alert',
      });
    }
  };

  // 5. Save/Log Meal Action
  const handleSaveMeal = async () => {
    const foodName = editMealName.value.trim();
    const calories = Math.max(0, parseInt(editMealCalories.value) || 0);
    const protein = Math.max(0, parseInt(editMealProtein.value) || 0);
    const carbs = Math.max(0, parseInt(editMealCarbs.value) || 0);
    const fat = Math.max(0, parseInt(editMealFat.value) || 0);
    const notes = editMealNotes.value.trim();

    if (!foodName) {
      showMessage('Please provide a valid meal name.', { type: 'alert' });
      return;
    }

    try {
      const mealLog: Omit<Meal, 'id'> & { id?: number } = {
        shortId: activeEstimateShortId,
        foodName,
        calories,
        protein,
        carbs,
        fat,
        notes,
        confidence: 100, // User verified
        imageBlob: activeImageBlob,
        timestamp: Date.now(),
        updatedAt: Date.now(),
      };

      if (editingMealId !== undefined) {
        mealLog.id = editingMealId;
      }

      await saveMeal(db, mealLog);

      showMessage(editingMealId !== undefined ? 'Meal log updated!' : 'Meal log saved!', {
        type: 'info',
        timeoutMs: 2500,
      });

      discardEstimate();
      imageIntake.clearImage();
      mealHintInput.value = '';

      await loadAndRenderDashboard(db, settings, dashboardElements);
      void handleSync();
    } catch (e) {
      console.error('[Calorie Tracker] Save log failed:', e);
      showMessage('Failed to save meal log.', { type: 'alert' });
    }
  };

  const discardEstimate = () => {
    estimateFormContainer.classList.add('hidden');
    estimateEmptyState.classList.remove('hidden');
    activeEstimateShortId = '';
    editingMealId = undefined;
  };

  // 6. Delete Log
  const handleDeleteLog = async (id: number) => {
    if (!confirm('Are you sure you want to delete this logged meal?')) return;
    try {
      const userId = settings.get<string>('userId', 'user-1').trim() || 'user-1';
      await deleteMeal(db, id, userId);
      showMessage('Meal log deleted successfully.', { type: 'info', timeoutMs: 2000 });

      if (editingMealId === id) {
        discardEstimate();
      }

      await loadAndRenderDashboard(db, settings, dashboardElements);
      void handleSync();
    } catch (e) {
      console.error('[Calorie Tracker] Deletion failed:', e);
    }
  };

  // 7. Edit Log (Load back to verify form)
  const handleEditLog = async (id: number) => {
    try {
      const m = await getMealById(db, id);
      if (!m) return;

      editingMealId = id;
      activeEstimateShortId = m.shortId;
      activeImageBlob = m.imageBlob || null;

      editMealName.value = m.foodName;
      editMealCalories.value = String(m.calories);
      editMealProtein.value = String(m.protein);
      editMealCarbs.value = String(m.carbs);
      editMealFat.value = String(m.fat);
      editMealNotes.value = m.notes || '';
      confidenceBadge.textContent = 'User Verified';

      if (m.imageBlob) {
        editMealPreview.src = URL.createObjectURL(m.imageBlob);
      } else {
        editMealPreview.src = '';
      }

      btnSaveText.textContent = 'Update Logged Meal';
      estimateEmptyState.classList.add('hidden');
      estimateFormContainer.classList.remove('hidden');

      estimateFormContainer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (e) {
      console.error('[Calorie Tracker] Edit preparation failed:', e);
    }
  };

  // DOM Event bindings
  settingsToggleBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });
  settingsSaveBtn.addEventListener('click', savePreferences);
  syncBtn.addEventListener('click', () => handleSync(true));

  analyzeBtn.addEventListener('click', () => {
    void performAIAnalysisAction();
  });
  btnDiscardEstimate.addEventListener('click', discardEstimate);
  btnSaveEstimate.addEventListener('click', () => {
    void handleSaveMeal();
  });

  dashboardElements.historyDateFilter.addEventListener('change', () => {
    void loadAndRenderDashboard(db, settings, dashboardElements);
  });
  dashboardElements.btnClearFilter.addEventListener('click', () => {
    dashboardElements.historyDateFilter.value = '';
    void loadAndRenderDashboard(db, settings, dashboardElements);
  });

  dashboardElements.logsTbody.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('.edit-log-btn');
    const deleteBtn = target.closest('.delete-log-btn');
    const imgBtn = target.closest('.show-details-img');

    const el = editBtn || imgBtn;
    if (el) {
      const id = parseInt(el.getAttribute('data-id') || '0');
      if (id) void handleEditLog(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.getAttribute('data-id') || '0');
      if (id) void handleDeleteLog(id);
    }
  });

  // 8. Lightbox Overlay for Image Enlargement (Mobile Aware)
  const lightbox = document.getElementById('meal-lightbox') as HTMLDivElement;
  const lightboxImg = document.getElementById('lightbox-img') as HTMLImageElement;
  const lightboxCaption = document.getElementById('lightbox-caption') as HTMLParagraphElement;
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn') as HTMLButtonElement;

  const openLightbox = () => {
    const url = editMealPreview.src;
    if (!url || !activeImageBlob) return;

    lightboxImg.src = url;
    lightboxCaption.textContent = editMealName.value.trim() || 'Meal Detail';

    lightbox.classList.remove('hidden');
    // Force browser reflow to trigger transition
    lightbox.offsetHeight;
    lightbox.classList.add('opacity-100');
    lightboxImg.classList.replace('scale-95', 'scale-100');
  };

  const closeLightbox = () => {
    lightbox.classList.remove('opacity-100');
    lightboxImg.classList.replace('scale-100', 'scale-95');
    setTimeout(() => {
      lightbox.classList.add('hidden');
      lightboxImg.src = '';
    }, 250);
  };

  editMealPreview.addEventListener('click', openLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target !== lightboxImg) {
      closeLightbox();
    }
  });
  lightboxCloseBtn.addEventListener('click', closeLightbox);

  // Load preferences and render dashboard initially
  loadPreferences();
  await loadAndRenderDashboard(db, settings, dashboardElements);

  // Validate backend status
  void SyncManager.isBackendAvailable().then((available) => {
    hasBackend = available;
    if (!available) {
      syncBtn.classList.add('hidden');
      return;
    }
    void handleSync();
  });

  // Cleanup references on route exit
  return () => {
    db.close();
    settingsCleanup();
    imageIntake.cleanup();
    cleanupDashboardPreviews();
    editMealPreview.removeEventListener('click', openLightbox);
  };
}
