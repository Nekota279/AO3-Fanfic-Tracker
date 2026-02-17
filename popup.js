const addBtn = document.getElementById('addBtn');
const ficUrls = document.getElementById('ficUrls');
const listDiv = document.getElementById('list');
const searchBar = document.getElementById('searchBar');
const ficCount = document.getElementById('ficCount');
const clearAllBtn = document.getElementById('clearAll');
const markAllBtn = document.getElementById('markAllRead');
const refreshBtn = document.getElementById('refreshBtn');
const tabUpdates = document.getElementById('tabUpdates');
const tabAll = document.getElementById('tabAll');
const lastSyncText = document.getElementById('lastSync');

let allFics = [];
let currentView = 'updates';

function updateBadge(fics) {
  const count = fics.filter(f => f.hasNewUpdate).length;
  const countText = count > 0 ? count.toString() : "";
  chrome.action.setBadgeText({ text: countText });
  chrome.action.setBadgeBackgroundColor({ color: "#990000" });
}

function loadData() {
  chrome.storage.local.get({fics: [], lastSyncTime: 0}, (data) => {
    allFics = data.fics;
    updateBadge(allFics);
    if (data.lastSyncTime > 0) {
      lastSyncText.innerText = "Last checked: " + new Date(data.lastSyncTime).toLocaleTimeString();
    } else {
      lastSyncText.innerText = "No sync yet";
    }
    renderList(allFics);
  });
}

function renderList(ficsToRender) {
  const displayList = currentView === 'updates' 
    ? ficsToRender.filter(f => f.hasNewUpdate === true)
    : ficsToRender;

  ficCount.innerText = displayList.length;
  
  if (displayList.length === 0) {
    const msg = currentView === 'updates' ? "No new updates yet." : "No fics tracked yet.";
    listDiv.innerHTML = `<div style="padding:40px 20px; text-align:center; color:#666; font-size:12px;">${msg}</div>`;
    return;
  }

  listDiv.innerHTML = displayList.map((f) => {
    const isSeries = f.url.includes('/series/');
    const prefix = isSeries ? 'w' : 'c'; 
    const statusText = isSeries ? 'Series Update' : 'Work Update';
    const timeText = f.hasNewUpdate ? getTimeAgo(f.lastChecked) : 'Active';

    const actionButton = currentView === 'updates' 
      ? `<button class="action-btn mark-read-btn" data-url="${f.url}" title="Dismiss Update">✕</button>`
      : `<button class="action-btn remove-btn" data-url="${f.url}" title="Remove from Tracker">🗑️</button>`;

    return `
      <div class="update-item" data-url="${f.latestUrl || f.url}" data-clean-url="${f.url}">
        <div class="item-info">
          <div class="item-title">${f.title || 'Scanning...'} ${prefix}${f.lastChapter || '?'}</div>
          <div class="item-meta">
            <span class="icon-square">${isSeries ? 'S' : 'F'}</span>
            <span>${statusText}</span>
            <span>• ${timeText}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center;">
          ${f.hasNewUpdate ? '<div class="status-dot">●</div>' : ''}
          ${actionButton}
        </div>
      </div>
    `;
  }).join('');

  attachEventListeners();
}

function attachEventListeners() {
  document.querySelectorAll('.update-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.action-btn')) {
        const cleanUrl = item.dataset.cleanUrl;
        markAsRead(cleanUrl); 
        window.open(item.dataset.url, '_blank');
      }
    });
  });

  document.querySelectorAll('.mark-read-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      markAsRead(btn.dataset.url);
    });
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFic(btn.dataset.url);
    });
  });
}

function markAsRead(url) {
  chrome.storage.local.get({fics: []}, (data) => {
    const fics = data.fics.map(f => {
      if (f.url === url) f.hasNewUpdate = false;
      return f;
    });
    chrome.storage.local.set({fics}, loadData);
  });
}

markAllBtn.addEventListener('click', () => {
  chrome.storage.local.get({fics: []}, (data) => {
    const fics = data.fics.map(f => {
      f.hasNewUpdate = false;
      return f;
    });
    chrome.storage.local.set({fics}, loadData);
  });
});

refreshBtn.addEventListener('click', () => {
    lastSyncText.innerText = "Syncing...";
    chrome.runtime.sendMessage({type: 'CHECK_NOW'});
    setTimeout(loadData, 3000); 
});

addBtn.addEventListener('click', () => {
  const rawText = ficUrls.value.trim();
  const urlRegex = /archiveofourown\.org\/(works|series)\/\d+/g;
  const foundUrls = rawText.match(urlRegex) || [];

  chrome.storage.local.get({fics: []}, (data) => {
    let fics = data.fics;
    foundUrls.forEach(url => {
      const cleanUrl = 'https://' + url.split('?')[0].replace(/\/$/, "");
      if (!fics.find(f => f.url === cleanUrl)) {
        fics.push({ url: cleanUrl, lastChapter: 0, title: '', baselineSet: false, hasNewUpdate: false });
      }
    });
    chrome.storage.local.set({fics}, () => {
      ficUrls.value = '';
      chrome.runtime.sendMessage({type: 'CHECK_NOW'});
      setTimeout(loadData, 2000);
    });
  });
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

clearAllBtn.addEventListener('click', () => {
  if (confirm("Delete ALL tracked fics permanently?")) {
    chrome.storage.local.set({fics: []}, () => loadData());
  }
});

function removeFic(url) {
  chrome.storage.local.get({fics: []}, (data) => {
    const fics = data.fics.filter(f => f.url !== url);
    chrome.storage.local.set({fics}, () => loadData());
  });
}

function getTimeAgo(ts) {
  if (!ts) return 'now';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
}

searchBar.addEventListener('input', () => {
  const query = searchBar.value.toLowerCase();
  const filtered = allFics.filter(f => (f.title || '').toLowerCase().includes(query));
  renderList(filtered);
});

loadData();