import { MARKET_STATE_COLORS } from './config.js';

export function classifyMarketState(mas) {
  const ma5 = mas['5'] || [];
  const ma100 = mas['100'] || [];
  const ma200 = mas['200'] || [];
  if (ma5.length === 0) return [];

  const map100 = Object.create(null);
  const map200 = Object.create(null);
  for (const p of ma100) map100[p.time] = p.value;
  for (const p of ma200) map200[p.time] = p.value;

  const result = [];
  for (const p of ma5) {
    const v5 = p.value;
    const v100 = map100[p.time];
    const v200 = map200[p.time];
    let st = 'unknown';
    if (v100 != null && v200 != null) {
      if (v5 > v100 && v100 > v200) st = 'trend_up';
      else if (v5 < v100 && v100 < v200) st = 'trend_down';
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
