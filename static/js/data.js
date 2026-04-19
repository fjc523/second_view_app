import { state } from './state.js';
import { chartEl, loading } from './dom.js';
import { fetchJSON } from './api.js';
import { getChart, renderChart } from './chart.js';
import { updateToolbar, updateStats } from './toolbar.js';
import { updateTimeline } from './timeline.js';

let prevDate = null;
let prevSymbol = null;

function getViewState() {
  const chart = getChart();
  if (!chart) return null;
  const timeScale = chart.timeScale();
  let centerTime = null;
  if (chartEl && chartEl.clientWidth > 0) {
    if (typeof timeScale.coordinateToLogical === 'function') {
      const logical = timeScale.coordinateToLogical(chartEl.clientWidth / 2);
      const candles = state.data && state.data.candles ? state.data.candles : null;
      const dataRes = state.data && Number.isFinite(state.data.resolution)
        ? state.data.resolution
        : state.resolution;
      if (Number.isFinite(logical) && candles && candles.length > 0 && Number.isFinite(dataRes)) {
        centerTime = candles[0].time + logical * dataRes;
      }
    }

    if (centerTime == null && typeof timeScale.coordinateToTime === 'function') {
      const timeAtCenter = timeScale.coordinateToTime(chartEl.clientWidth / 2);
      if (typeof timeAtCenter === 'number' && Number.isFinite(timeAtCenter)) {
        centerTime = timeAtCenter;
      }
    }
  }

  if (centerTime == null) {
    const range = timeScale.getVisibleRange();
    if (range) {
      centerTime = (range.from + range.to) / 2;
    }
  }

  if (centerTime == null || !Number.isFinite(centerTime)) return null;

  // Capture zoom level as time span (resolution-independent)
  let visibleTimeSpan = null;
  const logicalRange = timeScale.getVisibleLogicalRange();
  if (logicalRange && Number.isFinite(logicalRange.from) && Number.isFinite(logicalRange.to)) {
    const dataRes = state.data && Number.isFinite(state.data.resolution)
      ? state.data.resolution
      : state.resolution;
    if (Number.isFinite(dataRes) && dataRes > 0) {
      visibleTimeSpan = (logicalRange.to - logicalRange.from) * dataRes;
    }
  }

  return { centerTime, visibleTimeSpan };
}

export async function loadChart() {
  if (!state.currentDate || !state.currentSymbol) return;
  loading.classList.remove('hidden');

  const viewState = getViewState();
  const liveCenter = viewState ? viewState.centerTime : null;

  // Save current view state under previous symbol's key
  if (prevDate && prevSymbol && viewState) {
    state.viewStateCache[`${prevDate}/${prevSymbol}`] = viewState;
  }

  // Determine which center to use
  const dateOrSymbolChanged = state.currentDate !== prevDate || state.currentSymbol !== prevSymbol;
  const cacheKey = `${state.currentDate}/${state.currentSymbol}`;
  const cached = state.viewStateCache[cacheKey];
  let savedCenter = (dateOrSymbolChanged && cached) ? cached.centerTime : liveCenter;
  const liveTimeSpan = viewState ? viewState.visibleTimeSpan : null;
  let savedTimeSpan = (dateOrSymbolChanged && cached) ? cached.visibleTimeSpan : liveTimeSpan;

  if (
    state.activeEvent &&
    state.activeEvent.symbol === state.currentSymbol &&
    (state.activeEvent.anchor_marker_date_et || state.activeEvent.event_date_et) === state.currentDate
  ) {
    savedCenter = state.activeEvent.anchor_marker_epoch || state.activeEvent.event_epoch;
    if (state.resolution <= 1) {
      savedTimeSpan = 8 * 60;
    } else if (state.resolution <= 5) {
      savedTimeSpan = 12 * 60;
    } else if (state.resolution <= 10) {
      savedTimeSpan = 18 * 60;
    } else {
      savedTimeSpan = 45 * 60;
    }
  }

  // Update previous tracking
  prevDate = state.currentDate;
  prevSymbol = state.currentSymbol;

  const params = new URLSearchParams({
    session: state.session,
    resolution: state.resolution,
    use_clean: state.useClean,
  });
  if (state.spikeFilter) {
    params.set('spike_filter', 'hampel');
    params.set('spike_window', 3);
  }

  try {
    const data = await fetchJSON(`/api/price/${state.currentDate}/${state.currentSymbol}?${params}`);
    state.data = data;
    renderChart(data, savedCenter, savedTimeSpan);
    updateTimeline();
    updateToolbar(data);
    updateStats(data);
  } catch (e) {
    console.error('load error', e);
  } finally {
    loading.classList.add('hidden');
  }
}
