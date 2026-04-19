import { $ } from './dom.js';
import { formatNumber } from './format.js';
import { state } from './state.js';

export function updateToolbar(data) {
  const s = data.stats;
  $('tbSymbol').textContent = data.symbol;
  $('tbPrice').textContent = `$${s.close.toFixed(2)}`;
  const changeEl = $('tbChange');
  const up = s.change >= 0;
  changeEl.textContent = `${up ? '+' : ''}${s.change.toFixed(2)} (${up ? '+' : ''}${s.change_pct.toFixed(2)}%)`;
  changeEl.className = 'toolbar-change ' + (up ? 'up' : 'down');
}

export function updateStats(data) {
  const s = data.stats;
  const up = s.change >= 0;

  $('statPrice').innerHTML = `
    <div class="stat-row"><span class="stat-label">Open</span><span class="stat-value">${s.open.toFixed(4)}</span></div>
    <div class="stat-row"><span class="stat-label">High</span><span class="stat-value">${s.high.toFixed(4)}</span></div>
    <div class="stat-row"><span class="stat-label">Low</span><span class="stat-value">${s.low.toFixed(4)}</span></div>
    <div class="stat-row"><span class="stat-label">Close</span><span class="stat-value">${s.close.toFixed(4)}</span></div>
    <div class="stat-row"><span class="stat-label">Change</span><span class="stat-value ${up ? 'up' : 'down'}">${up ? '+' : ''}${s.change.toFixed(4)}</span></div>
    <div class="stat-row"><span class="stat-label">Change%</span><span class="stat-value ${up ? 'up' : 'down'}">${up ? '+' : ''}${s.change_pct.toFixed(2)}%</span></div>
  `;

  $('statVolume').innerHTML = `
    <div class="stat-row"><span class="stat-label">Total</span><span class="stat-value">${formatNumber(s.volume)}</span></div>
  `;

  $('statSession').innerHTML = `
    <div class="stat-row"><span class="stat-label">Filter</span><span class="stat-value">${data.session}</span></div>
    <div class="stat-row"><span class="stat-label">Resolution</span><span class="stat-value">${data.resolution}s</span></div>
  `;

  const firstT = new Date(s.first_time * 1000).toLocaleString('en-US', {
    timeZone: state.tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const lastT = new Date(s.last_time * 1000).toLocaleString('en-US', {
    timeZone: state.tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  $('statData').innerHTML = `
    <div class="stat-row"><span class="stat-label">Points</span><span class="stat-value">${formatNumber(s.data_points)}</span></div>
    <div class="stat-row"><span class="stat-label">First</span><span class="stat-value">${firstT}</span></div>
    <div class="stat-row"><span class="stat-label">Last</span><span class="stat-value">${lastT}</span></div>
  `;
}
