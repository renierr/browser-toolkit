// noinspection JSUnusedGlobalSymbols
export default function init(payload?: any) {
  const payloadEl = document.getElementById('payload') as HTMLButtonElement | null;
  if (payloadEl) {
    if (payload) {
      payloadEl.textContent = JSON.stringify(payload, null, 2);
    } else {
      payloadEl.textContent = 'No Payload provided';
    }
  }
}
