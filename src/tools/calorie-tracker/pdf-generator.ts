import { htmlToPdfBuffer } from '@js/mupdf-utils';
import { downloadFile } from '@js/file-utils';
import { type Meal } from './db';

export const PLACEHOLDER_SVG = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='0.9em' font-size='85'%3E🍴%3C/text%3E%3C/svg%3E`;

// --- Shared Constants & Styles ---

const SINGLE_MEAL_STYLES = `
  .meal-container {
    width: 100%;
    margin-bottom: 20pt;
  }
  .photo-cell {
    width: 45%;
    vertical-align: top;
    padding-right: 16pt;
  }
  .info-cell {
    width: 55%;
    vertical-align: top;
  }
  .meal-img {
    max-width: 100%;
    height: auto;
    display: block;
    border-radius: 8pt;
    border: 1px solid #e2e8f0;
  }
  .no-img-box {
    width: 100%;
    height: 180pt;
    line-height: 180pt;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8pt;
    text-align: center;
    font-size: 70pt;
  }
  .food-name {
    font-size: 18pt;
    font-weight: 800;
    color: #1a202c;
    margin-top: 0;
    margin-bottom: 4pt;
  }
  .timestamp {
    font-size: 10pt;
    color: #718096;
    font-weight: 600;
    margin-bottom: 12pt;
  }
  .meta-tag {
    display: inline-block;
    background-color: #ffedd5;
    color: #c2410c;
    font-size: 8.5pt;
    font-weight: bold;
    padding: 2.5pt 6.5pt;
    border-radius: 4pt;
    margin-bottom: 12pt;
  }
  .nutrition-box {
    background-color: #fff7ed;
    border: 1px solid #ffedd5;
    border-radius: 6pt;
    padding: 10pt;
    margin-bottom: 16pt;
    text-align: center;
  }
  .nutrition-val {
    font-size: 20pt;
    font-weight: 800;
    color: #ea580c;
  }
  .nutrition-lbl {
    font-size: 9pt;
    font-weight: bold;
    color: #c2410c;
    margin-top: 2pt;
  }
  .macro-table {
    width: 100%;
    margin-bottom: 16pt;
    border-collapse: collapse;
  }
  .macro-row {
    border-bottom: 1px solid #edf2f7;
  }
  .macro-lbl {
    padding: 6pt 0;
    font-weight: bold;
    font-size: 10pt;
    color: #4a5568;
  }
  .macro-val {
    padding: 6pt 0;
    text-align: right;
    font-weight: 800;
    font-size: 10pt;
    color: #1a202c;
  }
  .macro-goal {
    font-size: 8.5pt;
    color: #718096;
    font-weight: normal;
  }
  .notes-box {
    background-color: #fcf8f2;
    border-left: 4px solid #ea580c;
    padding: 10pt 12pt;
    margin-top: 16pt;
    border-radius: 0 6pt 6pt 0;
  }
  .notes-title {
    font-weight: bold;
    font-size: 9.5pt;
    color: #c2410c;
    margin-bottom: 4pt;
  }
  .notes-content {
    font-size: 9.5pt;
    font-style: italic;
    color: #4a5568;
    margin: 0;
  }
`;

const SUMMARY_REPORTS_STYLES = `
  .summary-title {
    font-size: 13pt;
    font-weight: 800;
    color: #1e293b;
    margin-top: 20pt;
    margin-bottom: 8pt;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4pt;
  }
  .summary-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20pt;
  }
  .summary-table th {
    background-color: #f8fafc;
    color: #334155;
    font-weight: bold;
    font-size: 9.5pt;
    text-align: left;
    padding: 8pt;
    border: 1px solid #e2e8f0;
  }
  .summary-table td {
    padding: 8pt;
    border: 1px solid #e2e8f0;
    font-size: 9.5pt;
  }
  .summary-val {
    font-weight: 800;
  }
  .progress-bg {
    width: 100px;
    height: 12px;
    background-color: #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
  }
  .progress-fill {
    height: 100%;
    border-radius: 6px;
  }
  .notes-box {
    background-color: #eff6ff;
    border-left: 4px solid #3b82f6;
    padding: 10pt 12pt;
    margin-bottom: 20pt;
    border-radius: 0 6pt 6pt 0;
  }
  .notes-title {
    font-weight: bold;
    font-size: 9.5pt;
    color: #1d4ed8;
    margin-bottom: 4pt;
  }
  .notes-content {
    font-size: 9.5pt;
    font-style: italic;
    color: #374151;
    margin: 0;
  }
  .meal-item {
    width: 100%;
    border: 1px solid #e2e8f0;
    border-radius: 8pt;
    background-color: #ffffff;
    margin-bottom: 16pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .meal-item-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .meal-thumbnail-cell {
    width: 110pt;
    vertical-align: top;
    padding: 10pt;
  }
  .meal-thumbnail {
    max-width: 100%;
    height: auto;
    display: block;
    border-radius: 6pt;
    border: 1px solid #e2e8f0;
  }
  .meal-thumbnail-placeholder {
    width: 90pt;
    height: 90pt;
    line-height: 90pt;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6pt;
    text-align: center;
    font-size: 38pt;
  }
  .meal-info-cell {
    vertical-align: top;
    padding: 10pt;
    word-wrap: break-word;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  .meal-name {
    font-size: 11.5pt;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 4pt 0;
    word-wrap: break-word;
    word-break: break-word;
  }
  .meal-time {
    font-size: 8.5pt;
    font-weight: bold;
    color: #64748b;
    margin-bottom: 8pt;
  }
  .meal-macros-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6pt;
  }
  .meal-macros-table td {
    padding: 2pt 4pt;
    font-size: 9pt;
  }
  .meal-notes {
    font-size: 9pt;
    font-style: italic;
    color: #475569;
    background-color: #f8fafc;
    padding: 6pt 8pt;
    border-radius: 4pt;
    margin-top: 6pt;
    border-left: 2px solid #94a3b8;
    word-wrap: break-word;
    word-break: break-word;
    overflow-wrap: break-word;
  }
`;

// --- Reusable Logic Helpers ---

/**
 * Converts a Blob to a base64 Data URL.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read blob as Base64.'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Builds the complete HTML page structure with standard styles, reusable header, and footer.
 */
function wrapHtmlDocument(
  title: string,
  subtitle: string,
  themeColor: string,
  titleColor: string,
  contentHtml: string,
  stylesHtml: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #2d3748;
    margin: 20pt;
    padding: 0;
    line-height: 1.5;
  }
  .header {
    border-bottom: 2px solid ${themeColor};
    padding-bottom: 12pt;
    margin-bottom: 20pt;
  }
  .title {
    font-size: 22pt;
    font-weight: 800;
    color: ${titleColor};
    margin: 0;
  }
  .subtitle {
    font-size: 9.5pt;
    color: #718096;
    margin-top: 4pt;
    font-weight: bold;
    text-transform: uppercase;
  }
  .footer {
    border-top: 1px solid #edf2f7;
    padding-top: 10pt;
    margin-top: 30pt;
    text-align: center;
    font-size: 8pt;
    color: #a0aec0;
  }
  ${stylesHtml}
</style>
</head>
<body>
  <div class="header">
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>
  </div>

  ${contentHtml}

  <div class="footer">
    Report generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} &bull; Calorie Tracker
  </div>
</body>
</html>
  `;
}

// --- Primary API Exporters ---

/**
 * Generates and downloads a PDF for a single meal log.
 */
export async function generateMealPdf(meal: Meal, settings: any): Promise<void> {
  const calGoal = settings.get('calorieGoal', 2000);
  const proteinGoal = settings.get('proteinGoal', 130);
  const carbsGoal = settings.get('carbsGoal', 220);
  const fatGoal = settings.get('fatGoal', 70);

  const dateStr = new Date(meal.timestamp).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = new Date(meal.timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  let imgBase64 = '';
  if (meal.imageBlob) {
    try {
      imgBase64 = await blobToBase64(meal.imageBlob);
    } catch (e) {
      console.warn('[Calorie Tracker PDF] Failed to convert image to Base64:', e);
    }
  }

  const contentHtml = `
  <table class="meal-container">
    <tr>
      <td class="photo-cell">
        ${
          imgBase64
            ? `<img class="meal-img" src="${imgBase64}" alt="${meal.foodName}">`
            : `<div class="no-img-box">🍴</div>`
        }
      </td>
      <td class="info-cell">
        <div class="food-name">${meal.foodName}</div>
        <div class="timestamp">${dateStr} &bull; ${timeStr}</div>
        <div class="meta-tag">Verified Log (${meal.shortId})</div>

        <div class="nutrition-box">
          <div class="nutrition-val">${meal.calories} kcal</div>
          <div class="nutrition-lbl">CALORIE CONTENT &bull; Target: ${calGoal} kcal</div>
        </div>

        <table class="macro-table">
          <tr class="macro-row">
            <td class="macro-lbl">Protein</td>
            <td class="macro-val">${meal.protein}g <span class="macro-goal">/ Daily Goal: ${proteinGoal}g</span></td>
          </tr>
          <tr class="macro-row">
            <td class="macro-lbl">Carbohydrates</td>
            <td class="macro-val">${meal.carbs}g <span class="macro-goal">/ Daily Goal: ${carbsGoal}g</span></td>
          </tr>
          <tr class="macro-row">
            <td class="macro-lbl">Fats</td>
            <td class="macro-val">${meal.fat}g <span class="macro-goal">/ Daily Goal: ${fatGoal}g</span></td>
          </tr>
        </table>

        ${
          meal.notes
            ? `
        <div class="notes-box">
          <div class="notes-title">Description & Notes</div>
          <p class="notes-content">${meal.notes}</p>
        </div>
        `
            : ''
        }
      </td>
    </tr>
  </table>
  `;

  const html = wrapHtmlDocument(
    'Meal Nutrition Report',
    'CALORIE TRACKER &bull; NUTRITIONAL INTELLIGENCE',
    '#ea580c',
    '#ea580c',
    contentHtml,
    SINGLE_MEAL_STYLES
  );

  const pdfBytes = await htmlToPdfBuffer(html);
  const safeName = meal.foodName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await downloadFile(pdfBytes, `meal-${safeName}-${meal.id}.pdf`, 'application/pdf');
}

/**
 * Generates and downloads a summary report (daily or timeframe).
 */
export async function generateSummaryPdf(
  meals: Meal[],
  title: string,
  timeframeStr: string,
  notes: string,
  includeImages: boolean,
  settings: any
): Promise<void> {
  const calorieGoal = settings.get('calorieGoal', 2000);
  const proteinGoal = settings.get('proteinGoal', 130);
  const carbsGoal = settings.get('carbsGoal', 220);
  const fatGoal = settings.get('fatGoal', 70);

  // Compute stats
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  for (const m of meals) {
    totalCalories += m.calories;
    totalProtein += m.protein;
    totalCarbs += m.carbs;
    totalFat += m.fat;
  }

  // Calculate unique days in meals set
  const uniqueDays = new Set(meals.map((m) => new Date(m.timestamp).toDateString())).size || 1;

  // Daily Averages
  const avgCal = Math.round(totalCalories / uniqueDays);
  const avgProt = Math.round(totalProtein / uniqueDays);
  const avgCarb = Math.round(totalCarbs / uniqueDays);
  const avgFat = Math.round(totalFat / uniqueDays);

  // Render meal rows HTML
  const mealsHtmlPromises = meals.map(async (m, i) => {
    let imgBase64 = '';
    if (includeImages && m.imageBlob) {
      try {
        imgBase64 = await blobToBase64(m.imageBlob);
      } catch (e) {
        console.warn('[Calorie Tracker PDF] Failed to convert list image:', e);
      }
    }

    const dateDayStr = new Date(m.timestamp).toLocaleDateString();
    const dateTimeStr = new Date(m.timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
    <div class="meal-item">
      <table class="meal-item-table">
        <tr>
          ${
            includeImages
              ? imgBase64
                ? `<td class="meal-thumbnail-cell"><img class="meal-thumbnail" src="${imgBase64}" alt="${m.foodName}"></td>`
                : `<td class="meal-thumbnail-cell"><div class="meal-thumbnail-placeholder">🍴</div></td>`
              : ''
          }
          <td class="meal-info-cell">
            <div class="meal-name">${i + 1}. ${m.foodName}</div>
            <div class="meal-time">${dateDayStr} @ ${dateTimeStr} &bull; ID: ${m.shortId}</div>

            <table class="meal-macros-table">
              <tr>
                <td style="font-weight: 800; color: #ea580c; font-size: 10pt;">Calories: ${m.calories} kcal</td>
                <td style="color: #16a34a; font-weight: bold;">Protein: ${m.protein}g</td>
                <td style="color: #2563eb; font-weight: bold;">Carbs: ${m.carbs}g</td>
                <td style="color: #d97706; font-weight: bold;">Fats: ${m.fat}g</td>
              </tr>
            </table>

            ${m.notes ? `<div class="meal-notes">${m.notes}</div>` : ''}
          </td>
        </tr>
      </table>
    </div>
    `;
  });

  const mealsHtmlArray = await Promise.all(mealsHtmlPromises);
  const mealsListHtml = mealsHtmlArray.join('');

  // Targets achievements
  const calPercent = Math.min(100, Math.round((avgCal / calorieGoal) * 100));
  const protPercent = Math.min(100, Math.round((avgProt / proteinGoal) * 100));
  const carbPercent = Math.min(100, Math.round((avgCarb / carbsGoal) * 100));
  const fatPercent = Math.min(100, Math.round((avgFat / fatGoal) * 100));

  const contentHtml = `
  <div class="summary-title">Nutritional Metrics & Performance</div>
  <table class="summary-table">
    <thead>
      <tr>
        <th>Nutrient / Goal</th>
        <th>Total Consumed</th>
        <th>Daily Average (${uniqueDays} Day${uniqueDays > 1 ? 's' : ''})</th>
        <th>Target Daily Goal</th>
        <th>% Achieved</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="summary-val" style="color: #ea580c;">Calories</td>
        <td>${totalCalories} kcal</td>
        <td class="summary-val">${avgCal} kcal</td>
        <td>${calorieGoal} kcal</td>
        <td>
          <div class="progress-bg">
            <div class="progress-fill" style="width: ${calPercent}%; background-color: #ea580c;"></div>
          </div>
          <span style="font-weight: bold; margin-left: 4pt;">${calPercent}%</span>
        </td>
      </tr>
      <tr>
        <td class="summary-val" style="color: #16a34a;">Protein</td>
        <td>${totalProtein}g</td>
        <td class="summary-val">${avgProt}g</td>
        <td>${proteinGoal}g</td>
        <td>
          <div class="progress-bg">
            <div class="progress-fill" style="width: ${protPercent}%; background-color: #16a34a;"></div>
          </div>
          <span style="font-weight: bold; margin-left: 4pt;">${protPercent}%</span>
        </td>
      </tr>
      <tr>
        <td class="summary-val" style="color: #2563eb;">Carbs</td>
        <td>${totalCarbs}g</td>
        <td class="summary-val">${avgCarb}g</td>
        <td>${carbsGoal}g</td>
        <td>
          <div class="progress-bg">
            <div class="progress-fill" style="width: ${carbPercent}%; background-color: #2563eb;"></div>
          </div>
          <span style="font-weight: bold; margin-left: 4pt;">${carbPercent}%</span>
        </td>
      </tr>
      <tr>
        <td class="summary-val" style="color: #d97706;">Fats</td>
        <td>${totalFat}g</td>
        <td class="summary-val">${avgFat}g</td>
        <td>${fatGoal}g</td>
        <td>
          <div class="progress-bg">
            <div class="progress-fill" style="width: ${fatPercent}%; background-color: #d97706;"></div>
          </div>
          <span style="font-weight: bold; margin-left: 4pt;">${fatPercent}%</span>
        </td>
      </tr>
    </tbody>
  </table>

  ${
    notes
      ? `
  <div class="notes-box">
    <div class="notes-title">Report Summary & Personal Notes</div>
    <p class="notes-content">${notes.replace(/\n/g, '<br>')}</p>
  </div>
  `
      : ''
  }

  <div class="summary-title">Logged Meals Details (${meals.length} meal${meals.length !== 1 ? 's' : ''})</div>

  <div style="margin-top: 10pt;">
    ${mealsListHtml || '<div style="font-style: italic; color: #64748b; padding: 10pt; text-align: center;">No meal logs present in selected duration.</div>'}
  </div>
  `;

  const html = wrapHtmlDocument(
    title || 'Nutritional Progress Report',
    `CALORIE TRACKER REPORT &bull; ${timeframeStr}`,
    '#2563eb',
    '#1e3a8a',
    contentHtml,
    SUMMARY_REPORTS_STYLES
  );

  const pdfBytes = await htmlToPdfBuffer(html);
  const safeTitle = (title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await downloadFile(pdfBytes, `${safeTitle}.pdf`, 'application/pdf');
}
