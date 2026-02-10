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

      // Scrape Title
      const titleMatch = text.match(/<h2 class="title heading">([\s\S]*?)<\/h2>/);
      if (titleMatch) fic.title = titleMatch[1].trim();

      // Scrape Chapter Count
      const countMatch = text.match(/<dd class="chapters">(\d+)\//);
      const currentCount = countMatch ? parseInt(countMatch[1]) : 0;

      // Scrape Latest Chapter Link
      const chapterMatches = [...text.matchAll(/\/works\/\d+\/chapters\/(\d+)/g)];
      if (chapterMatches.length > 0) {
        const latestId = chapterMatches[chapterMatches.length - 1][1];
        const latestUrl = `${fic.url}/chapters/${latestId}`;

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
      }
    } catch (e) { console.error("Error fetching fic:", fic.url); }
  }
  chrome.storage.local.set({fics: updatedFics});
}

function showNotification(title, url) {
  chrome.notifications.create({
    type: 'basic', iconUrl: 'icon.png',
    title: 'New Chapter Alert!', message: `${title} has been updated!`, priority: 2
  });
}