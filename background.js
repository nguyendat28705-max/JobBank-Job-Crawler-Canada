// background.js — Job Bank Job Crawler AUTO A→Z
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "saveToCSV" && message.url) {
    const filename = message.filename || "jobbank_jobs.csv";
    chrome.downloads.download({ url: message.url, filename, saveAs: message.saveAs !== false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Lỗi khi tải file CSV:", chrome.runtime.lastError);
      } else {
        console.log("Đã tải file thành công với ID:", downloadId);
      }
    });
  }
});

// Click icon extension: kích hoạt AUTO A→Z trên tab Job Bank hoặc mở tab Job Bank mới
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id && /^https:\/\/([a-z0-9-]+\.)?jobbank\.gc\.ca\//i.test(tab.url || "")) {
      chrome.tabs.sendMessage(tab.id, { action: "startAutoBatchFromIcon" });
      return;
    }
    await chrome.storage.local.set({ autoStartRequested: true });
    chrome.tabs.create({ url: "https://www.jobbank.gc.ca/jobsearch/jobsearch" });
  } catch (err) {
    console.error("Không thể khởi động AUTO từ icon:", err);
  }
});
