chrome.alarms.create('checkUpdates', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(checkFics);
chrome.runtime.onMessage.addListener((m) => { if (m.type === 'CHECK_NOW') checkFics(); });

function updateBadge(fics) {
  const count = fics.filter(f => f.hasNewUpdate).length;
  const countText = count > 0 ? count.toString() : "";
  chrome.action.setBadgeText({ text: countText });
  chrome.action.setBadgeBackgroundColor({ color: "#990000" });
}

async function checkFics() {
  const data = await chrome.storage.local.get({fics: []});
  const updatedFics = [...data.fics];

  for (let fic of updatedFics) {
    try {
      await new Promise(r => setTimeout(r, 500)); // Rate limit buffer

      const response = await fetch(fic.url);
      if (!response.ok) {
          console.error(`Status ${response.status} for ${fic.url}`);
          continue;
      }
      const text = await response.text();
      const isSeries = fic.url.includes('/series/');

      let titleMatch = text.match(/<h2 class="title heading">([\s\S]*?)<\/h2>/);
      if (isSeries && !titleMatch) {
          titleMatch = text.match(/<h2 class="heading">([\s\S]*?)<\/h2>/);
      }
      if (titleMatch) {
          fic.title = titleMatch[1].replace(/<[^>]*>?/gm, '').trim();
      }

      let currentCount = 0;
      let latestFoundUrl = fic.url;

      if (isSeries) {
        const seriesMatch = text.match(/<dt>Works:<\/dt>\s*<dd>(\d+)<\/dd>/);
        currentCount = seriesMatch ? parseInt(seriesMatch[1]) : 0;
        
        const allWorkLinks = [...text.matchAll(/href="\/works\/(\d+)"/g)];
        if (allWorkLinks.length > 0) {
            const lastWorkId = allWorkLinks[allWorkLinks.length - 1][1];
            latestFoundUrl = `https://archiveofourown.org/works/${lastWorkId}`;
        }
      } else {
        const countMatch = text.match(/<dd class="chapters">(\d+)\//);
        currentCount = countMatch ? parseInt(countMatch[1]) : 0;
        
        const chapterLinks = [...text.matchAll(/\/works\/\d+\/chapters\/(\d+)/g)];
        if (chapterLinks.length > 0) {
            const lastId = chapterLinks[chapterLinks.length - 1][1];
            latestFoundUrl = `${fic.url.split('/chapters')[0]}/chapters/${lastId}`;
        }
      }

      if (!fic.baselineSet) {
        fic.lastChapter = currentCount;
        fic.latestUrl = latestFoundUrl;
        fic.baselineSet = true;
        fic.hasNewUpdate = false;
      } else if (currentCount > fic.lastChapter) {
        fic.lastChapter = currentCount;
        fic.latestUrl = latestFoundUrl;
        fic.lastChecked = Date.now();
        fic.hasNewUpdate = true;
        showNotification(fic.title, latestFoundUrl);
      }
    } catch (e) { 
        console.error("Fetch failed for:", fic.url, e); 
    }
  }
  chrome.storage.local.set({fics: updatedFics, lastSyncTime: Date.now()}, () => {
    updateBadge(updatedFics);
  });
}

function showNotification(title, url) {
  chrome.notifications.create({
    type: 'basic', 
    iconUrl: 'icon.png', 
    title: 'Update Found!', 
    message: `${title} has a new entry!`, 
    priority: 2
  });
}