import { AIClient } from '../../js/ai';
import { SyncManager } from '../../js/sync';
import { showMessage } from '../../js/ui';
import {
  openDB,
  saveMeal,
  deleteMeal,
  getAllMeals,
  getMealById,
  STORE_NAME,
  type Meal,
} from './db';

export default async function init() {
  const db = await openDB();

  // Settings DOM elements
  const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
  const settingsToggleBtn = document.getElementById('settings-toggle-btn') as HTMLButtonElement;
  const settingUserIdInput = document.getElementById('setting-user-id') as HTMLInputElement;
  const settingCalGoalInput = document.getElementById('setting-cal-goal') as HTMLInputElement;
  const settingProteinInput = document.getElementById('setting-protein-goal') as HTMLInputElement;
  const settingCarbsInput = document.getElementById('setting-carbs-goal') as HTMLInputElement;
  const settingFatInput = document.getElementById('setting-fat-goal') as HTMLInputElement;
  const settingsSaveBtn = document.getElementById('settings-save-btn') as HTMLButtonElement;

  // Sync Button
  const syncBtn = document.getElementById('sync-btn') as HTMLButtonElement;

  // Today's Summary DOM elements
  const calorieCircle = document.getElementById('calorie-progress-circle') as SVGCircleElement;
  const calConsumedText = document.getElementById('summary-calories-consumed') as HTMLSpanElement;
  const calGoalText = document.getElementById('summary-calories-goal') as HTMLSpanElement;
  const calDeltaBadge = document.getElementById('calorie-delta-label') as HTMLSpanElement;
  
  const proteinConsumedText = document.getElementById('summary-protein-consumed') as HTMLSpanElement;
  const proteinGoalText = document.getElementById('summary-protein-goal') as HTMLSpanElement;
  const proteinProgressBar = document.getElementById('protein-progress') as HTMLProgressElement;

  const carbsConsumedText = document.getElementById('summary-carbs-consumed') as HTMLSpanElement;
  const carbsGoalText = document.getElementById('summary-carbs-goal') as HTMLSpanElement;
  const carbsProgressBar = document.getElementById('carbs-progress') as HTMLProgressElement;

  const fatConsumedText = document.getElementById('summary-fat-consumed') as HTMLSpanElement;
  const fatGoalText = document.getElementById('summary-fat-goal') as HTMLSpanElement;
  const fatProgressBar = document.getElementById('fat-progress') as HTMLProgressElement;

  const summaryDateLabel = document.getElementById('summary-date-label') as HTMLSpanElement;

  // Chart DOM
  const trendCanvas = document.getElementById('trend-chart') as HTMLCanvasElement;
  const chartEmptyState = document.getElementById('chart-empty-state') as HTMLDivElement;

  // Capture Section DOM elements
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
  const estimateFormContainer = document.getElementById('estimate-form-container') as HTMLDivElement;
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

  // Logs History DOM elements
  const logsTbody = document.getElementById('logs-tbody') as HTMLTableSectionElement;
  const logsEmptyState = document.getElementById('logs-empty-state') as HTMLDivElement;
  const historyDateFilter = document.getElementById('history-date-filter') as HTMLInputElement;
  const btnClearFilter = document.getElementById('btn-clear-filter') as HTMLButtonElement;

  // State Management
  let activeImageBlob: Blob | null = null;
  let editingMealId: number | undefined = undefined;
  let activeEstimateShortId = '';
  let hasBackend = false;

  // 1. Preferences & Goal Setup
  const loadPreferences = () => {
    const userId = localStorage.getItem('ct-user-id') || 'user-1';
    const calGoal = localStorage.getItem('ct-cal-goal') || '2000';
    const proteinGoal = localStorage.getItem('ct-protein-goal') || '130';
    const carbsGoal = localStorage.getItem('ct-carbs-goal') || '220';
    const fatGoal = localStorage.getItem('ct-fat-goal') || '70';

    settingUserIdInput.value = userId;
    settingCalGoalInput.value = calGoal;
    settingProteinInput.value = proteinGoal;
    settingCarbsInput.value = carbsGoal;
    settingFatInput.value = fatGoal;

    calGoalText.textContent = calGoal;
    proteinGoalText.textContent = proteinGoal;
    carbsGoalText.textContent = carbsGoal;
    fatGoalText.textContent = fatGoal;
  };

  const savePreferences = () => {
    const userId = settingUserIdInput.value.trim() || 'user-1';
    const calGoal = settingCalGoalInput.value.trim() || '2000';
    const proteinGoal = settingProteinInput.value.trim() || '130';
    const carbsGoal = settingCarbsInput.value.trim() || '220';
    const fatGoal = settingFatInput.value.trim() || '70';

    localStorage.setItem('ct-user-id', userId);
    localStorage.setItem('ct-cal-goal', calGoal);
    localStorage.setItem('ct-protein-goal', proteinGoal);
    localStorage.setItem('ct-carbs-goal', carbsGoal);
    localStorage.setItem('ct-fat-goal', fatGoal);

    loadPreferences();
    settingsPanel.classList.add('hidden');
    showMessage('Preferences updated successfully!', { type: 'info', timeoutMs: 2500 });
    
    // Recalculate and redraw dashboard
    void loadAndRenderDashboard();
    // Trigger isolated sync for the new user ID
    void handleSync();
  };

  // Toggle Settings Panel
  const toggleSettings = () => {
    settingsPanel.classList.toggle('hidden');
  };

  // Format date helper
  const getLocalDateString = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  // Convert File/Blob to Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // 2. Sync Manager Integration
  const handleSync = async (manual = false) => {
    if (!hasBackend) return;
    const userId = localStorage.getItem('ct-user-id') || 'user-1';
    const toolId = `calorie-tracker-${userId}`;

    syncBtn.classList.add('syncing');
    syncBtn.disabled = true;

    try {
      const result = await SyncManager.sync(db, STORE_NAME, toolId, 'shortId', { manual });
      if (result.pulled > 0 || result.deleted > 0) {
        await loadAndRenderDashboard();
      }
    } catch (e) {
      console.warn('[Calorie Tracker] Sync connection failed:', e);
    } finally {
      syncBtn.classList.remove('syncing');
      syncBtn.disabled = false;
    }
  };

  // 3. Dropzone & Image Intake Helpers
  const handleImageBlob = (blob: Blob) => {
    if (!blob.type.startsWith('image/')) {
      showMessage('Only image uploads are supported.', { type: 'alert' });
      return;
    }

    activeImageBlob = blob;
    const objectUrl = URL.createObjectURL(blob);
    
    dropzonePreview.src = objectUrl;
    dropzonePreview.classList.remove('hidden');
    dropzonePrompt.classList.add('hidden');
    clearImageBtn.classList.remove('hidden');
    analyzeBtn.disabled = false;
  };

  const clearImage = () => {
    activeImageBlob = null;
    dropzonePreview.src = '';
    dropzonePreview.classList.add('hidden');
    dropzonePrompt.classList.remove('hidden');
    clearImageBtn.classList.add('hidden');
    analyzeBtn.disabled = true;
    fileInput.value = '';
  };

  // File Input Change
  const onFileChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleImageBlob(file);
  };

  // Drag & Drop
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    mealDropzone.classList.add('border-primary');
  };

  const onDragLeave = () => {
    mealDropzone.classList.remove('border-primary');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    mealDropzone.classList.remove('border-primary');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImageBlob(file);
  };

  // Clipboard Paste Support
  const onPaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          handleImageBlob(file);
          showMessage('Meal image pasted from clipboard!', { type: 'info', timeoutMs: 2000 });
          break;
        }
      }
    }
  };

  const triggerPaste = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            handleImageBlob(blob);
            showMessage('Meal image read from clipboard!', { type: 'info', timeoutMs: 2000 });
            return;
          }
        }
      }
      showMessage('No image found in clipboard. Please copy an image first.', { type: 'alert' });
    } catch (err) {
      console.error('[Calorie Tracker] Clipboard access failed:', err);
      showMessage('Clipboard paste failed. Try standard Ctrl+V on the page.', { type: 'alert' });
    }
  };

  // 4. AI Nutritional Analysis
  const performAIAnalysis = async () => {
    if (!activeImageBlob) return;

    aiLoadingOverlay.classList.remove('hidden');
    estimateEmptyState.classList.add('hidden');
    estimateFormContainer.classList.add('hidden');

    try {
      const base64 = await blobToBase64(activeImageBlob);
      const userHint = mealHintInput.value.trim();

      const prompt = `Analyze this food meal photo and estimate its total nutritional content. ${userHint ? `Context clue provided by user: "${userHint}"` : ''} Provide logical, accurate calories, protein, carbs, and fat estimations.`;

      // Structure target schema
      const responseSchema = {
        type: 'OBJECT',
        properties: {
          foodName: { type: 'STRING', description: 'Brief description of the meal' },
          calories: { type: 'INTEGER', description: 'Estimated energy in kcal' },
          protein: { type: 'INTEGER', description: 'Estimated protein weight in grams' },
          carbs: { type: 'INTEGER', description: 'Estimated carbohydrates weight in grams' },
          fat: { type: 'INTEGER', description: 'Estimated lipids weight in grams' },
          confidence: { type: 'INTEGER', description: 'Estimation confidence rating from 1 to 100' },
          notes: { type: 'STRING', description: 'Breakdown explanation of food portions or components detected' }
        },
        required: ['foodName', 'calories', 'protein', 'carbs', 'fat', 'confidence', 'notes']
      };

      const systemInstruction = 'You are an advanced clinical nutritionist AI. You specialize in visually scanning dishes, estimating portion weights, and breaking down total nutritional content into precise calorie and macronutrient (protein, carbohydrates, lipid fat) totals.';

      const resultText = await AIClient.generate({
        prompt,
        systemInstruction,
        jsonMode: true,
        responseSchema,
        images: [
          {
            inlineData: {
              mimeType: activeImageBlob.type,
              data: base64
            }
          }
        ]
      });

      const parsed = JSON.parse(resultText);

      // Populating the verification panel
      editMealName.value = parsed.foodName || 'Meal';
      editMealCalories.value = String(parsed.calories || 0);
      editMealProtein.value = String(parsed.protein || 0);
      editMealCarbs.value = String(parsed.carbs || 0);
      editMealFat.value = String(parsed.fat || 0);
      editMealNotes.value = parsed.notes || '';
      confidenceBadge.textContent = `${parsed.confidence || 85}% AI Confidence`;

      // Update thumbnail preview
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

  // 5. Save Estimated Meal Log
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
        confidence: 100, // User validated
        imageBlob: activeImageBlob,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      if (editingMealId !== undefined) {
        mealLog.id = editingMealId;
      }

      await saveMeal(db, mealLog);

      showMessage(editingMealId !== undefined ? 'Meal log updated!' : 'Meal log saved!', {
        type: 'info',
        timeoutMs: 2500
      });

      // Clear states
      discardEstimate();
      clearImage();
      mealHintInput.value = '';

      // Reload dashboard
      await loadAndRenderDashboard();

      // Sync backend in background
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

  // 6. Canvas Trend Line Chart Utility
  const drawTrendChart = (meals: Meal[], dailyGoal: number) => {
    const ctx = trendCanvas.getContext('2d');
    if (!ctx) return;

    // Reset Canvas dimension for crisp rendering
    const rect = trendCanvas.getBoundingClientRect();
    trendCanvas.width = rect.width * devicePixelRatio;
    trendCanvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Build past 7 days daily map
    const dailyCalories: { [dateStr: string]: number } = {};
    const dayLabels: string[] = [];
    const dateKeys: string[] = [];

    const weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toDateString();
      dateKeys.push(key);
      dayLabels.push(weekdayShort[d.getDay()]);
      dailyCalories[key] = 0;
    }

    // Accumulate calories per day
    let totalLogsInTrend = 0;
    for (const m of meals) {
      const mealDateKey = new Date(m.timestamp).toDateString();
      if (dailyCalories[mealDateKey] !== undefined) {
        dailyCalories[mealDateKey] += m.calories;
        totalLogsInTrend++;
      }
    }

    if (totalLogsInTrend === 0) {
      chartEmptyState.classList.remove('hidden');
      ctx.clearRect(0, 0, width, height);
      return;
    }
    chartEmptyState.classList.add('hidden');

    const calorieData = dateKeys.map(k => dailyCalories[k]);

    // Plot boundaries
    const padding = { top: 20, right: 15, bottom: 25, left: 35 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find limits
    const maxVal = Math.max(dailyGoal * 1.25, ...calorieData, 1000);

    // Coordinate mapping helper
    const getX = (index: number) => padding.left + (index / 6) * chartWidth;
    const getY = (value: number) => padding.top + chartHeight - (value / maxVal) * chartHeight;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid lines and Y axis labels
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.15)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(150, 150, 150, 0.6)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yTicks = [0, Math.floor(maxVal / 2), Math.floor(maxVal)];
    for (const tick of yTicks) {
      const y = getY(tick);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${tick}`, padding.left - 5, y);
    }

    // 2. Draw Target Goal Line
    const goalY = getY(dailyGoal);
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.55)'; // Orange line
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, goalY);
    ctx.lineTo(width - padding.right, goalY);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    ctx.fillStyle = 'rgba(249, 115, 22, 0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('Goal', width - padding.right + 2, goalY - 6);

    // 3. Draw Gradient Underneath Line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(0));
    for (let i = 0; i < calorieData.length; i++) {
      ctx.lineTo(getX(i), getY(calorieData[i]));
    }
    ctx.lineTo(getX(6), getY(0));
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.35)');
    gradient.addColorStop(1, 'rgba(249, 115, 22, 0.00)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // 4. Draw Smooth Trend Line
    ctx.strokeStyle = 'rgb(249, 115, 22)'; // Solid Orange
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(calorieData[0]));
    for (let i = 1; i < calorieData.length; i++) {
      ctx.lineTo(getX(i), getY(calorieData[i]));
    }
    ctx.stroke();

    // 5. Draw Dots & Value Labels
    for (let i = 0; i < calorieData.length; i++) {
      const cx = getX(i);
      const cy = getY(calorieData[i]);

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgb(249, 115, 22)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Show values slightly offset
      if (calorieData[i] > 0) {
        ctx.fillStyle = 'currentColor';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${calorieData[i]}`, cx, cy - 10);
      }
    }

    // 6. Draw X Axis labels
    ctx.fillStyle = 'rgba(150, 150, 150, 0.7)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i < dayLabels.length; i++) {
      ctx.fillText(dayLabels[i], getX(i), padding.top + chartHeight + 8);
    }
  };

  // 7. Dashboard Calculation & Historical Table
  const loadAndRenderDashboard = async () => {
    try {
      const all = await getAllMeals(db);

      // Filters
      const dateFilterVal = historyDateFilter.value;
      let filtered = all;

      if (dateFilterVal) {
        const filterDateStr = new Date(dateFilterVal).toDateString();
        filtered = all.filter(m => new Date(m.timestamp).toDateString() === filterDateStr);
        btnClearFilter.classList.remove('hidden');
      } else {
        btnClearFilter.classList.add('hidden');
      }

      // Sort logs newest first
      filtered.sort((a, b) => b.timestamp - a.timestamp);

      // Render Logs Table
      renderHistoryLogs(filtered);

      // Render Today's statistics on Dashboard
      const todayDateStr = new Date().toDateString();
      const todayMeals = all.filter(m => new Date(m.timestamp).toDateString() === todayDateStr);

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

      // Read goals
      const calGoal = parseInt(settingCalGoalInput.value) || 2000;
      const proteinGoal = parseInt(settingProteinInput.value) || 130;
      const carbsGoal = parseInt(settingCarbsInput.value) || 220;
      const fatGoal = parseInt(settingFatInput.value) || 70;

      // Update text values
      calConsumedText.textContent = String(todayCal);
      proteinConsumedText.textContent = String(todayProt);
      carbsConsumedText.textContent = String(todayCarb);
      fatConsumedText.textContent = String(todayFat);

      // Update Delta Badge
      if (todayCal <= calGoal) {
        const diff = calGoal - todayCal;
        calDeltaBadge.textContent = `${diff} kcal remaining`;
        calDeltaBadge.className = 'text-xs font-semibold badge badge-success text-white px-3 py-1';
      } else {
        const excess = todayCal - calGoal;
        calDeltaBadge.textContent = `${excess} kcal over goal`;
        calDeltaBadge.className = 'text-xs font-semibold badge badge-error text-white px-3 py-1';
      }

      // Update Circle Progress (Dash Array = 440 circumference)
      const percent = Math.min(1, todayCal / calGoal);
      const dashOffset = 440 - percent * 440;
      calorieCircle.style.strokeDashoffset = String(dashOffset);

      // Update macro progress bars
      proteinProgressBar.value = proteinGoal > 0 ? Math.min(100, (todayProt / proteinGoal) * 100) : 0;
      carbsProgressBar.value = carbsGoal > 0 ? Math.min(100, (todayCarb / carbsGoal) * 100) : 0;
      fatProgressBar.value = fatGoal > 0 ? Math.min(100, (todayFat / fatGoal) * 100) : 0;

      summaryDateLabel.textContent = new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      // Draw daily canvas trend
      drawTrendChart(all, calGoal);
    } catch (e) {
      console.error('[Calorie Tracker] Dashboard rendering failed:', e);
    }
  };

  // Render Historical logs list
  const activeObjectUrls: string[] = [];
  const renderHistoryLogs = (meals: Meal[]) => {
    // Clear old object URLs to release memory
    for (const url of activeObjectUrls) {
      URL.revokeObjectURL(url);
    }
    activeObjectUrls.length = 0;

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
          previewHtml = `<img class="w-10 h-10 object-cover rounded border border-base-300" src="${url}" alt="dish" />`;
        }

        const dateStr = new Date(m.timestamp).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit'
        });
        const dateDayStr = getLocalDateString(m.timestamp);

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
  };

  // 8. Delete Log
  const handleDeleteLog = async (id: number) => {
    if (!confirm('Are you sure you want to delete this logged meal?')) return;
    try {
      const userId = localStorage.getItem('ct-user-id') || 'user-1';
      await deleteMeal(db, id, userId);
      showMessage('Meal log deleted successfully.', { type: 'info', timeoutMs: 2000 });
      
      if (editingMealId === id) {
        discardEstimate();
      }

      await loadAndRenderDashboard();
      // Background Sync
      void handleSync();
    } catch (e) {
      console.error('[Calorie Tracker] Deletion failed:', e);
    }
  };

  // 9. Edit existing Log (load back to panel)
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
      
      // Scroll to view edit form
      estimateFormContainer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (e) {
      console.error('[Calorie Tracker] Edit preparation failed:', e);
    }
  };

  // Event bindings
  settingsToggleBtn.addEventListener('click', toggleSettings);
  settingsSaveBtn.addEventListener('click', savePreferences);
  syncBtn.addEventListener('click', () => handleSync(true));

  // Dropzone click
  mealDropzone.addEventListener('click', (e) => {
    // Avoid triggering if clicking clear button
    if (e.target === clearImageBtn || clearImageBtn.contains(e.target as Node)) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', onFileChange);
  mealDropzone.addEventListener('dragover', onDragOver);
  mealDropzone.addEventListener('dragleave', onDragLeave);
  mealDropzone.addEventListener('drop', onDrop);
  
  pasteBtn.addEventListener('click', triggerPaste);
  clearImageBtn.addEventListener('click', clearImage);
  window.addEventListener('paste', onPaste);

  analyzeBtn.addEventListener('click', performAIAnalysis);
  btnDiscardEstimate.addEventListener('click', discardEstimate);
  btnSaveEstimate.addEventListener('click', handleSaveMeal);

  // Filters Event
  historyDateFilter.addEventListener('change', loadAndRenderDashboard);
  btnClearFilter.addEventListener('click', () => {
    historyDateFilter.value = '';
    void loadAndRenderDashboard();
  });

  // Table clicks
  logsTbody.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('.edit-log-btn');
    const deleteBtn = target.closest('.delete-log-btn');

    if (editBtn) {
      const id = parseInt(editBtn.getAttribute('data-id') || '0');
      if (id) void handleEditLog(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.getAttribute('data-id') || '0');
      if (id) void handleDeleteLog(id);
    }
  });

  // Load preferences and initial rendering
  loadPreferences();
  await loadAndRenderDashboard();

  // Check backend server availability
  void SyncManager.isBackendAvailable().then((available) => {
    hasBackend = available;
    if (!available) {
      syncBtn.classList.add('hidden');
      return;
    }
    void handleSync();
  });

  // Return Cleanup Handler
  return () => {
    db.close();
    window.removeEventListener('paste', onPaste);
    for (const url of activeObjectUrls) {
      URL.revokeObjectURL(url);
    }
  };
}
