import { MARKET_STATE_COLORS } from './config.js';

export function classifyMarketState(mas) {
  const ma5 = mas['5'] || [];
  const ma30 = mas['30'] || [];
  const ma60 = mas['60'] || [];
  if (ma5.length === 0) return [];

  const map30 = Object.create(null);
  const map60 = Object.create(null);
  for (const p of ma30) map30[p.time] = p.value;
  for (const p of ma60) map60[p.time] = p.value;

  const result = [];
  for (const p of ma5) {
    const v5 = p.value;
    const v30 = map30[p.time];
    const v60 = map60[p.time];
    let st = 'unknown';
    if (v30 != null && v60 != null) {
      if (v5 > v30 && v30 > v60) st = 'trend_up';
      else if (v5 < v30 && v30 < v60) st = 'trend_down';
      else st = 'oscillation';
    }
    result.push({ time: p.time, state: st });
  }
  return result;
}

export function buildStateHistogram(stateData) {
  return stateData.map(d => ({
    time: d.time,
    value: 1e12,
    color: MARKET_STATE_COLORS[d.state],
  }));
}
