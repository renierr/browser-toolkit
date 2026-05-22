import type { Meal } from './db';

/**
 * Renders a premium Canvas line chart displaying calorie trends over the past 7 days.
 */
export function drawTrendChart(
  canvas: HTMLCanvasElement,
  chartEmptyState: HTMLDivElement,
  meals: Meal[],
  dailyGoal: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Reset Canvas dimension for crisp high-DPI rendering
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
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

  const calorieData = dateKeys.map((k) => dailyCalories[k]);

  // Plot boundaries
  const padding = { top: 20, right: 15, bottom: 25, left: 35 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find limits
  const maxVal = Math.max(dailyGoal * 1.25, ...calorieData, 1000);

  // Coordinate mapping helpers
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
}
