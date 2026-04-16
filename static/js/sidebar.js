import { state } from './state.js';
import { symbolSearch, searchResults, eventListPicker, eventCards, eventListMeta, datePicker, replayPanel, reviewStatus } from './dom.js';
import { loadChart } from './data.js';
import { fetchJSON } from './api.js';
import { setGroupValue } from './controls.js';

let searchTimer = null;
let highlightIdx = -1;
let currentResults = [];
const visualStarKeys = new Set();

function currentDateEvents() {
  return state.replayEvents.filter(event => event.date === state.currentDate);
}

function visibleEvents() {
  return state.currentSymbol === 'ALL'
    ? currentDateEvents()
    : currentDateEvents().filter(event => event.symbol === state.currentSymbol);
}

function currentVisibleBuys() {
  return visibleEvents().filter(event => event.event_type === 'buy');
}

function linkedReviewIds(eventId) {
  const event = state.replayEventMap[eventId];
  if (!event) return [];
  const linked = event.linked_closed_trade_rows || [];
  if (linked.length === 0) return [eventId];
  return state.replayEvents
    .filter(e => (e.linked_closed_trade_rows || []).some(idx => linked.includes(idx)))
    .map(e => e.event_id);
}

function compactEventNotes(notes) {
  const clean = (notes || '').trim();
  if (!clean) return '';
  const parts = clean.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return clean;
  return parts.slice(0, 2).join(' · ');
}

function escapeHTML(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getEventVisualKey(event) {
  return `${state.currentEventList}:${event.id}`;
}

function persistMarks() {
  const payload = JSON.stringify(state.reviewMarks);
  try {
    const key = `reviewMarks:${state.replayRun || 'default'}`;
    localStorage.setItem(key, payload);
  } catch (e) {
    console.error('persist review marks local error', e);
  }
  if (state.replayRun) {
    fetchJSON(`/api/review/${state.replayRun}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marks: state.reviewMarks }),
    }).catch(e => {
      console.error('persist review marks remote error', e);
    });
  }
}

function markSelected(label) {
  if (!state.selectedReplayEventId) return;
  const ids = linkedReviewIds(state.selectedReplayEventId);
  const payload = {
    label,
    timestamp: new Date().toISOString(),
  };
  ids.forEach(id => {
    state.reviewMarks[id] = payload;
  });
  persistMarks();
  renderReplayPanelForSymbol();
  refreshReviewStatus();
}

function eventDatesInOrder() {
  return [...new Set((state.replayEvents || []).map(event => event.date))].sort().reverse();
}

function stepReplayEvent(direction) {
  const events = currentVisibleBuys();
  if (events.length === 0) return;
  let idx = events.findIndex(event => event.event_id === state.selectedReplayEventId);
  if (idx < 0 && state.selectedReplayEventId) {
    const current = state.replayEventMap[state.selectedReplayEventId];
    if (current && current.linked_closed_trade_rows?.length) {
      idx = events.findIndex(event => (event.linked_closed_trade_rows || []).some(row => current.linked_closed_trade_rows.includes(row)));
    }
  }
  if (idx < 0) idx = 0;
  const nextIdx = idx + direction;
  if (nextIdx >= 0 && nextIdx < events.length) {
    selectReplayEvent(events[nextIdx].event_id);
    return;
  }

  const dates = eventDatesInOrder();
  const currentDateIdx = dates.indexOf(state.currentDate);
  if (currentDateIdx < 0) return;
  const targetDateIdx = currentDateIdx + direction;
  if (targetDateIdx < 0 || targetDateIdx >= dates.length) return;
  const targetDate = dates[targetDateIdx];
  const targetEvents = state.currentSymbol === 'ALL'
    ? state.replayEvents.filter(event => event.date === targetDate && event.event_type === 'buy')
    : state.replayEvents.filter(event => event.date === targetDate && event.symbol === state.currentSymbol && event.event_type === 'buy');
  if (targetEvents.length === 0) return;
  state.currentDate = targetDate;
  const targetEvent = direction > 0 ? targetEvents[0] : targetEvents[targetEvents.length - 1];
  state.selectedReplayEventId = targetEvent.event_id;
  state.replayFocusNonce += 1;
  if (datePicker) datePicker.value = targetDate;
  renderReplayPanelForSymbol();
  refreshReviewStatus();
  loadChart();
}

function refreshReviewStatus() {
  if (!reviewStatus || !state.replayRun) return;
  const events = currentVisibleBuys();
  const marked = events.filter(event => state.reviewMarks[event.event_id]).length;
  const selected = state.selectedReplayEventId ? state.reviewMarks[state.selectedReplayEventId] : null;
  reviewStatus.innerHTML = `
    <div><strong>快捷键</strong>：←/↑ 上一组，→/↓ 下一组，<strong>K</strong> 标记保留整组，<strong>X</strong> 标记排除整组，<strong>U</strong> 取消当前组标记</div>
    <div><strong>日期进度</strong>：已标记 ${marked} / ${events.length} 组</div>
    <div><strong>当前分组标记</strong>：${selected ? selected.label : '未标记'}</div>
  `;
}

function selectReplayEvent(eventId) {
  state.selectedReplayEventId = eventId;
  const event = state.replayEventMap[eventId];
  if (event) {
    if (state.currentSymbol === 'ALL') {
      symbolSearch.value = 'ALL';
    } else {
      state.currentSymbol = event.symbol;
      symbolSearch.value = event.symbol;
    }
  }
  state.replayFocusNonce += 1;
  renderReplayPanelForSymbol();
  refreshReviewStatus();
  loadChart();
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function renderReplayPanelForSymbol() {
  if (!state.replayRun || !replayPanel) return;
  const currentEvents = currentVisibleBuys();
  const items = currentEvents.map(event => {
    const dt = new Date(event.timestamp).toLocaleString('en-US', {
      timeZone: state.tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const activeClass = event.event_id === state.selectedReplayEventId ? ' replay-item-active' : '';
    const mark = state.reviewMarks[event.event_id];
    const markText = mark ? ` · 标记=${mark.label}` : '';
    return `
      <div class="replay-item${activeClass}" data-event-id="${event.event_id}">
        <div class="replay-item-head replay-${event.event_type}">${event.symbol} · BUY组 · ${dt}${markText}</div>
        <div class="replay-item-meta">buy=${Number(event.price).toFixed(4)} qty=${event.quantity}</div>
        <div class="replay-item-meta">weight ${formatPercent(event.target_weight_before)} → ${formatPercent(event.target_weight_after)}</div>
        <div class="replay-item-meta">reason=${event.reason}</div>
      </div>
    `;
  }).join('');
  replayPanel.innerHTML = `
    <div class="replay-title">Replay Run</div>
    <div class="replay-run-id">${state.replayRun}</div>
    <div class="replay-count">${state.currentSymbol === 'ALL' ? '当前日期 BUY 组数' : '当前标的 BUY 组数'}：${currentEvents.length}</div>
    ${items || '<div class="replay-empty">当前 date/symbol 无可审阅 BUY 组</div>'}
  `;
  replayPanel.querySelectorAll('.replay-item').forEach(el => {
    el.addEventListener('click', () => selectReplayEvent(el.dataset.eventId));
  });
}

export function refreshReplayPanel() {
  renderReplayPanelForSymbol();
  refreshReviewStatus();
}

export function selectSymbol(symbol) {
  state.currentSymbol = symbol;
  state.activeEvent = null;
  const firstForSymbol = symbol === 'ALL'
    ? currentDateEvents()[0]
    : currentDateEvents().find(event => event.symbol === symbol);
  if (firstForSymbol) {
    state.selectedReplayEventId = firstForSymbol.event_id;
    state.replayFocusNonce += 1;
  }
  hideSearch();
  symbolSearch.value = symbol;
  renderEventCards();
  renderReplayPanelForSymbol();
  refreshReviewStatus();
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

  document.addEventListener('keydown', (e) => {
    if (!state.replayRun) return;
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepReplayEvent(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      stepReplayEvent(-1);
    } else if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      markSelected('keep');
    } else if (e.key.toLowerCase() === 'x') {
      e.preventDefault();
      markSelected('exclude');
    } else if (e.key.toLowerCase() === 'u') {
      e.preventDefault();
      if (state.selectedReplayEventId) {
        linkedReviewIds(state.selectedReplayEventId).forEach(id => delete state.reviewMarks[id]);
        persistMarks();
        renderReplayPanelForSymbol();
        refreshReviewStatus();
      }
    }
  });
}

async function doSearch(query) {
  try {
    if (state.replayRun) {
      const qUpper = query.toUpperCase();
      const replaySet = new Set(
        (state.replayEvents || [])
          .filter(event => !state.currentDate || event.date === state.currentDate)
          .map(event => event.symbol),
      );
      const replaySymbols = ['ALL', ...Array.from(replaySet).sort()];
      currentResults = replaySymbols.filter(sym => sym.toUpperCase().includes(qUpper));
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

export async function initEventLists() {
  try {
    const resp = await fetchJSON('/api/event-lists');
    state.eventLists = resp.files || [];

    eventListPicker.innerHTML = '<option value="">Select CSV...</option>';
    state.eventLists.forEach(file => {
      const opt = document.createElement('option');
      opt.value = file.name;
      opt.textContent = file.name;
      eventListPicker.appendChild(opt);
    });

    eventListPicker.addEventListener('change', async () => {
      state.currentEventList = eventListPicker.value;
      state.activeEvent = null;
      await loadEventList(state.currentEventList);
    });

    if (state.eventLists.length === 0) {
      eventListMeta.textContent = 'No event list CSV found';
    }
  } catch (e) {
    console.error('event list init error', e);
    eventListMeta.textContent = 'Failed to load event lists';
  }
}

async function loadEventList(name) {
  state.currentEvents = [];
  eventCards.innerHTML = '';

  if (!name) {
    eventListMeta.textContent = 'No event list selected';
    return;
  }

  try {
    const resp = await fetchJSON(`/api/event-lists/${encodeURIComponent(name)}`);
    state.currentEvents = resp.rows || [];
    eventListMeta.textContent = `${name} · ${state.currentEvents.length} events`;
    renderEventCards();
  } catch (e) {
    console.error('event list load error', e);
    eventListMeta.textContent = `Failed to load ${name}`;
  }
}

function renderEventCards() {
  if (!eventCards) return;
  eventCards.innerHTML = '';
  if (!state.currentEvents.length) {
    eventCards.innerHTML = '<div class="event-empty">No events in this CSV</div>';
    return;
  }

  state.currentEvents.forEach(event => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'event-card';
    card.dataset.id = String(event.id);
    if (state.activeEvent && state.activeEvent.listName === state.currentEventList && state.activeEvent.id === event.id) {
      card.classList.add('active');
    }

    const compactNotes = compactEventNotes(event.notes);
    const fullNotes = escapeHTML(event.notes || '');
    const safeSymbol = escapeHTML(event.symbol);
    const safeDate = escapeHTML(event.date);
    const safeTime = escapeHTML(event.time);
    const starKey = getEventVisualKey(event);
    const starred = visualStarKeys.has(starKey);
    card.innerHTML = `
      <div class="event-card-top">
        <span class="event-symbol">${safeSymbol}</span>
        <button class="event-star${starred ? ' active' : ''}" type="button" aria-label="临时星标" aria-pressed="${starred ? 'true' : 'false'}" title="临时星标">${starred ? '★' : '☆'}</button>
      </div>
      <div class="event-time">${safeDate} ${safeTime}</div>
      <div class="event-notes"${fullNotes ? ` title="${fullNotes}"` : ''}>${escapeHTML(compactNotes)}</div>
    `;
    const starEl = card.querySelector('.event-star');
    starEl.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (visualStarKeys.has(starKey)) {
        visualStarKeys.delete(starKey);
      } else {
        visualStarKeys.add(starKey);
      }
      renderEventCards();
    });
    card.addEventListener('click', () => selectEvent(event));
    eventCards.appendChild(card);
  });
}

export function refreshEventCards() {
  renderEventCards();
}

function selectEvent(event) {
  state.activeEvent = { ...event, listName: state.currentEventList };
  state.currentSymbol = event.symbol;
  state.currentDate = event.anchor_marker_date_et || event.event_date_et;
  state.session = 'all';
  state.resolution = 5;

  symbolSearch.value = event.symbol;
  if (datePicker.querySelector(`option[value="${state.currentDate}"]`)) {
    datePicker.value = state.currentDate;
  }
  setGroupValue('sessionGroup', 'all');
  setGroupValue('resGroup', '5');
  renderEventCards();
  loadChart();
}
