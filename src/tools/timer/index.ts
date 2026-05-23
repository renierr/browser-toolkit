import { backgroundTimer } from '@js/background-timer';
import type { BgTimerHandle } from '@js/background-timer';

export default function init() {
  const display = document.getElementById('timer-display') as HTMLElement;
  const status = document.getElementById('timer-status') as HTMLElement;
  const startStopBtn = document.getElementById('start-stop-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  const customInput = document.getElementById('custom-minutes') as HTMLInputElement;
  const setCustomBtn = document.getElementById('set-custom') as HTMLButtonElement;
  const presetBtns = document.querySelectorAll('.preset-btn');
  const notifPermission = document.getElementById('notif-permission') as HTMLElement;

  const storedDocTitle = document.title;

  let timeLeft = 0;
  let isRunning = false;
  let timerHandle: BgTimerHandle | null = null;
  let audioCtx: AudioContext | null = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      const AC =
        window.AudioContext ||
        (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playAlarmSound() {
    ensureAudioContext();
    if (!audioCtx) return;
    const frequencies = [523.25, 659.25, 783.99];
    const noteDuration = 0.15;
    const noteGap = 0.08;
    const patternGap = 0.3;
    const repetitions = 3;
    for (let rep = 0; rep < repetitions; rep++) {
      const patternStart = rep * (frequencies.length * (noteDuration + noteGap) + patternGap);
      frequencies.forEach((freq, i) => {
        const startTime = audioCtx!.currentTime + patternStart + i * (noteDuration + noteGap);
        const osc = audioCtx!.createOscillator();
        const gain = audioCtx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.connect(gain);
        gain.connect(audioCtx!.destination);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
        gain.gain.setValueAtTime(0.5, startTime + noteDuration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);
        osc.start(startTime);
        osc.stop(startTime + noteDuration);
      });
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function updateDisplay() {
    display.textContent = formatTime(timeLeft);
    document.title = isRunning ? `(${formatTime(timeLeft)}) Timer` : 'Timer';
  }

  function updateUI() {
    if (isRunning) {
      startStopBtn.textContent = 'Pause';
      startStopBtn.classList.remove('btn-primary');
      startStopBtn.classList.add('btn-warning');
      status.textContent = 'Running...';
    } else {
      startStopBtn.textContent = 'Start';
      startStopBtn.classList.remove('btn-warning');
      startStopBtn.classList.add('btn-primary');
      status.textContent = timeLeft > 0 ? 'Paused' : 'Ready';
    }
  }

  function cancelTimer() {
    if (timerHandle) {
      timerHandle.cancel();
      timerHandle = null;
    }
  }

  function startTimer() {
    if (timeLeft <= 0) return;
    ensureAudioContext();
    cancelTimer();
    timerHandle = backgroundTimer.createTimer();
    timerHandle.start(timeLeft, {
      onTick(remaining) {
        timeLeft = remaining;
        updateDisplay();
      },
      onComplete() {
        isRunning = false;
        timeLeft = 0;
        timerHandle = null;
        updateDisplay();
        updateUI();
        playAlarmSound();
        status.textContent = 'Finished';
      },
    });
    isRunning = true;
    updateUI();
  }

  function pauseTimer() {
    if (!timerHandle) return;
    cancelTimer();
    isRunning = false;
    updateUI();
  }

  function resetTimer() {
    cancelTimer();
    timeLeft = 0;
    isRunning = false;
    updateDisplay();
    updateUI();
  }

  function setTime(seconds: number) {
    resetTimer();
    timeLeft = seconds;
    updateDisplay();
    updateUI();
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

  startStopBtn.addEventListener('click', () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  resetBtn.addEventListener('click', resetTimer);

  setCustomBtn.addEventListener('click', () => {
    const mins = parseInt(customInput.value);
    if (mins > 0) setTime(mins * 60);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const secs = parseInt(btn.getAttribute('data-seconds') || '0');
      if (secs > 0) setTime(secs);
    });
  });

  requestNotificationPermission();
  updateDisplay();

  return () => {
    cancelTimer();
    document.title = storedDocTitle;
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  };
}
