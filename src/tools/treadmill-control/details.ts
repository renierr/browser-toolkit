import type { TreadmillSession } from './db';
import { formatDuration } from '../heart-rate-monitor/utils';

export function showSessionDetails(session: TreadmillSession, sessions?: TreadmillSession[]) {
  const modal = document.getElementById('session-modal') as HTMLDialogElement;
  const modalTitle = document.getElementById('modal-title')!;
  const sessionSelectContainer = document.getElementById('session-select-container')!;
  const sessionSelect = document.getElementById('session-select') as HTMLSelectElement;
  const modalDuration = document.getElementById('modal-duration')!;
  const modalDatapoints = document.getElementById('modal-datapoints')!;
  const graphCanvas = document.getElementById('session-graph') as HTMLCanvasElement;
  const dataToggle = document.getElementById('toggle-data') as HTMLInputElement;
  const dataContainer = document.getElementById('modal-data-container')!;
  const dataBody = document.getElementById('modal-data-body')!;

  const drawGraph = (canvas: HTMLCanvasElement, s: TreadmillSession) => {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	// Simple time-series plot of speed (if available)
	const w = canvas.width = canvas.clientWidth * devicePixelRatio;
	const h = canvas.height = canvas.clientHeight * devicePixelRatio;
	ctx.clearRect(0, 0, w, h);
	if (!s.dataPoints.length) return;

	// normalize start time and point times to numbers (ms)
	const startMs = typeof s.startTime === 'string' ? Date.parse(s.startTime) : (s.startTime as number);
	const times = s.dataPoints.map(p => {
		const t = typeof p.timestamp === 'string' ? Date.parse(p.timestamp) : (p.timestamp as number);
		return (isNaN(t) ? 0 : t) - (isNaN(startMs as number) ? 0 : startMs);
	});
	const speeds = s.dataPoints.map(p => {
		const v = (p.data && (p.data as any).speed) ?? 0;
		const n = Number(v);
		return isNaN(n) ? 0 : n;
	});
	const minV = Math.min(...speeds);
	const maxV = Math.max(...speeds);

	const lastTime = (times[times.length - 1] || 1);
	const range = (maxV - minV) || 1;

	ctx.strokeStyle = '#0ea5e9';
	ctx.lineWidth = 2 * devicePixelRatio;
	ctx.beginPath();
	s.dataPoints.forEach((_, i) => {
	  const x = (times[i] / lastTime) * w;
	  const y = h - ((speeds[i] - minV) / range) * h;
	  if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	});
	ctx.stroke();
  };

  const updateView = (current: TreadmillSession) => {
	const startMs = typeof current.startTime === 'string' ? Date.parse(current.startTime) : (current.startTime as number);
	const date = new Date(isNaN(startMs as number) ? String(current.startTime) : startMs).toLocaleString();
	const duration = current.endTime ? formatDuration((typeof current.endTime === 'string' ? Date.parse(current.endTime) : (current.endTime as number)) - (isNaN(startMs as number) ? 0 : startMs)) : '---';
	modalTitle.innerHTML = `Session Details <span class="badge badge-ghost font-mono ml-2">${current.uid || 'N/A'}</span> <div class="text-xs font-normal text-base-content/50 mt-1">${date}</div>`;
	modalDuration.textContent = duration;
	modalDatapoints.textContent = current.dataPoints.length.toString();

	dataToggle.checked = false;
	dataContainer.classList.add('hidden');
	renderDataTable(current, dataBody);

	setTimeout(() => drawGraph(graphCanvas, current), 50);
  };

  if (sessions && sessions.length > 1) {
	sessionSelectContainer.classList.remove('hidden');
	sessionSelect.innerHTML = '';
	sessions.forEach((s, idx) => {
	  const option = document.createElement('option');
	  option.value = idx.toString();
	  option.textContent = `${s.uid || '---'} - ${new Date(s.startTime).toLocaleString()}`;
	  sessionSelect.appendChild(option);
	});
	sessionSelect.onchange = () => {
	  const selectedSession = sessions[parseInt(sessionSelect.value)];
	  updateView(selectedSession);
	};
	sessionSelect.value = sessions.indexOf(session).toString();
  } else {
	sessionSelectContainer.classList.add('hidden');
  }

  updateView(session);
  modal.showModal();
}

function renderDataTable(session: TreadmillSession, container: HTMLElement) {
  container.innerHTML = '';
  const startMs = typeof session.startTime === 'string' ? Date.parse(session.startTime) : (session.startTime as number);
  session.dataPoints.forEach((p, index) => {
	const row = document.createElement('tr');
	const ts = typeof p.timestamp === 'string' ? Date.parse(p.timestamp) : (p.timestamp as number);
	const relativeTime = formatDuration((isNaN(ts) ? 0 : ts) - (isNaN(startMs as number) ? 0 : startMs));
	const speedVal = (p.data && (p.data as any).speed) ?? undefined;
	const speed = speedVal !== undefined ? `${Number(speedVal).toFixed(1)} km/h` : '--';
	const inclineVal = (p.data && (p.data as any).inclination) ?? undefined;
	const incline = inclineVal !== undefined ? `${Number(inclineVal).toFixed(1)}%` : '--';
	row.innerHTML = `
	  <td>${index + 1}</td>
	  <td class="font-mono">${relativeTime}</td>
	  <td class="font-bold">${speed}</td>
	  <td class="font-bold">${incline}</td>
	`;
	container.appendChild(row);
  });
}

export function initDetails() {
  const dataToggle = document.getElementById('toggle-data') as HTMLInputElement;
  const dataContainer = document.getElementById('modal-data-container')!;

  dataToggle.addEventListener('change', () => {
	if (dataToggle.checked) dataContainer.classList.remove('hidden'); else dataContainer.classList.add('hidden');
  });
}


