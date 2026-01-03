export default function init() {
  let timeLeft = 0;
  let timerId: number | null = null;
  let isRunning = false;

  const display = document.getElementById('timer-display') as HTMLElement;
  const status = document.getElementById('timer-status') as HTMLElement;
  const startStopBtn = document.getElementById('start-stop-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  const customInput = document.getElementById('custom-minutes') as HTMLInputElement;
  const setCustomBtn = document.getElementById('set-custom') as HTMLButtonElement;
  const presetBtns = document.querySelectorAll('.preset-btn');
  const notifPermission = document.getElementById('notif-permission') as HTMLElement;

  const oldDocTitle = document.title;
  function updateDisplay() {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    document.title = isRunning ? `(${display.textContent}) Timer` : 'Timer';
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
        icon: './favicon.ico',
      });
    } else {
      alert('Timer Finished!');
    }
    document.title = oldDocTitle;
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    isRunning = false;
    startStopBtn.textContent = 'Start';
    startStopBtn.classList.remove('btn-warning');
    startStopBtn.classList.add('btn-primary');
    status.textContent = timeLeft === 0 ? 'Finished' : 'Paused';
  }

  function startTimer() {
    if (timeLeft <= 0) return;

    isRunning = true;
    startStopBtn.textContent = 'Pause';
    startStopBtn.classList.remove('btn-primary');
    startStopBtn.classList.add('btn-warning');
    status.textContent = 'Running...';

    timerId = window.setInterval(() => {
      timeLeft--;
      updateDisplay();

      if (timeLeft <= 0) {
        stopTimer();
        notify();
      }
    }, 1000);
  }

  function setTime(seconds: number) {
    stopTimer();
    timeLeft = seconds;
    updateDisplay();
    status.textContent = 'Ready';
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
  updateDisplay();

  return () => {
    if (timerId) clearInterval(timerId);
  };
}
