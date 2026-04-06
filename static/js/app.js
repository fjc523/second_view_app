import { fetchJSON } from './api.js';
import { state } from './state.js';
import { selectSymbol, initSearch, refreshReplayPanel } from './sidebar.js';
import { initControls } from './controls.js';
import { initRangeSelection } from './range.js';
import { initTimeline } from './timeline.js';
import { updateClock } from './clock.js';
import { datePicker } from './dom.js';
import { loadChart } from './data.js';

function getReplayRunFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('replay_run');
}

async function initReplay() {
  const replayRun = getReplayRunFromURL();
  if (!replayRun) return;
  try {
    const replay = await fetchJSON(`/api/replay/${replayRun}`);
    state.replayRun = replayRun;
    state.replayEvents = replay.events || [];
    state.replayEventMap = Object.fromEntries((state.replayEvents || []).map(event => [event.event_id, event]));
    state.replaySymbols = [...new Set((state.replayEvents || []).map(event => event.symbol))].sort();
  } catch (e) {
    console.error('replay init error', e);
  }
}

async function initApp() {
  updateClock();
  setInterval(updateClock, 1000);
  initSearch();
  await initReplay();
  try {
    const resp = await fetchJSON('/api/dates');
    state.dates = resp.dates;
    const replayDates = [...new Set(state.replayEvents.map(event => event.date))];
    const dateKeys = (state.replayRun ? replayDates : Object.keys(state.dates)).sort().reverse();
    if (dateKeys.length === 0) return;

    dateKeys.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      datePicker.appendChild(opt);
    });

    datePicker.addEventListener('change', () => {
      state.currentDate = datePicker.value;
      if (state.replayRun) {
        const firstEventForDate = state.replayEvents.find(
          event => event.date === state.currentDate && event.symbol === state.currentSymbol,
        ) || state.replayEvents.find(event => event.date === state.currentDate);
        if (firstEventForDate) {
          state.currentSymbol = firstEventForDate.symbol;
          state.selectedReplayEventId = firstEventForDate.event_id;
          state.replayFocusNonce += 1;
          symbolSearch.value = state.currentSymbol;
        }
      }
      refreshReplayPanel();
      if (state.currentSymbol) {
        loadChart();
      }
    });

    state.currentDate = dateKeys[0];
    if (state.replayRun && state.replayEvents.length > 0) {
      const firstEvent = state.replayEvents.find(event => event.date === state.currentDate) || state.replayEvents[0];
      state.currentSymbol = firstEvent.symbol;
      state.selectedReplayEventId = firstEvent.event_id;
    } else {
      state.currentSymbol = 'AAPL';
    }
    refreshReplayPanel();
    loadChart();
  } catch (e) {
    console.error('init error', e);
  }
}

initControls();
initRangeSelection();
initTimeline();
initApp();
