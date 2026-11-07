# TA-STORE-VN — Hướng dẫn đưa website lên Railway

Bản này chuẩn bị backend Node.js để deploy bằng Docker trên Railway, lấy subdomain miễn phí dạng `*.up.railway.app`, và giữ dữ liệu License Key trong volume `/persist`.

> **Quan trọng về gói miễn phí:** Railway hiện cho người mới dùng thử với $5 credit trong tối đa 30 ngày. Sau đó Free plan chỉ có $1 credit/tháng; volume của tài khoản Trial có thể bị xóa 30 ngày sau khi credit hết hạn. Vì vậy đây là lựa chọn để dựng thử, không nên coi là hosting miễn phí bảo đảm chạy 24/7 lâu dài. Muốn giữ volume và chạy ổn định, cần gói trả phí và theo dõi mức dùng.

## A. Đưa source lên GitHub

1. Giải nén ZIP này trên máy.
2. Tạo repository mới trên GitHub, đặt Private để source quản trị không bị công khai.
3. Upload toàn bộ nội dung bên trong thư mục `TuanAnhStore_V40_FullWebsite_HTML` lên repository (không upload file ZIP lồng bên trong).
4. **Không upload** `.env`, file `config.json`, thư mục `data/`, `persist/`, API Token Cloudflare hay thông tin mật khẩu. Các đường dẫn bí mật/ dữ liệu đã được `.gitignore` loại trừ.

## B. Deploy Railway

1. Đăng nhập Railway, tạo Project → Deploy from GitHub Repo → chọn repository vừa tạo.
2. Railway tự nhận `Dockerfile` ở thư mục gốc và build ứng dụng. Không cần `npm install`.
3. Trong service, mở **Settings → Networking → Public Networking → Generate Domain**. Railway tạo URL HTTPS dạng `ten-ngau-nhien.up.railway.app`.
4. Trong service, mở **Volumes** → tạo volume và đặt **Mount Path** chính xác là `/persist`.
5. Mở **Variables**, thêm các biến sau:

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `TA_STORE_HOST` | `0.0.0.0` |
   | `TA_STORE_DATA_DIR` | `/persist/data` |
   | `TA_STORE_CONFIG_FILE` | `/persist/config.json` |
   | `TA_STORE_ADMIN_USERNAME` | `ADMIN` (hoặc tên quản trị riêng) |
   | `TA_STORE_ADMIN_PASSWORD` | Mật khẩu ngẫu nhiên dài tối thiểu 16 ký tự |

   Để Railway cấp cổng `PORT`, không đặt `TA_STORE_PORT`. Backend V39 đọc `PORT` do nền tảng cấp. Nếu Railway yêu cầu khai báo cổng trong Networking, đặt target port theo giá trị `PORT` của service.

6. Chờ deployment hoàn tất. Có thể đặt Healthcheck Path là `/api/health`.
7. Mở URL `*.up.railway.app`, đăng nhập bằng tài khoản/mật khẩu đã đặt trong Variables. Đổi mật khẩu ngay sau khi đăng nhập nếu bạn định chia sẻ dịch vụ cho người khác.

## C. Những gì đã chuẩn bị trong V39

- Backend nhận `PORT` của Railway, vẫn ưu tiên `TA_STORE_PORT` khi chạy theo launcher/Docker Compose cũ.
- Dùng Docker `ENTRYPOINT` để chuẩn bị quyền ghi cho volume `/persist`, sau đó hạ quyền chạy Node về user `node`.
- Dữ liệu key, lịch sử hoạt động và cấu hình Admin lưu ở `/persist` để giữ qua lần redeploy/restart khi volume được gắn đúng.
- Production từ chối khởi động nếu `TA_STORE_ADMIN_PASSWORD` không có hoặc ngắn hơn 16 ký tự.
- Không bắt buộc mua domain `.com`; subdomain Railway do Railway cấp.

## D. Kiểm tra và lưu ý

- Kiểm tra `GET /api/health` trả HTTP 200 sau deploy.
- Tạo một key thử, restart/redeploy service, rồi kiểm tra key còn trong danh sách. Đây là bước xác nhận volume đã gắn đúng.
- Sao lưu volume định kỳ. Không xem volume là bản backup duy nhất.
- Đừng gửi mật khẩu Admin, API Token Cloudflare hoặc file dữ liệu key lên chat/GitHub.
- Railway domain chỉ cung cấp địa chỉ website. Dịch vụ vẫn phụ thuộc trạng thái tài khoản, tài nguyên, volume và chính sách của Railway; không có cam kết uptime tuyệt đối.
- Mục Cloudflare trong website không cần thiết để chạy với domain `*.up.railway.app`. Chỉ cấu hình mục đó khi bạn sở hữu domain riêng và muốn kết nối Cloudflare Tunnel.

## Official references

- Railway Free Trial / Free plan: https://docs.railway.com/pricing/free-trial
- Railway pricing: https://railway.com/pricing
- Railway persistent volumes: https://docs.railway.com/volumes
- Railway domains: https://docs.railway.com/networking/domains/working-with-domains


## Giao diện HTML gộp một file

`index.html` gộp CSS, JavaScript frontend và 3 ảnh thương hiệu vào một file HTML. Backend vẫn chạy trong `server.js`; các chức năng Admin, License Key, nhật ký và API cần server. Không mở HTML bằng `file://`; hãy chạy `start.bat` hoặc triển khai Docker/Railway. Server dùng CSP hash cho hai khối CSS/JS inline, không bật `unsafe-inline`.
