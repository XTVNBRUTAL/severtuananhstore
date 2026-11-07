# TA-STORE-VN V42 — triển khai full-stack

## Vì sao không đăng nhập được ở GitHub Pages?

`https://<user>.github.io/...` chỉ phục vụ file tĩnh. Nó không chạy Node.js `server.js`, vì vậy các endpoint `/api/admin/login`, `/api/health`, `/api/keys` không tồn tại tại host đó. Không thể sửa lỗi này chỉ bằng cách đổi username/password hoặc sửa mỗi HTML.

## Triển khai đúng

1. Tạo một GitHub repository Private.
2. Giải nén ZIP và đưa **toàn bộ nội dung bên trong** vào thư mục gốc repository. `Dockerfile`, `railway.json`, `server.js` phải ở root.
3. Railway → New Project → Deploy from GitHub Repo → chọn repository. Railway dùng Dockerfile đặt ở root để build. Tài liệu: https://docs.railway.com/builds/dockerfiles
4. Trong service, tạo Volume có Mount Path `/persist`. Ứng dụng ghi `store.json` và `config.json` trong volume này để giữ keys/config sau redeploy.
5. Thêm các Variables:

```env
NODE_ENV=production
TA_STORE_HOST=0.0.0.0
TA_STORE_DATA_DIR=/persist/data
TA_STORE_CONFIG_FILE=/persist/config.json
TA_STORE_ADMIN_USERNAME=ADMIN
TA_STORE_ADMIN_PASSWORD=THAY_BANG_CHUOI_NGAU_NHIEN_IT_NHAT_16_KY_TU
```

6. Deploy. Railway cấp `PORT` tự động; server đã đọc `PORT`, không cần đặt `TA_STORE_PORT`.
7. Settings → Networking → Generate Domain để lấy URL HTTPS `*.up.railway.app`.
8. Kiểm tra `https://TEN-APP.up.railway.app/api/health`. Phản hồi mong đợi có `"ok":true`.
9. Truy cập `https://TEN-APP.up.railway.app/` và đăng nhập Admin bằng đúng thông tin tự đặt trong Variables.

Railway hướng dẫn kết nối GitHub repository, tạo domain và variables trong tài liệu chính thức:
- https://docs.railway.com/quick-start
- https://docs.railway.com/variables
- https://docs.railway.com/volumes
- https://docs.railway.com/deployments/healthchecks

## Lưu ý

- Healthcheck xác nhận server đã khởi động khi deploy; nó không thay thế monitoring liên tục.
- Dữ liệu cần Volume mount đúng `/persist`. Nếu bỏ Volume, dữ liệu có thể mất khi container bị thay thế.
- Không có cách để API Node.js chạy trực tiếp trên GitHub Pages.
- Chưa thể tạo deployment vào tài khoản Railway của người dùng từ ZIP này; cần thao tác/kết nối tài khoản Railway và GitHub.
