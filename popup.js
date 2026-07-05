const addBtn       = document.getElementById('addBtn');
const ficUrls      = document.getElementById('ficUrls');
const listDiv      = document.getElementById('list');
const searchBar    = document.getElementById('searchBar');
const ficCount     = document.getElementById('ficCount');
const clearAllBtn  = document.getElementById('clearAll');
const markAllBtn   = document.getElementById('markAllRead');
const refreshBtn   = document.getElementById('refreshBtn');
const tabUpdates   = document.getElementById('tabUpdates');
const tabAll       = document.getElementById('tabAll');
const lastSyncText = document.getElementById('lastSync');

let allFics = [];
let currentView = 'updates';

// ── Helpers ──────────────────────────────────────────────────────────────────

function updateBadge(fics) {
  const count = fics.filter(f => f.hasNewUpdate).length;
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#990000' });
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ── Data ─────────────────────────────────────────────────────────────────────

// Bring old-format fics (pre-newChapters) up to the current schema so
// previously unread updates aren't silently dropped after an extension update.
function migrateFic(f) {
  // Unify old field names
  if (f.lastKnownCount === undefined) f.lastKnownCount = f.lastChapter || f.latestChapter || 0;
  if (f.readCount      === undefined) f.readCount      = f.readChapter  || 0;
  if (!Array.isArray(f.newChapters))  f.newChapters    = [];
  if (f.baselineSet    === undefined) f.baselineSet    = true; // existing entries are past baseline

  // If the fic was flagged as having an update but newChapters is empty,
  // synthesise one entry so it still shows up in the feed.
  if (f.hasNewUpdate && f.newChapters.length === 0) {
    const url = f.latestUrl || f.url;
    const num = f.lastKnownCount || 0;
    f.newChapters = [{ url, num, detectedAt: f.lastChecked || Date.now() }];
  }

  return f;
}

function loadData() {
  chrome.storage.local.get({ fics: [], lastSyncTime: 0 }, (data) => {
    // Migrate any fics written by an older version of the extension
    const migrated = data.fics.map(migrateFic);
    // Persist the migrated data so background.js also sees the updated schema
    chrome.storage.local.set({ fics: migrated });

    allFics = migrated;
    updateBadge(allFics);
    lastSyncText.innerText = data.lastSyncTime > 0
      ? 'Last checked: ' + new Date(data.lastSyncTime).toLocaleTimeString()
      : 'No sync yet';
    renderList(allFics);
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderList(ficsToRender) {
  const query = searchBar.value.trim().toLowerCase();

  if (currentView === 'updates') {
    // Flatten all fics → individual chapter rows, newest first
    const rows = [];
    ficsToRender.forEach(f => {
      if (!f.hasNewUpdate) return;
      if (query && !(f.title || '').toLowerCase().includes(query)) return;
      const isSeries = f.url.includes('/series/');
      const label    = isSeries ? 'w' : 'c';
      (f.newChapters || []).forEach(ch => {
        rows.push({ fic: f, ch, label });
      });
    });

    // Sort: most recently detected first
    rows.sort((a, b) => (b.ch.detectedAt || 0) - (a.ch.detectedAt || 0));

    ficCount.innerText = rows.length;

    if (rows.length === 0) {
      listDiv.innerHTML = `<div class="empty-msg">No new updates.</div>`;
      return;
    }

    listDiv.innerHTML = rows.map(({ fic, ch, label }) => `
      <div class="chapter-row" data-fic-url="${fic.url}" data-chapter-url="${ch.url}">
        <div class="row-info">
          <div class="row-title">${fic.notFound ? '<span class="not-found-badge">⚠ Deleted/Private</span>' : ''} ${fic.title || 'Scanning…'} <span class="chap-tag">${label}${ch.num}</span></div>
          <div class="row-meta">
            <span class="source-badge">AO3</span>
            <span class="dot-sep">·</span>
            <span>${timeAgo(ch.detectedAt)}</span>
          </div>
        </div>
        <button class="mark-btn" data-fic-url="${fic.url}" data-chapter-url="${ch.url}" title="Mark as read">●</button>
      </div>
    `).join('');

  } else {
    // All Tracked: compact one-row-per-fic
    let displayList = ficsToRender;
    if (query) displayList = displayList.filter(f => (f.title || '').toLowerCase().includes(query));

    ficCount.innerText = displayList.length;

    if (displayList.length === 0) {
      listDiv.innerHTML = `<div class="empty-msg">No fics tracked.</div>`;
      return;
    }

    listDiv.innerHTML = displayList.map(f => {
      const isSeries   = f.url.includes('/series/');
      const label      = isSeries ? 'w' : 'c';
      const readCount  = f.readCount || 0;
      const knownCount = f.lastKnownCount || 0;
      const latestUrl  = (f.newChapters || []).at(-1)?.url ?? f.url;

      const chapterInfo = f.hasNewUpdate && knownCount > readCount
        ? `<span class="chapter-range">${label}${readCount} ➔ ${label}${knownCount}</span>`
        : `<span class="chapter-single">${label}${knownCount}</span>`;

      return `
        <div class="chapter-row single-row" data-url="${latestUrl}" data-clean-url="${f.url}">
          <div class="row-info">
            <div class="row-title">${f.notFound ? '<span class="not-found-badge">⚠ Deleted/Private</span>' : ''} ${f.title || 'Scanning…'} ${chapterInfo}</div>
            <div class="row-meta">
              <span class="source-badge">AO3</span>
              <span class="dot-sep">·</span>
              <span>${isSeries ? 'Series' : 'Fic'}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${f.hasNewUpdate ? '<span class="unread-dot">●</span>' : ''}
            <button class="remove-btn" data-url="${f.url}" title="Remove">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }

  attachEventListeners();
}

// ── Events ────────────────────────────────────────────────────────────────────

function attachEventListeners() {
  // Updates view: click row → open chapter + mark it read
  document.querySelectorAll('.chapter-row:not(.single-row)').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.mark-btn')) return;
      const { ficUrl, chapterUrl } = row.dataset;
      chrome.tabs.create({ url: chapterUrl });
      markChapterRead(ficUrl, chapterUrl);
    });
  });

  // Mark-read dot button (marks just that chapter without opening)
  document.querySelectorAll('.mark-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      markChapterRead(btn.dataset.ficUrl, btn.dataset.chapterUrl);
    });
  });

  // All Tracked view: click row → open latest chapter
  document.querySelectorAll('.single-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn')) return;
      chrome.tabs.create({ url: row.dataset.url });
    });
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFic(btn.dataset.url);
    });
  });
}

// ── Storage ops ───────────────────────────────────────────────────────────────

// Mark a single chapter as read — removes it from the fic's newChapters list
function markChapterRead(ficUrl, chapterUrl) {
  chrome.storage.local.get({ fics: [] }, (data) => {
    const fics = data.fics.map(f => {
      if (f.url !== ficUrl) return f;
      f.newChapters = (f.newChapters || []).filter(c => c.url !== chapterUrl);
      // If all chapters cleared, mark fic as fully read
      if (f.newChapters.length === 0) {
        f.hasNewUpdate = false;
        f.readCount    = f.lastKnownCount || f.readCount || 0;
      }
      return f;
    });
    chrome.storage.local.set({ fics }, loadData);
  });
}

// Mark all chapters of all fics as read
function markAllRead() {
  chrome.storage.local.get({ fics: [] }, (data) => {
    const fics = data.fics.map(f => ({
      ...f,
      hasNewUpdate: false,
      newChapters:  [],
      readCount:    f.lastKnownCount || f.readCount || 0,
    }));
    chrome.storage.local.set({ fics }, () => {
      chrome.action.setBadgeText({ text: '' });
      loadData();
    });
  });
}

function removeFic(url) {
  chrome.storage.local.get({ fics: [] }, (data) => {
    chrome.storage.local.set({ fics: data.fics.filter(f => f.url !== url) }, loadData);
  });
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

refreshBtn.addEventListener('click', () => {
  lastSyncText.innerText = 'Syncing…';
  chrome.runtime.sendMessage({ type: 'CHECK_NOW' }, () => loadData());
});

markAllBtn.addEventListener('click', markAllRead);

addBtn.addEventListener('click', () => {
  const rawText   = ficUrls.value.trim();
  const urlRegex  = /archiveofourown\.org\/(works|series)\/\d+/g;
  const foundUrls = rawText.match(urlRegex) || [];

  chrome.storage.local.get({ fics: [] }, (data) => {
    let fics = data.fics;
    foundUrls.forEach(url => {
      const cleanUrl = 'https://' + url.split('?')[0].replace(/\/$/, '');
      if (!fics.find(f => f.url === cleanUrl)) {
        fics.push({ url: cleanUrl, title: '', baselineSet: false, hasNewUpdate: false,
                    readCount: 0, lastKnownCount: 0, newChapters: [] });
      }
    });
    chrome.storage.local.set({ fics }, () => {
      ficUrls.value = '';
      chrome.runtime.sendMessage({ type: 'CHECK_NOW' }, () => loadData());
    });
  });
});

clearAllBtn.addEventListener('click', () => {
  if (confirm('Delete all tracked fics?')) {
    chrome.storage.local.set({ fics: [] }, () => {
      chrome.action.setBadgeText({ text: '' });
      loadData();
    });
  }
});

tabUpdates.addEventListener('click', () => {
  currentView = 'updates';
  tabUpdates.classList.add('active');
  tabAll.classList.remove('active');
  renderList(allFics);
});

tabAll.addEventListener('click', () => {
  currentView = 'all';
  tabAll.classList.add('active');
  tabUpdates.classList.remove('active');
  renderList(allFics);
});

searchBar.addEventListener('input', () => renderList(allFics));

// Re-render automatically whenever background.js writes to storage.
// More reliable than the sendMessage callback, which can silently drop
// if the MV3 service worker port disconnects mid-check (36 fics x 700ms = ~25s).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.fics) loadData();
});

loadData();