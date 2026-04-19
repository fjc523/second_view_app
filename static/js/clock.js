import { state } from './state.js';
import { clockEl } from './dom.js';

function tzLabel() {
  return state.tz === 'Asia/Shanghai' ? 'BJ' : 'ET';
}

export function updateClock() {
  const now = new Date();
  const t = now.toLocaleString('en-US', {
    timeZone: state.tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  clockEl.textContent = `${tzLabel()} ${t}`;
}
