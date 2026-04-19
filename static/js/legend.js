import { state } from './state.js';
import { MA_PERIODS, MA_COLORS } from './config.js';
import { maLegend, volLegend } from './dom.js';
import { formatAmount } from './format.js';

export function updateMALegend(d) {
  if (!state.showMA) {
    maLegend.innerHTML = '';
    return;
  }
  let html = '';
  // Price tag before MA values
  if (d && d.main) {
    const m = d.main;
    const price = m.close != null ? m.close : m.value;
    const isUp = m.close != null ? m.close >= m.open : true;
    if (price != null) {
      const bg = isUp ? 'rgba(74,222,128,.9)' : 'rgba(248,113,113,.9)';
      const fg = isUp ? '#0b1f12' : '#2b0d0d';
      html += `<span style="background:${bg};color:${fg};font-weight:600;padding:2px 6px;border-radius:6px;font-size:11px">$${price.toFixed(2)}</span> &nbsp;`;
    }
  }
  html += '<span style="color:#94a3b8">MA</span> &nbsp;';
  MA_PERIODS.forEach(p => {
    const key = String(p);
    const color = MA_COLORS[key] || '#94a3b8';
    const val = (d && d.mas && d.mas[key] !== undefined) ? d.mas[key].toFixed(3) : '';
    html += `<span style="color:${color}">MA${p}:${val}</span> &nbsp;`;
  });
  maLegend.innerHTML = html;
}

export function updateVolLegend(d) {
  let html = '<span style="color:#94a3b8">成交额</span> &nbsp;';
  if (d && d.vol !== undefined) {
    html += `<span style="color:#e2e8f0">AMT: ${formatAmount(d.vol)}</span>`;
  }
  if (d && d.volMa !== undefined) {
    html += ` &nbsp;<span style="color:#ef4444">MA20: ${formatAmount(d.volMa)}</span>`;
  }
  volLegend.innerHTML = html;
}
