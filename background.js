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

      // 1. Scrape Title
      const titleMatch = text.match(/<h2 class="title heading">([\s\S]*?)<\/h2>/);
      if (titleMatch) fic.title = titleMatch[1].trim();

      let currentCount = 0;
      let latestUrl = fic.url;

      if (isSeries) {
        // SERIES LOGIC: Track number of works in the series
        const seriesMatch = text.match(/<dt>Works:<\/dt>\s*<dd>(\d+)<\/dd>/);
        currentCount = seriesMatch ? parseInt(seriesMatch[1]) : 0;
        
        // Find the URL of the last work in the series index
        const allWorkLinks = [...text.matchAll(/<ul class="series work index group">[\s\S]*?href="\/works\/(\d+)"/g)];
        if (allWorkLinks.length > 0) {
          const latestWorkId = allWorkLinks[allWorkLinks.length - 1][1];
          latestUrl = `https://archiveofourown.org/works/${latestWorkId}`;
        }
      } else {
        // WORK LOGIC: Track chapters
        const countMatch = text.match(/<dd class="chapters">(\d+)\//);
        currentCount = countMatch ? parseInt(countMatch[1]) : 0;
        
        const chapterMatches = [...text.matchAll(/\/works\/\d+\/chapters\/(\d+)/g)];
        if (chapterMatches.length > 0) {
          const latestId = chapterMatches[chapterMatches.length - 1][1];
          latestUrl = `${fic.url}/chapters/${latestId}`;
        }
      }

      // 2. Update logic based on baseline
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
  chrome.storage.local.set({fics: updatedFics});
}

function showNotification(title, url) {
  chrome.notifications.create({
    type: 'basic', 
    iconUrl: 'icon128.png',
    title: 'New Content Alert!', 
    message: `${title} has updated!`, 
    priority: 2
  });
}