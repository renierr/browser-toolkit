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

	const speeds = s.dataPoints.map(p => p.data.speed ?? 0);
	const times = s.dataPoints.map(p => p.timestamp - s.startTime);
	const minV = Math.min(...speeds);
	const maxV = Math.max(...speeds);

	const lastTime = times[times.length - 1] || 1;
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
	const date = new Date(current.startTime).toLocaleString();
	const duration = current.endTime ? formatDuration(current.endTime - current.startTime) : '---';
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
  session.dataPoints.forEach((p, index) => {
	const row = document.createElement('tr');
	const relativeTime = formatDuration(p.timestamp - session.startTime);
	const speed = p.data.speed !== undefined ? `${p.data.speed.toFixed(1)} km/h` : '--';
	const incline = p.data.inclination !== undefined ? `${p.data.inclination.toFixed(1)}%` : '--';
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


