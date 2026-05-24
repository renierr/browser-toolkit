import { SyncManager } from '@js/sync';
import { showMessage } from '@js/ui';
import { getSettings } from '@js/settings';
import type { ToolPayload } from '@js/types';
import { setupImageIntake } from './image-helper';
import { performAIAnalysis } from './analysis';
import {
  loadAndRenderDashboard,
  cleanupDashboardPreviews,
  type DashboardElements,
} from './dashboard';
import {
  openDB,
  saveMeal,
  deleteMeal,
  getMealById,
  getAllMeals,
  STORE_NAME,
  type Meal,
} from './db';
import { generateMealPdf, generateSummaryPdf, PLACEHOLDER_SVG } from './pdf-generator';

export default async function init(payload?: ToolPayload) {
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

  // Import / Export Elements
  const btnImportMeals = document.getElementById('btn-import-meals') as HTMLButtonElement;
  const btnExportMeals = document.getElementById('btn-export-meals') as HTMLButtonElement;
  const fileImportInput = document.getElementById('meals-import-file') as HTMLInputElement;

  // Image Capture Elements
  const mealDropzone = document.getElementById('meal-dropzone') as HTMLDivElement;
  const dropzonePrompt = document.getElementById('dropzone-prompt') as HTMLDivElement;
  const dropzonePreview = document.getElementById('dropzone-preview') as HTMLImageElement;
  const fileInput = document.getElementById('dropzone-file-input') as HTMLInputElement;
  const pasteBtn = document.getElementById('paste-btn') as HTMLButtonElement;
  const clearImageBtn = document.getElementById('clear-image-btn') as HTMLButtonElement;
  const mealHintInput = document.getElementById('meal-hint-input') as HTMLTextAreaElement;
  const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;
  const btnManualAdd = document.getElementById('btn-manual-add') as HTMLButtonElement;

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
    historyFilterSelect: document.getElementById('history-filter-select') as HTMLSelectElement,
    historyDateFilter: document.getElementById('history-date-filter') as HTMLInputElement,
  };

  // Report Modal Elements
  const reportModal = document.getElementById('report-modal') as HTMLDialogElement;
  const btnOpenReportModal = document.getElementById('btn-open-report-modal') as HTMLButtonElement;
  const reportTypeSelect = document.getElementById('report-type-select') as HTMLSelectElement;
  const reportDailyContainer = document.getElementById('report-daily-container') as HTMLDivElement;
  const reportTimeframeContainer = document.getElementById(
    'report-timeframe-container'
  ) as HTMLDivElement;
  const reportSingleDate = document.getElementById('report-single-date') as HTMLInputElement;
  const reportStartDate = document.getElementById('report-start-date') as HTMLInputElement;
  const reportEndDate = document.getElementById('report-end-date') as HTMLInputElement;
  const reportTitleInput = document.getElementById('report-title-input') as HTMLInputElement;
  const reportNotesInput = document.getElementById('report-notes-input') as HTMLTextAreaElement;
  const reportIncludeImagesCheckbox = document.getElementById(
    'report-include-images-checkbox'
  ) as HTMLInputElement;
  const reportModalClose = document.getElementById('report-modal-close') as HTMLButtonElement;
  const reportModalGenerate = document.getElementById('report-modal-generate') as HTMLButtonElement;
  const reportGenerateSpinner = document.getElementById(
    'report-generate-spinner'
  ) as HTMLSpanElement;
  const reportGenerateIcon = document.getElementById('report-generate-icon') as HTMLElement;
  const reportGenerateText = document.getElementById('report-generate-text') as HTMLSpanElement;

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

  // Handle shared files payload (e.g. when routed as a Share Target PWA)
  if (payload?.sharedFiles?.length) {
    const sharedFile = payload.sharedFiles[0];
    if (sharedFile.type.startsWith('image/')) {
      void imageIntake.handleImageBlob(sharedFile);
    }
  }

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
        editMealPreview.src = PLACEHOLDER_SVG;
      }

      btnSaveText.textContent = 'Update Logged Meal';
      estimateEmptyState.classList.add('hidden');
      estimateFormContainer.classList.remove('hidden');

      estimateFormContainer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (e) {
      console.error('[Calorie Tracker] Edit preparation failed:', e);
    }
  };

  // Import/Export Helper Methods
  const dataURIToBlob = (dataURI: string): Blob => {
    try {
      const parts = dataURI.split(',');
      if (parts.length < 2) throw new Error('Invalid Data URI format');
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    } catch (err) {
      console.error('[Calorie Tracker] failed to convert Data URI to Blob:', err);
      return new Blob([], { type: 'image/png' });
    }
  };

  const handleExportMeals = async () => {
    try {
      showMessage('Preparing export...', { type: 'info', timeoutMs: 1500 });
      const all = await getAllMeals(db);

      const filterType = dashboardElements.historyFilterSelect.value;
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
        const dateFilterVal = dashboardElements.historyDateFilter.value;
        if (dateFilterVal) {
          const filterDateStr = new Date(dateFilterVal).toDateString();
          filtered = all.filter((m) => new Date(m.timestamp).toDateString() === filterDateStr);
        } else {
          filtered = [];
        }
      }

      if (filtered.length === 0) {
        showMessage('No meals found in selected timeframe to export.', { type: 'warning' });
        return;
      }

      const exportMeals = await Promise.all(
        filtered.map(async (m) => {
          let base64Image: string | null = null;
          if (m.imageBlob) {
            try {
              base64Image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(m.imageBlob as Blob);
              });
            } catch (err) {
              console.error('[Calorie Tracker] Image base64 conversion failed:', err);
            }
          }
          return {
            shortId: m.shortId,
            foodName: m.foodName,
            calories: m.calories,
            protein: m.protein,
            carbs: m.carbs,
            fat: m.fat,
            confidence: m.confidence,
            notes: m.notes || '',
            timestamp: m.timestamp,
            updatedAt: m.updatedAt,
            image: base64Image,
          };
        })
      );

      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        settings: {
          calorieGoal: settings.get('calorieGoal', 2000),
          proteinGoal: settings.get('proteinGoal', 130),
          carbsGoal: settings.get('carbsGoal', 220),
          fatGoal: settings.get('fatGoal', 70),
        },
        meals: exportMeals,
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calorie-tracker-export-${filterType}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage('Meals exported successfully!', { type: 'info', timeoutMs: 2500 });
    } catch (e: any) {
      console.error('[Calorie Tracker] Export failed:', e);
      showMessage(`Export failed: ${e.message || 'Error'}`, { type: 'alert' });
    }
  };

  const handleImportMeals = async (file: File) => {
    try {
      const text = await file.text();
      const importedData = JSON.parse(text);

      let mealsToImport: any[] = [];
      if (Array.isArray(importedData)) {
        mealsToImport = importedData;
      } else if (importedData && typeof importedData === 'object') {
        if (Array.isArray(importedData.meals)) {
          mealsToImport = importedData.meals;
          if (importedData.settings && typeof importedData.settings === 'object') {
            const incomingSettings = importedData.settings;
            if (typeof incomingSettings.calorieGoal === 'number') {
              settings.set('calorieGoal', incomingSettings.calorieGoal);
            }
            if (typeof incomingSettings.proteinGoal === 'number') {
              settings.set('proteinGoal', incomingSettings.proteinGoal);
            }
            if (typeof incomingSettings.carbsGoal === 'number') {
              settings.set('carbsGoal', incomingSettings.carbsGoal);
            }
            if (typeof incomingSettings.fatGoal === 'number') {
              settings.set('fatGoal', incomingSettings.fatGoal);
            }
            loadPreferences();
          }
        } else if (importedData.foodName) {
          mealsToImport = [importedData];
        }
      }

      if (mealsToImport.length === 0) {
        showMessage('No valid meals found in import file.', { type: 'warning' });
        return;
      }

      showMessage(`Importing ${mealsToImport.length} meal(s)...`, {
        type: 'info',
        timeoutMs: 1500,
      });

      const existingMeals = await getAllMeals(db);
      let importedCount = 0;

      for (const item of mealsToImport) {
        if (!item.foodName) continue;

        const shortId =
          item.shortId || 'MEAL-' + Math.random().toString(36).substring(2, 11).toUpperCase();
        const existing = existingMeals.find((m) => m.shortId === shortId);

        let imageBlob: Blob | null = null;
        if (item.image && typeof item.image === 'string') {
          imageBlob = dataURIToBlob(item.image);
        }

        const mealToSave: Omit<Meal, 'id'> & { id?: number } = {
          shortId,
          foodName: item.foodName,
          calories: Math.max(0, Number(item.calories) || 0),
          protein: Math.max(0, Number(item.protein) || 0),
          carbs: Math.max(0, Number(item.carbs) || 0),
          fat: Math.max(0, Number(item.fat) || 0),
          confidence: Number(item.confidence) || 100,
          notes: item.notes || '',
          timestamp: Number(item.timestamp) || Date.now(),
          updatedAt: Number(item.updatedAt) || Date.now(),
          imageBlob,
        };

        if (existing) {
          mealToSave.id = existing.id;
        }

        await saveMeal(db, mealToSave);
        importedCount++;
      }

      showMessage(`Successfully imported ${importedCount} meal(s)!`, {
        type: 'info',
        timeoutMs: 3000,
      });
      await loadAndRenderDashboard(db, settings, dashboardElements);
      void handleSync();
    } catch (e: any) {
      console.error('[Calorie Tracker] Import failed:', e);
      showMessage(`Import failed: ${e.message || 'JSON parsing error.'}`, { type: 'alert' });
    } finally {
      fileImportInput.value = '';
    }
  };

  // DOM Event bindings
  btnImportMeals.addEventListener('click', () => {
    fileImportInput.click();
  });
  fileImportInput.addEventListener('change', () => {
    if (fileImportInput.files && fileImportInput.files[0]) {
      void handleImportMeals(fileImportInput.files[0]);
    }
  });
  btnExportMeals.addEventListener('click', () => {
    void handleExportMeals();
  });
  settingsToggleBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });
  settingsSaveBtn.addEventListener('click', savePreferences);
  syncBtn.addEventListener('click', () => handleSync(true));

  analyzeBtn.addEventListener('click', () => {
    void performAIAnalysisAction();
  });

  btnManualAdd.addEventListener('click', () => {
    editingMealId = undefined;
    activeEstimateShortId = '';

    if (activeImageBlob) {
      editMealPreview.src = URL.createObjectURL(activeImageBlob);
    } else {
      activeImageBlob = null;
      editMealPreview.src = PLACEHOLDER_SVG;
    }

    editMealName.value = 'New Meal';
    editMealCalories.value = '0';
    editMealProtein.value = '0';
    editMealCarbs.value = '0';
    editMealFat.value = '0';
    editMealNotes.value = '';
    confidenceBadge.textContent = 'Manual Entry';

    btnSaveText.textContent = 'Save & Log Meal';
    estimateEmptyState.classList.add('hidden');
    estimateFormContainer.classList.remove('hidden');

    estimateFormContainer.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  btnDiscardEstimate.addEventListener('click', discardEstimate);
  btnSaveEstimate.addEventListener('click', () => {
    void handleSaveMeal();
  });

  const historyCustomDateContainer = document.getElementById(
    'history-custom-date-container'
  ) as HTMLDivElement;

  dashboardElements.historyFilterSelect.addEventListener('change', () => {
    const isCustom = dashboardElements.historyFilterSelect.value === 'custom';
    historyCustomDateContainer.classList.toggle('hidden', !isCustom);
    void loadAndRenderDashboard(db, settings, dashboardElements);
  });

  dashboardElements.historyDateFilter.addEventListener('change', () => {
    void loadAndRenderDashboard(db, settings, dashboardElements);
  });

  // PDF Report Helpers
  const handleSingleMealPdf = async (id: number) => {
    try {
      const m = await getMealById(db, id);
      if (!m) return;

      showMessage('Generating PDF Report...', { type: 'info', timeoutMs: 1500 });
      await generateMealPdf(m, settings);
      showMessage('PDF Report Downloaded!', { type: 'info', timeoutMs: 2000 });
    } catch (e: any) {
      console.error('[Calorie Tracker] Single PDF generation failed:', e);
      showMessage(`Failed to generate PDF: ${e.message || 'Error.'}`, { type: 'alert' });
    }
  };

  const handleGenerateReport = async () => {
    const type = reportTypeSelect.value;
    const title = reportTitleInput.value.trim();
    const notes = reportNotesInput.value.trim();
    const includeImages = reportIncludeImagesCheckbox.checked;

    let filteredMeals: Meal[] = [];
    let timeframeStr = '';

    try {
      const all = await getAllMeals(db);

      if (type === 'daily') {
        const targetDateVal = reportSingleDate.value;
        if (!targetDateVal) {
          showMessage('Please select a valid date.', { type: 'alert' });
          return;
        }
        const targetDateStr = new Date(targetDateVal).toDateString();
        filteredMeals = all.filter((m) => new Date(m.timestamp).toDateString() === targetDateStr);

        const formattedDate = new Date(targetDateVal).toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        timeframeStr = `Daily Report for ${formattedDate}`;
      } else {
        const startVal = reportStartDate.value;
        const endVal = reportEndDate.value;
        if (!startVal || !endVal) {
          showMessage('Please select valid start and end dates.', { type: 'alert' });
          return;
        }

        const startTimestamp = new Date(startVal).setHours(0, 0, 0, 0);
        const endTimestamp = new Date(endVal).setHours(23, 59, 59, 999);

        if (startTimestamp > endTimestamp) {
          showMessage('Start date cannot be after end date.', { type: 'alert' });
          return;
        }

        filteredMeals = all.filter(
          (m) => m.timestamp >= startTimestamp && m.timestamp <= endTimestamp
        );

        const formattedStart = new Date(startVal).toLocaleDateString();
        const formattedEnd = new Date(endVal).toLocaleDateString();
        timeframeStr = `Range: ${formattedStart} - ${formattedEnd}`;
      }

      if (filteredMeals.length === 0) {
        showMessage('No meals found in selected timeframe.', { type: 'warning' });
        return;
      }

      // Set loading state
      reportModalGenerate.disabled = true;
      reportGenerateSpinner.classList.remove('hidden');
      reportGenerateIcon.classList.add('hidden');
      reportGenerateText.textContent = 'Generating...';

      // Sort chronologically (oldest first)
      filteredMeals.sort((a, b) => a.timestamp - b.timestamp);

      const reportTitle =
        title || (type === 'daily' ? 'Daily Nutritional Report' : 'Timeframe Nutritional Report');

      await generateSummaryPdf(
        filteredMeals,
        reportTitle,
        timeframeStr,
        notes,
        includeImages,
        settings
      );

      showMessage('PDF Report Downloaded!', { type: 'info', timeoutMs: 2500 });
      reportModal.close();
    } catch (e: any) {
      console.error('[Calorie Tracker] PDF generation failed:', e);
      showMessage(`Failed to generate PDF: ${e.message || 'Error occurred.'}`, { type: 'alert' });
    } finally {
      // Reset state
      reportModalGenerate.disabled = false;
      reportGenerateSpinner.classList.add('hidden');
      reportGenerateIcon.classList.remove('hidden');
      reportGenerateText.textContent = 'Generate PDF';
    }
  };

  dashboardElements.logsTbody.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('.edit-log-btn');
    const deleteBtn = target.closest('.delete-log-btn');
    const imgBtn = target.closest('.show-details-img');
    const pdfBtn = target.closest('.export-pdf-btn');

    const el = editBtn || imgBtn;
    if (el) {
      const id = parseInt(el.getAttribute('data-id') || '0');
      if (id) void handleEditLog(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.getAttribute('data-id') || '0');
      if (id) void handleDeleteLog(id);
    } else if (pdfBtn) {
      const id = parseInt(pdfBtn.getAttribute('data-id') || '0');
      if (id) void handleSingleMealPdf(id);
    }
  });

  // Modal events
  btnOpenReportModal.addEventListener('click', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    reportSingleDate.value = todayStr;
    reportStartDate.value = sevenDaysAgoStr;
    reportEndDate.value = todayStr;

    reportTitleInput.value = '';
    reportNotesInput.value = '';
    reportIncludeImagesCheckbox.checked = true;

    reportTypeSelect.value = 'daily';
    reportDailyContainer.classList.remove('hidden');
    reportTimeframeContainer.classList.add('hidden');

    reportModal.showModal();
  });

  reportTypeSelect.addEventListener('change', () => {
    if (reportTypeSelect.value === 'daily') {
      reportDailyContainer.classList.remove('hidden');
      reportTimeframeContainer.classList.add('hidden');
    } else {
      reportDailyContainer.classList.add('hidden');
      reportTimeframeContainer.classList.remove('hidden');
    }
  });

  reportModalClose.addEventListener('click', () => {
    reportModal.close();
  });

  reportModalGenerate.addEventListener('click', () => {
    void handleGenerateReport();
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
