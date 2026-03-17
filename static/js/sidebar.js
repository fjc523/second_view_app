import { state } from './state.js';
import { symbolSearch, searchResults } from './dom.js';
import { loadChart } from './data.js';
import { fetchJSON } from './api.js';

let searchTimer = null;
let highlightIdx = -1;
let currentResults = [];

export function selectSymbol(symbol) {
  state.currentSymbol = symbol;
  hideSearch();
  symbolSearch.value = symbol;
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
