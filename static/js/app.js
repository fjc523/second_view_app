import { fetchJSON } from './api.js';
import { state } from './state.js';
import { initSearch, initEventLists, refreshEventCards, refreshReplayPanel } from './sidebar.js';
import { initControls } from './controls.js';
import { initRangeSelection } from './range.js';
import { initTimeline } from './timeline.js';
import { updateClock } from './clock.js';
import { datePicker, symbolSearch } from './dom.js';
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
    const localKey = `reviewMarks:${replayRun}`;
    let localMarks = {};
    try {
      localMarks = JSON.parse(localStorage.getItem(localKey) || '{}') || {};
    } catch (e) {
      console.error('load local review marks error', e);
    }
    const review = await fetchJSON(`/api/review/${replayRun}`);
    const remoteMarks = review.marks || {};
    state.reviewMarks = { ...localMarks, ...remoteMarks };

    const localCount = Object.keys(localMarks).length;
    const remoteCount = Object.keys(remoteMarks).length;
    if (localCount > remoteCount) {
      try {
        await fetchJSON(`/api/review/${replayRun}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marks: state.reviewMarks }),
        });
      } catch (e) {
        console.error('sync local review marks to server error', e);
      }
    }
  } catch (e) {
    console.error('replay init error', e);
  }
}

async function initApp() {
  updateClock();
  setInterval(updateClock, 1000);
  initSearch();
  initEventLists();
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
      state.activeEvent = null;
      refreshEventCards();
      if (state.replayRun) {
        const currentDateEvents = state.replayEvents.filter(event => event.date === state.currentDate);
        const keepAll = state.currentSymbol === 'ALL';
        const firstEventForDate = keepAll
          ? currentDateEvents[0]
          : currentDateEvents.find(event => event.symbol === state.currentSymbol) || currentDateEvents[0];
        if (firstEventForDate) {
          state.currentSymbol = keepAll ? 'ALL' : firstEventForDate.symbol;
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
      state.currentSymbol = 'ALL';
      state.selectedReplayEventId = firstEvent.event_id;
      symbolSearch.value = 'ALL';
    } else {
      state.currentSymbol = 'AAPL';
      symbolSearch.value = 'AAPL';
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
