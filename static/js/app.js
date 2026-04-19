import { fetchJSON } from './api.js';
import { state } from './state.js';
import { selectSymbol, initSearch, initEventLists, refreshEventCards } from './sidebar.js';
import { initControls } from './controls.js';
import { initRangeSelection } from './range.js';
import { initTimeline } from './timeline.js';
import { updateClock } from './clock.js';
import { datePicker } from './dom.js';
import { loadChart } from './data.js';

async function initApp() {
  updateClock();
  setInterval(updateClock, 1000);
  initSearch();
  initEventLists();
  try {
    const resp = await fetchJSON('/api/dates');
    state.dates = resp.dates;
    const dateKeys = Object.keys(state.dates).sort().reverse();
    if (dateKeys.length === 0) return;

    // Populate date picker
    dateKeys.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      datePicker.appendChild(opt);
    });

    datePicker.addEventListener('change', () => {
      state.currentDate = datePicker.value;
      state.activeEvent = null;
      refreshEventCards();
      if (state.currentSymbol) {
        loadChart();
      }
    });

    // Default: most recent date + AAPL
    state.currentDate = dateKeys[0];
    state.currentSymbol = 'AAPL';
    loadChart();
  } catch (e) {
    console.error('init error', e);
  }
}

initControls();
initRangeSelection();
initTimeline();
initApp();
