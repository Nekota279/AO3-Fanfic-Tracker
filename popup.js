const addBtn = document.getElementById('addBtn');
const ficUrls = document.getElementById('ficUrls');
const listDiv = document.getElementById('list');
const searchBar = document.getElementById('searchBar');
const ficCount = document.getElementById('ficCount');
const clearAllBtn = document.getElementById('clearAll');
const tabUpdates = document.getElementById('tabUpdates');
const tabAll = document.getElementById('tabAll');

let allFics = [];
let currentView = 'updates';

function loadData() {
  chrome.storage.local.get({fics: []}, (data) => {
    allFics = data.fics;
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
    const statusText = f.hasNewUpdate ? 'Fanfic Update' : 'Tracking';
    const timeText = f.hasNewUpdate ? getTimeAgo(f.lastChecked) : 'Active';

    return `
      <div class="update-item" data-url="${f.latestUrl || f.url}">
        <div class="item-info">
          <div class="item-title">${f.title || 'Scanning...'} ${prefix}${f.lastChapter || '?'}</div>
          <div class="item-meta">
            <span class="icon-square">F</span>
            <span>${statusText}</span>
            <span>• ${timeText}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center;">
          ${f.hasNewUpdate ? '<div class="status-dot">●</div>' : ''}
          <button class="remove-btn" data-remove="${f.url}">×</button>
        </div>
      </div>
    `;
  }).join('');

  attachEventListeners();
}

function attachEventListeners() {
  document.querySelectorAll('.update-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('remove-btn')) {
        window.open(item.dataset.url, '_blank');
      }
    });
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFic(btn.dataset.remove);
    });
  });
}

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
      setTimeout(loadData, 1000);
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
  if (confirm("Clear all tracked fics?")) {
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