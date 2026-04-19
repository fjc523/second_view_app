import { timelineCanvas } from './dom.js';
import { state } from './state.js';
import { getChart } from './chart.js';

let canvas = null;
let ctx = null;
let sparklineImageData = null;
let totalBars = 0;
let rangeUnsub = null;
let tooltip = null;

// Viewport pixel bounds (updated each render)
let vpX1 = 0, vpX2 = 0;

// Drag state
let dragging = false;
let dragStartX = 0;
let dragStartFrom = 0;
let dragStartTo = 0;

const SESSION_BG = {
  premarket:  'rgba(251,191,36,0.12)',
  market:     'rgba(74,222,128,0.12)',
  afterhours: 'rgba(167,139,250,0.12)',
};

function getSession(unixTime) {
  const d = new Date(unixTime * 1000);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (mins >= 540 && mins < 870) return 'premarket';    // 09:00–14:30 UTC
  if (mins >= 870 && mins < 1260) return 'market';       // 14:30–21:00 UTC
  return 'afterhours';
}

export function initTimeline() {
  canvas = timelineCanvas;
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  tooltip = document.createElement('div');
  tooltip.className = 'timeline-tooltip';
  canvas.parentElement.appendChild(tooltip);

  new ResizeObserver(() => {
    if (state.data && state.data.candles && state.data.candles.length > 0) {
      resizeCanvas();
      renderSparkline();
      renderViewport();
    }
  }).observe(canvas.parentElement);

  canvas.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onCanvasHover);
}

export function updateTimeline() {
  if (!canvas || !ctx) return;
  if (rangeUnsub) {
    rangeUnsub();
    rangeUnsub = null;
  }

  const candles = state.data && state.data.candles;
  if (!candles || candles.length === 0) return;

  totalBars = candles.length;
  resizeCanvas();
  renderSparkline();
  renderViewport();

  const chart = getChart();
  if (chart) {
    const handler = () => renderViewport();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    rangeUnsub = () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch (_) {}
    };
  }
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sparklineImageData = null;
}

function renderSparkline() {
  const candles = state.data && state.data.candles;
  if (!candles || candles.length === 0) return;

  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, w, h);

  // Session background bands
  let segStart = 0;
  let segSession = getSession(candles[0].time);
  for (let i = 1; i <= candles.length; i++) {
    const sess = i < candles.length ? getSession(candles[i].time) : null;
    if (sess !== segSession) {
      const x = (segStart / totalBars) * w;
      const segW = ((i - segStart) / totalBars) * w;
      ctx.fillStyle = SESSION_BG[segSession] || 'transparent';
      ctx.fillRect(x, 0, segW, h);
      segStart = i;
      segSession = sess;
    }
  }

  // Sparkline
  const closes = candles.map(c => c.close);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] < min) min = closes[i];
    if (closes[i] > max) max = closes[i];
  }
  const range = max - min || 1;
  const pad = 4;
  const drawH = h - pad * 2;

  ctx.beginPath();
  for (let i = 0; i < closes.length; i++) {
    const x = (i / (closes.length - 1 || 1)) * w;
    const y = pad + drawH - ((closes[i] - min) / range) * drawH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(96,165,250,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  sparklineImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function renderViewport() {
  if (!sparklineImageData) return;
  const chart = getChart();
  if (!chart) return;

  const logicalRange = chart.timeScale().getVisibleLogicalRange();
  if (!logicalRange) return;

  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  ctx.putImageData(sparklineImageData, 0, 0);
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

  vpX1 = Math.max(0, (logicalRange.from / totalBars) * w);
  vpX2 = Math.min(w, (logicalRange.to / totalBars) * w);

  ctx.fillStyle = 'rgba(96,165,250,0.15)';
  ctx.fillRect(vpX1, 0, vpX2 - vpX1, h);
  ctx.strokeStyle = 'rgba(96,165,250,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(vpX1 + 0.5, 0.5, vpX2 - vpX1 - 1, h - 1);
}

function onMouseDown(e) {
  const chart = getChart();
  if (!chart || totalBars === 0) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const clickLogical = (x / rect.width) * totalBars;
  const lr = chart.timeScale().getVisibleLogicalRange();
  if (!lr) return;

  // Jump viewport center to click position
  const span = lr.to - lr.from;
  const newFrom = clickLogical - span / 2;
  const newTo = clickLogical + span / 2;
  chart.timeScale().setVisibleLogicalRange({ from: newFrom, to: newTo });

  // Enter drag mode
  dragging = true;
  dragStartX = e.clientX;
  dragStartFrom = newFrom;
  dragStartTo = newTo;
  canvas.style.cursor = 'grabbing';
  showTooltip(e.clientX, clickLogical);
  e.preventDefault();
}

function onMouseMove(e) {
  if (!dragging) return;
  const chart = getChart();
  if (!chart) return;

  const rect = canvas.getBoundingClientRect();
  const deltaX = e.clientX - dragStartX;
  const deltaLogical = (deltaX / rect.width) * totalBars;

  const newFrom = dragStartFrom + deltaLogical;
  const newTo = dragStartTo + deltaLogical;
  chart.timeScale().setVisibleLogicalRange({ from: newFrom, to: newTo });

  // Tooltip: show center time
  const centerLogical = (newFrom + newTo) / 2;
  showTooltip(e.clientX, centerLogical);
}

function onMouseUp() {
  if (!dragging) return;
  dragging = false;
  canvas.style.cursor = '';
  hideTooltip();
}

function onCanvasHover() {
  if (!dragging) canvas.style.cursor = 'grab';
}

function showTooltip(clientX, logicalIndex) {
  if (!tooltip) return;
  const candles = state.data && state.data.candles;
  if (!candles || candles.length === 0) return;

  const idx = Math.max(0, Math.min(candles.length - 1, Math.round(logicalIndex)));
  const t = candles[idx].time;
  tooltip.textContent = new Date(t * 1000).toLocaleString('en-US', {
    timeZone: state.tz,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  tooltip.style.display = 'block';

  const parentRect = canvas.parentElement.getBoundingClientRect();
  const x = clientX - parentRect.left;
  tooltip.style.left = x + 'px';
}

function hideTooltip() {
  if (tooltip) tooltip.style.display = 'none';
}
