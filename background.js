chrome.alarms.create('checkUpdates', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(checkFics);
chrome.runtime.onMessage.addListener((m) => { if (m.type === 'CHECK_NOW') checkFics(); });

async function checkFics() {
  const data = await chrome.storage.local.get({fics: []});
  const updatedFics = [...data.fics];

  for (let fic of updatedFics) {
    try {
      const response = await fetch(fic.url);
      const text = await response.text();
      const isSeries = fic.url.includes('/series/');

      // Title extraction logic
      let titleMatch = text.match(/<h2 class="title heading">([\s\S]*?)<\/h2>/);
      if (isSeries && !titleMatch) {
          titleMatch = text.match(/<h2 class="heading">([\s\S]*?)<\/h2>/);
      }
      
      if (titleMatch) {
          fic.title = titleMatch[1].replace(/<[^>]*>?/gm, '').trim();
      }

      let currentCount = 0;
      let latestUrl = fic.url;

      if (isSeries) {
        const seriesMatch = text.match(/<dt>Works:<\/dt>\s*<dd>(\d+)<\/dd>/);
        currentCount = seriesMatch ? parseInt(seriesMatch[1]) : 0;
        const allWorkLinks = [...text.matchAll(/<ul class="series work index group">[\s\S]*?href="\/works\/(\d+)"/g)];
        if (allWorkLinks.length > 0) {
          const latestWorkId = allWorkLinks[allWorkLinks.length - 1][1];
          latestUrl = `https://archiveofourown.org/works/${latestWorkId}`;
        }
      } else {
        const countMatch = text.match(/<dd class="chapters">(\d+)\//);
        currentCount = countMatch ? parseInt(countMatch[1]) : 0;
        const chapterMatches = [...text.matchAll(/\/works\/\d+\/chapters\/(\d+)/g)];
        if (chapterMatches.length > 0) {
          const latestId = chapterMatches[chapterMatches.length - 1][1];
          latestUrl = `${fic.url}/chapters/${latestId}`;
        }
      }

      if (!fic.baselineSet) {
        fic.lastChapter = currentCount;
        fic.latestUrl = latestUrl;
        fic.baselineSet = true;
        fic.hasNewUpdate = false;
      } else if (currentCount > fic.lastChapter) {
        fic.lastChapter = currentCount;
        fic.latestUrl = latestUrl;
        fic.lastChecked = Date.now();
        fic.hasNewUpdate = true;
        showNotification(fic.title, latestUrl);
      }
    } catch (e) { console.error("Error fetching:", fic.url); }
  }
  chrome.storage.local.set({fics: updatedFics, lastSyncTime: Date.now()});
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