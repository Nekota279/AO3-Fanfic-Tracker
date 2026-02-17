chrome.alarms.create('checkUpdates', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(() => checkFics());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_NOW') {
    checkFics().then(() => sendResponse({status: 'done'}));
    return true; // Keep the message channel open for the async response
  }
});

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
      await new Promise(r => setTimeout(r, 700));

      const response = await fetch(fic.url);
      if (!response.ok) continue;

      const text = await response.text();
      const isSeries = fic.url.includes('/series/');

      // Title extraction
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
        
        // Find the absolute last chapter ID from the navigation dropdown
        const chapterOptions = [...text.matchAll(/<option value="(\d+)">\d+\./g)];
        if (chapterOptions.length > 0) {
            const lastChapterId = chapterOptions[chapterOptions.length - 1][1];
            latestFoundUrl = `${fic.url.split('/chapters')[0]}/chapters/${lastChapterId}`;
        }
      }

      // Ensure links are updated retroactively
      fic.latestUrl = latestFoundUrl;

      if (!fic.baselineSet) {
        fic.lastChapter = currentCount;
        fic.baselineSet = true;
        fic.hasNewUpdate = false;
      } else if (currentCount > fic.lastChapter) {
        fic.lastChapter = currentCount;
        fic.lastChecked = Date.now();
        fic.hasNewUpdate = true;
        showNotification(fic.title, latestFoundUrl);
      }
    } catch (e) { 
        console.error("Fetch failed for:", fic.url, e); 
    }
  }
  await chrome.storage.local.set({fics: updatedFics, lastSyncTime: Date.now()});
  updateBadge(updatedFics);
}

function showNotification(title, url) {
  chrome.notifications.create({
    type: 'basic', 
    iconUrl: 'icon.png', 
    title: 'New Update Found!', 
    message: `${title} has a new entry!`, 
    priority: 2
  });
}