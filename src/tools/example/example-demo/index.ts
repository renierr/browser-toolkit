import { showMessage, showProgress } from '../../../js/ui.ts';
import router from '../../../js/router.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const btnProgress = document.getElementById('demo-progress') as HTMLButtonElement | null;
  const btnInfo = document.getElementById('demo-info') as HTMLButtonElement | null;
  const btnInfoClose = document.getElementById('demo-info-close') as HTMLButtonElement | null;
  const btnWarning = document.getElementById('demo-warning') as HTMLButtonElement | null;
  const btnAlert = document.getElementById('demo-alert') as HTMLButtonElement | null;
  const helloBtn = document.getElementById('hello-payload') as HTMLButtonElement | null;

  btnProgress?.addEventListener('click', () => {
    showProgress('Simulate work… please wait.', { timeoutMs: 5000, tooLongMs: 2000 });
  });

  btnInfo?.addEventListener('click', () => showMessage('This is a tool Info-Message.'));
  btnWarning?.addEventListener('click', () =>
    showMessage('This is a warning – please check.', { type: 'warning' })
  );
  btnAlert?.addEventListener('click', () =>
    showMessage('This is an alert – something went wrong.', { type: 'alert' })
  );
  btnInfoClose?.addEventListener('click', () => {
    showMessage('This is a tool Info-Message (will auto close after 3s).', {
      timeoutMs: 3000,
    });
  });
  helloBtn?.addEventListener('click', () => {
    router.goTo('example-hello', { foo: 'bar' });
  });
}
