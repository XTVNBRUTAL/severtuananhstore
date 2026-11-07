# TA-STORE-VN V41 — Sửa đăng nhập Admin và deploy full-stack

## Lý do tài khoản không đăng nhập được ở link cũ

Link `*.github.io` là GitHub Pages, chỉ phục vụ HTML/CSS/JavaScript tĩnh. Nó không chạy `server.js`, nên các API như `/api/admin/login` và `/api/health` không tồn tại tại host đó. Đây không phải lỗi do nhập sai tài khoản.

**Cách đúng:** deploy toàn bộ thư mục project này lên Railway bằng Dockerfile, sau đó dùng domain `*.up.railway.app` do Railway cấp làm link website chính. Đừng tiếp tục dùng link `github.io` cho trang Admin.

## Deploy

1. Giải nén ZIP. Tạo một GitHub repository **Private**.
2. Upload toàn bộ nội dung bên trong thư mục `TuanAnhStore_V41_TA-STORE-VN_Railway` lên thư mục gốc của repository. Đảm bảo `Dockerfile`, `railway.json`, `server.js` nằm ở root, không nằm sâu thêm một thư mục.
3. Đăng nhập Railway → tạo Project → **Deploy from GitHub Repo** → chọn repository.
4. Railway sẽ dùng `Dockerfile` (đã khai báo trong `railway.json`).
5. Trong service Railway, tạo Volume với Mount Path chính xác: `/persist`.
6. Trong Variables, thêm:

   | Variable | Giá trị |
   |---|---|
   | `NODE_ENV` | `production` |
   | `TA_STORE_HOST` | `0.0.0.0` |
   | `TA_STORE_DATA_DIR` | `/persist/data` |
   | `TA_STORE_CONFIG_FILE` | `/persist/config.json` |
   | `TA_STORE_ADMIN_USERNAME` | `ADMIN` hoặc username riêng |
   | `TA_STORE_ADMIN_PASSWORD` | Mật khẩu tự đặt, tối thiểu 16 ký tự, nên dùng chuỗi ngẫu nhiên |

   Không đặt `TA_STORE_PORT`; Railway tự cấp `PORT` và server đã đọc biến này.

7. Trong Settings → Networking → Generate Domain để Railway cấp URL HTTPS miễn phí dạng `ten-app.up.railway.app`.
8. Đợi Deployment thành công, rồi mở `https://TEN-APP.up.railway.app/api/health`. Kết quả phải là JSON có `"ok": true`.
9. Mở `https://TEN-APP.up.railway.app/` và đăng nhập bằng username/password đặt ở bước 6.

## Giữ dữ liệu

Volume phải mount đúng `/persist`. Nếu không có Volume, dữ liệu key và config nằm trong filesystem container có thể mất khi redeploy. Sao lưu Volume định kỳ.

## Thử cục bộ trên Windows

Cài Node.js 22 trở lên, đặt `TA_STORE_ADMIN_PASSWORD` đủ mạnh trong biến môi trường nếu chạy production, rồi chạy `start.bat`. Không mở file HTML trực tiếp bằng `file://`.

## Những gì V41 sửa

- Thêm `railway.json`: chọn Dockerfile, healthcheck `/api/health`, restart policy `ALWAYS`.
- Sửa thông báo lỗi API: khi mở từ `github.io`, form đăng nhập chỉ rõ host tĩnh không có backend.
- Giữ frontend và backend chung một origin khi chạy từ Railway; tránh lỗi cookie/CORS do tách frontend static và backend.
- Giữ CSP hash cho script inline; không bật `unsafe-inline`.

## Lưu ý

- Mình đã chuẩn bị source và kiểm thử cục bộ; chưa thể tạo deploy trong tài khoản Railway/GitHub của bạn vì chưa có phiên kết nối tài khoản được xác nhận.
- Không chia sẻ mật khẩu Admin, file `config.json`, dữ liệu trong `data/` hoặc API token Cloudflare.
- Railway có thể tính phí theo mức sử dụng; domain `*.up.railway.app` không đồng nghĩa hosting backend miễn phí vô hạn.
