import type { HeartRateSession } from './db';
import { formatDuration } from './utils';
import { drawSessionGraph } from './graph';

export function showSessionDetails(session: HeartRateSession, sessions?: HeartRateSession[]) {
  const modal = document.getElementById('session-modal') as HTMLDialogElement;
  const modalTitle = document.getElementById('modal-title')!;
  const sessionSelectContainer = document.getElementById('session-select-container')!;
  const sessionSelect = document.getElementById('session-select') as HTMLSelectElement;
  const modalDuration = document.getElementById('modal-duration')!;
  const modalAvgHr = document.getElementById('modal-avg-hr')!;
  const modalMaxHr = document.getElementById('modal-max-hr')!;
  const modalDatapoints = document.getElementById('modal-datapoints')!;
  const graphCanvas = document.getElementById('session-graph') as HTMLCanvasElement;
  const dataToggle = document.getElementById('toggle-data') as HTMLInputElement;
  const dataContainer = document.getElementById('modal-data-container')!;
  const dataBody = document.getElementById('modal-data-body')!;

  const updateView = (current: HeartRateSession) => {
    const date = new Date(current.startTime).toLocaleString();
    const duration = current.endTime ? formatDuration(current.endTime - current.startTime) : '---';

    const hrs = current.dataPoints.map((p) => p.heartRate);
    const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0;
    const maxHr = hrs.length ? Math.max(...hrs) : 0;

    modalTitle.innerHTML = `Session Details <span class="badge badge-ghost font-mono ml-2">${current.uid || 'N/A'}</span> <div class="text-xs font-normal text-base-content/50 mt-1">${date}</div>`;
    modalDuration.textContent = duration;
    modalAvgHr.textContent = `${avgHr} BPM`;
    modalMaxHr.textContent = `${maxHr} BPM`;
    modalDatapoints.textContent = current.dataPoints.length.toString();

    // Reset toggle and data table
    dataToggle.checked = false;
    dataContainer.classList.add('hidden');
    renderDataTable(current, dataBody);

    // Draw graph after a short delay
    setTimeout(() => drawSessionGraph(graphCanvas, current), 50);
  };

  // Handle multiple sessions from JSON import
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

function renderDataTable(session: HeartRateSession, container: HTMLElement) {
  container.innerHTML = '';
  session.dataPoints.forEach((p, index) => {
    const row = document.createElement('tr');
    const relativeTime = formatDuration(p.timestamp - session.startTime);
    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="font-mono">${relativeTime}</td>
      <td class="font-bold">${p.heartRate} <small class="text-base-content/50">BPM</small></td>
    `;
    container.appendChild(row);
  });
}

export function initDetails() {
  const dataToggle = document.getElementById('toggle-data') as HTMLInputElement;
  const dataContainer = document.getElementById('modal-data-container')!;

  dataToggle.addEventListener('change', () => {
    if (dataToggle.checked) {
      dataContainer.classList.remove('hidden');
    } else {
      dataContainer.classList.add('hidden');
    }
  });
}
