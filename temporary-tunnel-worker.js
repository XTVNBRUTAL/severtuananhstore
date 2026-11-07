'use strict';

// Background worker for an independent temporary Cloudflare Quick Tunnel.
// It never touches the Named Tunnel PID/token or the permanent hostname state.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const RUNTIME = path.join(ROOT, '.runtime');
const URL_FILE = path.join(RUNTIME, 'temporary-public-url.txt');
const STATUS_FILE = path.join(RUNTIME, 'temporary-tunnel-status.txt');
const FAILED_FILE = path.join(RUNTIME, 'temporary-tunnel-failed.flag');
const CHILD_PID_FILE = path.join(RUNTIME, 'temporary-cloudflared.pid');
const LOG_FILE = path.join(RUNTIME, 'temporary-cloudflared.log');
const PORT_FILE = path.join(RUNTIME, 'active-port.txt');
const MAX_WAIT_MS = 180000;
let child = null;
let ready = false;
let stopping = false;
let outputTail = '';

fs.mkdirSync(RUNTIME, { recursive: true });
for (const file of [URL_FILE, FAILED_FILE]) {
  try { fs.rmSync(file, { force: true }); } catch { }
}
function writeStatus(message) {
  try { fs.writeFileSync(STATUS_FILE, String(message), 'utf8'); } catch { }
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`); } catch { }
}
function fail(message) {
  writeStatus(`ERROR: ${message}`);
  try { fs.writeFileSync(FAILED_FILE, String(message), 'utf8'); } catch { }
  try { fs.rmSync(URL_FILE, { force: true }); } catch { }
}
function clean() {
  for (const file of [CHILD_PID_FILE]) {
    try { fs.rmSync(file, { force: true }); } catch { }
  }
}
function terminate() {
  if (stopping) return;
  stopping = true;
  writeStatus('Đang dừng link tạm thời theo yêu cầu Admin.');
  if (child && child.pid) {
    try { child.kill(); } catch { }
  }
  setTimeout(() => { clean(); process.exit(0); }, 350).unref();
}
process.on('SIGTERM', terminate);
process.on('SIGINT', terminate);

let port = Number(process.env.TA_STORE_PORT || 3000);
try {
  const active = Number(fs.readFileSync(PORT_FILE, 'utf8').trim());
  if (Number.isInteger(active) && active >= 1024 && active <= 65535) port = active;
} catch { }
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  fail('Cổng website không hợp lệ; hãy chạy lại start.bat.');
  process.exit(1);
}

let executable;
if (process.platform === 'win32') {
  executable = path.join(RUNTIME, 'cloudflared.exe');
  if (!fs.existsSync(executable)) {
    fail('Không tìm thấy .runtime\\cloudflared.exe. Hãy chạy start.bat để tải cloudflared trước.');
    process.exit(1);
  }
} else {
  executable = process.env.CLOUDFLARED_BIN || '/usr/local/bin/cloudflared';
  if (executable.includes(path.sep) && !fs.existsSync(executable)) {
    fail(`Không tìm thấy cloudflared tại ${executable}. Hãy cài cloudflared hoặc dùng Docker image V25.`);
    process.exit(1);
  }
}

writeStatus(`Đang tạo Cloudflare Quick Tunnel tới http://127.0.0.1:${port}...`);
try {
  child = spawn(executable, [
    'tunnel', '--no-autoupdate', '--protocol', 'http2', '--edge-ip-version', '4',
    '--url', `http://127.0.0.1:${port}`
  ], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
  fail(`Không khởi chạy được cloudflared: ${error.message}`);
  process.exit(1);
}
if (!child || !child.pid) {
  fail('Windows/Linux không tạo được tiến trình cloudflared.');
  process.exit(1);
}
try { fs.writeFileSync(CHILD_PID_FILE, String(child.pid), 'ascii'); } catch { }

function consume(chunk) {
  const text = chunk.toString('utf8');
  outputTail = (outputTail + text).slice(-160000);
  try { fs.appendFileSync(LOG_FILE, text); } catch { }
  if (!ready) {
    const match = outputTail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      const safeUrl = match[0].toLowerCase().replace(/\/$/, '');
      const temp = `${URL_FILE}.tmp`;
      try {
        fs.writeFileSync(temp, safeUrl, 'ascii');
        fs.renameSync(temp, URL_FILE);
        ready = true;
        writeStatus(`TUNNEL_READY: ${safeUrl}`);
      } catch (error) {
        fail(`Không lưu được URL tạm thời: ${error.message}`);
      }
    }
  }
}
child.stdout.on('data', consume);
child.stderr.on('data', consume);
child.once('error', (error) => {
  fail(`Lỗi chạy cloudflared: ${error.message}`);
  clean();
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (!stopping) {
    if (ready) fail(`Quick Tunnel đã ngắt (mã ${code ?? 'không rõ'}${signal ? `, ${signal}` : ''}). Tạo link mới để chia sẻ lại.`);
    else fail(`cloudflared thoát trước khi tạo URL (mã ${code ?? 'không rõ'}${signal ? `, ${signal}` : ''}). Xem temporary-cloudflared.log.`);
  }
  clean();
  process.exit(stopping ? 0 : (code || 1));
});

const deadline = setTimeout(() => {
  if (!ready && !stopping) {
    fail('Đã chờ 180 giây nhưng Cloudflare chưa trả URL. Kiểm tra Internet và TCP 7844.');
    if (child && child.pid) { try { child.kill(); } catch { } }
  }
}, MAX_WAIT_MS);
deadline.unref();
