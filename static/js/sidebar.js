import { state } from './state.js';
import { symbolSearch, searchResults, eventListPicker, eventCards, eventListMeta, datePicker } from './dom.js';
import { loadChart } from './data.js';
import { fetchJSON } from './api.js';
import { setGroupValue } from './controls.js';

let searchTimer = null;
let highlightIdx = -1;
let currentResults = [];
const visualStarKeys = new Set();

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

export function selectSymbol(symbol) {
  state.currentSymbol = symbol;
  state.activeEvent = null;
  hideSearch();
  symbolSearch.value = symbol;
  renderEventCards();
  loadChart();
}

// Search functionality
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
