# Job Bank Job Crawler AUTO A→Z v4.1 — Vancouver Area (3 Days)

Extension Chrome tự động crawl, trích xuất, chuẩn hóa và xuất dữ liệu tin tuyển dụng trên **Job Bank Canada** (`jobbank.gc.ca` - Cổng thông tin việc làm chính thức của Chính phủ Canada) theo chuẩn Google Sheets, áp dụng chính xác 100% logic nghiệp vụ quy định.

---

## 1. 18 Từ Khóa Mục Tiêu (Target Keywords)
Crawler tự động duyệt tuần tự qua 18 từ khóa mục tiêu:
1. `analytics`
2. `artificial_intelligence`
3. `data`
4. `data scientist`
5. `finance`
6. `financial analyst`
7. `investment`
8. `investment management`
9. `machine learning`
10. `systems analyst`
11. `technology manager`
12. `President`
13. `CEO (Chief Executive Officer)`
14. `CIO (Chief Information Officer)`
15. `CTO (Chief Technology Officer)`
16. `CIO (Chief investment officer)`
17. `CSO (Chief Science Officer)`
18. `Chief AI officer (Chief Artificial Intelligence Officer)`

---

## 2. Tư Duy Thu Thập & Bộ Lọc Loại Trừ (Negative Keywords Blacklist)
- **Tư duy thu thập**: Khi tìm kiếm một từ khóa trên Job Bank, toàn bộ các công việc liên quan mà Job Bank trả về đều được chấp nhận (ví dụ tìm `investment` trả về `trading`, `finance`, `business development`, `portfolio`... đều phù hợp).
- **Bộ lọc loại trừ trên Job Title**: Nếu Tiêu đề công việc chứa bất kỳ từ khóa cấm nào sau đây thì **BỎ QUA NGAY LẬP TỨC**:
  > `compliance`, `clinic`, `dental`, `attorney`, `medical`, `people`, `health`, `counsel`, `fire`, `sale`, `sales`, `tax`, `accountant`, `accounting`, `pharma`, `construction`, `nurse`, `care`, `caregiver`, `designer`, `building`, `maintenance`, `interior`, `design`, `warehouse`, `social`, `media`, `lawyer`, `biologist`, `contracts`, `chemist`, `agronomist`, `facilities`, `underwri`, `photograph`, `plumber`, `electrician`, `mechanic`, `truck`, `therapy`, `accoutics`, `acoustics`, `head chef`, `chef`, `ethics`, `intern`, `internship`, `tunnel`, `co-op`, `coop`, `landscape`, `carpenter`, `terrestria`, `landscape architect`.
- **An toàn từ ngữ (Word-boundary regex)**: Áp dụng cơ chế regex ranh giới từ độc lập `(^|[^a-z0-9])term([^a-z0-9]|$)` để không bao giờ loại nhầm các chức danh hợp lệ (ví dụ: `media` không loại nhầm `Intermediate Data Analyst`; `care` không loại nhầm `Career Development`; `tax` không loại nhầm `Syntax Developer`).
- **6 Vị trí lãnh đạo cấp cao (`President`, `CEO`, `CIO`, `CTO`, `CSO`, `Chief AI Officer`)**: Bắt buộc Job Title phải mang chức danh lãnh đạo tương ứng; tự động loại bỏ `Vice President` / `VP` cũng như `Assistant to` khi tìm kiếm `President`.

---

## 3. Khu Vực & Thời Gian Đăng Tuyển
- **4 Khu vực mục tiêu (Metro Vancouver, BC, Canada)**:
  1. `Vancouver, BC` (Municipal ID: `mid=39070`)
  2. `Burnaby, BC` (Municipal ID: `mid=22327`)
  3. `North Vancouver, BC` (Municipal ID: `mid=39069`)
  4. `West Vancouver, BC` (Municipal ID: `mid=50333`)
- **Strict Location Filter**: Chỉ giữ các job thuộc 4 khu vực trên; loại bỏ nghiêm ngặt các thành phố lân cận ngoài danh mục (`Richmond`, `Surrey`, `Delta`, `Langley`, `Coquitlam`, `Maple Ridge`...) và loại bỏ `Vancouver, WA` (Mỹ) cũng như các tỉnh bang ngoài BC.
- **Thời gian**: Chỉ quét tin đăng trong vòng **3 ngày gần nhất** (`fage=3`, `sort=D`). Tự động dừng sớm lượt quét khi gặp tin cũ hơn 3 ngày.

---

## 4. Bộ Lọc Mức Lương (Salary Filtering)
- **Không lương thì không loại**: Các job không công bố lương, để trống hoặc ghi `N/A`, `to be determined` đều được **giữ lại (không loại)**.
- **Có lương thì xét điều kiện**: Nếu tin đăng có công bố số tiền cụ thể thì bắt buộc phải đạt chuẩn:
- **Ngưỡng lương tối thiểu**:
  - Lương năm: Tối thiểu **$60,000 CAD/năm**
  - Lương giờ: Tối thiểu **$30.00 CAD/giờ**
  - Quy đổi tháng $\ge \$5,000$ CAD/tháng, tuần $\ge \$1,154$ CAD/tuần.
  - Tính trên mức khởi điểm (min) của dải lương: nếu mức min dưới ngưỡng thì tự động loại bỏ.

---

## 5. Thông Tin Người Nộp & Người Lấy Job
- **Người nộp (Column M)**: **BẮT BUỘC ĐỂ TRỐNG** (`""`).
- **Người lấy job (Column N)**: **`Nguyễn Tiến Đạt`** (mặc định).

---

## 6. Cấu Trúc Xuất CSV Chuẩn Google Sheets (19 Cột A → S)
File CSV xuất ra mã hóa **UTF-8 with BOM** (`\uFEFF`), sẵn sàng mở và dán trực tiếp vào Google Sheets:

| Cột | Tên Cột | Quy Tắc & Định Dạng |
|:---:|:---|:---|
| **A** | `Column A` | Cột trống định dạng (`""`) |
| **B** | `Link job` | Đường dẫn trực tiếp tới tin tuyển dụng trên Job Bank (`https://www.jobbank.gc.ca/jobsearch/jobposting/...`) |
| **C** | `Company name` | Tên công ty / nhà tuyển dụng |
| **D** | `Title job` | Chức danh công việc gốc |
| **E** | `Formatted_Title job` | `Company - Title` (ví dụ: `Google Canada - Senior Data Engineer`) |
| **F** | `Translate title` | Công thức Google Sheets: `=IFERROR(GOOGLETRANSLATE(INDEX(D:D,ROW()),"en","vi"),"")` |
| **G** | `Salary` | Mức lương chuẩn hóa có số tiền cụ thể |
| **H** | `Location` | Địa điểm (Vancouver, BC / Burnaby, BC / North Vancouver, BC / West Vancouver, BC / Remote) |
| **I** | `Jobboard` | `"Job Bank"` |
| **J** | `Date` | Ngày xuất file định dạng **`MM/DD/YYYY`** |
| **K** | `Status` | Cột trống (`""`) |
| **L** | `Phân loại job` | Cấp bậc chuẩn 3 nhóm: `Chief/President level`, `Manager`, `Dưới Manager` |
| **M** | `Người nộp` | **BẮT BUỘC ĐỂ TRỐNG** (`""`) |
| **N** | `Người lấy job` | `"Nguyễn Tiến Đạt"` |
| **O** | `Email nộp job trực tiếp` | Để trống (`""`) |
| **P** | `Column P` | Hình thức nộp: `Apply Now` hoặc `Apply on Company Site` |
| **Q** | `Min 60k/Min 120k` | Phân loại lương (`Min 60k` hoặc `Min 120k`) |
| **R** | `Gộp và chuẩn hóa company name và title job` | Công thức chống trùng: `=COUNTIF(E:E,INDEX(E:E,ROW()))=1` |
| **S** | `Check trùng lặp` | Cột trống (`""`) |

---

## 7. Hướng Dẫn Cài Đặt & Sử Dụng

### Bước 1: Cài đặt tiện ích vào trình duyệt
1. Mở Chrome/Edge và truy cập: `chrome://extensions/`
2. Bật chế độ nhà phát triển (**Developer mode**).
3. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục: `d:\Desktop\QT_DATA\JobBank-Job-Crawler-AUTO-AZ-v4-VANCOUVER-3DAYS`.

### Bước 2: Khởi chạy
1. Truy cập trang tìm kiếm Job Bank Canada: `https://www.jobbank.gc.ca/jobsearch/jobsearch`
2. Bảng điều khiển màu tím sẽ xuất hiện ở góc dưới bên phải màn hình.
3. Bấm nút **`🚀 Chạy AUTO A→Z`**.
4. Tiện ích sẽ tự động duyệt toàn bộ 18 từ khóa $\times$ 4 khu vực và xuất file CSV Google Sheets hoàn chỉnh.

### Bước 3: Kiểm thử tự động (Verification Test)
Chạy lệnh kiểm thử độc lập:
```powershell
node d:\Desktop\QT_DATA\JobBank-Job-Crawler-AUTO-AZ-v4-VANCOUVER-3DAYS\verify_crawler.js
```
Kết quả kiểm thử: **151/151 tests PASS (100%)**.
