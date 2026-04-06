import { state } from './state.js';
import { loadChart } from './data.js';
import { fetchJSON } from './api.js';
import { replayPanel, symbolSearch, searchResults } from './dom.js';

let searchTimer = null;
let highlightIdx = -1;
let currentResults = [];

function selectReplayEvent(eventId) {
  state.selectedReplayEventId = eventId;
  state.replayFocusNonce += 1;
  renderReplayPanelForSymbol();
  loadChart();
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function renderReplayPanelForSymbol() {
  if (!state.replayRun || !replayPanel) return;
  const currentEvents = state.replayEvents.filter(
    event => event.date === state.currentDate && event.symbol === state.currentSymbol,
  );
  const items = currentEvents.map(event => {
    const dt = new Date(event.timestamp).toLocaleString('en-US', {
      timeZone: state.tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const activeClass = event.event_id === state.selectedReplayEventId ? ' replay-item-active' : '';
    return `
      <div class="replay-item${activeClass}" data-event-id="${event.event_id}">
        <div class="replay-item-head replay-${event.event_type}">${event.event_type.toUpperCase()} · ${dt}</div>
        <div class="replay-item-meta">price=${Number(event.price).toFixed(4)} qty=${event.quantity}</div>
        <div class="replay-item-meta">weight ${formatPercent(event.target_weight_before)} → ${formatPercent(event.target_weight_after)}</div>
        <div class="replay-item-meta">contribution=${formatPercent(event.contribution_pct)}</div>
        <div class="replay-item-meta replay-reason">reason=${event.reason}</div>
      </div>
    `;
  }).join('');
  replayPanel.innerHTML = `
    <div class="replay-title">Replay Run</div>
    <div class="replay-run-id">${state.replayRun}</div>
    <div class="replay-count">当前标的事件数：${currentEvents.length}</div>
    ${items || '<div class="replay-empty">当前 date/symbol 无回放事件</div>'}
  `;
  replayPanel.querySelectorAll('.replay-item').forEach(el => {
    el.addEventListener('click', () => selectReplayEvent(el.dataset.eventId));
  });
}

export function refreshReplayPanel() {
  renderReplayPanelForSymbol();
}

export function selectSymbol(symbol) {
  state.currentSymbol = symbol;
  const firstForSymbol = state.replayEvents.find(
    event => event.date === state.currentDate && event.symbol === symbol,
  );
  if (firstForSymbol) {
    state.selectedReplayEventId = firstForSymbol.event_id;
    state.replayFocusNonce += 1;
  }
  hideSearch();
  symbolSearch.value = symbol;
  renderReplayPanelForSymbol();
  loadChart();
}

export function initSearch() {
  symbolSearch.addEventListener('input', () => {
    const q = symbolSearch.value.trim();
    if (q.length === 0) {
      hideSearch();
      return;
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(q), 150);
  });

  symbolSearch.addEventListener('keydown', (e) => {
    if (!searchResults.classList.contains('visible')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, currentResults.length - 1);
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      updateHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < currentResults.length) {
        selectSymbol(currentResults[highlightIdx]);
      } else if (currentResults.length > 0) {
        selectSymbol(currentResults[0]);
      }
    } else if (e.key === 'Escape') {
      hideSearch();
    }
  });

  symbolSearch.addEventListener('focus', () => {
    const q = symbolSearch.value.trim();
    if (q.length > 0 && currentResults.length > 0) {
      searchResults.classList.add('visible');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      hideSearch();
    }
  });
}

async function doSearch(query) {
  try {
    if (state.replayRun) {
      const qUpper = query.toUpperCase();
      currentResults = (state.replaySymbols || []).filter(sym => sym.toUpperCase().includes(qUpper));
      highlightIdx = -1;
      renderSearchResults(query);
      return;
    }
    const resp = await fetchJSON(`/api/search?q=${encodeURIComponent(query)}`);
    currentResults = resp.symbols;
    highlightIdx = -1;
    renderSearchResults(query);
  } catch (e) {
    console.error('search error', e);
  }
}

function renderSearchResults(query) {
  searchResults.innerHTML = '';
  if (currentResults.length === 0) {
    searchResults.classList.remove('visible');
    return;
  }
  const qUpper = query.toUpperCase();
  currentResults.forEach((sym, i) => {
    const item = document.createElement('div');
    item.className = 'search-item';
    const idx = sym.toUpperCase().indexOf(qUpper);
    if (idx >= 0) {
      item.innerHTML = sym.slice(0, idx) +
        `<span class="match">${sym.slice(idx, idx + qUpper.length)}</span>` +
        sym.slice(idx + qUpper.length);
    } else {
      item.textContent = sym;
    }
    item.onclick = () => selectSymbol(sym);
    item.onmouseenter = () => { highlightIdx = i; updateHighlight(); };
    searchResults.appendChild(item);
  });
  searchResults.classList.add('visible');
}

function updateHighlight() {
  searchResults.querySelectorAll('.search-item').forEach((el, i) => {
    el.classList.toggle('highlighted', i === highlightIdx);
  });
}

function hideSearch() {
  searchResults.classList.remove('visible');
  highlightIdx = -1;
}
