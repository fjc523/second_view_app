import { MA_COLORS, MA_PERIODS, INTERACTION_ON, INTERACTION_OFF } from './config.js';
import { state } from './state.js';
import { chartEl } from './dom.js';
import { updateMALegend, updateVolLegend } from './legend.js';
import { classifyMarketState, buildStateHistogram } from './marketstate.js';

let chart = null;
let mainSeries = null;
let volumeSeries = null;
let maSeries = {};
let volMaSeries = null;
let marketStateSeries = null;
let lastCrosshairBar = null;

export function getChart() {
  return chart;
}

export function getCrosshairBar() {
  return lastCrosshairBar;
}

export function setChartInteraction(enabled) {
  if (!chart) return;
  chart.applyOptions(enabled ? INTERACTION_ON : INTERACTION_OFF);
}

export function createChart() {
  if (chart) {
    chart.remove();
    chart = null;
  }
  mainSeries = null;
  volumeSeries = null;
  maSeries = {};
  volMaSeries = null;
  marketStateSeries = null;

  chart = LightweightCharts.createChart(chartEl, {
    layout: {
      background: { type: 'solid', color: '#0b0f14' },
      textColor: '#9aa3b2',
      fontSize: 11,
      fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Arial, sans-serif",
    },
    grid: {
      vertLines: { color: 'rgba(34,42,56,0.55)' },
      horzLines: { color: 'rgba(34,42,56,0.55)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Magnet,
      vertLine: { color: 'rgba(96,165,250,0.35)', width: 1, style: 0 },
      horzLine: { visible: false, labelVisible: false },
    },
    rightPriceScale: {
      borderColor: '#1f2633',
      scaleMargins: { top: 0.05, bottom: 0.2 },
    },
    leftPriceScale: {
      visible: true,
      borderColor: '#1f2633',
    },
    localization: {
      timeFormatter: t => {
        const dt = new Date(t * 1000);
        return dt.toLocaleString('en-US', {
          timeZone: state.tz,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      },
    },
    timeScale: {
      borderColor: '#1f2633',
      timeVisible: true,
      secondsVisible: true,
      rightOffset: 5,
      barSpacing: 6,
      minBarSpacing: 0.5,
      tickMarkFormatter: t => {
        const dt = new Date(t * 1000);
        return dt.toLocaleString('en-US', {
          timeZone: state.tz,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      },
    },
    handleScale: INTERACTION_ON.handleScale,
    handleScroll: INTERACTION_ON.handleScroll,
  });

  marketStateSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'mktstate',
    lastValueVisible: false,
    priceLineVisible: false,
  });
  chart.priceScale('mktstate').applyOptions({
    scaleMargins: { top: 0, bottom: 0 },
    drawTicks: false,
    borderVisible: false,
    visible: false,
  });

  volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
  });
  chart.priceScale('vol').applyOptions({
    scaleMargins: { top: 0.85, bottom: 0 },
    drawTicks: false,
    borderVisible: false,
  });

  volMaSeries = chart.addLineSeries({
    color: '#f87171',
    lineWidth: 1,
    priceScaleId: 'vol',
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });

  MA_PERIODS.forEach(p => {
    const key = String(p);
    maSeries[key] = chart.addLineSeries({
      color: MA_COLORS[key] || '#94a3b8',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
  });

  chart.subscribeCrosshairMove(param => {
    if (!param || !param.time || !state.data) {
      lastCrosshairBar = null;
      updateMALegend(null);
      updateVolLegend(null);
      return;
    }
    const d = { time: param.time };

    if (mainSeries) {
      const v = param.seriesData.get(mainSeries);
      if (v) {
        d.main = v;
        const price = v.close != null ? v.close : v.value;
        lastCrosshairBar = { time: param.time, price };
      }
    }

    if (volumeSeries) {
      const v = param.seriesData.get(volumeSeries);
      if (v) d.vol = v.value;
    }

    d.mas = {};
    if (state.showMA) {
      MA_PERIODS.forEach(p => {
        const key = String(p);
        if (maSeries[key]) {
          const v = param.seriesData.get(maSeries[key]);
          if (v) d.mas[key] = v.value;
        }
      });
    }

    if (volMaSeries) {
      const v = param.seriesData.get(volMaSeries);
      if (v) d.volMa = v.value;
    }

    updateMALegend(d);
    updateVolLegend(d);
  });

  new ResizeObserver(() => {
    chart.applyOptions({ width: chartEl.clientWidth, height: chartEl.clientHeight });
  }).observe(chartEl);
}

export function applyBarSpacing() {
  if (!chart) return;
  let spacing = 6;
  let minSpacing = 1.5;
  if (state.resolution <= 1) {
    spacing = 3;
    minSpacing = 1.5;
  } else if (state.resolution <= 5) {
    spacing = 4;
    minSpacing = 1.7;
  } else if (state.resolution <= 10) {
    spacing = 6;
    minSpacing = 2.0;
  } else {
    spacing = 8;
    minSpacing = 2.2;
  }
  chart.timeScale().applyOptions({
    barSpacing: spacing,
    minBarSpacing: minSpacing,
  });
}

export function renderChart(data, savedCenter, savedTimeSpan) {
  createChart();

  if (state.chartType === 'candle') {
    mainSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderVisible: true,
      wickVisible: true,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    mainSeries.setData(data.candles);
  } else {
    mainSeries = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const lineData = data.candles.map(c => ({ time: c.time, value: c.close }));
    mainSeries.setData(lineData);
  }

  volumeSeries.setData(data.volume);

  if (data.volume_ma && data.volume_ma.length > 0) {
    volMaSeries.setData(data.volume_ma);
  }

  MA_PERIODS.forEach(p => {
    const key = String(p);
    const maData = (data.mas && data.mas[key]) ? data.mas[key] : [];
    maSeries[key].setData(maData);
    maSeries[key].applyOptions({ visible: state.showMA });
  });

  if (data.mas && marketStateSeries) {
    const stateData = classifyMarketState(data.mas);
    marketStateSeries.setData(buildStateHistogram(stateData));
    marketStateSeries.applyOptions({ visible: state.showMarketState });
  }

  const markers = [];

  if (data.market_open_time && data.candles.length > 0) {
    const markerCandle = data.candles.find(c => c.time >= data.market_open_time);
    if (markerCandle) {
      markers.push({
        time: markerCandle.time,
        position: 'belowBar',
        color: '#f59e0b',
        shape: 'arrowUp',
        text: '9:30',
      });
    }
  }

  if (data.stats && data.stats.high_time) {
    markers.push({
      time: data.stats.high_time,
      position: 'aboveBar',
      color: '#22c55e',
      shape: 'circle',
      text: data.stats.high.toFixed(3),
    });
  }

  if (data.stats && data.stats.low_time) {
    markers.push({
      time: data.stats.low_time,
      position: 'belowBar',
      color: '#ef4444',
      shape: 'circle',
      text: data.stats.low.toFixed(3),
    });
  }

  if (
    state.activeEvent &&
    state.activeEvent.symbol === data.symbol &&
    (state.activeEvent.anchor_marker_date_et || state.activeEvent.event_date_et) === data.date
  ) {
    const activeMarkers = Array.isArray(state.activeEvent.markers) && state.activeEvent.markers.length > 0
      ? state.activeEvent.markers
      : [{
          event_epoch: Number(state.activeEvent.event_epoch),
          label: 'Event',
          is_anchor: true,
        }];

    activeMarkers.forEach((marker, idx) => {
      const markerTime = Number(marker.event_epoch);
      if (!Number.isFinite(markerTime)) return;
      const eventCandle = data.candles.find(c => c.time >= markerTime)
        || [...data.candles].reverse().find(c => c.time <= markerTime);
      if (!eventCandle) return;
      const isAnchor = Boolean(marker.is_anchor) || idx === 0;
      markers.push({
        time: eventCandle.time,
        position: isAnchor ? 'aboveBar' : 'belowBar',
        color: isAnchor ? '#60a5fa' : '#93c5fd',
        shape: isAnchor ? 'square' : 'circle',
        text: marker.label || 'Event',
      });
    });
  }

  markers.sort((a, b) => a.time - b.time);
  if (markers.length > 0) {
    mainSeries.setMarkers(markers);
  }

  updateMALegend({ mas: getLastMAValues(data) });
  updateVolLegend({});

  applyBarSpacing();

  const centerLogical = timeToLogical(data, savedCenter);
  const resolution = Number.isFinite(data.resolution) ? data.resolution : state.resolution;
  const eventLogical = (
    state.activeEvent &&
    state.activeEvent.symbol === data.symbol &&
    (state.activeEvent.anchor_marker_date_et || state.activeEvent.event_date_et) === data.date
  ) ? timeToLogical(data, Number(state.activeEvent.anchor_marker_epoch || state.activeEvent.event_epoch)) : null;

  // Compute half-span: prefer saved time span (converted to logical), fall back to current range
  let halfSpan = null;
  if (Number.isFinite(savedTimeSpan) && savedTimeSpan > 0 && Number.isFinite(resolution) && resolution > 0) {
    halfSpan = savedTimeSpan / (2 * resolution);
  }
  if (halfSpan == null || !Number.isFinite(halfSpan) || halfSpan <= 0) {
    const logicalRange = chart.timeScale().getVisibleLogicalRange();
    if (logicalRange && Number.isFinite(logicalRange.from) && Number.isFinite(logicalRange.to)) {
      halfSpan = (logicalRange.to - logicalRange.from) / 2;
    }
  }

  if (Number.isFinite(eventLogical) && Number.isFinite(halfSpan) && halfSpan > 0) {
    const span = halfSpan * 2;
    const leftFraction = 1 / 3;
    chart.timeScale().setVisibleLogicalRange({
      from: eventLogical - span * leftFraction,
      to: eventLogical + span * (1 - leftFraction),
    });
  } else if (Number.isFinite(centerLogical) && Number.isFinite(halfSpan) && halfSpan > 0) {
    chart.timeScale().setVisibleLogicalRange({
      from: centerLogical - halfSpan,
      to: centerLogical + halfSpan,
    });
  } else {
    chart.timeScale().fitContent();
  }
}

export function getLastMAValues(data) {
  const vals = {};
  if (!data.mas) return vals;
  MA_PERIODS.forEach(p => {
    const key = String(p);
    const arr = data.mas[key];
    if (arr && arr.length > 0) {
      vals[key] = arr[arr.length - 1].value;
    }
  });
  return vals;
}

export function updateIndicatorVisibility() {
  MA_PERIODS.forEach(p => {
    const key = String(p);
    if (maSeries[key]) maSeries[key].applyOptions({ visible: state.showMA });
  });
  if (!state.showMA) {
    updateMALegend(null);
  } else if (state.data) {
    updateMALegend({ mas: getLastMAValues(state.data) });
  }
}

export function updateMarketStateVisibility() {
  if (marketStateSeries) {
    marketStateSeries.applyOptions({ visible: state.showMarketState });
  }
}

function timeToLogical(data, targetTime) {
  if (!data || !data.candles || data.candles.length === 0 || !Number.isFinite(targetTime)) return null;
  const resolution = Number.isFinite(data.resolution) ? data.resolution : state.resolution;
  if (!Number.isFinite(resolution) || resolution <= 0) return null;
  const firstTime = data.candles[0].time;
  return (targetTime - firstTime) / resolution;
}
