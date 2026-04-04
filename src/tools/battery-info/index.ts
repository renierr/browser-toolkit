type BatteryManager = {
  readonly charging: boolean;
  readonly chargingTime: number;
  readonly dischargingTime: number;
  readonly level: number;
  onchargingchange: ((this: BatteryManager, ev: Event) => unknown) | null;
  onchargingtimechange: ((this: BatteryManager, ev: Event) => unknown) | null;
  ondischargingtimechange: ((this: BatteryManager, ev: Event) => unknown) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => unknown) | null;
  addEventListener(
    type: 'chargingchange' | 'chargingtimechange' | 'dischargingtimechange' | 'levelchange',
    listener: (this: BatteryManager, ev: Event) => unknown
  ): void;
  removeEventListener(
    type: 'chargingchange' | 'chargingtimechange' | 'dischargingtimechange' | 'levelchange',
    listener: (this: BatteryManager, ev: Event) => unknown
  ): void;
};

type ExtendedNavigator = Navigator & {
  getBattery(): Promise<BatteryManager>;
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds === Infinity) {
    return '--';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return '< 1m';
}

function updateBatteryUI(battery: BatteryManager): void {
  const level = Math.round(battery.level * 100);
  const isCharging = battery.charging;

  const fillEl = document.getElementById('battery-fill');
  const levelEl = document.getElementById('battery-level');
  const statusEl = document.getElementById('charging-status');
  const statusTextEl = document.getElementById('status-text');
  const statLevel = document.getElementById('stat-level');
  const statLevelDesc = document.getElementById('stat-level-desc');
  const statCharging = document.getElementById('stat-charging');
  const statChargingDesc = document.getElementById('stat-charging-desc');
  const statTime = document.getElementById('stat-time');
  const statTimeDesc = document.getElementById('stat-time-desc');

  if (
    fillEl &&
    levelEl &&
    statusEl &&
    statusTextEl &&
    statLevel &&
    statLevelDesc &&
    statCharging &&
    statChargingDesc &&
    statTime &&
    statTimeDesc
  ) {
    fillEl.style.height = `${level}%`;
    levelEl.textContent = `${level}%`;

    if (level <= 20) {
      fillEl.classList.remove('bg-warning', 'bg-success');
      fillEl.classList.add('bg-error');
    } else if (level <= 50) {
      fillEl.classList.remove('bg-error', 'bg-success');
      fillEl.classList.add('bg-warning');
    } else {
      fillEl.classList.remove('bg-error', 'bg-warning');
      fillEl.classList.add('bg-success');
    }

    statLevel.textContent = `${level}%`;

    if (isCharging) {
      statusEl.classList.remove('badge-warning', 'badge-error', 'badge-ghost');
      statusEl.classList.add('badge-success');
      const iconEl = statusEl.querySelector('i');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', 'plug');
      }
      statusTextEl.textContent = 'Charging';

      statCharging.textContent = 'Charging';
      statChargingDesc.textContent = 'Connected to power';

      const timeText =
        battery.chargingTime === 0 ? 'Fully charged' : formatTime(battery.chargingTime);
      statTime.textContent = timeText;
      statTimeDesc.textContent =
        battery.chargingTime === 0 ? 'Battery is full' : 'Time to full charge';
    } else if (battery.level >= 1) {
      statusEl.classList.remove('badge-warning', 'badge-error', 'badge-success');
      statusEl.classList.add('badge-ghost');
      const iconEl = statusEl.querySelector('i');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', 'battery-full');
      }
      statusTextEl.textContent = 'Full';

      statCharging.textContent = 'Full';
      statChargingDesc.textContent = 'Battery is charged';

      statTime.textContent = '--';
      statTimeDesc.textContent = 'On AC power';
    } else {
      statusEl.classList.remove('badge-success', 'badge-error', 'badge-ghost');
      statusEl.classList.add('badge-warning');
      const iconEl = statusEl.querySelector('i');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', 'battery');
      }
      statusTextEl.textContent = 'Discharging';

      statCharging.textContent = 'Discharging';
      statChargingDesc.textContent = 'Running on battery';

      const timeText = formatTime(battery.dischargingTime);
      statTime.textContent = timeText;
      statTimeDesc.textContent = 'Time remaining';
    }
  }
}

export default function init(): (() => void) | undefined {
  const loadingEl = document.getElementById('battery-loading');
  const unsupportedEl = document.getElementById('battery-unsupported');
  const contentEl = document.getElementById('battery-content');

  if (!loadingEl || !unsupportedEl || !contentEl) {
    console.error('[BatteryInfo] Required DOM elements not found');
    return;
  }

  const nav = navigator as ExtendedNavigator;

  if (!nav.getBattery) {
    loadingEl.classList.add('hidden');
    unsupportedEl.classList.remove('hidden');
    return;
  }

  nav
    .getBattery()
    .then((battery) => {
      loadingEl.classList.add('hidden');
      unsupportedEl.classList.add('hidden');
      contentEl.classList.remove('hidden');

      updateBatteryUI(battery);

      const handleChange = () => updateBatteryUI(battery);

      battery.addEventListener('chargingchange', handleChange);
      battery.addEventListener('levelchange', handleChange);
      battery.addEventListener('chargingtimechange', handleChange);
      battery.addEventListener('dischargingtimechange', handleChange);

      return () => {
        battery.removeEventListener('chargingchange', handleChange);
        battery.removeEventListener('levelchange', handleChange);
        battery.removeEventListener('chargingtimechange', handleChange);
        battery.removeEventListener('dischargingtimechange', handleChange);
      };
    })
    .catch((error) => {
      console.error('[BatteryInfo] Failed to get battery info:', error);
      loadingEl.classList.add('hidden');
      unsupportedEl.classList.remove('hidden');
    });

  return;
}
