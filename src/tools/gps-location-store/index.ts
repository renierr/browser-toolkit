import {
  openDB,
  saveLocation,
  getAllLocations,
  deleteLocation,
  clearAllLocations,
  generateDefaultDescription,
} from './db.ts';
import type { SavedLocation } from './types.ts';
import { showMessage } from '@js/ui.ts';
import { gpsGenerateGoogleMapsLink } from '@js/gps-utils.ts';
import {
  calculateDistance,
  formatDistance,
  formatCoordinate,
  formatTimestamp,
  createOsmEmbedUrl,
  getPositionViaIp,
} from './utils.ts';

interface PositionResult {
  lat: number;
  lon: number;
  accuracy: number;
  source: 'gps' | 'network' | 'ip';
}

function getPosition(highAccuracy: boolean): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: highAccuracy,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

export default async function init() {
  let currentPosition: PositionResult | null = null;
  let db: IDBDatabase | null = null;
  let allLocations: SavedLocation[] = [];

  db = await openDB();
  await loadLocations();
  setupEventListeners();
  updateLastSavedDisplay();

  return () => {
    currentPosition = null;
    if (db) {
      db.close();
      db = null;
    }
    allLocations = [];
  };

  async function loadLocations(): Promise<void> {
    if (!db) return;
    allLocations = await getAllLocations(db);
    renderHistory();
  }

  function setupEventListeners(): void {
    const getLocationBtn = document.getElementById('get-location-btn') as HTMLButtonElement;
    const saveLocationBtn = document.getElementById('save-location-btn') as HTMLButtonElement;
    const clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;
    const descriptionInput = document.getElementById('location-description') as HTMLInputElement;
    const viewLastMapBtn = document.getElementById('view-last-map-btn') as HTMLButtonElement;
    const viewCurrentMapBtn = document.getElementById('view-current-map-btn') as HTMLButtonElement;
    const googleMapsCurrentLink = document.getElementById(
      'google-maps-current-link'
    ) as HTMLAnchorElement;
    const googleMapsLastLink = document.getElementById(
      'google-maps-last-link'
    ) as HTMLAnchorElement;
    const getApproxBtn = document.getElementById('get-approx-btn') as HTMLButtonElement;

    getLocationBtn.addEventListener('click', handleGetLocation);
    saveLocationBtn.addEventListener('click', handleSaveLocation);
    clearAllBtn.addEventListener('click', handleClearAll);
    descriptionInput.addEventListener('input', updateSaveButtonState);
    viewLastMapBtn.addEventListener('click', () => showMapForLocation(allLocations[0]));
    getApproxBtn.addEventListener('click', handleGetApproximateLocation);
    viewCurrentMapBtn.addEventListener('click', handleViewCurrentMap);
    googleMapsCurrentLink.addEventListener('click', (e) => {
      if (!currentPosition) e.preventDefault();
    });
    googleMapsLastLink.addEventListener('click', (e) => {
      if (allLocations.length === 0) e.preventDefault();
    });
  }

  function getSourceLabel(source: PositionResult['source']): string {
    switch (source) {
      case 'gps':
        return 'GPS';
      case 'network':
        return 'Network';
      case 'ip':
        return 'IP-based (approx)';
    }
  }

  function updateCurrentLocationDisplay(pos: PositionResult): void {
    const display = document.getElementById('current-location-display') as HTMLDivElement;
    const approxBtn = document.getElementById('approx-btn-container') as HTMLDivElement;
    const actions = document.getElementById('current-location-actions') as HTMLDivElement;
    const googleLink = document.getElementById('google-maps-current-link') as HTMLAnchorElement;

    display.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div><span class="opacity-70">Latitude:</span> ${formatCoordinate(pos.lat, true)}</div>
        <div><span class="opacity-70">Longitude:</span> ${formatCoordinate(pos.lon, false)}</div>
        <div><span class="opacity-70">Accuracy:</span> ±${pos.accuracy.toFixed(0)} m</div>
        <div><span class="opacity-70">Source:</span> <span class="badge badge-sm">${getSourceLabel(pos.source)}</span></div>
      </div>
    `;

    approxBtn.classList.add('hidden');
    actions.classList.remove('hidden');
    googleLink.href = gpsGenerateGoogleMapsLink(pos.lat, pos.lon);
  }

  function handleViewCurrentMap(): void {
    if (!currentPosition) return;
    showMapForLocation({
      latitude: currentPosition.lat,
      longitude: currentPosition.lon,
    } as SavedLocation);
  }

  async function handleGetLocation(): Promise<void> {
    const display = document.getElementById('current-location-display') as HTMLDivElement;
    const btn = document.getElementById('get-location-btn') as HTMLButtonElement;
    const approxBtn = document.getElementById('approx-btn-container') as HTMLDivElement;

    if (!navigator.geolocation) {
      showMessage('Geolocation is not supported by this browser.', { type: 'alert' });
      return;
    }

    btn.disabled = true;
    approxBtn.classList.add('hidden');
    btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Getting...';

    try {
      const position = await getPosition(true);
      currentPosition = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        source: 'gps',
      };
      updateCurrentLocationDisplay(currentPosition);
    } catch {
      btn.innerHTML = '<i data-lucide="map-pin" class="w-4 h-4"></i> Get Location';
      btn.disabled = false;
      display.innerHTML =
        '<div class="opacity-50">Exact location unavailable. Try approximate location below.</div>';
      approxBtn.classList.remove('hidden');
      return;
    }

    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="map-pin" class="w-4 h-4"></i> Get Location';
    updateSaveButtonState();
    updateLastSavedDisplay();
  }

  async function handleGetApproximateLocation(): Promise<void> {
    const display = document.getElementById('current-location-display') as HTMLDivElement;
    const btn = document.getElementById('get-location-btn') as HTMLButtonElement;
    const approxBtn = document.getElementById('approx-btn-container') as HTMLDivElement;

    btn.disabled = true;
    approxBtn.classList.add('hidden');
    btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Getting...';
    display.innerHTML = '<div class="opacity-50">Fetching approximate location via IP...</div>';

    const ipPos = await getPositionViaIp();
    if (ipPos) {
      currentPosition = ipPos;
      updateCurrentLocationDisplay(currentPosition);
    } else {
      display.innerHTML =
        '<div class="text-error">Failed to get approximate location. Please try again.</div>';
      approxBtn.classList.remove('hidden');
    }

    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="map-pin" class="w-4 h-4"></i> Get Location';
    updateSaveButtonState();
    updateLastSavedDisplay();
  }

  function updateSaveButtonState(): void {
    const saveBtn = document.getElementById('save-location-btn') as HTMLButtonElement;
    saveBtn.disabled = !currentPosition;
  }

  async function handleSaveLocation(): Promise<void> {
    if (!db || !currentPosition) return;

    const descriptionInput = document.getElementById('location-description') as HTMLInputElement;
    const description = descriptionInput.value.trim() || generateDefaultDescription();

    const location: Omit<SavedLocation, 'id'> = {
      latitude: currentPosition.lat,
      longitude: currentPosition.lon,
      description,
      accuracy: currentPosition.accuracy,
      timestamp: Date.now(),
    };

    await saveLocation(db, location);

    descriptionInput.value = '';
    currentPosition = null;

    const display = document.getElementById('current-location-display') as HTMLDivElement;
    const actions = document.getElementById('current-location-actions') as HTMLDivElement;
    display.innerHTML =
      '<div class="opacity-50">Location saved! Click "Get Location" to track again</div>';
    actions.classList.add('hidden');
    updateSaveButtonState();

    await loadLocations();
    updateLastSavedDisplay();

    showMessage('Location saved successfully!');
  }

  function updateLastSavedDisplay(): void {
    const display = document.getElementById('last-saved-display') as HTMLDivElement;
    const actions = document.getElementById('last-saved-actions') as HTMLDivElement;
    const googleLink = document.getElementById('google-maps-last-link') as HTMLAnchorElement;

    if (allLocations.length === 0) {
      display.innerHTML = '<div class="opacity-50">No saved locations</div>';
      actions.classList.add('hidden');
      return;
    }

    const last = allLocations[0];
    let distanceHtml = '';

    if (currentPosition) {
      const dist = calculateDistance(
        currentPosition.lat,
        currentPosition.lon,
        last.latitude,
        last.longitude
      );
      distanceHtml = `<div><span class="opacity-70">Distance:</span> ${formatDistance(dist)}</div>`;
    }

    const hasDescription = last.description && !last.description.startsWith('Location saved on');

    display.innerHTML = `
      <div class="grid grid-cols-2 gap-1 text-xs">
        <div><span class="opacity-70">Latitude:</span> ${last.latitude.toFixed(5)}°</div>
        <div><span class="opacity-70">Longitude:</span> ${last.longitude.toFixed(5)}°</div>
        ${distanceHtml}
        ${hasDescription ? `<div class="col-span-2 text-primary font-medium">"${last.description}"</div>` : ''}
        <div><span class="opacity-70">Saved:</span> ${formatTimestamp(last.timestamp)}</div>
      </div>
    `;

    actions.classList.remove('hidden');
    googleLink.href = gpsGenerateGoogleMapsLink(last.latitude, last.longitude);
  }

  function renderHistory(): void {
    const container = document.getElementById('history-container') as HTMLDivElement;

    if (allLocations.length === 0) {
      container.innerHTML =
        '<div class="text-center p-4 opacity-50 italic">No locations saved yet</div>';
      return;
    }

    const historyItems = allLocations;

    container.innerHTML = historyItems
      .map(
        (loc, idx) => `
      <div class="collapse collapse-arrow bg-base-100 border border-base-300">
        <input type="checkbox" />
        <div class="collapse-title flex justify-between items-center pr-12 min-h-auto py-2">
          <div class="text-sm">
            <span class="font-medium">${idx === 0 ? '★ ' : ''}Location ${allLocations.length - idx}</span>
            <span class="opacity-70 ml-2">${formatTimestamp(loc.timestamp)}</span>
          </div>
          <button
            class="btn btn-ghost btn-xs btn-circle delete-btn"
            data-id="${loc.id}"
            onclick="event.stopPropagation();"
          >
            <i data-lucide="trash-2" class="w-4 h-4 text-error"></i>
          </button>
        </div>
        <div class="collapse-content text-sm">
          <div class="grid grid-cols-2 gap-2 mb-2">
            <div><span class="opacity-70">Latitude:</span> ${formatCoordinate(loc.latitude, true)}</div>
            <div><span class="opacity-70">Longitude:</span> ${formatCoordinate(loc.longitude, false)}</div>
            <div><span class="opacity-70">Accuracy:</span> ±${loc.accuracy.toFixed(0)} m</div>
            <div><span class="opacity-70">Saved:</span> ${formatTimestamp(loc.timestamp)}</div>
          </div>
          ${
            loc.description
              ? `<div class="mb-2"><span class="opacity-70">Description:</span> "${loc.description}"</div>`
              : ''
          }
          <div class="flex gap-2 mt-3">
            <button class="btn btn-outline btn-sm view-map-btn" data-lat="${loc.latitude}" data-lon="${loc.longitude}">
              <i data-lucide="map" class="w-4 h-4"></i>
              View on Map
            </button>
            <a
              href="${gpsGenerateGoogleMapsLink(loc.latitude, loc.longitude)}"
              target="_blank"
              class="btn btn-outline btn-sm"
            >
              <i data-lucide="external-link" class="w-4 h-4"></i>
              Google Maps
            </a>
          </div>
        </div>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).getAttribute('data-id') || '0');
        if (confirm('Delete this location?')) {
          await deleteLocation(db!, id);
          await loadLocations();
          updateLastSavedDisplay();
          showMessage('Location deleted');
        }
      });
    });

    container.querySelectorAll('.view-map-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const lat = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-lat') || '0');
        const lon = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-lon') || '0');
        showMapForLocation({ latitude: lat, longitude: lon } as SavedLocation);
      });
    });
  }

  function showMapForLocation(loc: SavedLocation): void {
    const modal = document.getElementById('map-modal') as HTMLDialogElement;
    const iframe = document.getElementById('map-frame') as HTMLIFrameElement;
    iframe.src = createOsmEmbedUrl(loc.latitude, loc.longitude);
    modal.showModal();
  }

  async function handleClearAll(): Promise<void> {
    if (!db) return;

    if (allLocations.length === 0) {
      showMessage('No locations to clear.');
      return;
    }

    if (confirm(`Delete all ${allLocations.length} saved locations? This cannot be undone.`)) {
      await clearAllLocations(db);
      allLocations = [];
      renderHistory();
      updateLastSavedDisplay();
      showMessage('All locations cleared');
    }
  }
}
