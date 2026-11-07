# Tuan Anh Store — V37 Advanced License Generator + Lua Studio V36

## V37 — Advanced License Generator + Activity Audit

- Hộp tạo key nâng cao theo ảnh tham chiếu: live preview, ứng dụng, số lượng, thời hạn nhanh, prefix, độ dài, random, level, ghi chú và khóa một thiết bị.
- Sinh theo lô tối đa 500 key; server tự sinh mã duy nhất. Mã được copy vào clipboard sau khi tạo.
- Thời hạn của key mới bắt đầu khi kích hoạt hợp lệ đầu tiên. Key gắn ứng dụng cần gửi đúng trường `application` khi gọi API verify.
- Nhật ký Admin ghi tạo/sinh hàng loạt, copy, chỉnh sửa, ban/mở ban, xóa và gỡ thiết bị; nhật ký không lưu nguyên mã key.

## V36 — Thiết kế GUI Roblox Studio + Source Inspector + Static Decode

Lua Studio đã được thay mới thành workspace ba khu vực, giữ phong cách menu tối/đen và điểm nhấn hồng từ GUI tham chiếu Tuấn Anh Store. Đây là phiên bản thiết kế lại; không còn dùng cơ chế MAKE cũ để chèn hoặc thay thân hàm trong source tải lên.

### 1. Thiết kế GUI (live preview)

- Xem menu mẫu theo bố cục sidebar, logo, tên menu, dòng phụ, version, profile, tab và danh sách control.
- Đổi tên file, tiêu đề menu, mô tả, version, tên/role hiển thị, kích thước cửa sổ, màu nhấn và màu nền; preview cập nhật khi chỉnh sửa.
- Thêm, đổi tên, xóa tối đa 12 tab; thêm tối đa 80 control Button, Toggle hoặc Slider và chọn tab chứa control.
- Bản preview cho phép thử toggle, button và slider để kiểm tra giao diện. Các control trong file xuất là UI-only mặc định; chúng không thay đổi gameplay và không tự gọi handler trong source.
- File MAKE là LocalScript GUI độc lập cho Roblox Studio, dùng `ScreenGui`, `Frame`, `TextLabel`, `ImageLabel`, `TextButton`, `TextBox`, `ScrollingFrame` và các layout object tiêu chuẩn. Đặt trong `StarterPlayerScripts` hoặc `StarterGui`.

### 2. Gắn ảnh Roblox

- Có thể chọn ảnh từ máy để xem trước hoặc nhập HTTPS URL để preview. URL/ảnh cục bộ không tự biến thành Roblox asset.
- Để ảnh xuất hiện trong LocalScript, phải upload ảnh qua Roblox Open Cloud (Admin session + API Key + Creator Type + Creator ID) hoặc nhập một Roblox Asset ID hợp lệ. Build sẽ báo lỗi nếu mới có ảnh preview mà chưa có Asset ID, tránh xuất file thiếu logo.
- Upload vẫn dùng endpoint Admin hiện có `/api/admin/roblox/assets`; API Key chỉ được gửi trong request upload và ô key được xóa sau khi thử upload. Roblox vẫn quyết định moderation và quyền sử dụng asset.
- Giới hạn tối ưu ảnh vẫn theo Roblox: file upload không quá 20 MB và mỗi chiều nhỏ hơn 8000 px.

### 3. Source Inspector

- Tải hoặc dán `.lua` / `.txt` tối đa 5 MB để đọc, chỉnh sửa và xem số ký tự/dòng.
- Source chỉ được giữ trong trình duyệt để xem và phân tích tĩnh. Nút Build tạo GUI từ Designer, không ghép code nguồn vào output và không thực thi source.
- Các đoạn executor, hook, anti-cheat bypass hoặc chức năng can thiệp người chơi trong file tham chiếu không được đưa vào LocalScript mới.

### 4. Decode (static only)

- Hỗ trợ một số lớp literal phổ biến: `string.char(...)` với byte in được, `string.reverse("...")`, `("..."):reverse()`, Lua decimal/hex escapes và Base64 literal truyền trực tiếp cho `loadstring` / `load`.
- Không chạy `loadstring`, không gọi HTTP, không thực thi payload và không tải code từ máy chủ. Báo cáo sẽ liệt kê phép biến đổi tĩnh và cảnh báo dấu hiệu code động/quyền truy cập nhạy cảm.
- Không thể khôi phục source gốc một cách bảo đảm từ Luau bytecode, VM obfuscator, mã hóa khóa riêng, payload phụ thuộc server hoặc thuật toán có trạng thái. Kết quả là bản phân tích/giải lớp được hỗ trợ, không cam kết tương đương source ban đầu.

### Dùng Lua Studio V36

1. Chạy `start.bat`, đăng nhập Admin và mở **Lua Studio V36**.
2. Trong **Thiết kế GUI**, chỉnh tên menu, màu, kích thước, tab và control; theo dõi preview ngay bên cạnh.
3. Muốn có logo trong file xuất, upload ảnh Roblox hoặc nhập Asset ID. Ảnh URL chỉ dùng xem trước cho tới khi có Asset ID.
4. Bấm **BUILD GUI LUA SCRIPT**, sau đó sao chép hoặc tải file `.lua`. Trong ZIP có sẵn file tham khảo `samples/TuanAnhStore-GUI-Sample.lua`.
5. Dùng **Source** để đọc source hiện có; dùng **Decode** để thử các phép biến đổi tĩnh có hỗ trợ.

**Phiên bản backend:** `public-web-v37-advanced-license-generator`; `start.bat` kiểm tra đúng định danh này trước khi báo server sẵn sàng.

---

# Tuan Anh Store — V32 Lua Preview & Image Fix + V29 Red/Black + Lua Menu Designer

## V32 — Lua Preview & Image Fix

- Làm lớn bản xem trước menu Lua, hiển thị toàn bộ danh sách chức năng được bật với số thứ tự và loại điều khiển.
- Phân tích khai báo hàm có thụt dòng, hàm `local`, hàm gán bằng `function`; bỏ qua function giả trong comment/chuỗi.
- Đọc MIME theo chữ ký file thật để xử lý ảnh Windows/provider trả MIME rỗng hoặc sai; hỗ trợ PNG, JPG, WebP, GIF, BMP và AVIF nếu trình duyệt giải mã được.
- Dùng `createImageBitmap` trước, fallback sang data URL; ảnh tải lên hiển thị ở preview và được nhúng Base64 trong output Lua.
- Xác định `return` ở cấp chunk thay vì nhầm các `return` bên trong function là top-level, tránh bỏ mất khối đăng ký menu tự động.

## Sửa lỗi khởi động V32

- Watchdog khởi chạy Node bằng .NET ProcessStartInfo, truyền rõ `TA_STORE_PORT`, `TA_STORE_HOST` và tunnel origin; không phụ thuộc việc biến môi trường có được kế thừa qua nhiều lớp `start`/PowerShell hay không.
- Đối số `server.js` được truyền đúng kể cả khi thư mục cài đặt có dấu cách hoặc ký tự Unicode.
- Ghi riêng stdout và stderr của Node vào `.runtime/server.out.log` và `.runtime/server.err.log`; launcher hiển thị cả hai cùng thông tin `netstat` nếu API không sẵn sàng.
- Watchdog ghi PID/command line và dừng sau 6 lần khởi động lỗi liên tiếp thay vì lặp vô hạn không có hướng dẫn.
- Health API đổi thành `public-web-v32-lua-preview-image-fix`; launcher chỉ mở trang khi cả health và trang chủ đã xác minh thành công.
- Sửa lỗi PowerShell dùng nhầm biến hệ thống `$HOME` (không cho ghi đè) trong kiểm tra trang chủ; đây là nguyên nhân làm launcher chờ mãi dù Node đã mở cổng. Dùng tên biến `$homeHtml` riêng.
- Health check loopback bỏ qua HTTP proxy của Windows để tránh cấu hình proxy hệ thống làm sai kết quả kiểm tra `127.0.0.1`.
- Node ghi rõ `STARTUP OK` hoặc `SERVER LISTEN ERROR` (bao gồm `EADDRINUSE`) để chẩn đoán cổng bị chiếm.


## Hai loại link chia sẻ trong trang Admin

- **Link tạm thời (Quick Tunnel):** dùng `♥ Tạo link tạm thời`. Server tạo URL `https://<random>.trycloudflare.com`, tự kiểm tra `/api/health` từ HTTPS công khai rồi mới bật nút sao chép. Link này thay đổi khi tạo lại và chỉ hoạt động khi máy/VPS đang chạy website và tiến trình Quick Tunnel còn sống. Có thể ngắt bằng nút **Ngắt link**.
- **Tên miền cố định (24/7):** nhập hostname thuộc domain bạn sở hữu, lưu API Token Cloudflare một lần, rồi bấm **Lưu tên miền**. Cloudflare DNS + Named Tunnel sẽ được cấu hình theo token. Muốn tắt máy cá nhân mà web vẫn online, phải chạy Docker Compose trên VPS luôn bật; không có cách biến Quick Tunnel trên PC tắt thành dịch vụ 24/7.

Quick Tunnel và Named Tunnel dùng trạng thái/tiến trình tách biệt; tạo link tạm thời không dừng tunnel tên miền.

### Sửa lỗi V30

- Launcher chỉ tái sử dụng Node server khi PID thuộc tiến trình của thư mục này, phiên bản API đúng `public-web-v30-root-route-fix` và trang `/` trả HTTP 200 có đúng tiêu đề website.
- Nếu cổng đang bị server V28/V29 cũ chiếm, launcher bỏ qua tiến trình cũ và chọn cổng khác thay vì mở nhầm server trả `Not found`.
- Kiểm tra khởi động xác minh cả `/api/health` và trang chủ `/`; mở `/` hoặc `/index.html` đều phục vụ `index.html`.
- Đổi cache-buster CSS/JS để trình duyệt tải mã V30 mới.

### Nâng cấp V29

- Lua Studio nhận ảnh PNG/JPG/WebP dung lượng tối đa 20 MB (50 megapixel), kiểm tra định dạng và kích thước ảnh trước khi đọc vào bộ nhớ. Ảnh được nhúng Base64 trực tiếp trong file Lua; dung lượng sau make tăng khoảng 33%.
- Giới hạn source Lua tăng lên 5 MB; file sau make hỗ trợ tối đa 40 MB. Khi output lớn, vùng xem trước được rút gọn để tránh treo trình duyệt; nút Sao chép full và Tải file vẫn dùng toàn bộ nội dung.
- Hiển thị tên ảnh, dung lượng và độ phân giải; có nút xóa ảnh đã chọn. Việc xử lý ảnh vẫn chạy cục bộ trên trình duyệt, ảnh không được upload lên server.
- Khi tải/dán mã Lua, Studio tự dò tối đa 80 hàm có tên dạng `function name(...)`, `local function name(...)` và `name = function(...)`, kể cả khi có thụt dòng; parser bỏ qua phần comment/chuỗi để hạn chế nhận nhầm. Hàm phát hiện được đưa vào editor để đổi tên hiển thị, chỉnh tên hàm liên kết, chọn nút bấm/bật-tắt, ẩn hoặc xóa; có thể thêm mục thủ công.
- Bản xem trước GUI cập nhật theo danh sách action. Khi MAKE, output chứa menu descriptor và adapter `__TA_STORE_BUILD_MENU(ui, handlers)` với `addButton`/`addToggle`. Nếu runtime cung cấp global `TA_STORE_UI` thì đoạn đăng ký tự dựng menu; bạn cần nối adapter với UI framework cụ thể vì mỗi framework Lua có API khác nhau.
- Công cụ không thực thi script tải lên. Nếu source có câu lệnh `return`, bộ tạo giữ nguyên cấu trúc chunk và bỏ phần tự đăng ký ở cuối để tránh lỗi cú pháp; gọi builder thủ công sau khi tích hợp UI adapter.
- Health API version đổi thành `public-web-v30-root-route-fix`.

### Nâng cấp V27

- Thêm mục **Hoạt động** chỉ Admin nhìn thấy. Backend ghi nhật ký đăng nhập/đăng xuất, khởi động server, tạo/sửa/ban/mở ban/xóa key, gỡ thiết bị, cấu hình API và thao tác tạo/ngắt/cấu hình link chia sẻ.
- Nhật ký lưu riêng trong `data/activity.json`, giới hạn 500 sự kiện gần nhất; các API `GET/POST/DELETE /api/admin/activity` yêu cầu session Admin. Ngoài thao tác server như đăng nhập, quản lý key, cấu hình API và link chia sẻ, nhật ký còn ghi các trang Admin đã mở và thao tác Lua Studio: tải/chỉnh sửa/make/tải xuống script. Chỉ lưu tên file và số ký tự, không gửi/lưu nội dung mã nguồn, mật khẩu, Cloudflare API Token hoặc toàn bộ License Key.
- Thêm mục **Lua Studio** chỉ Admin nhìn thấy: tải `.lua`/`.txt` tối đa 5 MB, chỉnh source, đổi tên file, tên menu, mô tả, thêm URL ảnh HTTPS hoặc upload PNG/JPG/WebP tối đa 20 MB (50 megapixel), xem trước và tải file `.lua` đã make tối đa 40 MB.
- Lua Studio chỉ xử lý văn bản trong trình duyệt, không thực thi script được tải lên. Phần menu được thêm dưới dạng UI adapter trung lập, không chèn executor API, exploit hoặc bypass; UI framework tích hợp cần cung cấp adapter `createWindow`; `addImage` và `addLabel` được gọi nếu có hỗ trợ.
- Bộ tạo giữ nguyên dòng shebang và source gốc; khối menu được đặt trước source, phần đăng ký handler chỉ được thêm khi source không có `return`. Khối make cũ được thay thế khi make lại để tránh nhân đôi.
- Health API version đổi thành `public-web-v27-activity-lua`.

### Nâng cấp V26

- Đồng bộ `TA_STORE_PORT` từ launcher Windows vào API server để server, trình duyệt và Quick Tunnel luôn dùng cùng cổng khi cổng 3000 bận.
- `stop.bat` dừng cả Quick Tunnel được tạo trong Admin (worker + cloudflared child), xóa URL tạm thời và không đụng nhầm Named Tunnel ngoài tiến trình dừng chuẩn.
1. Đã thay logo header, favicon và ảnh hero bằng artwork anime đỏ/đen do chủ website cung cấp.
2. Giao diện nền đỏ-đen, kính mờ tối, viền/ánh sáng đỏ và 22 trái tim rơi chậm. Có hỗ trợ `prefers-reduced-motion`.
3. Thêm API Admin-only cho tạo, kiểm tra, sao chép và ngắt Quick Tunnel tạm thời.
4. Docker app image có binary `cloudflared` để tạo Quick Tunnel từ Admin trên VPS; Named Tunnel cố định vẫn chạy ở service `cloudflared` riêng.
5. Version health API đổi thành `public-web-v26`.

---

# TUAN ANH STORE — V24 Auto Domain + Auto Tunnel + Public Access

## Tạo link tên miền tự động ngay trong website (V24)

V24 rút phần cấu hình Cloudflare xuống **một API Token duy nhất**. Sau khi kết nối một lần, Admin chỉ cần nhập hostname, ví dụ `store.tuananhstore.com`, rồi bấm **Lưu tên miền**. Backend sẽ tự:

1. Dò domain gốc trong Cloudflare Zones từ hostname (không cần nhập Zone ID hoặc Account ID).
2. Tự tìm Named Tunnel `tuan-anh-store-public`; nếu chưa có thì tạo remotely-managed Tunnel mới.
3. Tự lấy Tunnel Token và lưu vào file riêng trên server; không gửi token về trình duyệt.
4. Tạo/cập nhật Published Application route trỏ tới `http://app:3000`.
5. Tạo/cập nhật CNAME `hostname -> <TUNNEL_ID>.cfargotunnel.com` với proxy Cloudflare.
6. Kiểm tra URL HTTPS công khai `/api/health`; chỉ mở nút sao chép sau khi xác nhận đúng website Tuấn Anh Store.

API Token chỉ được gửi tới backend qua phiên Admin, được xác minh với Cloudflare và lưu riêng trên server với quyền file hạn chế. Website không trả lại token trong API response. Hệ thống không tự xóa các bản ghi A/AAAA/MX/TXT hoặc CNAME xung đột.

### Điều kiện bắt buộc

- Bạn phải sở hữu tên miền; thêm domain vào Cloudflare và đổi nameserver để Zone có trạng thái `Active`.
- Bạn cần tạo **một Cloudflare API Token** một lần. Ứng dụng không thể tự đăng nhập Cloudflare hoặc tự cấp quyền cho chính nó.
- Để hoạt động khi tắt máy cá nhân, website và Tunnel phải chạy trên VPS/hosting luôn bật. Docker Compose bên dưới tự chờ token, khởi động `cloudflared` và đặt `restart: unless-stopped`.
- Không có cách nào đảm bảo uptime tuyệt đối 100%; VPS, domain, mạng và tài khoản Cloudflare vẫn phải hoạt động.

### Thiết lập một lần

1. Trong Cloudflare Dashboard, thêm tên miền của bạn và hoàn tất nameserver setup đến khi Zone là `Active`.
2. Mở **My Profile → API Tokens → Create Token → Create Custom Token**.
3. Cấp các quyền tối thiểu và giới hạn vào đúng domain/account:
   - `Zone → Zone → Read` (để tự tìm zone và Account ID).
   - `Zone → DNS → Read` và `Zone → DNS → Write` (một số màn hình có thể ghi Edit; để đọc và tạo/cập nhật CNAME).
   - `Account → Cloudflare Tunnel → Read` và `Account → Cloudflare Tunnel → Write` (quyền ghi cần để tạo Tunnel, cấu hình route và lấy Tunnel Token; một số màn hình cũ có thể ghi Edit).
4. Trên VPS Linux đã cài Docker Engine + Docker Compose plugin, giải nén V24:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Đặt `TA_STORE_ADMIN_PASSWORD` thành mật khẩu mạnh tối thiểu 16 ký tự. Không cần nhập Zone ID, Account ID, Tunnel ID hoặc Tunnel Token. `CLOUDFLARE_API_TOKEN` có thể để trống vì bạn sẽ lưu token trong Admin. Nếu muốn, có thể đặt đúng một API Token ở biến này thay vì dán trong giao diện.
5. Khởi động website và các container:
   ```bash
   mkdir -p persist/data
   sudo chown -R 1000:1000 persist
   sudo systemctl enable --now docker
   docker compose up -d --build
   docker compose ps
   ```
6. Cổng bootstrap Admin mặc định chỉ bind vào `127.0.0.1:3000`, không công khai ra Internet. Từ Windows PowerShell trên máy bạn, mở SSH port-forward (giữ cửa sổ này chạy):
   ```powershell
   ssh -L 3000:127.0.0.1:3000 YOUR_VPS_USER@YOUR_VPS_IP
   ```
   Sau đó mở `http://127.0.0.1:3000` trên máy bạn, đăng nhập Admin và cấu hình Cloudflare. Bạn có thể đổi `TA_STORE_LOOPBACK_PORT` nếu cổng 3000 đã được dùng trên VPS.
7. Mở website, đăng nhập Admin → **Chia sẻ website** → mở phần **Kết nối Cloudflare một lần**. Dán API Token rồi bấm **Lưu token an toàn**. Website xác minh và lưu token riêng trên máy chủ.
8. Nhập hostname thuộc domain bạn sở hữu, ví dụ `store.tuananhstore.com`, rồi bấm **Lưu tên miền**. V24 tự tìm zone, tạo/tái sử dụng Tunnel, lấy Tunnel Token, cấu hình route và DNS. Container `cloudflared` dùng image hỗ trợ shell do source build từ binary chính thức của Cloudflare; nó tự chờ token file rồi chạy Named Tunnel.
9. Khi DNS/HTTPS lan truyền và `/api/health` trả đúng phiên bản website, nút **Sao chép link** sẽ bật. Theo dõi log bằng `docker compose logs -f app cloudflared`.

### Quyền API Token và bảo mật

- Dùng API Token riêng, không dùng Global API Key; giới hạn tài nguyên vào đúng zone/account.
- Dán API Token trong trang Admin qua HTTPS; khi cấu hình lần đầu trên VPS, có thể mở trang Admin qua `localhost` được chuyển tiếp bằng SSH (lưu lượng đã được SSH mã hóa). Không dán token qua HTTP công khai, không gửi token qua chat hoặc đưa `.env`/file token lên GitHub.
- Token được lưu tại `persist/data/cloudflare-api-token` với quyền hạn chế; Tunnel Token tại Docker named volume `tunnel_runtime` và chỉ được mount cho app/cloudflared.
- Nếu hostname đang có A/AAAA/MX/TXT hoặc CNAME trỏ tới dịch vụ khác, website báo xung đột và không tự xóa/ghi đè record đó.
- Nếu token thiếu quyền, Cloudflare API sẽ báo lỗi cụ thể. Kiểm tra các quyền Zone Read, DNS Read/Write và Cloudflare Tunnel Read/Write (tên hiển thị có thể khác nhẹ theo giao diện Cloudflare).

### Chạy 24/7

- Dùng VPS/hosting luôn bật và chạy `docker compose up -d`. App, Tunnel đều có `restart: unless-stopped`; container Tunnel chờ Admin tạo token rồi tự kết nối. Cổng quản trị bootstrap chỉ bind `127.0.0.1`; truy cập qua SSH port-forward, không mở cổng 3000 công khai.
- Tắt máy tính cá nhân không ảnh hưởng khi VPS vẫn hoạt động. Nếu chạy bằng `start.bat` trên máy Windows cá nhân, website chỉ truy cập được khi máy Windows đó bật và có Internet.
- Muốn tự khởi động sau khi VPS reboot, bật Docker bằng `sudo systemctl enable --now docker`.

## Chạy trên Windows

Trên Windows, `start.bat` vẫn phù hợp chạy website local/Quick Tunnel khi máy bật. Khi nhập API Token và domain trong Admin, V24 có thể tự tạo DNS/route và khởi chạy Named Tunnel nếu `cloudflared.exe` đã được tải. Tuy nhiên muốn website chạy khi tắt máy cá nhân, phải triển khai V24 lên VPS bằng Docker Compose.

Khi chạy trên Windows, người khác chỉ truy cập được khi chính máy Windows đó đang bật, server và tunnel còn chạy. Muốn máy cá nhân tắt nhưng website vẫn online, triển khai cùng source lên VPS bằng Docker Compose.

---
Website công khai tông xanh dương neon, có trang chủ cho mọi khách truy cập; khu Admin quản lý License Key và API được bảo vệ bằng đăng nhập. Backend Node.js có API xác thực, CORS cấu hình và lưu dữ liệu bền vững xuống `data/store.json`.

## Tạo link chia sẻ trong website (V24)

1. Khởi động bằng Docker Compose trên VPS.
2. Đăng nhập Admin, mở phần kết nối Cloudflare và lưu một API Token với quyền Zone Read, DNS Read/Write và Cloudflare Tunnel Read/Write.
3. Nhập hostname/subdomain thuộc domain của bạn rồi bấm **Lưu tên miền**.
4. Server tự tìm Zone, tạo/tái sử dụng Named Tunnel, lấy Tunnel Token, cấu hình Published Route và DNS CNAME qua Cloudflare API.
5. Chờ DNS và HTTPS lan truyền. Nút sao chép chỉ bật khi `/api/health` của hostname trả đúng website Tuấn Anh Store.

Nếu token thiếu quyền, Zone chưa Active, DNS xung đột hoặc Tunnel chưa kết nối, website hiển thị lỗi cụ thể và không tạo link giả.

## Chạy website công khai trên Internet (Windows) — Quick Tunnel tạm thời

1. Giải nén toàn bộ ZIP vào một thư mục cố định (không chạy trực tiếp bên trong file ZIP).
2. Máy có Node.js 18+ thì launcher dùng bản có sẵn. Nếu chưa có, launcher tự tải Node.js portable chính thức vào `.runtime`.
3. Chạy `start.bat`. Launcher tự chọn cổng trống trong dải `3000–3100` (ưu tiên `3000`), rồi khởi động website/API tại cổng đó.
4. Launcher tải `cloudflared` từ trang phát hành chính thức của Cloudflare nếu chưa có, kiểm tra phiên bản và kết nối Quick Tunnel qua HTTP/2. Màn hình launcher hiển thị trạng thái tải/kết nối; nếu không nhận được URL trong thời hạn chờ, tunnel tự dừng và website local vẫn tiếp tục chạy.
5. Khi tunnel sẵn sàng, launcher in URL dạng `https://ten-ngau-nhien.trycloudflare.com`, tự mở URL đó và lưu đường dẫn vào `PUBLIC_URL.txt`. Gửi URL này cho mọi người để họ vào website từ Internet. Trang chủ có mục “Chia sẻ website” tự hiển thị link mới nhất và nút sao chép. Mục này tự kiểm tra trạng thái tunnel và chỉ bật nút sao chép khi link HTTPS hợp lệ đã sẵn sàng.
6. Trang chủ được công khai cho tất cả khách. Mục Quản lý Key, API Server và Cài đặt vẫn yêu cầu đăng nhập Admin. API verify công khai không trả dữ liệu key; API quản trị vẫn yêu cầu session.
7. Đóng trình duyệt không làm website/tunnel tắt. Watchdog tự chạy lại Node.js nếu server crash. Chạy `stop.bat` để dừng cả server và tunnel.

**Lưu ý về Quick Tunnel:** URL `trycloudflare.com` là URL tạm, thay đổi khi tạo tunnel mới và ngừng hoạt động khi tiến trình `cloudflared` dừng hoặc máy tính tắt/mất mạng. Quick Tunnels phù hợp chia sẻ/thử nghiệm, không có cam kết uptime và có giới hạn 200 request đồng thời; website phải chạy trên máy chủ của boss man thì người khác mới truy cập được. Muốn domain cố định và chạy ổn định lâu dài, cần tên miền nằm trên Cloudflare và cấu hình Tunnel được quản lý trong Cloudflare Dashboard.

Nếu chỉ muốn dùng nội bộ, vẫn truy cập địa chỉ local được in trong cửa sổ launcher (cổng được chọn tự động). Không cần mở port router. Tunnel cần kết nối Internet đi ra tới Cloudflare; bản V15 ưu tiên HTTP/2, vì vậy firewall/antivirus hoặc mạng đang dùng cần cho phép outbound TCP cổng `7844`. Nếu log báo `i/o timeout` tới cổng này, cần cho phép kết nối đó hoặc thử một mạng khác; không thể sửa bằng cách đổi cổng website local.

## Tài khoản admin mặc định

- Tài khoản: `ADMIN`
- Mật khẩu: `tanhsito36`

Trang chủ mở công khai, không cần tài khoản. Khi khách bấm Quản lý Key, API Server hoặc Cài đặt, website mới hiện form đăng nhập Admin. Form để trống và người dùng phải tự nhập tài khoản `ADMIN` cùng mật khẩu `tanhsito36`; không tự điền hoặc tự khôi phục phiên khi tải trang. Mỗi lần mở lại trang, phiên cũ của trình duyệt đó sẽ được đăng xuất. Đăng nhập thành công không bị giới hạn số lần. Chỉ khi nhập sai liên tiếp 10 lần trong 1 phút mới bị tạm dừng tối đa 1 phút; đăng nhập đúng sẽ xóa bộ đếm sai. Mật khẩu được lưu dạng hash scrypt + salt trong `config.json`, không lưu mật khẩu thô.

## Chức năng

- Bộ tạo License Key nâng cao: xem trước mã, chọn ứng dụng, tạo theo lô 1–500 key, cấu hình prefix/độ dài/random, level, ghi chú đơn hàng và khóa một thiết bị (HWID/device ID).
- Key ngẫu nhiên được sinh ở server; mã trong preview chỉ là mẫu. Key tự nhập phải duy nhất, 4–80 ký tự chữ/số/dấu gạch ngang/gạch dưới.
- Ban / mở ban / xóa key; đổi tên, thời hạn và giới hạn thiết bị từng key.
- Chọn nhanh thời hạn 1 / 3 / 12 giờ, 1 / 7 / 30 ngày hoặc vĩnh viễn. Với key tạo từ giao diện nâng cao, bộ đếm bắt đầu ở lần xác thực hợp lệ đầu tiên.
- Xem thiết bị đã kích hoạt; gỡ thiết bị để giải phóng slot.
- `maxDevices = 0` nghĩa là không giới hạn số thiết bị cho key đó.
- Public endpoint `POST /api/verify` cho app/game xác thực key và device ID.
- Trang API có nút kiểm tra health thật, form gửi request verify thật và hiển thị HTTP/JSON response.
- Có cấu hình CORS theo origin; có thể bind `0.0.0.0` để thiết bị khác trong LAN gọi API.
- Khi đổi bind sang LAN, server tự restart (khi chạy qua launcher watchdog) để áp dụng.
- Trang chủ công khai; khách chỉ xem được trang chủ và số liệu thống kê tổng hợp. Các màn hình Quản lý Key, API Server, Cài đặt và toàn bộ API quản trị đều yêu cầu đăng nhập. Danh sách key và mã key không được công khai.
- Admin API dùng session cookie HttpOnly + SameSite Strict. Mỗi lần mở/tải lại website yêu cầu tự nhập thông tin đăng nhập; không tự khôi phục phiên cũ. Đăng nhập đúng có thể lặp lại không giới hạn; chỉ các lần nhập sai liên tiếp mới bị giới hạn tạm thời 1 phút để chống dò mật khẩu.
- Lưu dữ liệu bền vững qua lần restart.

Không cần `npm install`, không cần database ngoài và không cần Python. Nếu tải Node.js portable bị firewall chặn, hãy cho phép kết nối tới `nodejs.org` hoặc cài Node.js LTS thủ công rồi chạy lại `start.bat`.

## Public API: xác thực key

`POST http://127.0.0.1:<PORT>/api/verify` (thay `<PORT>` bằng cổng launcher hiển thị)

Header: `Content-Type: application/json`

Body:

```json
{
  "key": "TAS-YOUR-KEY",
  "deviceId": "DEVICE-001",
  "application": "TA-STORE-VN"
}
```

Phản hồi thành công:

```json
{
  "ok": true,
  "status": "valid",
  "keyName": "TA-STORE-VN · TAS- #1",
  "application": "TA-STORE-VN",
  "level": 1,
  "expiresAt": "2026-11-08T07:00:00.000Z",
  "devicesUsed": 1,
  "maxDevices": 1,
  "deviceLimit": "limited"
}
```

Một số trạng thái lỗi: `invalid`, `banned`, `expired`, `device_limit`, `application_required`, `application_mismatch`, `rate_limited`.

Health check: `GET http://127.0.0.1:<PORT>/api/health` (thay `<PORT>` bằng cổng hiển thị khi khởi động).

## Dùng từ app/game khác

Gửi HTTP POST tới endpoint `/api/verify` với `key`, `deviceId` và `application` (đúng tên ứng dụng đã chọn khi tạo key). Các key cũ không gắn ứng dụng vẫn có thể xác thực chỉ bằng `key` và `deviceId`. Phản hồi thành công có thêm `level` để client xử lý quyền. Không gửi mật khẩu admin hoặc cookie quản trị vào client game.

## Cho máy khác truy cập trong mạng

Sửa `host` trong `config.json` thành `0.0.0.0`, sau đó mở port tương ứng trong firewall. Truy cập bằng IP LAN của máy chạy server, ví dụ `http://192.168.1.10:<PORT>`.

## Triển khai Internet

`start.bat` dùng Cloudflare Quick Tunnel để cấp HTTPS URL tạm, không cần domain, tài khoản Cloudflare hay mở port router. Đây là chế độ chia sẻ/thử nghiệm; URL sẽ đổi sau khi tunnel khởi động lại. Để có domain cố định và vận hành dài hạn, tạo Cloudflare Tunnel được quản lý trong Cloudflare Dashboard và gắn hostname riêng. Với lượng key/request lớn, chuyển `data/store.json` sang PostgreSQL hoặc database phù hợp; JSON storage hiện hướng đến self-host quy mô nhỏ/vừa.

## API quản trị

Các endpoint dưới đây yêu cầu đăng nhập admin:

- `GET /api/admin/me`
- `GET /api/admin/public-link/status` (trả trạng thái và URL chỉ cho Admin đã đăng nhập)
- `POST /api/admin/public-link/start`
- `POST /api/admin/logout`
- `GET /api/stats`
- `GET /api/keys`
- `POST /api/keys` (hỗ trợ `customKey` tùy chọn; mã phải duy nhất, 4–80 ký tự chữ/số/-/_)
- `PATCH /api/keys/:id`
- `DELETE /api/keys/:id`
- `POST /api/keys/:id/ban`
- `POST /api/keys/:id/unban`
- `DELETE /api/keys/:id/devices/:deviceId`


## Khắc phục Cloudflare Tunnel (V12)

- Trạng thái tunnel được ghi ở `.runtime\tunnel-status.txt`; log chi tiết ở `.runtime\cloudflared.log`.
- Tunnel ưu tiên HTTP/2 để tương thích mạng chặn UDP/QUIC.
- Nếu không tạo URL trong 120 giây sau khi bắt đầu kết nối, tiến trình tunnel tự dừng, launcher mở website local và hiển thị log thay vì treo vô thời hạn.
- Nếu download `cloudflared` thất bại, kiểm tra khả năng truy cập GitHub Releases và firewall/antivirus.

## Cập nhật bản mới

Trước khi thay file, chạy `stop.bat` trong thư mục bản cũ để dừng watchdog/server. Sao lưu thư mục `data` (đặc biệt là `data/store.json`) và `config.json` nếu có; giải nén bản ZIP mới vào thư mục riêng, chép dữ liệu cũ sang bản mới rồi chạy `start.bat`. Không ghi đè `data/store.json` bằng file mẫu trong ZIP nếu bạn đã có key đang sử dụng.


## Truy cập công khai

- Mọi người có URL `PUBLIC_URL.txt` đều xem được trang chủ qua HTTPS.
- Trang chủ chỉ nhận số liệu tổng hợp từ `GET /api/public/stats`; không trả về danh sách key hoặc thông tin thiết bị.
- Khách bấm Quản lý Key / API Server / Cài đặt sẽ được yêu cầu đăng nhập Admin.
- `POST /api/verify` là endpoint xác thực License Key công khai cho ứng dụng; endpoint quản trị vẫn khóa bằng session.
- `stop.bat` dừng cả `cloudflared` lẫn backend và xóa URL công khai đang dùng.

## Giao diện thương hiệu
- Đã thay logo đầu trang và logo trang chủ bằng logo Tuấn Anh Store do chủ dự án cung cấp.
- Chủ đề toàn trang và popup tạo key dùng xanh dương / xanh điện trên nền navy, giữ màu trạng thái xanh lá, vàng và đỏ để dễ phân biệt.
- Popup tạo key hỗ trợ thời hạn theo số ngày, ngày-giờ tùy chỉnh và key không hết hạn.
- Hai ảnh logo nằm trong `assets/` và được server cho phép phục vụ công khai.


## Kết nối API từ app/web khác

1. Đăng nhập Admin, mở mục **API Server**.
2. Dùng **Thử xác thực License Key thật** để gửi POST tới API. Khi thành công, thiết bị kiểm thử được ghi nhận vào key.
3. Nếu client là website chạy ở domain/port khác, thêm origin gốc vào **CORS Allowed Origins** (ví dụ `https://app.example.com` hoặc `http://localhost:5173`). Không thêm đường dẫn `/...`. Dùng `*` chỉ khi cần cho mọi origin; endpoint verify không dùng cookie quản trị.
4. Nếu client ở máy khác trong LAN, chọn **Cho phép thiết bị khác trong mạng LAN** rồi lưu. Server sẽ restart để bind `0.0.0.0`. Mở TCP port đang được launcher sử dụng trên Windows Firewall và gọi `http://IP-LAN-MAY-CHU:<PORT>/api/verify`.
5. App desktop/game/native gọi HTTP trực tiếp không cần CORS; gửi JSON với `key` và `deviceId`. Website chạy trên domain khác thì cần CORS origin được cho phép.

**Không cấu hình `*` cùng cookie admin và không đưa mật khẩu Admin vào app/game.** Khi truy cập Internet, triển khai HTTPS reverse proxy và đặt allow-list CORS theo domain cụ thể.


## Sửa tự mở trình duyệt (V13)

- Ngay khi API local phản hồi health-check, `start.bat` tự mở `http://127.0.0.1:<PORT>/` bằng trình duyệt mặc định.
- Launcher tiếp tục kết nối Cloudflare ở nền; khi có URL công khai, trình duyệt mở thêm URL `https://....trycloudflare.com`.
- Nếu Cloudflare không kết nối được, website local vẫn đã được mở và sử dụng bình thường.


## Bản V16 — sửa tạo link ngay trong website và giao diện xanh kính (lịch sử)

- Nút tạo link chờ tối đa 330 giây, đủ thời gian tải cloudflared và hoàn tất bắt tay Cloudflare.
- Tunnel launcher không còn dùng callback bất đồng bộ PowerShell để đọc stdout/stderr; thay bằng redirect ra file log rồi dò URL trực tiếp, tránh lỗi runspace khiến không lấy được URL.
- Backend trả trạng thái và phần log gần nhất riêng cho Admin; lỗi thật được hiển thị trong thẻ chia sẻ thay vì chỉ báo chung chung.
- URL chỉ được công bố khi đúng HTTPS `*.trycloudflare.com` và tiến trình cloudflared vẫn còn chạy. Khi tiến trình tunnel ngắt, URL cũ bị xóa và trạng thái chuyển sang lỗi.
- Giao diện bản cũ dùng xanh cobalt/cyan, kính mờ, ánh sáng tương tác theo chuột, shimmer và hover glow.

**Lưu ý:** Nút tạo link trong web chỉ hoạt động trên Windows và cần Internet. Nếu mạng/firewall chặn kết nối Cloudflare (thường là TCP 7844 khi dùng HTTP/2), web sẽ hiển thị nguyên nhân và log cuối để dễ kiểm tra.

## V17 — quyền link mời và custom key

- Thẻ tạo link mời được ẩn hoàn toàn với khách; chỉ hiện sau khi Admin đăng nhập.
- API `/api/public/link` đã yêu cầu session Admin, tránh khách ẩn danh đọc URL mời từ endpoint.
- Trang Admin đọc trạng thái/URL qua `/api/admin/public-link/status`.
- Form tạo key có trường mã tùy chỉnh. Để trống thì server sinh mã ngẫu nhiên; nếu nhập mã, server chuẩn hóa chữ hoa, kiểm tra định dạng và từ chối nếu trùng.
- Chủ đề mới: nền midnight navy gần đen, ánh chuyển sắc xanh dương, kính mờ tiết chế; giảm blur/animation trên màn hình nhỏ và tôn trọng `prefers-reduced-motion`.


## V20 — sửa nhận diện API khi khởi động Windows (lịch sử)

- Admin có thể nhập/lưu domain hoặc subdomain HTTPS riêng ngay trong thẻ Chia sẻ website; giá trị được lưu bền vững vào `config.json`.
- Quick Tunnel trên Windows vẫn hoạt động như trước nhưng chỉ là link tạm.
- Có `Dockerfile` và `docker-compose.yml` chạy app + Named Cloudflare Tunnel trên VPS. Hai service chính dùng `restart: unless-stopped`; sidecar cloudflared tự chờ token file; app kiểm tra `/ready` nội bộ; dữ liệu và config nằm trong `persist/`.
- `TA_STORE_DATA_DIR`, `TA_STORE_CONFIG_FILE`, `TA_STORE_HOST`, `TA_STORE_PORT`, `TA_STORE_ADMIN_USERNAME` và `TA_STORE_ADMIN_PASSWORD` hỗ trợ cấu hình môi trường triển khai.
- Domain cố định cần domain thật được thêm vào Cloudflare, Published application route và Tunnel token. Source ZIP không thể tự đăng ký domain, thay đổi DNS hoặc tự thuê VPS thay cho chủ website.


## V20 — cập nhật cho domain riêng (lịch sử)

- Thêm form Admin để lưu domain/subdomain HTTPS riêng; chấp nhận nhập `store.tenmien.com` hoặc `https://store.tenmien.com`.
- Backend kiểm tra định dạng, từ chối IP/localhost/domain mẫu/Quick Tunnel, yêu cầu Admin session + same-origin, rồi lưu hostname vào `config.json`.
- Trang Chia sẻ website phân biệt “domain đã lưu” với “Named Tunnel đang kết nối”; link không bị báo online giả khi tunnel chưa sẵn sàng.
- Docker Compose chạy cloudflared Named Tunnel với metrics nội bộ tại `cloudflared:2000`; app dùng `/ready` để xác nhận connector đang kết nối với Cloudflare.
- `TA_STORE_PUBLIC_URL` trở thành tùy chọn; Admin có thể lưu hostname trực tiếp từ giao diện. `CLOUDFLARE_TUNNEL_TOKEN` vẫn cần được đặt trong `.env` trên VPS.


## V26 — Chỉnh sửa thời hạn License Key

- Giao diện thời hạn chuyển sang các thẻ lựa chọn rõ ràng: giữ nguyên, gia hạn, đặt ngày cụ thể hoặc không hết hạn.
- Hiển thị ngày hết hạn hiện tại và thời gian còn lại.
- Gia hạn cộng từ hạn hiện tại nếu key còn hiệu lực; key đã hết hạn hoặc đang không giới hạn sẽ tính từ thời điểm lưu.
- Có mốc nhanh 1 / 7 / 30 / 90 / 365 ngày và xem trước ngày hết hạn mới.
- Chọn ngày/giờ cụ thể có kiểm tra thời gian trong tương lai và dùng múi giờ trên máy quản trị.
- Server cũng từ chối ngày hết hạn trong quá khứ để tránh dữ liệu không hợp lệ.


## V27 — Nhật ký hoạt động và Lua Studio

### Nhật ký hoạt động (Admin only)

- Mở tab **Hoạt động** sau khi đăng nhập Admin để xem sự kiện mới nhất, thời gian, nhóm sự kiện và chi tiết thao tác. Danh sách tự làm mới mỗi 9 giây khi tab đang mở.
- Bộ lọc gồm License Key, link chia sẻ, tài khoản và hệ thống. Có thể xóa nhật ký sau khi xác nhận.
- Lịch sử được lưu bền vững ở `data/activity.json` và tự giữ tối đa 500 bản ghi mới nhất. Endpoint đọc/xóa cần phiên Admin.

### Lua Studio (Admin only)

1. Mở tab **Lua Studio**, chọn file `.lua`/`.txt` tối đa 1 MB hoặc dán mã vào editor.
2. Đổi tên file xuất, tên menu và dòng mô tả.
3. Thêm ảnh bằng URL HTTPS hoặc tải ảnh PNG/JPG/WebP tối đa 512 KB (ảnh cục bộ được nhúng dạng Data URL/Base64 trong cấu hình Lua).
4. Bấm **MAKE SCRIPT LUA**, xem output, sao chép hoặc tải file. Source gốc được giữ nguyên; khối UI adapter được chèn trước source để không làm sai top-level `return` và giữ shebang nếu có.
5. UI adapter là khung tích hợp trung lập. Framework Lua của người dùng cần có `createWindow`, `addImage`, `addLabel`; tool không tự thực thi file đã tải lên và không tự tạo giao diện cho mọi framework khác nhau.

Không chạy script lạ trên máy chính. Hãy đọc và kiểm tra nội dung trước khi sử dụng.


### Lua Studio V29 — tự nhận diện chức năng và dựng menu

- Khi tải file `.lua` hoặc dán mã nguồn, Studio tự dò các khai báo hàm có tên dạng `function name(...)`, `local function name(...)` và `name = function(...)`, kể cả khi có thụt dòng; parser bỏ qua phần comment/chuỗi để hạn chế nhận nhầm.
- Mỗi hàm được đưa thành một dòng cấu hình menu. Admin có thể đổi tên hiển thị, chỉnh tên hàm liên kết, chọn `Nút bấm` hoặc `Bật / tắt`, tắt mục hoặc xóa mục. Có thể tự thêm mục thủ công.
- Bản xem trước menu cập nhật theo cấu hình. Khi MAKE, file Lua được bổ sung danh sách action và adapter `__TA_STORE_BUILD_MENU(ui, handlers)`.
- Nếu script có `return` cấp cao nhất, công cụ giữ nguyên cấu trúc và không tự nối đoạn đăng ký ở cuối chunk; output sẽ báo cần tích hợp thủ công để tránh làm hỏng module.
- Adapter cần được nối với UI framework thực tế và cung cấp `TA_STORE_UI` (`createWindow`, `addButton`, tùy chọn `addToggle`, `addImage`, `addLabel`). Vì UI API khác nhau giữa framework, Studio không giả định/chạy framework hoặc tự thực thi script tải lên.
- Source Lua được xử lý ở trình duyệt; nhật ký chỉ lưu thao tác và tên file, không lưu nội dung mã.


## V34 UI polish — left sidebar and exact function names

- Compact horizontal brand layout in the preview sidebar; version badge no longer steals the title column.
- Sidebar receives a wider minimum width so menu title, subtitle and tab labels wrap at word boundaries rather than one character per line.
- Preview action labels show the user-facing name and the exact Lua handler identifier on a separate line when a handler is assigned.
- When the source scanner detects named functions, generated menu controls use those detected names; generic sample controls are hidden from that detected result so they do not masquerade as real functions.
- This editor remains a UI/configuration builder only; it does not execute uploaded Lua source.


## V35 — MAKE thay thế hàm menu tại chỗ

- Thêm parser theo block Lua để dò phạm vi `function ... end`, có xử lý function lồng nhau, `if/end`, `for/while/do`, `repeat/until`; bỏ qua comment và string khi tìm block.
- Tự nhận diện các hàm có dấu hiệu dựng giao diện như `BuildMenu`, `CreateMenu`, `MainMenu`, `InitUI`, `CreateWindow`, `ScreenGui`, `Instance.new`, `addTab`, `addButton`... Có dropdown chọn lại mục tiêu khi source có nhiều hàm UI.
- Bấm MAKE sẽ **thay phần thân của đúng hàm menu được chọn** bằng cấu hình/menu mới. Các hàm khác trong source được giữ nguyên; không thêm adapter ở đầu file, không nối registration ở cuối file và không tạo menu trùng.
- Nếu không tìm thấy hàm UI/menu đủ rõ, MAKE dừng và báo lý do; không tự đoán hàm gameplay để ghi đè.
- Các handler local được khai báo sau hàm menu không nằm trong lexical scope; MAKE báo rõ trường hợp này thay vì tạo callback hỏng.
- Output cần `TA_STORE_UI` global hoặc tham số `ui` / `self` của hàm menu, hỗ trợ `createWindow` và các control tương ứng. Tool vẫn chỉ xử lý văn bản, không thực thi source Lua.

---

# V39 — Deploy Railway (subdomain HTTPS + persistent volume)

Bản V39 thêm hỗ trợ biến cổng `PORT` do Railway cấp, Docker entrypoint chuẩn bị quyền ghi cho volume rồi hạ quyền chạy Node về user `node`, và bắt buộc mật khẩu Admin từ 16 ký tự trong môi trường production.

Xem hướng dẫn triển khai từng bước tại `README_RAILWAY_V39.md`. Railway có thể cấp URL HTTPS miễn phí dạng `*.up.railway.app`; gắn volume vào `/persist` để giữ dữ liệu key và cấu hình. Lưu ý Free/Trial chỉ thích hợp thử nghiệm; cần gói phù hợp để duy trì dịch vụ và volume lâu dài.
