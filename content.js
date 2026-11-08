// content.js — Job Bank Job Crawler AUTO A→Z (Vancouver Area - 3 Days)
// Nền tảng: Job Bank Canada (jobbank.gc.ca)
// Người nộp: để trống (Cột M) | Người lấy job: Nguyễn Tiến Đạt (Cột N)

let isCrawling = false;
let currentPage = 1;
let allJobs = [];
let maxPages = 0; // 0 = Không giới hạn số trang, quét cho tới khi chạm mốc quá 3 ngày
let hasExported = false;
let resumeFromIndex = 0;
let consecutiveNetworkErrors = 0;
let filterKeywords = [];
let filterLocations = [];

const DEFAULT_APPLICANT_NAME = "";
const DEFAULT_CRAWLER_NAME = "Nguyễn Tiến Đạt";
let applicantName = DEFAULT_APPLICANT_NAME;
let crawlerName = DEFAULT_CRAWLER_NAME;

// ======================================================
// AUTO A→Z CONFIG
// ======================================================
const DEFAULT_SEARCH_KEYWORDS = [
  "analytics",
  "artificial_intelligence",
  "data",
  "data scientist",
  "finance",
  "financial analyst",
  "investment",
  "investment management",
  "machine learning",
  "systems analyst",
  "technology manager",
  "President",
  "CEO (Chief Executive Officer)",
  "CIO (Chief Information Officer)",
  "CTO (Chief Technology Officer)",
  "CIO (Chief investment officer)",
  "CSO (Chief Science Officer)",
  "Chief AI officer (Chief Artificial Intelligence Officer)"
];

// Bảng đối chiếu chức danh riêng cho 6 vị trí lãnh đạo cấp cao C-Level:
// (Toàn bộ 11 từ khóa chuyên môn khác đều chấp nhận 100% kết quả từ Job Bank, không lọc title theo keyword)
const EXECUTIVE_TITLE_TERMS = {
  "President": ["president"],
  "president": ["president"],
  "CEO (Chief Executive Officer)": ["CEO", "Chief Executive Officer"],
  "CIO (Chief Information Officer)": ["CIO", "Chief Information Officer"],
  "CTO (Chief Technology Officer)": ["CTO", "Chief Technology Officer"],
  "CIO (Chief investment officer)": ["CIO", "Chief Investment Officer"],
  "CSO (Chief Science Officer)": ["CSO", "Chief Science Officer", "Chief Scientific Officer"],
  "Chief AI officer (Chief Artificial Intelligence Officer)": ["Chief AI Officer", "Chief Artificial Intelligence Officer", "CAIO", "Chief AI"]
};

// 4 khu vực mục tiêu tại Metro Vancouver, BC, Canada kèm Municipal ID (mid) của Job Bank
const AUTO_LOCATIONS = [
  { name: "Vancouver, BC", city: "Vancouver", mid: "39070" },
  { name: "Burnaby, BC", city: "Burnaby", mid: "22327" },
  { name: "North Vancouver, BC", city: "North Vancouver", mid: "39069" },
  { name: "West Vancouver, BC", city: "West Vancouver", mid: "50333" }
];

const AUTO_ALLOWED_LOCATION_TERMS = [
  "vancouver, bc", "vancouver, british columbia", "vancouver (bc)", "vancouver",
  "burnaby, bc", "burnaby, british columbia", "burnaby (bc)", "burnaby",
  "north vancouver, bc", "north vancouver, british columbia", "north vancouver (bc)", "north vancouver",
  "west vancouver, bc", "west vancouver, british columbia", "west vancouver (bc)", "west vancouver",
  "metro vancouver, bc", "greater vancouver, bc"
];

// Danh sách loại trừ nghiêm ngặt các vùng lân cận ngoài 4 khu vực mục tiêu
const STRICT_EXCLUDED_LOCATIONS = [
  "richmond", "surrey", "delta", "langley", "coquitlam", "port coquitlam",
  "port moody", "maple ridge", "white rock", "new westminster", "pitt meadows",
  "abbotsford", "chilliwack", "mission", "squamish", "whistler", "victoria",
  "kelowna", "kamloops", "prince george", "nanaimo", "alberta", "ontario", "quebec"
];

// BỘ LỌC LOẠI TRỪ (Negative Keywords Blacklist) trên TIÊU ĐỀ CÔNG VIỆC (Job Title)
// Áp dụng chính xác 100% danh sách từ khóa cấm theo yêu cầu nghiệp vụ:
const DEFAULT_EXCLUDED_TITLE_KEYWORDS = [
  "compliance", "clinic", "dental", "attorney", "medical", "people", "health",
  "counsel", "fire", "sale", "sales", "tax", "accountant", "accounting", "pharma",
  "construction", "nurse", "care", "caregiver", "designer", "building",
  "maintenance", "interior", "design", "warehouse", "social", "media", "lawyer",
  "biologist", "contracts", "chemist", "agronomist", "facilities", "underwri",
  "photograph", "plumber", "electrician", "mechanic", "truck", "therapy",
  "accoutics", "acoustics", "head chef", "chef", "ethics", "intern", "internship",
  "tunnel", "co-op", "coop", "landscape", "carpenter", "terrestria", "landscape architect"
];

const AUTO_DAYS = 3;
const AUTO_MIN_ANNUAL_SALARY = 60000;
const AUTO_MIN_HOURLY_SALARY = 30;

let batchLocationIndex = 0;
let currentSearchLocation = AUTO_LOCATIONS[0];
let batchRunning = false;
let batchKeywords = [...DEFAULT_SEARCH_KEYWORDS];
let batchKeywordIndex = 0;
let currentSearchKeyword = "";
let autoKeywordText = DEFAULT_SEARCH_KEYWORDS.join("\n");

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(...args) {
  console.log("[Job Bank Crawler]", ...args);
}

// Trích xuất mã định danh công việc (Job ID / Job Key) từ URL hoặc ID thẻ
function extractJobKey(url, cardId = "") {
  if (cardId && /^article-(\d+)/i.test(cardId)) {
    return cardId.replace(/^article-/i, "");
  }
  if (!url) return null;
  try {
    const match = url.match(/\/jobposting\/([a-z0-9_-]+)/i)
      || url.match(/[?&]jid=([a-z0-9_-]+)/i);
    return match ? match[1].replace(/;.*$/, "") : null;
  } catch {
    return null;
  }
}

// Kiểm tra mức lương theo yêu cầu:
// 1. Không lương (để trống, N/A, không ghi số cụ thể) -> KHÔNG LOẠI (giữ lại)
// 2. Có lương -> BẮT BUỘC xét điều kiện >= $60k/năm (hoặc >= $30/h)
function salaryMeetsMinimum(salaryText) {
  // Không có thông tin lương -> Không loại (chấp nhận)
  if (!salaryText || salaryText === "N/A" || !salaryText.trim()) return true;

  const values = extractSalaryNumbers(salaryText);
  // Không trích xuất được số tiền cụ thể nào -> Không loại (chấp nhận)
  if (values.length === 0) return true;

  // Có mức lương công bố cụ thể -> Bắt buộc xét điều kiện >= $60k/năm hoặc >= $30/giờ
  // Lấy giá trị khởi điểm (min) của dải lương để đảm bảo mức tối thiểu đạt chuẩn
  const minSalary = Math.min(...values);
  const period = getSalaryPeriod(salaryText);

  if (period === "hour") return minSalary >= AUTO_MIN_HOURLY_SALARY;
  if (period === "week") return minSalary >= (AUTO_MIN_ANNUAL_SALARY / 52);
  if (period === "month") return minSalary >= (AUTO_MIN_ANNUAL_SALARY / 12);
  if (period === "year") return minSalary >= AUTO_MIN_ANNUAL_SALARY;

  // Trường hợp không ghi rõ đơn vị nhưng số lớn >= 10000 -> tính theo năm
  if (minSalary >= 10000) return minSalary >= AUTO_MIN_ANNUAL_SALARY;
  // Trường hợp mức theo giờ phổ biến
  if (minSalary >= AUTO_MIN_HOURLY_SALARY && minSalary <= 200) return true;

  // Mức lương công bố dưới ngưỡng tối thiểu -> Loại bỏ
  return false;
}

// Kiểm tra trùng lặp job
function isJobDuplicate(newJob) {
  const newKey = extractJobKey(newJob.link);
  return allJobs.some(existing => {
    if (newKey) {
      const existingKey = extractJobKey(existing.link);
      if (existingKey && existingKey === newKey) return true;
    }
    return existing.title?.toLowerCase() === newJob.title?.toLowerCase()
      && existing.company?.toLowerCase() === newJob.company?.toLowerCase()
      && existing.location?.toLowerCase() === newJob.location?.toLowerCase();
  });
}

// Phân tích ngày đăng tuyển từ Job Bank (vd: "November 03, 2026")
function parseJobDate(dateStr) {
  if (!dateStr || dateStr === "N/A") return null;
  try {
    const cleaned = dateStr.replace(/\s+/g, " ").trim();
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {}
  return null;
}

// Kiểm tra ngày có trong phạm vi 3 ngày gần nhất hay không
function isWithinDays(dateStr, maxDays = AUTO_DAYS) {
  if (!dateStr) return true; // Nếu không tìm thấy ngày, không loại bỏ sớm
  const jobDate = parseJobDate(dateStr);
  if (!jobDate) return true;

  const now = new Date();
  const diffTime = now.getTime() - jobDate.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  // Cho phép dung sai một phần do chênh lệch múi giờ Canada (khoảng 3.5 ngày)
  return diffDays <= (maxDays + 0.5);
}

// Bộ lọc địa điểm nghiêm ngặt: Chỉ chấp nhận 4 vùng Vancouver, Burnaby, North Van, West Van
function shouldKeepByLocation(location) {
  if (!location || location === "N/A") return false;
  const loc = location.toLowerCase().replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();

  // Loại bỏ các địa điểm trùng tên ở Mỹ (ví dụ: Vancouver, WA, USA)
  if ((loc.includes(" wa") || loc.includes("washington") || loc.includes("usa") || loc.includes("united states")) &&
      !loc.includes(" bc") && !loc.includes("british columbia") && !loc.includes("canada")) {
    return false;
  }

  // Kiểm tra loại trừ nếu rơi vào các thành phố lân cận ngoài danh mục
  for (const ex of STRICT_EXCLUDED_LOCATIONS) {
    const pattern = new RegExp(`(^|\\s)${ex}(\\s|$)`, "i");
    if (pattern.test(loc)) {
      return false;
    }
  }

  // Chấp nhận nếu chứa 1 trong 4 vùng mục tiêu
  return (
    loc.includes("vancouver") ||
    loc.includes("burnaby") ||
    loc.includes("north vancouver") ||
    loc.includes("west vancouver")
  );
}

// Kiểm tra xem Job Title có chứa từ khóa loại trừ (Negative Keywords) không
// Sử dụng word-boundary regex để tránh match nhầm các từ hợp lệ (như intermediate, career, syntax...)
function getMatchedExcludedTerm(jobTitle) {
  if (!jobTitle) return null;
  const title = jobTitle.toLowerCase().trim();

  for (const term of DEFAULT_EXCLUDED_TITLE_KEYWORDS) {
    const cleanTerm = term.toLowerCase().trim();
    if (!cleanTerm) continue;

    // Gốc từ / tiền tố (underwriter, photography, terrestrial)
    if (cleanTerm === "underwri" || cleanTerm === "photograph" || cleanTerm === "terrestria") {
      if (title.includes(cleanTerm)) return term;
      continue;
    }

    // Cụm nhiều từ (vd: "head chef", "landscape architect")
    if (cleanTerm.includes(" ") || cleanTerm.includes("-")) {
      const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(title)) {
        return term;
      }
      continue;
    }

    // Từ đơn: Bắt buộc dùng word-boundary regex
    // Tránh: "media" match nhầm "Intermediate Data Analyst"
    // Tránh: "care" match nhầm "Career Development"
    // Tránh: "tax" match nhầm "Syntax"
    const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    if (rx.test(title)) {
      return term;
    }
  }

  return null;
}

function hasExcludedTitleKeyword(jobTitle) {
  return getMatchedExcludedTerm(jobTitle) !== null;
}

// Kiểm tra khớp từ khóa trong Job Title
function titleContainsTerm(jobTitle, term) {
  if (!jobTitle || !term) return false;
  const title = jobTitle.toLowerCase().replace(/[_–—-]+/g, " ").replace(/\s+/g, " ").trim();
  const normalizedTerm = term.toLowerCase().replace(/[_–—-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalizedTerm) return false;

  // Loại trừ các vị trí trợ lý / thư ký cho C-Level (vd: "assistant to ceo", "executive assistant to cto")
  if (/\b(assistant to|ea to|secretary to)\b/i.test(title)) {
    return false;
  }

  // Với President: loại bỏ "vice president" / "vp"
  if (normalizedTerm === "president") {
    if (/\bvice[\s-]+president\b/i.test(title) || /\bvp\b/i.test(title)) {
      return false;
    }
    return /\bpresident\b/i.test(title);
  }

  // Acronym ngắn (2-4 ký tự): bắt buộc match nguyên từ độc lập
  if (/^[a-z0-9]{2,4}$/.test(normalizedTerm)) {
    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(title);
  }
  return title.includes(normalizedTerm);
}

function getAutoTitleTerms(searchKeyword) {
  if (!searchKeyword) return [];
  const trimmed = searchKeyword.trim();
  if (EXECUTIVE_TITLE_TERMS[trimmed]) return EXECUTIVE_TITLE_TERMS[trimmed];

  const lower = trimmed.toLowerCase();
  for (const [key, aliases] of Object.entries(EXECUTIVE_TITLE_TERMS)) {
    if (key.toLowerCase() === lower) return aliases;
  }

  const parenMatch = trimmed.match(/^(.*?)\s*\((.*?)\)$/);
  if (parenMatch) {
    return [parenMatch[1].trim(), parenMatch[2].trim()];
  }

  return [trimmed];
}

function isExecutiveSearchKeyword(kw) {
  if (!kw) return false;
  const lower = kw.toLowerCase().trim();
  return (
    lower === "president" ||
    lower.startsWith("ceo") ||
    lower.startsWith("cio") ||
    lower.startsWith("cto") ||
    lower.startsWith("cso") ||
    lower.startsWith("chief")
  );
}

function shouldKeepByAutoTitleKeyword(jobTitle) {
  if (!batchRunning) return true;
  const terms = getAutoTitleTerms(currentSearchKeyword || batchKeywords[batchKeywordIndex]);
  if (!terms.length || !jobTitle) return false;
  return terms.some(term => titleContainsTerm(jobTitle, term));
}

// Xử lý câu truy vấn phù hợp cho Job Bank Canada
function getSearchQueryForJobBank(keyword) {
  if (!keyword) return "";
  const lower = keyword.trim().toLowerCase();

  if (lower.startsWith("ceo")) return "CEO";
  if (lower.startsWith("cio")) return "CIO";
  if (lower.startsWith("cto")) return "CTO";
  if (lower.startsWith("cso")) return "CSO";
  if (lower.startsWith("president")) return "President";
  if (lower.includes("chief ai") || lower.includes("chief artificial intelligence")) {
    return '"Chief AI Officer"';
  }
  if (lower === "artificial_intelligence" || lower === "artificial intelligence") {
    return '"artificial intelligence"';
  }
  if (lower === "data scientist") return '"data scientist"';
  if (lower === "financial analyst") return '"financial analyst"';
  if (lower === "investment management") return '"investment management"';
  if (lower === "systems analyst") return '"systems analyst"';
  if (lower === "technology manager") return '"technology manager"';
  if (lower === "machine learning") return '"machine learning"';

  return keyword.replace(/[()]/g, "").trim();
}

// Tạo URL tìm kiếm trực tiếp trên Job Bank Canada
function buildJobBankSearchUrl(keyword, locationObj = currentSearchLocation || AUTO_LOCATIONS[0]) {
  const url = new URL("https://www.jobbank.gc.ca/jobsearch/jobsearch");
  url.searchParams.set("searchstring", getSearchQueryForJobBank(keyword));
  url.searchParams.set("locationstring", locationObj.name);
  if (locationObj.mid) {
    url.searchParams.set("mid", locationObj.mid);
  }
  url.searchParams.set("fprov", "BC");
  url.searchParams.set("sort", "D"); // Sắp xếp theo ngày mới nhất
  url.searchParams.set("fage", String(AUTO_DAYS)); // Lọc 3 ngày
  return url.toString();
}

function parseAutoKeywords(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#"));
}


function getBatchProgressText() {
  if (!batchRunning || !batchKeywords.length) return "AUTO A→Z chưa chạy";
  const idx = Math.min(batchKeywordIndex + 1, batchKeywords.length);
  const locName = currentSearchLocation?.name || AUTO_LOCATIONS[batchLocationIndex]?.name || "";
  return `AUTO ${idx}/${batchKeywords.length} | Vùng ${batchLocationIndex + 1}/${AUTO_LOCATIONS.length}: "${currentSearchKeyword || batchKeywords[batchKeywordIndex] || ""}" @ ${locName}`;
}

function updateBatchProgressUI() {
  const el = document.getElementById("jobbank-auto-progress");
  if (el) {
    el.textContent = `${getBatchProgressText()} | Lấy toàn bộ jobs trả về • Lọc bằng Negative Blacklist | Vancouver/Burnaby/North Vancouver/West Vancouver | 3 ngày | Không lương: giữ lại | Có lương: min 60k/năm (30/h) | Người lấy job: ${crawlerName}`;
  }
}

// Bắt đầu chu trình AUTO A→Z
async function startAutoBatch() {
  if (batchRunning || isCrawling) {
    updateStatus("Crawler đang chạy. Vui lòng bấm Dừng/Reset trước khi khởi động phiên mới.");
    return;
  }

  const keywordInput = document.getElementById("auto-keywords-input");
  autoKeywordText = keywordInput?.value || autoKeywordText || DEFAULT_SEARCH_KEYWORDS.join("\n");
  const keywords = parseAutoKeywords(autoKeywordText);
  if (!keywords.length) return updateStatus("Danh sách keyword AUTO đang trống.");

  const nameInput = document.getElementById("applicant-name-input");
  applicantName = nameInput ? nameInput.value.trim() : "";
  const crawlerInput = document.getElementById("crawler-name-input");
  crawlerName = crawlerInput && crawlerInput.value.trim() ? crawlerInput.value.trim() : DEFAULT_CRAWLER_NAME;

  maxPages = 0; // 0 = Không giới hạn trang, quét hết tin 3 ngày

  filterKeywords = [];
  filterLocations = [...AUTO_ALLOWED_LOCATION_TERMS];

  allJobs = [];
  currentPage = 1;
  resumeFromIndex = 0;
  hasExported = false;
  batchRunning = true;
  isCrawling = true;
  batchKeywords = keywords;
  batchKeywordIndex = 0;
  batchLocationIndex = 0;
  currentSearchKeyword = batchKeywords[0];
  currentSearchLocation = AUTO_LOCATIONS[0];

  const tbody = document.querySelector("#jobbank-crawler-table tbody");
  if (tbody) tbody.innerHTML = "";

  await chrome.storage.local.set({
    allJobs, currentPage, resumeFromIndex, hasExported, isCrawling, maxPages,
    batchRunning, batchKeywords, batchKeywordIndex, batchLocationIndex,
    currentSearchKeyword, currentSearchLocation, autoKeywordText,
    applicantName, crawlerName, pendingJob: null
  });

  updateButtonStates();
  updateBatchProgressUI();
  updateStatus(`AUTO A→Z bắt đầu: "${currentSearchKeyword}" @ ${currentSearchLocation.name}`);

  location.href = buildJobBankSearchUrl(currentSearchKeyword, currentSearchLocation);
}

// Hoàn tất lượt từ khóa / địa điểm hiện tại và chuyển tiếp
async function finishCurrentKeyword(reason = "") {
  const finishedKeyword = currentSearchKeyword || batchKeywords[batchKeywordIndex] || "";
  if (!batchRunning) {
    updateStatus(reason || "Hoàn tất crawl.");
    if (!hasExported) {
      exportSheetCSV();
      hasExported = true;
    }
    isCrawling = false;
    await chrome.storage.local.set({ isCrawling: false, hasExported });
    updateButtonStates();
    return false;
  }

  // 1. Chạy đủ 4 location cho mỗi keyword trước khi sang keyword tiếp theo
  if (batchLocationIndex + 1 < AUTO_LOCATIONS.length) {
    batchLocationIndex += 1;
    currentSearchLocation = AUTO_LOCATIONS[batchLocationIndex];
    currentPage = 1;
    resumeFromIndex = 0;
    isCrawling = true;
    await chrome.storage.local.set({
      allJobs, currentPage, resumeFromIndex, isCrawling, batchRunning,
      batchKeywords, batchKeywordIndex, batchLocationIndex, currentSearchKeyword, currentSearchLocation, pendingJob: null
    });
    updateBatchProgressUI();
    updateStatus(`Hoàn tất "${finishedKeyword}" tại vị trí trước (${reason}). Chuyển sang: ${currentSearchLocation.name}`);
    await wait(2500 + Math.floor(Math.random() * 1000));
    location.href = buildJobBankSearchUrl(currentSearchKeyword, currentSearchLocation);
    return false;
  }

  // 2. Chuyển sang keyword tiếp theo
  const nextIndex = batchKeywordIndex + 1;
  if (nextIndex < batchKeywords.length) {
    batchKeywordIndex = nextIndex;
    batchLocationIndex = 0;
    currentSearchKeyword = batchKeywords[batchKeywordIndex];
    currentSearchLocation = AUTO_LOCATIONS[0];
    currentPage = 1;
    resumeFromIndex = 0;
    isCrawling = true;
    await chrome.storage.local.set({
      allJobs, currentPage, resumeFromIndex, isCrawling, batchRunning,
      batchKeywords, batchKeywordIndex, batchLocationIndex, currentSearchKeyword, currentSearchLocation, pendingJob: null
    });
    updateBatchProgressUI();
    updateStatus(`Hoàn tất keyword "${finishedKeyword}" (${reason}). Chuyển sang: "${currentSearchKeyword}" @ ${currentSearchLocation.name}`);
    await wait(2500 + Math.floor(Math.random() * 1000));
    location.href = buildJobBankSearchUrl(currentSearchKeyword, currentSearchLocation);
    return false;
  }

  // 3. Hoàn tất toàn bộ chu trình A→Z
  batchRunning = false;
  isCrawling = false;
  currentPage = 1;
  resumeFromIndex = 0;
  hasExported = true;
  await chrome.storage.local.set({
    allJobs, batchRunning, isCrawling, currentPage, resumeFromIndex,
    hasExported, pendingJob: null
  });
  updateBatchProgressUI();
  updateButtonStates();
  updateStatus(`AUTO A→Z hoàn tất ${batchKeywords.length} keywords x 4 locations. Tổng cộng ${allJobs.length} job đạt chuẩn.`);
  exportSheetCSV({ autoDownload: true, filenameTag: "AUTO_JOBBANK_ALL_KEYWORDS" });
  return false;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.action === "startAutoBatchFromIcon") {
    startAutoBatch();
  }
});

// Xây dựng Panel điều khiển nổi trên giao diện Job Bank
function createPanel() {
  if (document.querySelector("#jobbank-crawler-panel")) return;

  const panel = document.createElement("div");
  panel.id = "jobbank-crawler-panel";
  panel.innerHTML = `
    <div id="jobbank-crawler-controls">
      <button id="jobbank-auto-btn">🚀 Chạy AUTO A→Z</button>
      <button id="jobbank-start-btn">Crawl trang hiện tại</button>
      <button id="jobbank-stop-btn" disabled>Dừng</button>
      <button id="jobbank-reset-btn">Reset</button>
      <button id="jobbank-sheet-csv-btn">Tải CSV Sheet</button>
      <button id="jobbank-csv-btn" disabled>Tải CSV Thô</button>
    </div>
    <div id="jobbank-auto-config">
      <div class="auto-title">
        🍁 Job Bank Canada AUTO A→Z: Vancouver, Burnaby, North/West Vancouver • 3 ngày • Không lương: giữ lại | Có lương: min $60k/năm ($30/h)
      </div>
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
        <label><strong>Người nộp:</strong></label>
        <input type="text" id="applicant-name-input" value="${applicantName}" placeholder="(để trống)" style="padding: 3px 8px; border: 1px solid #c8a2c8; border-radius: 4px; width: 120px; color: #2c3e50;" />
        <label style="margin-left: 8px;"><strong>Người lấy job:</strong></label>
        <input type="text" id="crawler-name-input" value="${crawlerName}" style="padding: 3px 8px; border: 1px solid #c8a2c8; border-radius: 4px; font-weight: bold; width: 140px; color: #2c3e50;" />
        <span style="color: #666; font-size: 11px;">(Cột M để trống, Cột N: Nguyễn Tiến Đạt)</span>
      </div>
      <textarea id="auto-keywords-input" rows="5" spellcheck="false">${autoKeywordText}</textarea>
      <div id="jobbank-auto-progress">AUTO A→Z chưa chạy</div>
    </div>
    

    <div id="jobbank-crawler-status">Chưa bắt đầu.</div>
    <div style="padding: 4px 10px; background: #f3e5f5; font-weight: bold; font-size: 11px; color: #4a148c; border-bottom: 1px solid #e1bee7; display: flex; justify-content: space-between; align-items: center;">
      <span>📋 Danh sách Job đạt chuẩn (Dữ liệu chấp nhận)</span>
      <span style="font-weight: normal; font-size: 10.5px; color: #666;">(Xem trực tiếp 3+ dòng cùng lúc)</span>
    </div>
    <div id="jobbank-crawler-table-wrapper">
      <table id="jobbank-crawler-table">
        <thead>
          <tr>
            <th>Company</th><th>Job Title</th><th>Link</th><th>Salary</th><th>Location</th><th>Apply Method</th><th>Date</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById("jobbank-auto-btn").onclick = () => startAutoBatch();

  const applicantInputEl = document.getElementById("applicant-name-input");
  if (applicantInputEl) {
    applicantInputEl.addEventListener("change", () => {
      applicantName = applicantInputEl.value.trim();
      chrome.storage.local.set({ applicantName });
      updateBatchProgressUI();
    });
  }

  const crawlerInputEl = document.getElementById("crawler-name-input");
  if (crawlerInputEl) {
    crawlerInputEl.addEventListener("change", () => {
      crawlerName = crawlerInputEl.value.trim() || DEFAULT_CRAWLER_NAME;
      chrome.storage.local.set({ crawlerName });
      updateBatchProgressUI();
    });
  }

  const autoKeywordsEl = document.getElementById("auto-keywords-input");
  if (autoKeywordsEl) {
    autoKeywordsEl.addEventListener("change", () => {
      autoKeywordText = autoKeywordsEl.value;
      chrome.storage.local.set({ autoKeywordText });
    });
  }

  document.getElementById("jobbank-start-btn").onclick = () => {
    maxPages = 0; // 0 = Không giới hạn trang, quét hết tin 3 ngày
    startCrawl();
  };

  document.getElementById("jobbank-stop-btn").onclick = () => {
    if (isCrawling || batchRunning) {
      isCrawling = false;
      batchRunning = false;
      chrome.storage.local.set({ isCrawling: false, batchRunning: false, pendingJob: null });
      updateStatus("Đã dừng thu thập / AUTO.");
      updateBatchProgressUI();
      updateButtonStates();
    }
  };

  document.getElementById("jobbank-reset-btn").onclick = () => {
    chrome.storage.local.clear();
    allJobs = [];
    currentPage = 1;
    isCrawling = false;
    batchRunning = false;
    batchKeywordIndex = 0;
    batchLocationIndex = 0;
    currentSearchKeyword = "";
    hasExported = false;
    const tbody = document.querySelector("#jobbank-crawler-table tbody");
    if (tbody) tbody.innerHTML = "";
    updateStatus("Đã xóa dữ liệu lưu trữ.");
    updateButtonStates();
    updateBatchProgressUI();
  };

  document.getElementById("jobbank-csv-btn").onclick = () => {
    if (!isCrawling && allJobs.length > 0) {
      exportCSV();
    }
  };

  document.getElementById("jobbank-sheet-csv-btn").onclick = () => {
    if (isCrawling) {
      updateStatus("Vui lòng chờ crawl hoàn tất trước khi xuất file.");
      return;
    }
    if (allJobs.length === 0) {
      updateStatus("Chưa có job nào trong danh sách.");
      return;
    }
    exportSheetCSV();
  };

  
}

function updateButtonStates() {
  const autoBtn = document.getElementById("jobbank-auto-btn");
  const startBtn = document.getElementById("jobbank-start-btn");
  const stopBtn = document.getElementById("jobbank-stop-btn");
  const csvBtn = document.getElementById("jobbank-csv-btn");
  const sheetCsvBtn = document.getElementById("jobbank-sheet-csv-btn");

  if (autoBtn) autoBtn.disabled = isCrawling || batchRunning;
  if (startBtn) startBtn.disabled = isCrawling || batchRunning;
  if (stopBtn) stopBtn.disabled = !isCrawling && !batchRunning;
  if (csvBtn) csvBtn.disabled = isCrawling || allJobs.length === 0;
  if (sheetCsvBtn) sheetCsvBtn.disabled = isCrawling || allJobs.length === 0;
}

function updateStatus(text) {
  const el = document.getElementById("jobbank-crawler-status");
  if (el) el.textContent = text;
  log(text);
}

function appendToTable(job) {
  const tbody = document.querySelector("#jobbank-crawler-table tbody");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${job.company || "N/A"}</td>
    <td>${job.title || "N/A"}</td>
    <td><a href="${job.link}" target="_blank">Link</a></td>
    <td>${job.salary || "N/A"}</td>
    <td>${job.location || "N/A"}</td>
    <td>${job.applyMethod || "N/A"}</td>
    <td>${job.date || "N/A"}</td>
  `;
  tbody.appendChild(row);
}

function rebuildTable() {
  const tbody = document.querySelector("#jobbank-crawler-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const job of allJobs) {
    appendToTable(job);
  }
}

// Chờ danh sách job card xuất hiện trên Job Bank
async function waitForJobCards(timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const cards = document.querySelectorAll("article[id^='article-'], article.action-buttons, .results-jobs article");
      if (cards.length > 0) {
        clearInterval(interval);
        log("Đã tìm thấy", cards.length, "job cards trên Job Bank");
        resolve(Array.from(cards));
        return;
      }

      const noResults = document.querySelector(".alert-info, #noresult-message, .no-results");
      const bodyText = (document.body?.innerText || "").toLowerCase();
      const hasNoResult = bodyText.includes("no jobs match your search")
        || bodyText.includes("0 results found")
        || bodyText.includes("did not match any jobs")
        || bodyText.includes("aucun emploi ne correspond");

      if (noResults || (Date.now() - start > 2000 && hasNoResult)) {
        clearInterval(interval);
        log("Không tìm thấy kết quả nào (0 jobs).");
        resolve([]);
        return;
      }

      if (Date.now() - start > timeout) {
        clearInterval(interval);
        log("Timeout chờ job cards.");
        resolve([]);
      }
    }, 400);
  });
}

function parsePostingDetailHtml(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  // Nhận diện phương thức nộp đơn (Apply Method)
  let applyMethod = "Apply Now";
  const externalLink = doc.querySelector("#externalJobLink, a[id*='externalJobLink']");
  if (externalLink) {
    applyMethod = "Apply on Company Site";
  } else {
    const applyBtn = doc.querySelector("#applynowbutton, button[id*='applynow']");
    if (applyBtn) {
      applyMethod = "Apply Now";
    }
  }

  // Trích xuất email HR trực tiếp nếu có
  let email = "";
  const mailtoLink = doc.querySelector("a[href^='mailto:']");
  if (mailtoLink) {
    email = mailtoLink.href.replace(/^mailto:/i, "").split("?")[0].trim();
  } else {
    const emailMatch = htmlText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      // Loại trừ các email hệ thống của chính Job Bank
      const found = emailMatch[1].toLowerCase();
      if (!found.includes("jobbank.gc.ca") && !found.includes("canada.ca")) {
        email = emailMatch[1].trim();
      }
    }
  }

  // Lấy mức lương chi tiết hơn nếu card chưa có
  let detailSalary = "";
  const salaryEl = doc.querySelector('[property="baseSalary"], .salary, .attribute-value.salary');
  if (salaryEl) {
    detailSalary = salaryEl.innerText?.trim() || "";
  }

  // Lấy chức danh công việc sạch từ trang chi tiết nếu có
  let detailTitle = "";
  const titleH1 = doc.querySelector("h1[property='title'], h1.title, #job-posting-detail h1, h1");
  if (titleH1) {
    const t = titleH1.innerText?.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ") || "";
    if (t) {
      detailTitle = t.charAt(0).toUpperCase() + t.slice(1);
    }
  }

  return { applyMethod, email, detailSalary, detailTitle };
}

// Tải chi tiết tin tuyển dụng ngầm qua fetch với cơ chế chống chặn WAF F5 Big-IP
async function fetchJobPostingDetail(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url, { credentials: "same-origin" });

    // Cơ chế tự động hạ nhiệt khi gặp HTTP 429 (Too Many Requests) hoặc 503
    if (resp.status === 429 || resp.status === 503) {
      updateStatus("⚠️ Máy chủ Job Bank yêu cầu giảm tốc độ (429/503). Tạm dừng 15s để hạ nhiệt...");
      log("Máy chủ phản hồi 429/503. Tạm nghỉ 15 giây...");
      await wait(15000);
      try {
        const retryResp = await fetch(url, { credentials: "same-origin" });
        if (!retryResp.ok) return null;
        consecutiveNetworkErrors = 0;
        return parsePostingDetailHtml(await retryResp.text());
      } catch (retryErr) {
        log("Thử lại sau 429 thất bại:", retryErr);
        return null;
      }
    }

    if (!resp.ok) return null;
    consecutiveNetworkErrors = 0;
    const htmlText = await resp.text();
    return parsePostingDetailHtml(htmlText);
  } catch (err) {
    consecutiveNetworkErrors++;
    log(`Lỗi kết nối khi fetch (${consecutiveNetworkErrors}/3):`, err);

    // Circuit Breaker: nếu bị ngắt kết nối liên tiếp 3 lần (ERR_CONNECTION_RESET), tự động dừng để bảo vệ IP
    if (consecutiveNetworkErrors >= 3) {
      updateStatus("⛔ Tường lửa máy chủ đã ngắt kết nối (ERR_CONNECTION_RESET). Tự động DỪNG để bảo vệ IP!");
      isCrawling = false;
      batchRunning = false;
      await chrome.storage.local.set({ isCrawling: false, batchRunning: false });
      updateButtonStates();
      updateBatchProgressUI();
    }
    return null;
  }
}

// Trích xuất chức danh công việc CHUẨN XÁC, SẠCH SẼ từ Job Card của Job Bank
// Đảm bảo không bao giờ bị dính các badge rác như: "New 12 - 14 km", "On site", "Direct Apply",
// "Posted on Job Bank", "This job was posted directly...", "ZipRecruiter", "indeed.com"
function extractJobTitleFromCard(card) {
  if (!card) return "N/A";

  // 1. Ưu tiên cao nhất: Thẻ span.noctitle (hoặc h3 .noctitle) - chứa riêng 100% tên chức danh của Job Bank
  const nocEl = card.querySelector(".noctitle, span.noctitle, h3 .noctitle");
  if (nocEl && nocEl.innerText && nocEl.innerText.trim()) {
    const raw = nocEl.innerText.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
    if (raw) {
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
  }

  // 2. Dự phòng: Nếu không tìm thấy thẻ .noctitle, lấy từ h3 nhưng PHẢI xóa sạch tất cả các badge rác
  const h3 = card.querySelector("h3.title, a.resultJobItem h3, h3");
  if (h3) {
    const clone = h3.cloneNode(true);
    // Bóc tách toàn bộ badge khoảng cách, hình thức làm việc, nguồn việc (indeed, ziprecruiter, job bank...), mô tả tooltip
    const junkSelectors = [
      ".flag", ".job-source", ".wb-inv", ".description", ".distance",
      ".new", ".telework", ".appmethod", ".postedonJB", "span[class*='job-source']"
    ];
    junkSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });
    const raw = clone.innerText?.trim() || "";
    const clean = raw.replace(/\s*- job post\s*$/i, "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    if (clean) {
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
  }

  return "N/A";
}

// Bắt đầu crawl
async function startCrawl() {
  if (isCrawling) return;
  isCrawling = true;
  hasExported = false;
  resumeFromIndex = 0;
  chrome.storage.local.set({ isCrawling, maxPages, resumeFromIndex: 0, pendingJob: null });
  updateButtonStates();
  updateStatus("Bắt đầu crawl Job Bank...");
  await crawlPage(0);
}

// Vòng lặp duyệt các job card trên trang kết quả Job Bank
async function crawlPage(startIndex = 0) {
  try {
    updateStatus("Đang tải danh sách tin tuyển dụng Job Bank...");
    const jobCards = await waitForJobCards(12000);

    if (!jobCards.length) {
      updateStatus("Không có tin tuyển dụng nào được tìm thấy.");
      if (batchRunning) {
        return await finishCurrentKeyword("0 jobs");
      }
      isCrawling = false;
      updateButtonStates();
      return false;
    }

    let processedCountThisBatch = 0;
    let stopDueToDateCutoff = false;

    for (let i = startIndex; i < jobCards.length; i++) {
      if (!isCrawling) return false;

      const card = jobCards[i];
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      await wait(400);

      // Trích xuất từ Job Card chuẩn xác, loại bỏ hoàn toàn các badge rác
      const companyEl = card.querySelector("li.business, span.business");
      const locationEl = card.querySelector("li.location, span.location");
      const salaryEl = card.querySelector("li.salary, span.salary");
      const dateEl = card.querySelector("li.date, span.date");
      const linkEl = card.querySelector("a.resultJobItem, a[href*='/jobposting/']");

      const rawTitle = extractJobTitleFromCard(card);
      const rawCompany = (companyEl?.innerText?.trim() || "N/A").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
      const rawLocation = (locationEl?.innerText?.trim().replace(/^Location\s*/i, "") || "N/A").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
      const rawSalary = (salaryEl?.innerText?.trim().replace(/^Salary\s*/i, "") || "N/A").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
      const rawDate = (dateEl?.innerText?.trim() || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");

      let jobLink = linkEl?.href || "";
      if (jobLink && jobLink.startsWith("/")) {
        jobLink = "https://www.jobbank.gc.ca" + jobLink;
      }
      // Làm sạch session id khỏi link để link bền vững: /jobposting/50656015;jsessionid=... -> /jobposting/50656015
      jobLink = jobLink.replace(/;jsessionid=[^?]+/i, "");

      const pendingJob = {
        title: rawTitle,
        company: rawCompany,
        location: rawLocation,
        salary: rawSalary,
        date: rawDate,
        applyMethod: "N/A",
        email: "",
        link: jobLink || location.href,
        page: currentPage,
        searchKeyword: currentSearchKeyword || "manual"
      };

      // 1. Kiểm tra ngày đăng tuyển (3 ngày gần nhất)
      // Do kết quả được sắp xếp theo Ngày mới nhất (sort=D), khi gặp job cũ hơn 3 ngày -> dừng toàn bộ search này
      if (rawDate && !isWithinDays(rawDate, AUTO_DAYS)) {
        log(`Dừng quét từ khóa vì gặp tin cũ hơn 3 ngày: "${pendingJob.title}" ngày ${rawDate}`);
        updateStatus(`Dừng quét lượt này (đã tới mốc 3 ngày: ${rawDate})`);
        stopDueToDateCutoff = true;
        break;
      }

      // 2. Kiểm tra trùng lặp
      if (isJobDuplicate(pendingJob)) {
        log(`Bỏ qua (đã thu thập): "${pendingJob.title}" tại ${pendingJob.company}`);
        continue;
      }

      // 3. Strict Location Filter: Vancouver, Burnaby, North Vancouver, West Vancouver
      if (!shouldKeepByLocation(pendingJob.location)) {
        log(`Bỏ qua (ngoài 4 vùng chỉ định): "${pendingJob.title}" tại ${pendingJob.location}`);
        continue;
      }

      // 4. BỘ LỌC LOẠI TRỪ (Negative Keywords Blacklist) trên Job Title
      if (hasExcludedTitleKeyword(pendingJob.title)) {
        const matchedNeg = getMatchedExcludedTerm(pendingJob.title);
        log(`Bỏ qua (tiêu đề chứa từ khóa loại trừ "${matchedNeg}"): "${pendingJob.title}"`);
        updateStatus(`Loại trừ từ cấm: ${pendingJob.title} ("${matchedNeg}")`);
        continue;
      }

      // 5. Strict Title cho 6 vị trí lãnh đạo cấp cao (President, CEO, CIO, CTO, CSO, Chief AI Officer)
      if (isExecutiveSearchKeyword(currentSearchKeyword) && !shouldKeepByAutoTitleKeyword(pendingJob.title)) {
        const expected = getAutoTitleTerms(currentSearchKeyword).join(" / ");
        log(`Bỏ qua (tiêu đề không khớp chức danh lãnh đạo: ${expected}): "${pendingJob.title}"`);
        updateStatus(`Bỏ qua title C-Level: ${pendingJob.title} — yêu cầu: ${expected}`);
        continue;
      }

      // 6. Kiểm tra sơ bộ mức lương trên card (nếu đã có và không đạt min -> bỏ qua luôn)
      if (rawSalary && rawSalary !== "N/A" && !salaryMeetsMinimum(rawSalary)) {
        log(`Bỏ qua (mức lương công bố dưới $60k/năm hoặc <$30/h): "${pendingJob.title}" - ${rawSalary}`);
        continue;
      }

      // 7. Tư duy thu thập:
      // Toàn bộ công việc liên quan mà Job Bank trả về đều được chấp nhận (ví dụ tìm "investment" trả về
      // trading, finance, business development, portfolio... đều phù hợp), miễn là Job Title không vi phạm từ cấm ở bước 4.

      // 8. Đọc chi tiết trang job ngầm (fetch) để lấy Apply Method và xác thực lương nếu cần
      let applyMethod = "Apply Now";
      let effectiveSalary = rawSalary;
      let email = "";

      if (pendingJob.link) {
        updateStatus(`Đang đọc chi tiết: ${pendingJob.title}...`);
        const details = await fetchJobPostingDetail(pendingJob.link);
        if (details) {
          applyMethod = details.applyMethod || "Apply Now";
          email = details.email || "";
          if (details.detailTitle && (!pendingJob.title || pendingJob.title === "N/A")) {
            pendingJob.title = details.detailTitle;
          }
          if ((!effectiveSalary || effectiveSalary === "N/A") && details.detailSalary) {
            effectiveSalary = details.detailSalary;
          }
        }

        // Nếu ngắt kết nối liên tiếp dẫn đến circuit breaker dừng crawl
        if (!isCrawling) {
          return false;
        }

        // Độ trễ an toàn ngẫu nhiên giữa các lần đọc chi tiết: 1200ms - 2000ms (Human-like pacing)
        const safeDelay = 1200 + Math.floor(Math.random() * 800);
        await wait(safeDelay);
      }

      // 9. Bộ lọc mức lương: Không lương thì không loại, có lương thì xét điều kiện >= $60k/năm (hoặc >= $30/h)
      if (!salaryMeetsMinimum(effectiveSalary)) {
        log(`Bỏ qua (mức lương công bố dưới chuẩn $60k/năm - $30/h): "${pendingJob.title}" - ${effectiveSalary}`);
        continue;
      }

      const finalJob = {
        ...pendingJob,
        salary: effectiveSalary,
        applyMethod: applyMethod,
        email: email
      };

      allJobs.push(finalJob);
      appendToTable(finalJob);
      processedCountThisBatch++;
      await chrome.storage.local.set({ allJobs, pendingJob: null });
      updateStatus(`Đã thêm (${allJobs.length}): ${finalJob.title} | ${finalJob.company} | ${finalJob.salary} | ${finalJob.applyMethod}`);
    }

    // Nếu đã chạm mốc quá 3 ngày hoặc không còn kết quả
    if (stopDueToDateCutoff) {
      if (batchRunning) {
        return await finishCurrentKeyword("đã quét hết tin trong 3 ngày");
      }
      isCrawling = false;
      updateButtonStates();
      updateStatus(`Hoàn tất crawl. Thu thập được ${allJobs.length} job đạt chuẩn.`);
      return true;
    }

    // Kiểm tra giới hạn số trang nếu có thiết lập
    if (maxPages > 0 && currentPage >= maxPages) {
      if (batchRunning) {
        return await finishCurrentKeyword(`đạt giới hạn ${maxPages} trang`);
      }
      isCrawling = false;
      updateButtonStates();
      return true;
    }

    // Kiểm tra nút "Show more results" của Job Bank (#moreresultbutton)
    const moreBtn = document.querySelector("#moreresultbutton");
    if (moreBtn && !moreBtn.disabled && moreBtn.offsetParent !== null) {
      const currentCardsCount = document.querySelectorAll("article[id^='article-']").length;
      updateStatus("Đang tải thêm kết quả từ Job Bank...");
      moreBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      await wait(400);
      moreBtn.click();

      // Chờ các card mới được chèn vào DOM
      let waitCount = 0;
      let newCardsLoaded = false;
      while (waitCount < 15) {
        await wait(600);
        const newCount = document.querySelectorAll("article[id^='article-']").length;
        if (newCount > currentCardsCount) {
          newCardsLoaded = true;
          break;
        }
        waitCount++;
      }

      if (newCardsLoaded) {
        currentPage++;
        await chrome.storage.local.set({ currentPage });
        // Khoảng nghỉ nhẹ nhàng trước khi đọc trang mới để tránh dồn stream
        await wait(1500 + Math.floor(Math.random() * 1000));
        return await crawlPage(currentCardsCount);
      }
    }

    // Hết kết quả để hiển thị
    if (batchRunning) {
      return await finishCurrentKeyword("không còn kết quả mới");
    }
    isCrawling = false;
    updateButtonStates();
    updateStatus(`Hoàn tất crawl. Tổng cộng ${allJobs.length} job đạt chuẩn.`);
    return true;

  } catch (err) {
    console.error("Lỗi crawl page:", err);
    if (batchRunning) {
      return await finishCurrentKeyword(`lỗi: ${String(err)}`);
    }
    updateStatus("Lỗi crawl: " + err);
    isCrawling = false;
    updateButtonStates();
    return false;
  }
}

// ======================================================
// FORMAT DỮ LIỆU ĐỂ ĐƯA VÀO GOOGLE SHEET CHUẨN (A -> S)
// ======================================================

function normalizeSheetLocation(location) {
  if (!location || location === "N/A") return "";
  const original = location.trim();
  const text = original.toLowerCase();

  if (text.includes("remote") || text.includes("à domicile") || text.includes("télétravail") || text.includes("work from home")) {
    return "Remote";
  }

  // Chuẩn hóa định dạng "Vancouver (BC)" -> "Vancouver, BC"
  const m = original.match(/^([a-zA-Z\s]+)\s*\(([A-Z]{2})\)/i);
  if (m) {
    return `${m[1].trim()}, ${m[2].trim().toUpperCase()}`;
  }

  return original;
}

function extractSalaryNumbers(salaryText) {
  if (!salaryText || salaryText === "N/A") return [];

  const text = salaryText
    .replace(/\u00a0/g, " ")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Tìm các số tiền thập phân hoặc nguyên
  const regex = /\$?\s*(\d+(?:\.\d+)?)/g;
  const numbers = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val > 0) {
      numbers.push(val);
    }
  }

  return numbers;
}

function getSalaryPeriod(salaryText) {
  if (!salaryText || salaryText === "N/A") return "unknown";
  const lower = salaryText.toLowerCase();

  if (lower.includes("hour") || lower.includes("hr") || lower.includes("/h") || lower.includes("hourly") || lower.includes("de l'heure")) return "hour";
  if (lower.includes("day") || lower.includes("/d") || lower.includes("daily") || lower.includes("par jour")) return "day";
  if (lower.includes("week") || lower.includes("/w") || lower.includes("weekly") || lower.includes("par semaine")) return "week";
  if (lower.includes("month") || lower.includes("/m") || lower.includes("monthly") || lower.includes("par mois")) return "month";
  if (lower.includes("year") || lower.includes("yr") || lower.includes("/y") || lower.includes("annual") || lower.includes("annually") || lower.includes("par année")) return "year";

  return "unknown";
}

function normalizeSheetSalary(salaryText) {
  if (!salaryText || salaryText === "N/A") return "";

  const values = extractSalaryNumbers(salaryText);
  if (values.length === 0) return salaryText.trim();

  const period = getSalaryPeriod(salaryText);
  const periodLabel = {
    hour: "hour",
    day: "day",
    week: "week",
    month: "month",
    year: "year",
    unknown: ""
  }[period];

  const formatNum = n => {
    if (period === "hour" || (n < 500 && period !== "year")) {
      return `$${n.toFixed(2)}`;
    }
    return `$${Math.round(n).toLocaleString("en-US")}`;
  };

  let formatted = "";
  if (values.length === 1) {
    formatted = formatNum(values[0]);
  } else if (values.length >= 2) {
    formatted = `${formatNum(values[0])} - ${formatNum(values[1])}`;
  } else {
    return salaryText.trim();
  }

  return periodLabel ? `${formatted} / ${periodLabel}` : formatted;
}

function classifySalary(salaryText) {
  if (!salaryText || salaryText === "N/A") return "";
  const values = extractSalaryNumbers(salaryText);
  if (values.length === 0) return "";

  const maxSalary = Math.max(...values);
  const period = getSalaryPeriod(salaryText);

  let annualEquivalent = 0;
  if (period === "hour") annualEquivalent = maxSalary * 2080;
  else if (period === "day") annualEquivalent = maxSalary * 260;
  else if (period === "week") annualEquivalent = maxSalary * 52;
  else if (period === "month") annualEquivalent = maxSalary * 12;
  else if (period === "year") annualEquivalent = maxSalary;
  else {
    if (maxSalary < 200) annualEquivalent = maxSalary * 2080;
    else annualEquivalent = maxSalary;
  }

  if (annualEquivalent >= 120000) return "Min 120k";
  if (annualEquivalent >= 60000) return "Min 60k";
  return "";
}

// Phân loại cấp bậc công việc (Column L) gộp theo đúng 3 nhóm chuẩn:
// 1. "Chief/President level"
// 2. "Manager"
// 3. "Dưới Manager"
function classifyJobLevel(jobTitle) {
  if (!jobTitle || jobTitle === "N/A") return "Dưới Manager";
  const text = jobTitle.toLowerCase().replace(/[_–—-]+/g, " ").replace(/\s+/g, " ").trim();

  // 1. Vice President / VP thuộc nhóm Manager (không phải Chief/President level)
  if (/\bvice[\s-]+president\b/i.test(text) || /\bvp\b/i.test(text)) {
    return "Manager";
  }

  // 2. Chief/President level: Các chức danh cấp C và President
  if (
    /\b(chief|ceo|cio|cto|cso|caio|coo|cfo|cdo|cmo|cro|c-level)\b/i.test(text) ||
    (/\bpresident\b/i.test(text) && !/\b(vice|vp|assistant)\b/i.test(text))
  ) {
    return "Chief/President level";
  }

  // 3. Manager (bao gồm Director, Directeur, Head of, Manager, Gestionnaire, Supervisor, Lead, Dean, Principal...)
  if (
    /\b(director|directeur|head of|manager|gestionnaire|supervisor|lead|dean|principal)\b/i.test(text)
  ) {
    return "Manager";
  }

  // 4. Còn lại thuộc Dưới Manager (Senior, Middle, Junior, Intern, Specialist, Analyst, Developer, Associate...)
  return "Dưới Manager";
}

// Định dạng ngày DD/MM/YYYY chuẩn (Ngày/Tháng/Năm, ví dụ: 05/11/2026)
function formatSheetDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

function formattedCompanyTitle(company, title) {
  const cleanComp = String(company || "").trim().replace(/\s+/g, " ");
  const cleanTitle = String(title || "").trim().replace(/\s+/g, " ");
  return `${cleanComp} - ${cleanTitle}`;
}

function normalizeApplyMethod(applyMethod) {
  if (!applyMethod || applyMethod === "N/A") return "";
  const text = applyMethod.trim().toLowerCase();

  if (
    text.includes("apply now") ||
    text.includes("postuler maintenant") ||
    text.includes("postuler") ||
    text.includes("direct")
  ) {
    return "Apply Now";
  }

  if (
    text.includes("company site") ||
    text.includes("employer website") ||
    text.includes("external") ||
    text.includes("site de l'employeur")
  ) {
    return "Apply on Company Site";
  }

  return applyMethod.trim();
}

function csvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  // Loại bỏ hoàn toàn các ký tự xuống dòng (\r, \n) để cell không bao giờ bị nhảy dòng vỡ ô trong Google Sheets
  const clean = text.replace(/[\r\n]+/g, " ").trim();
  return `"${clean.replace(/"/g, '""')}"`;
}

// Xuất file CSV Sheet Ready cấu trúc chuẩn A -> S
// Cột M: Người nộp = để trống
// Cột N: Người lấy job = Nguyễn Tiến Đạt
function exportSheetCSV(options = {}) {
  const { autoDownload = false, filenameTag = "" } = options;
  if (!allJobs.length) {
    updateStatus("Không có dữ liệu để xuất.");
    return;
  }

  const today = formatSheetDate();
  const currentApplicant = applicantName || "";
  const currentCrawler = crawlerName || DEFAULT_CRAWLER_NAME;

  const headers = [
    "Column A",                                  // A
    "Link job",                                  // B
    "Company name",                              // C
    "Title job",                                 // D
    "Formatted_Title job",                       // E
    "Translate title",                           // F
    "Salary",                                    // G
    "Location",                                  // H
    "Jobboard",                                  // I
    "Date",                                      // J
    "Status",                                    // K
    "Phân loại job",                             // L
    "Người nộp",                                 // M (để trống)
    "Người lấy job",                             // N (Nguyễn Tiến Đạt)
    "Email nộp job trực tiếp",                   // O
    "Column P",                                  // P = Apply Method
    "Min 60k/Min 120k",                          // Q
    "Gộp và chuẩn hóa company name và title job",// R = TRUE/FALSE unique
    "Check trùng lặp"                            // S
  ];

  const rows = allJobs.map(job => {
    const cleanTitle = (job.title || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    const cleanComp = (job.company || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    const formattedTitle = formattedCompanyTitle(cleanComp, cleanTitle);
    const salary = normalizeSheetSalary(job.salary);
    const location = normalizeSheetLocation(job.location);
    const level = classifyJobLevel(cleanTitle);
    const salaryClass = classifySalary(job.salary);
    const applyMethod = normalizeApplyMethod(job.applyMethod);

    const translateFormula =
      '=IFERROR(GOOGLETRANSLATE(INDEX(D:D,ROW()),"en","vi"),"")';

    const uniqueFormula =
      '=COUNTIF(E:E,INDEX(E:E,ROW()))=1';

    return [
      "",                    // A - Column A
      job.link || "",        // B
      cleanComp,             // C
      cleanTitle,            // D
      formattedTitle,        // E
      translateFormula,      // F
      salary,                // G
      location,              // H
      "Job Bank",            // I
      today,                 // J
      "",                    // K - Status
      level,                 // L
      "",                    // M - Người nộp (BẮT BUỘC ĐỂ TRỐNG "")
      currentCrawler,        // N - Người lấy job (Nguyễn Tiến Đạt)
      "",                    // O - Email nộp job trực tiếp (để trống "")
      applyMethod,           // P - Apply Method (Apply Now / Apply on Company Site)
      salaryClass,           // Q - Min 60k / Min 120k
      uniqueFormula,         // R - TRUE/FALSE trong Google Sheets
      ""                     // S - Check trùng lặp
    ];
  });

  const csvContent = [
    headers.map(csvValue).join(","),
    ...rows.map(row => row.map(csvValue).join(","))
  ].join("\r\n");

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const sourceText = filenameTag || (batchKeywords.length > 1 && hasExported
    ? "all_keywords"
    : (currentSearchKeyword || "jobbank"));
  const keywordText = sourceText
    .replace(/[\\/:*?"<>|\x00]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/,+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 60);

  const filename = `${allJobs.length}_jobs_${keywordText || "jobbank"}_SHEET_READY.csv`;
  chrome.runtime.sendMessage({ action: "saveToCSV", url, filename, saveAs: !autoDownload });

  updateStatus(
    `Đã tạo Sheet Ready: ${allJobs.length} jobs | Người lấy job: ${currentCrawler} | P=Apply Method.`
  );
}

function exportCSV() {
  log("Bắt đầu xuất file CSV thô với", allJobs.length, "job");
  const headers = ["CompanyName", "Job Title", "Link", "Salary", "Location", "Apply Method", "Email", "Date", "Page", "Applicant Name", "Crawler Name"];
  const currentApplicant = applicantName || "";
  const currentCrawler = crawlerName || DEFAULT_CRAWLER_NAME;
  const rows = allJobs.map(j =>
    [j.company, j.title, j.link, j.salary, j.location, normalizeApplyMethod(j.applyMethod), j.email || "", j.date || "", j.page, currentApplicant, currentCrawler].map(v => {
      const val = (typeof v === "string" || typeof v === "number") ? v.toString() : "";
      const clean = val.replace(/[\r\n]+/g, " ").trim();
      return `"${clean.replace(/"/g, '""')}"`;
    }).join(",")
  );

  const csvContent = [headers.join(","), ...rows].join("\r\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const filename = `${allJobs.length}_jobs_jobbank_raw.csv`;
  chrome.runtime.sendMessage({ action: "saveToCSV", url, filename, saveAs: true });
}

// Tự động đóng các popup cảnh báo địa lý (ngoài Canada) hoặc thông báo của Job Bank
function autoDismissPopups() {
  const closeSelectors = [
    "button.popup-modal-dismiss",
    ".popup-modal-dismiss",
    ".mfp-close",
    "button.cancel",
    "#popup-modal-dismiss",
    "button[class*='modal-dismiss']"
  ];
  for (const sel of closeSelectors) {
    const btn = document.querySelector(sel);
    if (btn && btn.offsetParent !== null) {
      try {
        btn.click();
        log("Đã tự động đóng popup cảnh báo Job Bank.");
      } catch {}
    }
  }
}

// Khởi tạo extension
function initialize() {
  createPanel();
  autoDismissPopups();
  setInterval(autoDismissPopups, 1000);

  chrome.storage.local.get([
    "allJobs", "currentPage", "isCrawling", "maxPages", "pendingJob", "resumeFromIndex",
    "filterKeywords", "filterLocations", "batchRunning", "batchKeywords", "batchKeywordIndex", "batchLocationIndex",
    "currentSearchKeyword", "currentSearchLocation", "autoKeywordText", "autoStartRequested", "hasExported",
    "applicantName", "crawlerName"
  ], (data) => {
    if (data.allJobs) {
      allJobs = data.allJobs;
      rebuildTable();
    }
    if (data.currentPage) currentPage = data.currentPage;
    maxPages = 0; // 0 = Không giới hạn trang, quét hết tin 3 ngày
    if (data.applicantName !== undefined) {
      applicantName = data.applicantName;
      const el = document.getElementById("applicant-name-input");
      if (el) el.value = applicantName;
    }
    if (data.crawlerName) {
      crawlerName = data.crawlerName;
      const el = document.getElementById("crawler-name-input");
      if (el) el.value = crawlerName;
    }
    if (data.batchKeywords) batchKeywords = data.batchKeywords;
    if (data.batchKeywordIndex !== undefined) batchKeywordIndex = data.batchKeywordIndex;
    if (data.batchLocationIndex !== undefined) batchLocationIndex = data.batchLocationIndex;
    if (data.currentSearchKeyword) currentSearchKeyword = data.currentSearchKeyword;
    if (data.currentSearchLocation) currentSearchLocation = data.currentSearchLocation;
    if (data.autoKeywordText) {
      autoKeywordText = data.autoKeywordText;
      const el = document.getElementById("auto-keywords-input");
      if (el) el.value = autoKeywordText;
    }
    if (data.batchRunning !== undefined) batchRunning = data.batchRunning;
    if (data.isCrawling !== undefined) isCrawling = data.isCrawling;
    if (data.hasExported !== undefined) hasExported = data.hasExported;

    updateButtonStates();
    updateBatchProgressUI();

    if (data.autoStartRequested) {
      chrome.storage.local.remove("autoStartRequested");
      startAutoBatch();
      return;
    }

    if (batchRunning && isCrawling) {
      updateStatus(`Tiếp tục AUTO A→Z: "${currentSearchKeyword}" @ ${currentSearchLocation?.name || ""}`);
      crawlPage(data.resumeFromIndex || 0);
    } else if (isCrawling) {
      updateStatus("Tiếp tục crawl trang...");
      crawlPage(data.resumeFromIndex || 0);
    }
  });
}

// Khởi chạy khi DOM sẵn sàng
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
