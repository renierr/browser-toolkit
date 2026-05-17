import { acquireWakeLock } from '@js/utils';
import { backgroundTimer } from '@js/background-timer';
import type { BgTimerHandle } from '@js/background-timer';
import { playRingtone } from './ringtone';
import type { RingtoneType, RingtoneControl } from './ringtone';

type Screen = 'setup' | 'countdown' | 'incoming' | 'active' | 'ended';

export default function init(): void | (() => void) {
  const container = document.getElementById('tool-content');
  if (!container) return;

  let audioCtx: AudioContext | null = null;
  let ringtone: RingtoneControl | null = null;
  let releaseWakeLock: (() => void) | null = null;
  let callTimerInterval: ReturnType<typeof setInterval> | null = null;
  let callStartTime = 0;
  let bgTimer: BgTimerHandle | null = null;

  const el = (id: string) => container.querySelector<HTMLElement>(`#${id}`)!;
  const inp = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;

  const screenSetup = el('screen-setup');
  const screenCountdown = el('screen-countdown');
  const screenIncoming = el('screen-incoming');
  const screenActive = el('screen-active');
  const screenEnded = el('screen-ended');

  const btnStart = el('btn-start');
  const btnCancelCountdown = el('btn-cancel-countdown');
  const btnDecline = el('btn-decline');
  const btnAnswer = el('btn-answer');
  const btnMute = el('btn-mute');
  const btnSpeaker = el('btn-speaker');
  const btnEndCall = el('btn-end-call');
  const btnNewCall = el('btn-new-call');
  const inputName = inp('input-name');
  const selectRingtone = el('select-ringtone') as HTMLSelectElement;
  const chkVibrate = inp('chk-vibrate');
  const countdownDisplay = el('countdown-display');
  const incomingAvatar = el('incoming-avatar');
  const incomingName = el('incoming-name');
  const activeAvatar = el('active-avatar');
  const activeName = el('active-name');
  const callTimer = el('call-timer');
  const endedDuration = el('ended-duration');
  const notifStatus = el('notif-status') as HTMLElement | null;

  const avatarBtns = container.querySelectorAll<HTMLButtonElement>('.avatar-btn');
  const timerBtns = container.querySelectorAll<HTMLButtonElement>('.timer-btn');

  // --- Helpers ---

  function showScreen(screen: Screen): void {
    screenSetup.classList.toggle('hidden', screen !== 'setup');
    screenCountdown.classList.toggle('hidden', screen !== 'countdown');
    screenIncoming.classList.toggle('hidden', screen !== 'incoming');
    screenActive.classList.toggle('hidden', screen !== 'active');
    screenEnded.classList.toggle('hidden', screen !== 'ended');
  }

  function getCtx(): AudioContext | null {
    if (!audioCtx) {
      try {
        const AC =
          window.AudioContext ||
          (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AC();
      } catch {
        return null;
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function getRingtoneType(): RingtoneType {
    return selectRingtone.value as RingtoneType;
  }

  function getVibrate(): boolean {
    return chkVibrate.checked;
  }

  function getContactName(): string {
    return inputName.value.trim() || 'Unknown Caller';
  }

  function getAvatar(): string {
    return selectedAvatar;
  }

  function getTimerSeconds(): number {
    return selectedTimer;
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function updateCallScreen(): void {
    const name = getContactName();
    const avatar = getAvatar();
    incomingName.textContent = name;
    incomingAvatar.textContent = avatar;
    activeName.textContent = name;
    activeAvatar.textContent = avatar;
  }

  // --- Audio ---

  function startRingtone(): void {
    const ctx = getCtx();
    if (!ctx) return;
    stopRingtone();
    ringtone = playRingtone(ctx, getRingtoneType());
    ringtone.setVibrate(getVibrate());
  }

  function stopRingtone(): void {
    if (ringtone) {
      ringtone.stop();
      ringtone = null;
    }
  }

  // --- Wake Lock ---

  function acquireScreenLock(): void {
    if (!releaseWakeLock) {
      releaseWakeLock = acquireWakeLock();
    }
  }

  function releaseScreenLock(): void {
    if (releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
    }
  }

  // --- Countdown (via background timer) ---

  function startCountdown(seconds: number): void {
    let remaining = seconds;
    countdownDisplay.textContent = String(remaining);
    showScreen('countdown');

    bgTimer = backgroundTimer.createTimer();
    bgTimer.start(seconds, {
      onTick(r: number) {
        remaining = r;
        countdownDisplay.textContent = String(r);
      },
      onComplete() {
        bgTimer = null;
        stopCountdown();
        showIncoming();
      },
    }, { suppressNotification: true });
  }

  function stopCountdown(): void {
    if (bgTimer) {
      bgTimer.cancel();
      bgTimer = null;
    }
  }

  // --- Call Timer ---

  function startCallTimer(): void {
    callStartTime = Date.now();
    callTimer.textContent = '00:00';
    if (callTimerInterval) clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      callTimer.textContent = formatDuration(elapsed);
    }, 1000);
  }

  function stopCallTimer(): void {
    if (callTimerInterval) {
      clearInterval(callTimerInterval);
      callTimerInterval = null;
    }
  }

  function resyncCallTimer(): void {
    if (!callStartTime) return;
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    callTimer.textContent = formatDuration(elapsed);
  }

  function getCallDuration(): string {
    if (!callStartTime) return '00:00';
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    return formatDuration(elapsed);
  }

  // --- Notifications ---

  function requestNotificationPermission(): void {
    if (!('Notification' in window)) {
      if (notifStatus) notifStatus.textContent = 'Not supported';
      return;
    }
    if (Notification.permission === 'granted') {
      if (notifStatus) notifStatus.textContent = 'Enabled';
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (notifStatus) {
          notifStatus.textContent = permission === 'granted' ? 'Enabled' : 'Denied';
        }
      });
    } else {
      if (notifStatus) notifStatus.textContent = 'Denied';
    }
  }

  // --- Visibility resync ---

  function handleVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    resyncCallTimer();
  }

  // --- State transitions ---

  function showIncoming(): void {
    updateCallScreen();
    startRingtone();
    acquireScreenLock();
    showScreen('incoming');
  }

  function handleStart(): void {
    updateCallScreen();
    const delay = getTimerSeconds();
    if (delay > 0) {
      startCountdown(delay);
    } else {
      showIncoming();
    }
  }

  function handleAnswer(): void {
    stopRingtone();
    startCallTimer();
    showScreen('active');
  }

  function handleDecline(): void {
    stopRingtone();
    releaseScreenLock();
    showScreen('setup');
  }

  function handleEndCall(): void {
    stopCallTimer();
    stopRingtone();
    endedDuration.textContent = getCallDuration();
    releaseScreenLock();
    showScreen('ended');
  }

  function handleNewCall(): void {
    showScreen('setup');
  }

  function handleCancelCountdown(): void {
    stopCountdown();
    showScreen('setup');
  }

  // --- Button UI toggles ---

  function toggleMute(): void {
    const circle = btnMute.querySelector('.rounded-full');
    if (!circle) return;
    const isActive = circle.classList.contains('bg-success');
    if (isActive) {
      circle.classList.remove('bg-success');
      circle.classList.add('bg-base-300');
    } else {
      circle.classList.add('bg-success');
      circle.classList.remove('bg-base-300');
    }
  }

  function toggleSpeaker(): void {
    const circle = btnSpeaker.querySelector('.rounded-full');
    if (!circle) return;
    const isActive = circle.classList.contains('bg-success');
    if (isActive) {
      circle.classList.remove('bg-success');
      circle.classList.add('bg-base-300');
    } else {
      circle.classList.add('bg-success');
      circle.classList.remove('bg-base-300');
    }
  }

  // --- Avatar picker ---

  let selectedAvatar = '😎';

  function selectAvatar(btn: HTMLButtonElement): void {
    avatarBtns.forEach((b) => b.classList.remove('selected', 'btn-primary'));
    btn.classList.add('selected', 'btn-primary');
    selectedAvatar = btn.getAttribute('data-emoji') || '😎';
  }

  // --- Timer picker ---

  let selectedTimer = 0;

  function selectTimer(btn: HTMLButtonElement): void {
    timerBtns.forEach((b) => {
      b.classList.remove('btn-primary');
      b.classList.add('btn-outline');
    });
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-primary');
    selectedTimer = parseInt(btn.getAttribute('data-seconds') || '0', 10);
  }

  // --- Init avatar/timer defaults ---

  avatarBtns.forEach((btn) => {
    btn.classList.toggle('btn-primary', btn.classList.contains('selected'));
  });
  timerBtns.forEach((btn) => {
    if (btn.classList.contains('selected')) {
      btn.classList.remove('selected');
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-primary');
      selectedTimer = parseInt(btn.getAttribute('data-seconds') || '0', 10);
    }
  });

  // Request notification permission
  requestNotificationPermission();

  // --- Event listeners ---

  container.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-emoji]') as HTMLButtonElement | null;
    if (btn && avatarBtns && Array.from(avatarBtns).includes(btn)) {
      selectAvatar(btn);
      return;
    }
    const timerBtn = target.closest('[data-seconds]') as HTMLButtonElement | null;
    if (timerBtn && timerBtns && Array.from(timerBtns).includes(timerBtn)) {
      selectTimer(timerBtn);
      return;
    }
  });

  const onStart = () => handleStart();
  const onCancelCountdown = () => handleCancelCountdown();
  const onDecline = () => handleDecline();
  const onAnswer = () => handleAnswer();
  const onMute = () => toggleMute();
  const onSpeaker = () => toggleSpeaker();
  const onEndCall = () => handleEndCall();
  const onNewCall = () => handleNewCall();
  const onVisibilityChange = () => handleVisibilityChange();

  btnStart.addEventListener('click', onStart);
  btnCancelCountdown.addEventListener('click', onCancelCountdown);
  btnDecline.addEventListener('click', onDecline);
  btnAnswer.addEventListener('click', onAnswer);
  btnMute.addEventListener('click', onMute);
  btnSpeaker.addEventListener('click', onSpeaker);
  btnEndCall.addEventListener('click', onEndCall);
  btnNewCall.addEventListener('click', onNewCall);
  document.addEventListener('visibilitychange', onVisibilityChange);

  // --- Cleanup ---

  return () => {
    stopCountdown();
    stopCallTimer();
    stopRingtone();
    releaseScreenLock();

    document.removeEventListener('visibilitychange', onVisibilityChange);

    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }

    btnStart.removeEventListener('click', onStart);
    btnCancelCountdown.removeEventListener('click', onCancelCountdown);
    btnDecline.removeEventListener('click', onDecline);
    btnAnswer.removeEventListener('click', onAnswer);
    btnMute.removeEventListener('click', onMute);
    btnSpeaker.removeEventListener('click', onSpeaker);
    btnEndCall.removeEventListener('click', onEndCall);
    btnNewCall.removeEventListener('click', onNewCall);
  };
}
