TA-STORE-VN V40 — FULL WEBSITE

index.html đã gộp giao diện, CSS, JavaScript frontend và ảnh vào một file.
Để chức năng Admin/API/License Key chạy, khởi động server bằng start.bat (Windows) hoặc deploy Docker/Railway.
Không mở index.html trực tiếp bằng file:// vì API /api/* cần server.js.
Content Security Policy vẫn được giữ bằng SHA-256 hashes cho CSS/JS inline.
