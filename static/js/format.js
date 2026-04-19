import { state } from './state.js';

export function formatTime(epoch) {
  const dt = new Date(epoch * 1000);
  return dt.toLocaleString('en-US', {
    timeZone: state.tz,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatVol(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}

export function formatAmount(n) {
  return (n / 1e6).toFixed(2) + 'M';
}

export function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function formatRangeDuration(sec) {
  if (state.resolution >= 60) {
    return `${Math.round(sec / 60)}m`;
  }
  return `${Math.round(sec)}s`;
}
