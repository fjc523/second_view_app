import { state } from './state.js';
import { $ } from './dom.js';
import { loadChart } from './data.js';
import { updateIndicatorVisibility, updateMarketStateVisibility } from './chart.js';
import { updateClock } from './clock.js';

function setupBtnGroup(groupId, onChange) {
  const group = $(groupId);
  group.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.val);
    });
  });
}

export function setGroupValue(groupId, val) {
  const group = $(groupId);
  group.querySelectorAll('.btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
}

export function initControls() {
  setupBtnGroup('chartTypeGroup', v => {
    state.chartType = v;
    loadChart();
  });
  setupBtnGroup('resGroup', v => {
    state.resolution = parseInt(v);
    loadChart();
  });
  setupBtnGroup('sessionGroup', v => {
    state.session = v;
    loadChart();
  });
  setupBtnGroup('tzGroup', v => {
    state.tz = v;
    updateClock();
    loadChart();
  });

  $('toggleMA').addEventListener('click', function () {
    state.showMA = !state.showMA;
    this.classList.toggle('active', state.showMA);
    updateIndicatorVisibility();
  });

  $('toggleFilter').addEventListener('click', function () {
    state.spikeFilter = !state.spikeFilter;
    this.classList.toggle('active', state.spikeFilter);
    loadChart();
  });

  $('toggleMarketState').addEventListener('click', function () {
    state.showMarketState = !state.showMarketState;
    this.classList.toggle('active', state.showMarketState);
    updateMarketStateVisibility();
  });
}
