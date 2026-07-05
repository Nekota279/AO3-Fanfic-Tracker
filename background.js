chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkUpdates', { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUpdates') checkFics();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_NOW') {
    checkFics().then(() => sendResponse({ status: 'done' }));
    return true;
  }
});

function updateBadge(fics) {
  const count = fics.filter(f => f.hasNewUpdate).length;
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#990000' });
}

async function checkFics() {
  // Any chrome.* API call resets the service worker's 30s idle timer.
  // Firing one every 20s keeps the worker alive through the whole loop,
  // even with the 2s/15s delays between fics.
  const stayAlive = setInterval(() => {
    chrome.storage.local.get('lastSyncTime', () => {});
  }, 20000);

  try {
    const data = await chrome.storage.local.get({ fics: [] });
    const updatedFics = [...data.fics];

    console.log(`[AO3] Starting check for ${updatedFics.length} fic(s)`);

    for (let fic of updatedFics) {
      try {
        await new Promise(r => setTimeout(r, 2000)); // 2 s base delay — AO3 rate limits aggressively

        console.log(`[AO3] Fetching: ${fic.url}`);

        let response, text;
        try {
          response = await fetch(fic.url);
          if (!response.ok) {
            if (response.status === 404) {
              console.warn(`[AO3] 404 — marking as not found: ${fic.url}`);
              fic.notFound = true;
              fic.title = fic.title || '(Deleted / Private)';
              continue;
            }
            if (response.status === 403 || response.status === 429) {
              console.warn(`[AO3] ${response.status} rate limit hit — cooling down 15 s`);
              await new Promise(r => setTimeout(r, 15000));
              continue;
            }
            console.warn(`[AO3] Bad response ${response.status} for ${fic.url}`);
            continue;
          }
          text = await response.text();
          fic.notFound = false;
          console.log(`[AO3] Got response for ${fic.url} (${text.length} chars)`);
        } catch (fetchErr) {
          console.warn(`[AO3] Fetch failed for ${fic.url}:`, fetchErr.message);
          continue;
        }

        const isSeries = fic.url.includes('/series/');

        let titleMatch = text.match(/<h2 class="title heading">([\s\S]*?)<\/h2>/);
        if (isSeries && !titleMatch) titleMatch = text.match(/<h2 class="heading">([\s\S]*?)<\/h2>/);
        if (titleMatch) {
          fic.title = titleMatch[1].replace(/<[^>]*>?/gm, '').trim();
          console.log(`[AO3] Title: "${fic.title}"`);
        } else {
          console.warn(`[AO3] Could not extract title for ${fic.url}`);
        }

        let currentCount = 0;

        if (isSeries) {
          const seriesMatch = text.match(/<dt>Works:<\/dt>\s*<dd>(\d+)<\/dd>/);
          currentCount = seriesMatch ? parseInt(seriesMatch[1]) : 0;
          console.log(`[AO3] Series works count: ${currentCount}, lastKnown: ${fic.lastKnownCount}`);

          // Each work in a series is linked multiple times (title, cover, "read" button),
          // so dedupe while preserving first-seen order to avoid the same positional-
          // slicing bug as the chapter select above.
          const allWorkIds = [...new Set([...text.matchAll(/href="\/works\/(\d+)"/g)].map(m => m[1]))];

          if (!fic.baselineSet) {
            fic.readCount = currentCount; fic.lastKnownCount = currentCount;
            fic.baselineSet = true; fic.hasNewUpdate = false; fic.newChapters = [];
            console.log(`[AO3] Baseline set at ${currentCount} works`);
          } else if (currentCount > fic.lastKnownCount) {
            const readCount = fic.readCount || 0;
            const newIds = allWorkIds.slice(readCount);
            const existingUrls = new Set((fic.newChapters || []).map(c => c.url));
            const now = Date.now();

            for (let i = 0; i < newIds.length; i++) {
              const workUrl = `https://archiveofourown.org/works/${newIds[i]}`;
              if (!existingUrls.has(workUrl)) {
                fic.newChapters = fic.newChapters || [];
                fic.newChapters.push({ url: workUrl, num: readCount + i + 1, detectedAt: now });
              }
            }
            console.log(`[AO3] ${fic.newChapters.length} new work(s) found`);
            const latestUrl = fic.newChapters.at(-1)?.url ?? fic.url;
            fic.lastKnownCount = currentCount;
            fic.hasNewUpdate = true;
            showNotification(fic.title, latestUrl);
          } else {
            console.log(`[AO3] No new works for ${fic.title}`);
          }

        } else {
          const countMatch = text.match(/<dd class="chapters">(\d+)\//);
          currentCount = countMatch ? parseInt(countMatch[1]) : 0;
          console.log(`[AO3] Chapter count: ${currentCount}, lastKnown: ${fic.lastKnownCount}`);

          // AO3 renders the chapter-select dropdown twice per page (top nav + bottom nav).
          // Scope to just the first <select> block so we get exactly one copy of the
          // chapter IDs, in order — otherwise the list is duplicated and later slicing
          // grabs bogus "new chapter" entries that actually point at early chapters.
          const chapterSelectMatch = text.match(/<select[^>]*name=["']chapter_id["'][^>]*>([\s\S]*?)<\/select>/);
          const allChapterIds = chapterSelectMatch
            ? [...chapterSelectMatch[1].matchAll(/<option value="(\d+)"/g)].map(m => m[1])
            : [];
          const baseUrl = fic.url.split('/chapters')[0];

          if (!fic.baselineSet) {
            fic.readCount = currentCount; fic.lastKnownCount = currentCount;
            fic.baselineSet = true; fic.hasNewUpdate = false; fic.newChapters = [];
            console.log(`[AO3] Baseline set at chapter ${currentCount}`);
          } else if (currentCount > fic.lastKnownCount) {
            const readCount = fic.readCount || 0;
            const newIds = allChapterIds.slice(readCount);
            const existingUrls = new Set((fic.newChapters || []).map(c => c.url));
            const now = Date.now();

            for (let i = 0; i < newIds.length; i++) {
              const chUrl = `${baseUrl}/chapters/${newIds[i]}`;
              if (!existingUrls.has(chUrl)) {
                fic.newChapters = fic.newChapters || [];
                fic.newChapters.push({ url: chUrl, num: readCount + i + 1, detectedAt: now });
              }
            }
            console.log(`[AO3] ${fic.newChapters.length} new chapter(s) found`);
            const latestUrl = fic.newChapters.at(-1)?.url ?? fic.url;
            fic.lastKnownCount = currentCount;
            fic.hasNewUpdate = true;
            showNotification(fic.title, latestUrl);
          } else {
            console.log(`[AO3] No new chapters for ${fic.title}`);
          }
        }

      } catch (e) {
        console.error(`[AO3] Unexpected error for ${fic.url}:`, e);
      }
    }

    await chrome.storage.local.set({ fics: updatedFics, lastSyncTime: Date.now() });
    console.log('[AO3] Check complete, storage updated');
    updateBadge(updatedFics);

  } finally {
    clearInterval(stayAlive);
  }
}

function showNotification(title, url) {
  chrome.notifications.create({
    type: 'basic', iconUrl: 'icon.png',
    title: 'New Update Found!',
    message: `${title} has a new entry!`,
    priority: 2
  });
}