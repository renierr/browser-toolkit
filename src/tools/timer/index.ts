
// noinspection JSUnusedGlobalSymbols
export default function init() {
  let timeLeft = 0;
  let timerId: number | null = null;
  let isRunning = false;
  let endTime: number | null = null;

  const STORAGE_KEY = 'tool-timer-state';

  const display = document.getElementById('timer-display') as HTMLElement;
  const status = document.getElementById('timer-status') as HTMLElement;
  const startStopBtn = document.getElementById('start-stop-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  const customInput = document.getElementById('custom-minutes') as HTMLInputElement;
  const setCustomBtn = document.getElementById('set-custom') as HTMLButtonElement;
  const presetBtns = document.querySelectorAll('.preset-btn');
  const notifPermission = document.getElementById('notif-permission') as HTMLElement;

  function saveState() {
    const state = {
      timeLeft,
      isRunning,
      endTime: isRunning ? endTime : null,
      lastUpdate: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const state = JSON.parse(saved);
      const now = Date.now();

      if (state.isRunning && state.endTime) {
        const remaining = Math.round((state.endTime - now) / 1000);
        if (remaining > 0) {
          timeLeft = remaining;
          endTime = state.endTime;
          startTimer(true);
        } else {
          timeLeft = 0;
          status.textContent = 'Finished while away';
        }
      } else {
        timeLeft = state.timeLeft || 0;
      }
    } catch (e) {
      console.error('Failed to load timer state', e);
    }
  }

  function updateDisplay() {
    const mins = Math.floor(Math.max(0, timeLeft) / 60);
    const secs = Math.max(0, timeLeft) % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    display.textContent = timeStr;
    document.title = isRunning ? `(${timeStr}) Timer` : 'Timer';
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) {
      notifPermission.textContent = 'Not supported';
      return;
    }
    if (Notification.permission === 'granted') {
      notifPermission.textContent = 'Enabled';
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        notifPermission.textContent = permission === 'granted' ? 'Enabled' : 'Denied';
      });
    } else {
      notifPermission.textContent = 'Denied';
    }
  }

  function notify() {
    if (Notification.permission === 'granted') {
      new Notification('Timer Finished!', {
        body: 'Your countdown has ended.',
        icon: './favicon.png',
      });
    } else {
      alert('Timer Finished!');
    }
  }

  function stopTimer(isFinished = false) {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    isRunning = false;
    endTime = null;
    startStopBtn.textContent = 'Start';
    startStopBtn.classList.remove('btn-warning');
    startStopBtn.classList.add('btn-primary');
    status.textContent = isFinished ? 'Finished' : 'Paused';
    saveState();
  }

  function startTimer(isResuming = false) {
    if (timeLeft <= 0) return;

    isRunning = true;
    if (!isResuming) {
      endTime = Date.now() + timeLeft * 1000;
    }

    startStopBtn.textContent = 'Pause';
    startStopBtn.classList.remove('btn-primary');
    startStopBtn.classList.add('btn-warning');
    status.textContent = 'Running...';

    timerId = window.setInterval(() => {
      const now = Date.now();
      if (endTime) {
        timeLeft = Math.round((endTime - now) / 1000);
      } else {
        timeLeft--;
      }

      if (timeLeft <= 0) {
        timeLeft = 0;
        updateDisplay();
        stopTimer(true);
        notify();
      } else {
        updateDisplay();
        saveState();
      }
    }, 1000);

    saveState();
  }

  function setTime(seconds: number) {
    stopTimer();
    timeLeft = seconds;
    updateDisplay();
    status.textContent = 'Ready';
    saveState();
  }

  startStopBtn.addEventListener('click', () => {
    if (isRunning) {
      stopTimer();
    } else {
      startTimer();
    }
  });

  resetBtn.addEventListener('click', () => {
    stopTimer();
    timeLeft = 0;
    updateDisplay();
    status.textContent = 'Ready';
    localStorage.removeItem(STORAGE_KEY);
  });

  setCustomBtn.addEventListener('click', () => {
    const mins = parseInt(customInput.value);
    if (mins > 0) {
      setTime(mins * 60);
    }
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const secs = parseInt(btn.getAttribute('data-seconds') || '0');
      setTime(secs);
    });
  });

  requestNotificationPermission();
  loadState();
  updateDisplay();

  return () => {
    if (timerId) clearInterval(timerId);
    document.title = 'Vanilla Toolkit';
  };
}
