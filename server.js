'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { getCloudflareSetupState, verifyCloudflareApiToken, provisionCloudflareHostname } = require('./cloudflare-domain');

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.TA_STORE_DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'store.json');
const CONFIG_FILE = path.resolve(process.env.TA_STORE_CONFIG_FILE || path.join(ROOT, 'config.json'));
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const ROBLOX_UPLOAD_MAX_BODY_BYTES = 29 * 1024 * 1024;
const ROBLOX_IMAGE_MAX_BYTES = 20_000_000;
const APP_VERSION = 'public-web-v42-railway-fullstack';

const DEFAULT_ADMIN_USERNAME = process.env.TA_STORE_ADMIN_USERNAME || 'ADMIN';
const configuredAdminPassword = String(process.env.TA_STORE_ADMIN_PASSWORD || '');
if (process.env.NODE_ENV === 'production' && configuredAdminPassword.length < 16) {
  throw new Error('Bảo mật: môi trường production bắt buộc TA_STORE_ADMIN_PASSWORD dài ít nhất 16 ký tự. Hãy đặt biến môi trường này trước khi khởi động.');
}
const DEFAULT_ADMIN_PASSWORD = configuredAdminPassword || 'tanhsito36';

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  const temp = `${CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(temp, CONFIG_FILE);
}

function makeDefaultConfig(previous = {}) {
  const salt = crypto.randomBytes(16);
  return {
    configVersion: 3,
    host: typeof previous.host === 'string' ? previous.host : '127.0.0.1',
    port: Number.isInteger(Number(previous.port)) ? Number(previous.port) : 3000,
    adminUsername: DEFAULT_ADMIN_USERNAME,
    adminSalt: salt.toString('hex'),
    adminPasswordHash: crypto.scryptSync(DEFAULT_ADMIN_PASSWORD, salt, 64).toString('hex'),
    cookieSecure: Boolean(previous.cookieSecure),
    allowedOrigins: Array.isArray(previous.allowedOrigins) ? previous.allowedOrigins : [],
    publicBaseUrl: typeof previous.publicBaseUrl === 'string' ? previous.publicBaseUrl : ''
  };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const initial = makeDefaultConfig();
    saveConfig(initial);
    console.log('\n============================================================');
    console.log('TAO TAI KHOAN QUAN TRI MAC DINH');
    console.log(`Tai khoan: ${DEFAULT_ADMIN_USERNAME}`);
    console.log(`Mat khau: ${DEFAULT_ADMIN_PASSWORD}`);
    console.log('Thong tin dang nhap duoc luu dang bam trong config.json.');
    console.log('Hay doi mat khau truoc khi dua server len Internet.');
    console.log('============================================================\n');
    return initial;
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`Khong doc duoc config.json: ${error.message}`);
  }

  // Nang cap config cu: dat tai khoan ADMIN theo yeu cau va chi luu hash mat khau.
  if (config.configVersion !== 3 || !config.adminUsername || !config.adminSalt || !config.adminPasswordHash) {
    config = makeDefaultConfig(config);
    saveConfig(config);
    console.log('\n[CONFIG] Da nang cap cau hinh admin.');
    console.log(`Tai khoan mac dinh: ${DEFAULT_ADMIN_USERNAME}`);
    console.log(`Mat khau mac dinh: ${DEFAULT_ADMIN_PASSWORD}\n`);
  }

  const salt = Buffer.from(String(config.adminSalt), 'hex');
  const passwordHash = Buffer.from(String(config.adminPasswordHash), 'hex');
  if (salt.length !== 16 || passwordHash.length !== 64 || typeof config.adminUsername !== 'string') {
    throw new Error('Thong tin admin trong config.json khong hop le. Hay sao luu va xoa config.json de tao lai.');
  }

  config.host = typeof config.host === 'string' ? config.host : '127.0.0.1';
  config.port = Number.isInteger(Number(config.port)) ? Number(config.port) : 3000;
  config.cookieSecure = Boolean(config.cookieSecure);
  config.allowedOrigins = Array.isArray(config.allowedOrigins) ? config.allowedOrigins : [];
  config.publicBaseUrl = typeof config.publicBaseUrl === 'string' ? config.publicBaseUrl : '';
  return config;
}
const CONFIG = loadConfig();
if (typeof process.env.TA_STORE_HOST === 'string' && process.env.TA_STORE_HOST.trim()) {
  CONFIG.host = process.env.TA_STORE_HOST.trim();
}
// Windows launcher chooses an available port and passes it to the watchdog.
// Honor that value so the API, Quick Tunnel worker, and browser all use one port.
const runtimePortValue = String(process.env.TA_STORE_PORT || process.env.PORT || '').trim();
if (runtimePortValue) {
  const envPort = Number(runtimePortValue);
  if (Number.isInteger(envPort) && envPort >= 1 && envPort <= 65535) {
    CONFIG.port = envPort;
  } else {
    throw new Error('PORT/TA_STORE_PORT không hợp lệ; phải là số nguyên từ 1 đến 65535.');
  }
}
function normalizeConfiguredPublicUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try { parsed = new URL(candidate); }
  catch { throw new Error('Tên miền không hợp lệ. Nhập dạng tuananhstore.com hoặc https://tuananhstore.com.'); }
  const hostname = parsed.hostname.toLowerCase();
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const labels = hostname.split('.');
  const validHostname = hostname.length <= 253 && labels.length >= 2
    && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    && /^[a-z]{2,63}$/.test(labels[labels.length - 1]);
  const isReservedExample = /(^|\.)example\.(com|net|org)$/.test(hostname)
    || hostname.endsWith('.invalid') || hostname.endsWith('.test');
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
      || parsed.pathname !== '/' || parsed.search || parsed.hash
      || !validHostname || isIpv4 || hostname === 'localhost'
      || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || hostname.endsWith('.trycloudflare.com') || isReservedExample) {
    throw new Error('Chỉ nhập domain/subdomain HTTPS công khai do bạn sở hữu, ví dụ https://store.tenmiencuaban.com. Không nhập IP, đường dẫn, cổng hoặc domain mẫu.');
  }
  return `https://${hostname}`;
}
// Admin có thể cập nhật tên miền trong giao diện; config.json được lưu bền vững.
// Khi chưa lưu từ giao diện, có thể lấy giá trị khởi tạo từ biến môi trường.
let PERMANENT_PUBLIC_URL = null;
try {
  PERMANENT_PUBLIC_URL = normalizeConfiguredPublicUrl(CONFIG.publicBaseUrl || process.env.TA_STORE_PUBLIC_URL || '');
} catch (error) {
  console.warn(`[PUBLIC LINK] Bỏ qua tên miền cấu hình chưa hợp lệ: ${error.message}`);
}
const TUNNEL_READY_URL = String(process.env.TA_STORE_TUNNEL_READY_URL || '').trim();

function getTunnelOriginForProvisioning() {
  const configured = String(process.env.TA_STORE_TUNNEL_ORIGIN || '').trim();
  if (configured) return configured;
  return `http://127.0.0.1:${CONFIG.port}`;
}

function getCloudflareApiTokenFile() {
  return path.resolve(process.env.CLOUDFLARE_API_TOKEN_FILE || path.join(DATA_DIR, 'cloudflare-api-token'));
}

function getCloudflareTunnelTokenFile() {
  return path.resolve(process.env.CLOUDFLARE_TUNNEL_TOKEN_FILE || path.join(ROOT, '.runtime', 'named-tunnel-token'));
}

function getCloudflareRuntimeEnv() {
  const env = { ...process.env };
  // Prefer the token saved by Admin over an optional environment fallback.
  try {
    const savedToken = fs.readFileSync(getCloudflareApiTokenFile(), 'utf8').trim();
    if (savedToken) env.CLOUDFLARE_API_TOKEN = savedToken;
  } catch { }
  env.CLOUDFLARE_TUNNEL_TOKEN_FILE = getCloudflareTunnelTokenFile();
  return env;
}

function saveCloudflareApiToken(token) {
  const file = getCloudflareApiTokenFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(temp, 0o600); } catch { }
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch { }
}

function getPublicLinkAutomationStatus() {
  return getCloudflareSetupState(getCloudflareRuntimeEnv());
}

function checkNamedTunnelReady() {
  if (!TUNNEL_READY_URL) return Promise.resolve({ checked: false, ready: false });
  let parsed;
  try { parsed = new URL(TUNNEL_READY_URL); }
  catch { return Promise.resolve({ checked: true, ready: false }); }
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password) {
    return Promise.resolve({ checked: true, ready: false });
  }
  return new Promise((resolve) => {
    const request = http.get(parsed, (response) => {
      response.resume();
      resolve({ checked: true, ready: response.statusCode === 200 });
    });
    request.setTimeout(1800, () => request.destroy(new Error('Tunnel readiness timeout')));
    request.on('error', () => resolve({ checked: true, ready: false }));
  });
}
// A connected cloudflared connector alone does not prove that the selected public
// hostname has DNS + a Published application route pointing to THIS app. Verify
// the real public HTTPS endpoint before enabling the copy/share action in Admin.
let publicDomainProbeCache = { url: '', checkedAt: 0, result: null };
const PUBLIC_DOMAIN_PROBE_TTL_MS = 8000;

function checkPublicDomainReachable(publicUrl) {
  let normalized;
  try { normalized = normalizeConfiguredPublicUrl(publicUrl); }
  catch (error) { return Promise.resolve({ checked: true, reachable: false, message: error.message }); }
  if (!normalized) return Promise.resolve({ checked: true, reachable: false, message: 'Chưa cấu hình tên miền công khai.' });

  const now = Date.now();
  if (publicDomainProbeCache.url === normalized && publicDomainProbeCache.result
      && now - publicDomainProbeCache.checkedAt < PUBLIC_DOMAIN_PROBE_TTL_MS) {
    return Promise.resolve(publicDomainProbeCache.result);
  }

  return new Promise((resolve) => {
    const target = new URL('/api/health', normalized);
    let settled = false;
    let body = '';
    const finish = (result) => {
      if (settled) return;
      settled = true;
      publicDomainProbeCache = { url: normalized, checkedAt: Date.now(), result };
      resolve(result);
    };

    const request = https.get(target, {
      headers: {
        accept: 'application/json',
        'cache-control': 'no-cache',
        'user-agent': 'TuanAnhStore-PublicDomain-Check/1.0'
      }
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status < 200 || status >= 300) {
        response.resume();
        let message = `Tên miền trả về HTTP ${status || 'không rõ'}, chưa truy cập được website.`;
        if (status === 401 || status === 403) message = 'Cloudflare Access hoặc chính sách bảo mật đang chặn truy cập công khai. Hãy kiểm tra Access/WAF cho hostname này.';
        else if (status === 404) message = 'Tên miền đã tới máy chủ nhưng route /api/health không đúng. Hãy trỏ Published application route tới http://app:3000.';
        else if ([502, 503, 504, 520, 521, 522, 523, 524, 530].includes(status)) message = `Cloudflare trả HTTP ${status}. Kiểm tra Named Tunnel, DNS và Published application route.`;
        else if (status >= 300 && status < 400) message = 'Tên miền đang chuyển hướng. Hãy nhập hostname HTTPS cuối cùng, không dùng URL chuyển hướng.';
        return finish({ checked: true, reachable: false, status, message });
      }

      response.on('data', (chunk) => {
        body += chunk.toString('utf8');
        if (body.length > 8192) request.destroy(new Error('Phản hồi kiểm tra domain quá lớn.'));
      });
      response.on('end', () => {
        let health;
        try { health = JSON.parse(body); }
        catch { return finish({ checked: true, reachable: false, status, message: 'Tên miền phản hồi HTTPS nhưng không trả API health của Tuấn Anh Store. Có thể DNS đang trỏ nhầm website.' }); }
        const isThisApp = health && health.ok === true
          && health.service === 'Tuan Anh Store Key API'
          && health.version === APP_VERSION;
        if (!isThisApp) {
          return finish({ checked: true, reachable: false, status, message: 'Tên miền đang trỏ tới dịch vụ khác, không phải website Tuấn Anh Store. Kiểm tra Published application route → http://app:3000.' });
        }
        return finish({ checked: true, reachable: true, status, message: 'Tên miền HTTPS đã truy cập được từ Internet và trả đúng API của Tuấn Anh Store.' });
      });
      response.on('error', (error) => finish({ checked: true, reachable: false, message: `Lỗi đọc phản hồi domain: ${error.message}` }));
    });

    request.setTimeout(6500, () => request.destroy(new Error('Hết thời gian kiểm tra HTTPS domain (6,5 giây).')));
    request.on('error', (error) => {
      const detail = error && error.message ? error.message : 'Không rõ nguyên nhân';
      finish({ checked: true, reachable: false, message: `Chưa truy cập được ${normalized} từ Internet: ${detail}. Kiểm tra DNS, chứng chỉ HTTPS, Tunnel và Published application route.` });
    });
  });
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }, null, 2));
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { keys: Array.isArray(parsed.keys) ? parsed.keys : [] };
  } catch (error) {
    throw new Error(`Khong doc duoc data/store.json: ${error.message}`);
  }
}

const store = loadStore();

// Persistent, admin-only activity history. Secrets and full license codes are never stored here.
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
function loadActivityLog() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.slice(0, 500) : [];
  } catch { return []; }
}
let activityLog = loadActivityLog();
let lastLoggedTemporaryLinkUrl = '';
let lastLoggedDomainUrl = '';
function persistActivityLog() {
  try {
    const tempFile = `${ACTIVITY_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(activityLog.slice(0, 500), null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(tempFile, 0o600); } catch { }
    fs.renameSync(tempFile, ACTIVITY_FILE);
  } catch (error) {
    console.warn('[ACTIVITY] Không thể lưu nhật ký:', error.message);
  }
}
function recordActivity(category, title, detail = '') {
  const safeCategory = ['license', 'share', 'account', 'system', 'tool'].includes(category) ? category : 'system';
  const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  activityLog.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    category: safeCategory,
    title: clean(title, 120),
    detail: clean(detail, 260),
    actor: clean(CONFIG.adminUsername || 'ADMIN', 40)
  });
  if (activityLog.length > 500) activityLog.length = 500;
  persistActivityLog();
}

let persistQueue = Promise.resolve();
function persistStore() {
  const snapshot = JSON.stringify(store, null, 2);
  persistQueue = persistQueue.then(async () => {
    const tempFile = `${DB_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(tempFile, snapshot, 'utf8');
    await fs.promises.rename(tempFile, DB_FILE);
  });
  return persistQueue;
}

const sessions = new Map();
const loginAttempts = new Map();
const verifyAttempts = new Map();
const passwordSalt = Buffer.from(CONFIG.adminSalt, 'hex');
const expectedPasswordHash = Buffer.from(CONFIG.adminPasswordHash, 'hex');
const expectedUsername = Buffer.from(CONFIG.adminUsername.toUpperCase(), 'utf8');

function hashPassword(value) {
  return crypto.scryptSync(String(value), passwordSalt, expectedPasswordHash.length);
}

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getClientIp(req) {
  // Cloudflare Tunnel connects from localhost; use its edge-supplied client IP
  // so one visitor cannot consume the login/verify rate limit for everyone.
  const remote = req.socket.remoteAddress || 'unknown';
  const forwarded = String(req.headers['cf-connecting-ip'] || '').trim();
  const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (isLoopback && forwarded && forwarded.length <= 64 && /^[0-9a-fA-F:.]+$/.test(forwarded)) return forwarded;
  return remote;
}

function allowRate(map, key, max, windowMs) {
  const now = Date.now();
  const recent = (map.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= max) {
    map.set(key, recent);
    return false;
  }
  recent.push(now);
  map.set(key, recent);
  return true;
}

function cleanRateMaps() {
  const now = Date.now();
  for (const map of [loginAttempts, verifyAttempts, robloxUploadAttempts]) {
    for (const [key, timestamps] of map) {
      const valid = timestamps.filter((time) => now - time < 60 * 60 * 1000);
      if (valid.length) map.set(key, valid);
      else map.delete(key);
    }
  }
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}
setInterval(cleanRateMaps, 10 * 60 * 1000).unref();

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  });
  res.end(body);
}

function readJson(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Du lieu gui len qua lon.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('JSON khong hop le.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

function currentSession(req) {
  const token = parseCookies(req.headers.cookie).ta_store_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, session };
}

function requireAdmin(req, res) {
  const found = currentSession(req);
  if (!found) {
    sendJson(res, 401, { ok: false, error: 'Vui long dang nhap quan tri.' });
    return null;
  }
  return found;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const requestHost = forwardedHost || req.headers.host;
    if (requestHost && parsed.host.toLowerCase() === String(requestHost).toLowerCase()) return true;
    // Cloudflare Tunnel may rewrite Host for the local origin. Only accept the
    // original HTTPS browser origin when Cloudflare's proxy headers are present.
    const proxiedByCloudflare = parsed.protocol === 'https:' && Boolean(req.headers['cf-ray']) && Boolean(req.headers['cf-connecting-ip']);
    return proxiedByCloudflare;
  } catch {
    return false;
  }
}

function validString(value, maxLength = 120) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function parseExpiry(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function createKeyValue() {
  return `TAS-${crypto.randomBytes(18).toString('hex').toUpperCase()}`;
}

function createPrefixedKey(prefix, totalLength) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffixLength = totalLength - prefix.length;
  let suffix = '';
  for (let i = 0; i < suffixLength; i += 1) suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  return `${prefix}${suffix}`;
}

function getKeyById(id) {
  return store.keys.find((item) => item.id === id);
}

function publicKeyStatus(key) {
  if (key.status === 'banned') return 'banned';
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function corsForVerify(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true; // Native clients/server-to-server calls do not send Origin.

  const allowed = Array.isArray(CONFIG.allowedOrigins) ? CONFIG.allowedOrigins : [];
  if (allowed.includes('*')) {
    // Public license verification has no cookies/auth credentials, so wildcard is safe here.
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    return false;
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

function normalizeAllowedOrigins(value) {
  if (!Array.isArray(value)) return { error: 'Danh sach CORS phai la mang URL origin.' };
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string') return { error: 'Moi origin phai la chuoi URL.' };
    const text = item.trim();
    if (!text) continue;
    if (text === '*') {
      return { value: ['*'] };
    }
    let parsed;
    try { parsed = new URL(text); } catch { return { error: `Origin khong hop le: ${text}` }; }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return { error: `Nhap origin goc, khong kem duong dan: ${text}` };
    }
    result.push(parsed.origin);
  }
  return { value: [...new Set(result)] };
}

function isProcessRunning(pidValue) {
  const pid = Number(pidValue);
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error && error.code === 'EPERM'; }
}

function readPidFile(filePath) {
  try { return Number.parseInt(fs.readFileSync(filePath, 'utf8').trim(), 10); }
  catch { return 0; }
}

function stopWindowsProcessTree(pid) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(Number(pid)) || Number(pid) < 1) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const done = () => { if (!finished) { finished = true; resolve(); } };
    const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    child.once('error', done);
    child.once('exit', done);
    setTimeout(done, 3500).unref();
  });
}

async function startWindowsNamedTunnel() {
  if (process.platform !== 'win32') return { managedExternally: true };
  const runtime = path.join(ROOT, '.runtime');
  const exe = path.join(runtime, 'cloudflared.exe');
  const pidFile = path.join(runtime, 'cloudflared.pid');
  const launcherPidFile = path.join(runtime, 'tunnel-launcher.pid');
  const modeFile = path.join(runtime, 'named-tunnel.mode');
  const tokenFile = getCloudflareTunnelTokenFile();
  if (!fs.existsSync(tokenFile)) throw new Error('Đã tạo cấu hình Tunnel nhưng chưa có file Tunnel Token trên máy. Hãy thử tạo link lại.');
  if (!fs.existsSync(exe)) throw new Error('Chưa có cloudflared.exe. Hãy chạy start.bat một lần để tải công cụ Cloudflare rồi bấm tạo link lại.');

  const currentPid = readPidFile(pidFile);
  let currentMode = '';
  try { currentMode = fs.readFileSync(modeFile, 'utf8').trim(); } catch { }
  if (currentMode === 'named' && isProcessRunning(currentPid)) return { started: true, reused: true };

  const launcherPid = readPidFile(launcherPidFile);
  if (isProcessRunning(launcherPid)) await stopWindowsProcessTree(launcherPid);
  if (isProcessRunning(currentPid)) await stopWindowsProcessTree(currentPid);
  await new Promise((resolve) => setTimeout(resolve, 800));

  fs.mkdirSync(runtime, { recursive: true });
  const logFile = path.join(runtime, 'cloudflared.log');
  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(exe, [
    'tunnel', '--no-autoupdate', '--metrics', '127.0.0.1:2000',
    'run', '--token-file', tokenFile
  ], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd]
  });
  child.once('error', () => { try { fs.closeSync(logFd); } catch { } });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  try { fs.closeSync(logFd); } catch { }
  fs.writeFileSync(pidFile, String(child.pid), 'ascii');
  fs.writeFileSync(modeFile, 'named', 'ascii');
  try { fs.rmSync(launcherPidFile, { force: true }); } catch { }
  child.unref();
  return { started: true, reused: false };
}

function getPublicTunnelUrl() {
  // Legacy launcher URL. A Named Tunnel is intentionally not treated as a Quick Tunnel.
  if (PERMANENT_PUBLIC_URL) return PERMANENT_PUBLIC_URL;
  const runtime = path.join(ROOT, '.runtime');
  try {
    const mode = fs.readFileSync(path.join(runtime, 'named-tunnel.mode'), 'utf8').trim();
    if (mode === 'named') return null;
  } catch { }
  const publicUrlFile = path.join(ROOT, 'PUBLIC_URL.txt');
  try {
    const rawUrl = fs.readFileSync(publicUrlFile, 'utf8').trim();
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(parsed.hostname)
        || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    const cloudflaredPid = readPidFile(path.join(runtime, 'cloudflared.pid'));
    return isProcessRunning(cloudflaredPid) ? parsed.origin : null;
  } catch { return null; }
}

function getStartupQuickTunnelUrl() {
  const runtime = path.join(ROOT, '.runtime');
  try {
    if (fs.readFileSync(path.join(runtime, 'named-tunnel.mode'), 'utf8').trim() === 'named') return null;
  } catch { }
  const url = getPublicTunnelUrl();
  return url && !PERMANENT_PUBLIC_URL ? url : null;
}

function getTemporaryTunnelFiles() {
  const runtime = path.join(ROOT, '.runtime');
  return {
    runtime,
    workerPid: path.join(runtime, 'temporary-tunnel-worker.pid'),
    childPid: path.join(runtime, 'temporary-cloudflared.pid'),
    url: path.join(runtime, 'temporary-public-url.txt'),
    status: path.join(runtime, 'temporary-tunnel-status.txt'),
    failed: path.join(runtime, 'temporary-tunnel-failed.flag'),
    log: path.join(runtime, 'temporary-cloudflared.log')
  };
}

function getTemporaryTunnelRawState() {
  const files = getTemporaryTunnelFiles();
  const workerPid = readPidFile(files.workerPid);
  const childPid = readPidFile(files.childPid);
  const workerRunning = isProcessRunning(workerPid);
  const childRunning = isProcessRunning(childPid);
  if (workerRunning && childRunning) {
    try {
      const parsed = new URL(fs.readFileSync(files.url, 'utf8').trim());
      if (parsed.protocol === 'https:' && /^[a-z0-9-]+\.trycloudflare\.com$/i.test(parsed.hostname)
          && !parsed.username && !parsed.password && !parsed.port && parsed.pathname === '/' && !parsed.search && !parsed.hash) {
        return { state: 'checking', url: parsed.origin, source: 'web-created' };
      }
    } catch { }
    let message = 'Cloudflare đang tạo link tạm thời...';
    try { message = fs.readFileSync(files.status, 'utf8').trim() || message; } catch { }
    return { state: 'starting', url: '', source: 'web-created', message };
  }
  if (workerRunning || childRunning) {
    let message = 'Đang khởi động tiến trình Quick Tunnel...';
    try { message = fs.readFileSync(files.status, 'utf8').trim() || message; } catch { }
    return { state: 'starting', url: '', source: 'web-created', message };
  }
  try {
    const message = fs.readFileSync(files.failed, 'utf8').trim();
    if (message) return { state: 'error', url: '', source: 'web-created', message };
  } catch { }
  const startupUrl = getStartupQuickTunnelUrl();
  if (startupUrl) return { state: 'checking', url: startupUrl, source: 'launcher' };
  return { state: 'offline', url: '', source: '', message: 'Chưa có link tạm thời. Bấm “Tạo link tạm thời” để bắt đầu.' };
}

let temporaryTunnelProbeCache = { url: '', checkedAt: 0, result: null };
async function checkTemporaryTunnelReachable(publicUrl) {
  let parsed;
  try { parsed = new URL(publicUrl); } catch { return { reachable: false, message: 'URL Quick Tunnel không hợp lệ.' }; }
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(parsed.hostname)) {
    return { reachable: false, message: 'URL không phải Cloudflare Quick Tunnel hợp lệ.' };
  }
  const now = Date.now();
  if (temporaryTunnelProbeCache.url === parsed.origin && temporaryTunnelProbeCache.result
      && now - temporaryTunnelProbeCache.checkedAt < 5000) return temporaryTunnelProbeCache.result;
  const result = await new Promise((resolve) => {
    const request = https.get(new URL('/api/health', parsed.origin), { headers: { accept: 'application/json', 'cache-control': 'no-cache' } }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk.toString('utf8'); if (body.length > 8192) request.destroy(new Error('Phản hồi health quá lớn.')); });
      response.on('end', () => {
        let health;
        try { health = JSON.parse(body); } catch { return resolve({ reachable: false, message: `Quick Tunnel trả HTTP ${response.statusCode}, chưa phải API health của website.` }); }
        const reachable = response.statusCode === 200 && health && health.ok === true
          && health.service === 'Tuan Anh Store Key API' && health.version === APP_VERSION;
        resolve({ reachable, message: reachable ? 'Link tạm thời đã truy cập HTTPS từ Internet và phản hồi đúng website Tuấn Anh Store.' : 'Tunnel chưa tới đúng phiên bản website. Đợi thêm hoặc kiểm tra kết nối local.' });
      });
    });
    request.setTimeout(6500, () => request.destroy(new Error('Hết thời gian kiểm tra Quick Tunnel.')));
    request.on('error', (error) => resolve({ reachable: false, message: `Chưa truy cập được link tạm thời: ${error.message}` }));
  });
  temporaryTunnelProbeCache = { url: parsed.origin, checkedAt: Date.now(), result };
  return result;
}

async function getTemporaryTunnelStatusPayload() {
  const raw = getTemporaryTunnelRawState();
  let reachable = false;
  let message = raw.message || 'Chưa có link tạm thời.';
  if (raw.url) {
    const probe = await checkTemporaryTunnelReachable(raw.url);
    reachable = probe.reachable;
    message = probe.message;
  }
  let logTail = '';
  try { logTail = fs.readFileSync(getTemporaryTunnelFiles().log, 'utf8').slice(-5000); } catch { }
  if (!raw.url && raw.state === 'starting') {
    try { logTail = fs.readFileSync(getTemporaryTunnelFiles().log, 'utf8').slice(-5000); } catch { }
  }
  return {
    ok: true,
    type: 'temporary',
    state: raw.url ? (reachable ? 'ready' : 'checking') : raw.state,
    available: Boolean(raw.url && reachable),
    url: raw.url && reachable ? raw.url : null,
    configuredUrl: raw.url || '',
    source: raw.source,
    message,
    logTail
  };
}

function startTemporaryTunnelFromWeb() {
  const files = getTemporaryTunnelFiles();
  fs.mkdirSync(files.runtime, { recursive: true });
  const workerScript = path.join(ROOT, 'temporary-tunnel-worker.js');
  if (!fs.existsSync(workerScript)) throw new Error('Không tìm thấy temporary-tunnel-worker.js trong source V27.');
  if (process.platform !== 'win32' && process.platform !== 'linux' && process.platform !== 'darwin') {
    throw new Error(`Hệ điều hành ${process.platform} chưa được hỗ trợ tạo Quick Tunnel.`);
  }
  if (process.platform === 'win32' && !fs.existsSync(path.join(files.runtime, 'cloudflared.exe'))) {
    throw new Error('Chưa có cloudflared.exe. Hãy chạy start.bat một lần để tải công cụ Cloudflare trước.');
  }
  if (process.platform !== 'win32' && !fs.existsSync(process.env.CLOUDFLARED_BIN || '/usr/local/bin/cloudflared')) {
    throw new Error('Không tìm thấy cloudflared trong image. Hãy dùng Dockerfile V27 hoặc cài cloudflared.');
  }
  const workerPid = readPidFile(files.workerPid);
  const childPid = readPidFile(files.childPid);
  if (isProcessRunning(workerPid) || isProcessRunning(childPid)) return { started: false, state: 'starting' };
  for (const file of [files.url, files.failed, files.status, files.log, files.childPid]) {
    try { fs.rmSync(file, { force: true }); } catch { }
  }
  const worker = spawn(process.execPath, [workerScript], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, TA_STORE_PORT: String(CONFIG.port), CLOUDFLARED_BIN: process.env.CLOUDFLARED_BIN || (process.platform === 'win32' ? path.join(files.runtime, 'cloudflared.exe') : '/usr/local/bin/cloudflared') }
  });
  if (!worker.pid) throw new Error('Không tạo được tiến trình Quick Tunnel nền.');
  fs.writeFileSync(files.workerPid, String(worker.pid), 'ascii');
  worker.once('error', (error) => {
    try { fs.writeFileSync(files.failed, `Không khởi chạy worker: ${error.message}`, 'utf8'); } catch { }
  });
  worker.unref();
  return { started: true, workerPid: worker.pid };
}

async function stopTemporaryTunnelFromWeb() {
  const files = getTemporaryTunnelFiles();
  const workerPid = readPidFile(files.workerPid);
  const childPid = readPidFile(files.childPid);
  if (isProcessRunning(workerPid)) {
    if (process.platform === 'win32') await stopWindowsProcessTree(workerPid);
    else { try { process.kill(workerPid, 'SIGTERM'); } catch { } }
  } else if (isProcessRunning(childPid)) {
    if (process.platform === 'win32') await stopWindowsProcessTree(childPid);
    else { try { process.kill(childPid, 'SIGTERM'); } catch { } }
  }
  // Also allow Admin to stop the one-time Quick Tunnel launched by start.bat,
  // but never stop a Named Tunnel or the persistent domain connector.
  const startupUrl = getStartupQuickTunnelUrl();
  if (startupUrl) {
    const runtime = path.join(ROOT, '.runtime');
    const mode = (() => { try { return fs.readFileSync(path.join(runtime, 'named-tunnel.mode'), 'utf8').trim(); } catch { return ''; } })();
    if (mode !== 'named') {
      const launcher = readPidFile(path.join(runtime, 'tunnel-launcher.pid'));
      const cloudflared = readPidFile(path.join(runtime, 'cloudflared.pid'));
      if (isProcessRunning(launcher)) {
        if (process.platform === 'win32') await stopWindowsProcessTree(launcher);
        else { try { process.kill(launcher, 'SIGTERM'); } catch { } }
      }
      if (isProcessRunning(cloudflared)) {
        if (process.platform === 'win32') await stopWindowsProcessTree(cloudflared);
        else { try { process.kill(cloudflared, 'SIGTERM'); } catch { } }
      }
      try { fs.rmSync(path.join(ROOT, 'PUBLIC_URL.txt'), { force: true }); } catch { }
    }
  }
  for (const file of [files.workerPid, files.childPid, files.url, files.status, files.failed]) {
    try { fs.rmSync(file, { force: true }); } catch { }
  }
  temporaryTunnelProbeCache = { url: '', checkedAt: 0, result: null };
  return { ok: true, stopped: true };
}

function getPublicTunnelState() {
  if (PERMANENT_PUBLIC_URL) {
    return { state: 'configured', permanent: true, message: 'Tên miền đã được lưu. Đang chờ Named Cloudflare Tunnel kết nối trên VPS.' };
  }
  const runtime = path.join(ROOT, '.runtime');
  const launcherPid = readPidFile(path.join(runtime, 'tunnel-launcher.pid'));
  const cloudflaredPid = readPidFile(path.join(runtime, 'cloudflared.pid'));
  if (getPublicTunnelUrl()) return { state: 'ready', message: 'Website đã sẵn sàng cho mọi người truy cập.' };
  if (isProcessRunning(launcherPid) || isProcessRunning(cloudflaredPid)) {
    let detail = 'Cloudflare đang tạo đường dẫn công khai. Vui lòng đợi trong giây lát.';
    try {
      const status = fs.readFileSync(path.join(runtime, 'tunnel-status.txt'), 'utf8').trim();
      if (status) detail = status;
    } catch { }
    return { state: 'starting', message: detail };
  }
  const failedFile = path.join(runtime, 'tunnel-failed.flag');
  if (fs.existsSync(failedFile)) {
    let detail = 'Chưa tạo được link. Hãy kiểm tra log tunnel.';
    try { detail = fs.readFileSync(failedFile, 'utf8').trim() || detail; } catch { }
    return { state: 'error', message: detail };
  }
  if (tunnelStartRequestedAt && Date.now() - tunnelStartRequestedAt < 30000) {
    return { state: 'starting', message: 'Cloudflare đang khởi chạy. Vui lòng đợi trong giây lát.' };
  }
  return { state: 'offline', message: 'Chưa có link công khai. Đăng nhập Admin để tạo link ngay trên website.' };
}

let tunnelStartRequestedAt = 0;

function startPublicTunnelFromWeb() {
  if (process.platform !== 'win32') {
    throw new Error('Tạo link trực tiếp trong website hiện được hỗ trợ trên Windows; hãy dùng start.bat trên hệ thống này.');
  }
  const runtime = path.join(ROOT, '.runtime');
  fs.mkdirSync(runtime, { recursive: true });
  const script = path.join(ROOT, 'start-public-tunnel.ps1');
  if (!fs.existsSync(script)) throw new Error('Không tìm thấy trình khởi chạy Cloudflare Tunnel.');

  // Remove stale state before launching so the UI cannot mistake an old URL for a new one.
  for (const name of ['PUBLIC_URL.txt', 'tunnel-failed.flag', 'tunnel-status.txt']) {
    try { fs.rmSync(path.join(name === 'PUBLIC_URL.txt' ? ROOT : runtime, name), { force: true }); } catch { }
  }

  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  });
  tunnelStartRequestedAt = Date.now();
  child.once('error', (error) => {
    const message = `Không thể khởi động PowerShell Tunnel: ${error.message}`;
    try {
      fs.writeFileSync(path.join(runtime, 'tunnel-failed.flag'), message, 'utf8');
      fs.writeFileSync(path.join(runtime, 'tunnel-status.txt'), message, 'utf8');
    } catch { }
  });
  child.once('exit', (code, signal) => {
    // A launcher that exits without a live URL is a failed start, not an endless spinner.
    if (!getPublicTunnelUrl()) {
      const failedFile = path.join(runtime, 'tunnel-failed.flag');
      if (!fs.existsSync(failedFile)) {
        const message = `Trình khởi chạy Tunnel đã dừng (mã ${code ?? 'không rõ'}${signal ? `, tín hiệu ${signal}` : ''}) trước khi có link. Xem .runtime/cloudflared.log.`;
        try {
          fs.writeFileSync(failedFile, message, 'utf8');
          fs.writeFileSync(path.join(runtime, 'tunnel-status.txt'), message, 'utf8');
        } catch { }
      }
    }
  });
  child.unref();
}

const ROBLOX_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/bmp']);
const robloxUploadAttempts = new Map();

function sniffRobloxImage(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 24
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 26 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      while (offset < buffer.length && buffer[offset] === 0xff) offset++;
      if (offset >= buffer.length) break;
      const marker = buffer[offset++];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)
          && segmentLength >= 7) {
        return { mimeType: 'image/jpeg', height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
      }
      offset += segmentLength;
    }
    return null;
  }
  if (buffer.length >= 54 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    const width = Math.abs(buffer.readInt32LE(18));
    const height = Math.abs(buffer.readInt32LE(22));
    return { mimeType: 'image/bmp', width, height };
  }
  return null;
}

function robloxApiError(payload, fallback) {
  const message = payload?.message || payload?.error || payload?.status?.message || fallback;
  return String(message).replace(/[\r\n\t]+/g, ' ').slice(0, 600);
}

async function robloxCloudRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
  const raw = await response.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { message: raw.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(robloxApiError(payload, `Roblox Open Cloud trả HTTP ${response.status}.`));
    error.statusCode = response.status === 401 || response.status === 403 ? 502 : 502;
    throw error;
  }
  return payload;
}

async function uploadRobloxImage(body) {
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const creatorType = body.creatorType === 'group' ? 'group' : body.creatorType === 'user' ? 'user' : '';
  const creatorId = typeof body.creatorId === 'string' ? body.creatorId.trim() : String(body.creatorId || '').trim();
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 50) : '';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '';
  const fileName = typeof body.fileName === 'string' ? path.basename(body.fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) : 'tuananh-image.png';
  const suppliedMime = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : '';
  const base64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';

  if (apiKey.length < 16 || apiKey.length > 500 || /[\r\n]/.test(apiKey)) {
    throw Object.assign(new Error('Roblox API Key không hợp lệ hoặc chưa được nhập.'), { statusCode: 400 });
  }
  if (!creatorType || !/^\d{1,20}$/.test(creatorId)) {
    throw Object.assign(new Error('Hãy chọn User/Group và nhập đúng Creator ID dạng số.'), { statusCode: 400 });
  }
  if (!displayName) {
    throw Object.assign(new Error('Tên ảnh Roblox không được để trống.'), { statusCode: 400 });
  }
  if (!ROBLOX_IMAGE_MIME_TYPES.has(suppliedMime) || !base64 || base64.length > Math.ceil(ROBLOX_IMAGE_MAX_BYTES * 4 / 3) + 16) {
    throw Object.assign(new Error('Ảnh phải là PNG, JPG hoặc BMP và không vượt quá 20 MB.'), { statusCode: 400 });
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw Object.assign(new Error('Dữ liệu ảnh Base64 không hợp lệ.'), { statusCode: 400 });
  }

  const fileBuffer = Buffer.from(base64, 'base64');
  if (!fileBuffer.length || fileBuffer.length > ROBLOX_IMAGE_MAX_BYTES) {
    throw Object.assign(new Error('Dung lượng ảnh phải từ 1 byte đến 20 MB.'), { statusCode: 413 });
  }
  const detected = sniffRobloxImage(fileBuffer);
  if (!detected || detected.mimeType !== suppliedMime) {
    throw Object.assign(new Error('Định dạng file không khớp nội dung ảnh. Hãy chọn lại PNG/JPG/BMP gốc.'), { statusCode: 400 });
  }
  if (!detected.width || !detected.height || detected.width >= 8000 || detected.height >= 8000) {
    throw Object.assign(new Error('Kích thước ảnh Roblox phải nhỏ hơn 8000 × 8000 pixel.'), { statusCode: 400 });
  }

  const metadata = {
    assetType: 'Image',
    displayName,
    description,
    creationContext: {
      creator: creatorType === 'group' ? { groupId: creatorId } : { userId: creatorId }
    }
  };
  const form = new FormData();
  form.set('request', JSON.stringify(metadata));
  form.set('fileContent', new Blob([fileBuffer], { type: detected.mimeType }), fileName || 'tuananh-image');

  // API key is used only for this outbound request. It is never written to disk or logs.
  const created = await robloxCloudRequest('https://apis.roblox.com/assets/v1/assets', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: form
  });

  let asset = created?.response || null;
  if (!asset?.assetId) {
    const operationPath = String(created?.path || '').replace(/^\/+/, '');
    const operationMatch = operationPath.match(/^operations\/([A-Za-z0-9_-]{1,160})$/);
    if (!operationMatch) {
      throw Object.assign(new Error('Roblox đã nhận yêu cầu nhưng không trả operation ID hợp lệ.'), { statusCode: 502 });
    }
    const operationId = operationMatch[1];
    let operation = created;
    for (let attempt = 0; attempt < 24; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 500 + attempt * 80)));
      operation = await robloxCloudRequest(`https://apis.roblox.com/assets/v1/operations/${encodeURIComponent(operationId)}`, {
        method: 'GET', headers: { 'x-api-key': apiKey }
      });
      if (operation.done) break;
    }
    if (!operation?.done) {
      throw Object.assign(new Error(`Roblox đang xử lý ảnh. Operation ID: ${operationId}. Hãy thử lại sau; đừng upload lại ngay để tránh tạo ảnh trùng.`), { statusCode: 504 });
    }
    if (operation.error || operation.status?.error) {
      throw Object.assign(new Error(robloxApiError(operation.error || operation.status, 'Roblox từ chối xử lý ảnh.')), { statusCode: 502 });
    }
    asset = operation.response || null;
  }

  const assetId = String(asset?.assetId || '').trim();
  if (!/^\d{1,24}$/.test(assetId)) {
    throw Object.assign(new Error('Upload đã hoàn tất nhưng phản hồi không chứa Asset ID hợp lệ.'), { statusCode: 502 });
  }
  return {
    assetId,
    assetUri: `rbxassetid://${assetId}`,
    displayName: asset.displayName || displayName,
    moderationState: asset.moderationResult?.moderationState || 'pending_or_not_returned',
    creator: asset.creationContext?.creator || metadata.creationContext.creator
  };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'Tuan Anh Store Key API', version: APP_VERSION, host: CONFIG.host, port: CONFIG.port, verifyEndpoint: '/api/verify', time: new Date().toISOString() });
  }

  if (pathname === '/api/public/link' && req.method === 'GET') {
    // The invite URL is private to the signed-in administrator. A saved hostname
    // is not called available until its public HTTPS health endpoint reaches this app.
    const linkSession = requireAdmin(req, res);
    if (!linkSession) return;
    if (PERMANENT_PUBLIC_URL) {
      const tunnel = await checkNamedTunnelReady();
      const publicCheck = await checkPublicDomainReachable(PERMANENT_PUBLIC_URL);
      const available = publicCheck.reachable;
      return sendJson(res, 200, {
        ok: true,
        available,
        url: available ? PERMANENT_PUBLIC_URL : null,
        state: available ? 'ready' : (tunnel.ready ? 'unreachable' : 'configured'),
        permanent: true,
        tunnelConnected: tunnel.ready,
        configuredUrl: PERMANENT_PUBLIC_URL,
        message: publicCheck.message
      });
    }
    const publicUrl = getPublicTunnelUrl();
    const tunnelState = getPublicTunnelState();
    return sendJson(res, 200, {
      ok: true,
      available: Boolean(publicUrl),
      url: publicUrl,
      state: tunnelState.state,
      permanent: Boolean(tunnelState.permanent),
      configuredUrl: '',
      message: tunnelState.state === 'error' ? 'Chưa thể tạo link công khai. Admin hãy kiểm tra trạng thái trong trang quản trị.' : tunnelState.message
    });
  }

  if (pathname === '/api/public/stats' && req.method === 'GET') {
    // Chi cong khai so lieu tong hop; khong tra ve key, ten key hay danh sach thiet bi.
    const active = store.keys.filter((key) => publicKeyStatus(key) === 'active').length;
    const banned = store.keys.filter((key) => key.status === 'banned').length;
    const devices = store.keys.reduce((sum, key) => sum + key.devices.length, 0);
    return sendJson(res, 200, { ok: true, total: store.keys.length, active, banned, devices });
  }

  if (pathname === '/api/verify') {
    if (!corsForVerify(req, res)) {
      return sendJson(res, 403, { ok: false, status: 'cors_blocked', error: 'Origin nay chua duoc cho phep goi API.' });
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST, OPTIONS' });
    const ip = getClientIp(req);
    if (!allowRate(verifyAttempts, ip, 180, 60 * 1000)) {
      return sendJson(res, 429, { ok: false, status: 'rate_limited', error: 'Qua nhieu yeu cau. Thu lai sau.' });
    }
    const body = await readJson(req);
    const keyValue = typeof body.key === 'string' ? body.key.trim().toUpperCase() : '';
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    if (!keyValue || !validString(deviceId, 200)) {
      return sendJson(res, 400, { ok: false, status: 'bad_request', error: 'Can key va deviceId hop le.' });
    }
    const key = store.keys.find((item) => item.key === keyValue);
    if (!key) return sendJson(res, 200, { ok: false, status: 'invalid', error: 'Key khong ton tai.' });
    const requestedApplication = typeof body.application === 'string' ? body.application.trim() : '';
    if (key.application && !requestedApplication) {
      return sendJson(res, 200, { ok: false, status: 'application_required', error: 'Key này cần tên ứng dụng khi xác thực.' });
    }
    if (key.application && requestedApplication.toLocaleLowerCase('vi-VN') !== String(key.application).toLocaleLowerCase('vi-VN')) {
      return sendJson(res, 200, { ok: false, status: 'application_mismatch', error: 'License Key không thuộc ứng dụng này.' });
    }
    const status = publicKeyStatus(key);
    if (status !== 'active') {
      return sendJson(res, 200, { ok: false, status, error: status === 'banned' ? 'Key da bi khoa.' : 'Key da het han.' });
    }

    let device = key.devices.find((item) => item.deviceId === deviceId);
    if (!device && key.maxDevices > 0 && key.devices.length >= key.maxDevices) {
      return sendJson(res, 200, {
        ok: false,
        status: 'device_limit',
        error: 'Key da dat gioi han thiet bi.',
        devicesUsed: key.devices.length,
        maxDevices: key.maxDevices
      });
    }

    const now = new Date().toISOString();
    if (device) {
      device.lastSeen = now;
    } else {
      device = { id: crypto.randomUUID(), deviceId, firstSeen: now, lastSeen: now };
      key.devices.push(device);
    }
    if (Number.isSafeInteger(key.pendingDurationMs) && key.pendingDurationMs > 0 && !key.activatedAt) {
      key.activatedAt = now;
      key.expiresAt = new Date(Date.now() + key.pendingDurationMs).toISOString();
      key.pendingDurationMs = 0;
    }
    key.lastUsedAt = now;
    await persistStore();
    return sendJson(res, 200, {
      ok: true,
      status: 'valid',
      keyName: key.name,
      application: key.application || '',
      level: Number.isSafeInteger(key.level) ? key.level : 1,
      expiresAt: key.expiresAt,
      devicesUsed: key.devices.length,
      maxDevices: key.maxDevices,
      deviceLimit: key.maxDevices === 0 ? 'unlimited' : 'limited'
    });
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });

    // Successful logins are unlimited. Only failed credentials count toward the
    // short rate limit, so repeatedly signing in/out never locks the admin out.
    const ip = getClientIp(req);
    const body = await readJson(req);
    const suppliedUsername = typeof body.username === 'string' ? body.username.trim().toUpperCase() : '';
    const suppliedPassword = typeof body.password === 'string' ? body.password : '';
    const usernameMatches = safeEqual(Buffer.from(suppliedUsername, 'utf8'), expectedUsername);
    const passwordMatches = safeEqual(hashPassword(suppliedPassword), expectedPasswordHash);
    if (!usernameMatches || !passwordMatches) {
      // Chi tam gioi han khi nhap sai lien tiep; cua so gioi han ngan de tranh khoa oan 15 phut.
      if (!allowRate(loginAttempts, ip, 10, 60 * 1000)) {
        return sendJson(res, 429, { ok: false, error: 'Nhap sai qua nhieu lan. Vui long doi 1 phut roi thu lai.' });
      }
      return sendJson(res, 401, { ok: false, error: 'Tai khoan hoac mat khau khong dung.' });
    }

    // Clear prior failed attempts after a valid login and issue a fresh session.
    // Multiple sessions can coexist; each browser/device can sign in independently.
    loginAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
    recordActivity('account', 'Admin đăng nhập', 'Đăng nhập quản trị thành công.');
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const secure = (CONFIG.cookieSecure || forwardedProto === 'https') ? '; Secure' : '';
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `ta_store_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
    });
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });
    const found = currentSession(req);
    if (found) {
      sessions.delete(found.token);
      recordActivity('account', 'Admin đăng xuất', 'Phiên quản trị đã kết thúc.');
    }
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': 'ta_store_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    });
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  if (pathname === '/api/admin/roblox/assets' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin không hợp lệ.' });
    const ip = getClientIp(req);
    if (!allowRate(robloxUploadAttempts, ip, 5, 60 * 1000)) {
      return sendJson(res, 429, { ok: false, error: 'Đã upload quá nhiều ảnh trong thời gian ngắn. Hãy đợi một phút.' });
    }
    const body = await readJson(req, ROBLOX_UPLOAD_MAX_BODY_BYTES);
    const result = await uploadRobloxImage(body);
    recordActivity('tool', 'Upload ảnh Roblox Open Cloud', `Asset ID: ${result.assetId}; creator: ${body.creatorType === 'group' ? 'group' : 'user'} ${String(body.creatorId || '').slice(0, 20)}; moderation: ${result.moderationState}. API Key không được lưu.`);
    return sendJson(res, 200, { ok: true, ...result, message: 'Roblox đã trả Asset ID. Ảnh vẫn phải tuân theo moderation và quyền sử dụng của Roblox.' });
  }

  if (pathname === '/api/admin/activity' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin không hợp lệ.' });
    const body = await readJson(req);
    const events = {
      page_keys_open: ['system', 'Mở trang Quản lý Key'],
      page_api_open: ['system', 'Mở trang API Server'],
      page_settings_open: ['system', 'Mở trang Cài đặt'],
      page_activity_open: ['system', 'Mở trang Hoạt động'],
      page_lua_studio_open: ['tool', 'Mở Lua Studio'],
      license_key_copied: ['license', 'Sao chép License Key'],
      lua_source_loaded: ['tool', 'Tải script Lua'],
      lua_source_edited: ['tool', 'Chỉnh sửa script Lua'],
      lua_script_made: ['tool', 'MAKE script Lua'],
      lua_output_downloaded: ['tool', 'Tải xuống script Lua']
    };
    const event = events[String(body.action || '')];
    if (!event) return sendJson(res, 400, { ok: false, error: 'Loại hoạt động không được hỗ trợ.' });
    const detail = typeof body.detail === 'string' ? body.detail.slice(0, 180) : '';
    recordActivity(event[0], event[1], detail);
    return sendJson(res, 201, { ok: true });
  }

  if (pathname === '/api/admin/activity' && req.method === 'GET') {
    const requested = Number(url.searchParams.get('limit') || 150);
    const limit = Number.isInteger(requested) ? Math.max(1, Math.min(500, requested)) : 150;
    const today = new Date().toISOString().slice(0, 10);
    return sendJson(res, 200, {
      ok: true,
      total: activityLog.length,
      today: activityLog.filter((item) => String(item.at || '').slice(0, 10) === today).length,
      events: activityLog.slice(0, limit)
    });
  }

  if (pathname === '/api/admin/activity' && req.method === 'DELETE') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin không hợp lệ.' });
    activityLog = [];
    persistActivityLog();
    return sendJson(res, 200, { ok: true, cleared: true });
  }

  if (pathname === '/api/admin/temporary-link/status' && req.method === 'GET') {
    const status = await getTemporaryTunnelStatusPayload();
    if (status.available && status.url && status.url !== lastLoggedTemporaryLinkUrl) {
      lastLoggedTemporaryLinkUrl = status.url;
      recordActivity('share', 'Link tạm thời đã sẵn sàng', `Quick Tunnel đã xác minh HTTPS thành công: ${status.url}`);
    }
    return sendJson(res, 200, status);
  }

  if (pathname === '/api/admin/temporary-link/start' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin không hợp lệ.' });
    const current = await getTemporaryTunnelStatusPayload();
    if (current.available) return sendJson(res, 200, { ...current, started: false, message: 'Link tạm thời đang hoạt động; đây là link hiện tại.' });
    if (current.state === 'starting' || current.state === 'checking') {
      return sendJson(res, 202, { ...current, started: false, available: false, message: current.message || 'Quick Tunnel đang được khởi chạy/kiểm tra.' });
    }
    try {
      const started = startTemporaryTunnelFromWeb();
      recordActivity('share', 'Bắt đầu tạo link tạm thời', 'Admin đã khởi chạy Cloudflare Quick Tunnel.');
      return sendJson(res, 202, { ok: true, ...started, state: 'starting', available: false, message: 'Đã khởi chạy Quick Tunnel riêng. Đang chờ URL HTTPS từ Cloudflare...' });
    } catch (error) {
      return sendJson(res, 500, { ok: false, state: 'error', error: error.message || 'Không thể khởi chạy Quick Tunnel.' });
    }
  }

  if (pathname === '/api/admin/temporary-link/stop' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin không hợp lệ.' });
    await stopTemporaryTunnelFromWeb();
    recordActivity('share', 'Ngắt link tạm thời', 'Admin đã dừng Cloudflare Quick Tunnel.');
    return sendJson(res, 200, { ok: true, stopped: true, state: 'offline', message: 'Đã ngắt link tạm thời. Link này không còn truy cập được.' });
  }

  if (pathname === '/api/admin/public-link/cloudflare-token' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin không hợp lệ.' });
    const body = await readJson(req);
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    try {
      const verified = await verifyCloudflareApiToken(token);
      saveCloudflareApiToken(token);
      recordActivity('share', 'Lưu Cloudflare API Token', 'API Token đã được xác minh và lưu an toàn trên máy chủ; không ghi lại nội dung token.');
      return sendJson(res, 200, {
        ok: true,
        configured: true,
        tokenStatus: verified.status,
        expiresOn: verified.expiresOn,
        message: 'API Token Cloudflare đã được xác minh và lưu riêng trên máy chủ. Token không được gửi lại trình duyệt.'
      });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message || 'Không xác minh được Cloudflare API Token.' });
    }
  }

  if (pathname === '/api/admin/public-link/domain' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin không hợp lệ.' });
    const body = await readJson(req);
    let normalized;
    try { normalized = normalizeConfiguredPublicUrl(body.url); }
    catch (error) { return sendJson(res, 400, { ok: false, error: error.message }); }
    if (!normalized) return sendJson(res, 400, { ok: false, error: 'Hãy nhập tên miền bạn sở hữu trước khi tạo link.' });

    const runtimeCloudflareEnv = getCloudflareRuntimeEnv();
    const automation = getPublicLinkAutomationStatus();
    let provisioning = null;
    if (automation.configured) {
      try {
        provisioning = await provisionCloudflareHostname({
          hostname: new URL(normalized).hostname,
          origin: getTunnelOriginForProvisioning(),
          env: runtimeCloudflareEnv
        });
        if (process.platform === 'win32') await startWindowsNamedTunnel();
      } catch (error) {
        return sendJson(res, 502, {
          ok: false,
          error: error.message || 'Không thể tự cấu hình DNS và Cloudflare Tunnel.',
          autoProvisionConfigured: true,
          provisioned: false
        });
      }
    } else {
      // Backward compatibility: a domain already configured manually may still
      // be saved, but an unconfigured domain is never advertised as working.
      publicDomainProbeCache = { url: '', checkedAt: 0, result: null };
      const existingPublicCheck = await checkPublicDomainReachable(normalized);
      if (!existingPublicCheck.reachable) {
        return sendJson(res, 503, {
          ok: false,
          error: `${automation.message} Tên miền này chưa truy cập được công khai; hãy cấu hình API để website tự tạo DNS/route, hoặc cấu hình DNS/Tunnel thủ công rồi kiểm tra lại.`,
          autoProvisionConfigured: false,
          missingCloudflareSettings: automation.missing
        });
      }
    }

    // Persist only after Cloudflare accepted both the Published Route and DNS CNAME,
    // or after a manually configured domain has been verified against this app.
    CONFIG.publicBaseUrl = normalized;
    saveConfig(CONFIG);
    PERMANENT_PUBLIC_URL = normalized;
    recordActivity('share', 'Cấu hình tên miền công khai', `Hostname: ${new URL(normalized).hostname}; DNS/route provisioning đã được yêu cầu.`);
    publicDomainProbeCache = { url: '', checkedAt: 0, result: null };

    const tunnel = await checkNamedTunnelReady();
    const publicCheck = await checkPublicDomainReachable(normalized);
    const available = publicCheck.reachable;
    return sendJson(res, 200, {
      ok: true,
      saved: true,
      provisioned: Boolean(provisioning),
      dnsConfigured: provisioning ? provisioning.dnsConfigured : false,
      routeConfigured: provisioning ? provisioning.routeConfigured : false,
      permanent: true,
      available,
      url: available ? normalized : null,
      configuredUrl: normalized,
      hostname: new URL(normalized).hostname,
      cnameTarget: provisioning ? provisioning.cnameTarget : '',
      tunnelConnected: tunnel.ready,
      domainReachable: publicCheck.reachable,
      autoProvisionConfigured: automation.configured,
      message: available
        ? (provisioning
          ? 'Đã tự tạo/cập nhật DNS CNAME và Published Route. HTTPS đã truy cập được từ Internet; bạn có thể chia sẻ link.'
          : 'Tên miền đã được cấu hình sẵn và xác minh truy cập công khai thành công; bạn có thể chia sẻ link.')
        : (provisioning
          ? 'Đã cấu hình DNS CNAME và Published Route trên Cloudflare. DNS/HTTPS đang lan truyền hoặc Tunnel chưa sẵn sàng; đợi một chút rồi bấm Kiểm tra link. '
          : 'Tên miền đã lưu nhưng hiện chưa xác minh được truy cập công khai. ') + (publicCheck.message || '')
    });
  }

  if (pathname === '/api/admin/public-link/start' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });
    if (!PERMANENT_PUBLIC_URL) {
      return sendJson(res, 409, { ok: false, error: 'Hãy tạo link tạm thời ở thẻ “Quick Tunnel” phía trên hoặc nhập tên miền riêng rồi bấm Lưu tên miền.' });
    }
    if (PERMANENT_PUBLIC_URL) {
      const runtimeCloudflareEnv = getCloudflareRuntimeEnv();
      const automation = getPublicLinkAutomationStatus();
      let provisioning = null;
      if (automation.configured) {
        try {
          provisioning = await provisionCloudflareHostname({
            hostname: new URL(PERMANENT_PUBLIC_URL).hostname,
            origin: getTunnelOriginForProvisioning(),
            env: runtimeCloudflareEnv
          });
          if (process.platform === 'win32') await startWindowsNamedTunnel();
        } catch (error) {
          return sendJson(res, 502, { ok: false, error: error.message || 'Không thể cấu hình lại DNS/Tunnel.', provisioned: false });
        }
      }
      const tunnel = await checkNamedTunnelReady();
      publicDomainProbeCache = { url: '', checkedAt: 0, result: null };
      const publicCheck = await checkPublicDomainReachable(PERMANENT_PUBLIC_URL);
      const available = publicCheck.reachable;
      if (!automation.configured && !available) {
        return sendJson(res, 503, { ok: false, error: automation.message, autoProvisionConfigured: false, missingCloudflareSettings: automation.missing, permanent: true, configuredUrl: PERMANENT_PUBLIC_URL });
      }
      if (available) recordActivity('share', 'Xác minh link tên miền', `Website truy cập công khai thành công: ${new URL(PERMANENT_PUBLIC_URL).hostname}`);
      return sendJson(res, 200, {
        ok: true,
        started: false,
        provisioned: Boolean(provisioning),
        dnsConfigured: provisioning ? provisioning.dnsConfigured : false,
        routeConfigured: provisioning ? provisioning.routeConfigured : false,
        available,
        permanent: true,
        tunnelConnected: tunnel.ready,
        domainReachable: publicCheck.reachable,
        state: available ? 'ready' : (tunnel.ready ? 'unreachable' : 'configured'),
        url: available ? PERMANENT_PUBLIC_URL : null,
        configuredUrl: PERMANENT_PUBLIC_URL,
        message: available
          ? (provisioning
            ? 'DNS và Published Route đã được cấu hình; website đã truy cập công khai thành công.'
            : 'Tên miền đã được cấu hình và website hiện truy cập công khai thành công.')
          : (provisioning
            ? 'DNS và Published Route đã được cấu hình. Hãy đợi DNS/HTTPS lan truyền rồi kiểm tra lại. '
            : 'Tên miền đã lưu nhưng chưa truy cập được. ') + (publicCheck.message || '')
      });
    }
    const existingUrl = getPublicTunnelUrl();
    if (existingUrl) {
      return sendJson(res, 200, { ok: true, started: false, available: true, permanent: false, url: existingUrl, message: 'Tunnel đang hoạt động; đây là link hiện tại.' });
    }
    const runtime = path.join(ROOT, '.runtime');
    const launcherPid = readPidFile(path.join(runtime, 'tunnel-launcher.pid'));
    const cloudflaredPid = readPidFile(path.join(runtime, 'cloudflared.pid'));
    if (isProcessRunning(launcherPid) || isProcessRunning(cloudflaredPid) || (tunnelStartRequestedAt && Date.now() - tunnelStartRequestedAt < 30000)) {
      return sendJson(res, 202, { ok: true, started: false, available: false, state: 'starting', message: 'Tunnel đang được tạo. Trang sẽ tự cập nhật khi có link.' });
    }
    try {
      startPublicTunnelFromWeb();
      return sendJson(res, 202, { ok: true, started: true, available: false, state: 'starting', message: 'Đã khởi chạy Cloudflare Tunnel. Đang xin link công khai...' });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message });
    }
  }

  if (pathname === '/api/admin/public-link/status' && req.method === 'GET') {
    const tunnelState = getPublicTunnelState();
    let logTail = '';
    try {
      const lines = fs.readFileSync(path.join(ROOT, '.runtime', 'cloudflared.log'), 'utf8').split(/\r?\n/).filter(Boolean);
      logTail = lines.slice(-12).join('\n').slice(-5000);
    } catch { }
    if (PERMANENT_PUBLIC_URL) {
      const tunnel = await checkNamedTunnelReady();
      const publicCheck = await checkPublicDomainReachable(PERMANENT_PUBLIC_URL);
      const available = publicCheck.reachable;
      if (available && PERMANENT_PUBLIC_URL !== lastLoggedDomainUrl) {
        lastLoggedDomainUrl = PERMANENT_PUBLIC_URL;
        recordActivity('share', 'Tên miền công khai đã sẵn sàng', `Đã xác minh HTTPS: ${new URL(PERMANENT_PUBLIC_URL).hostname}`);
      }
      const state = available ? 'ready' : (tunnel.ready ? 'unreachable' : 'configured');
      const message = available
        ? 'Tên miền HTTPS đã được kiểm tra từ Internet và đang phục vụ đúng website Tuấn Anh Store.'
        : publicCheck.message || (tunnel.ready
          ? 'Tunnel đang kết nối nhưng tên miền chưa tới đúng website. Kiểm tra DNS và Published application route.'
          : 'Tên miền đã lưu nhưng Named Tunnel chưa kết nối. Kiểm tra Tunnel Connector, token trong bộ nhớ riêng và Published application route trên Cloudflare.');
      return sendJson(res, 200, {
        ok: true,
        state,
        permanent: true,
        available,
        tunnelConnected: tunnel.ready,
        domainReachable: publicCheck.reachable,
        url: available ? PERMANENT_PUBLIC_URL : null,
        configuredUrl: PERMANENT_PUBLIC_URL,
        autoProvisionConfigured: getPublicLinkAutomationStatus().configured,
        apiTokenConfigured: getPublicLinkAutomationStatus().configured,
        missingCloudflareSettings: getPublicLinkAutomationStatus().missing,
        cloudflareSetupMessage: getPublicLinkAutomationStatus().message,
        message,
        logTail
      });
    }
    const automation = getPublicLinkAutomationStatus();
    return sendJson(res, 200, {
      ok: true,
      state: PERMANENT_PUBLIC_URL ? tunnelState.state : 'not-configured',
      permanent: Boolean(PERMANENT_PUBLIC_URL),
      available: false,
      url: null,
      configuredUrl: PERMANENT_PUBLIC_URL || '',
      tunnelConnected: false,
      autoProvisionConfigured: automation.configured,
      apiTokenConfigured: automation.configured,
      missingCloudflareSettings: automation.missing,
      cloudflareSetupMessage: automation.message,
      message: PERMANENT_PUBLIC_URL ? tunnelState.message : 'Chưa cấu hình tên miền cố định. Hãy nhập hostname thuộc domain bạn sở hữu bên dưới. Link tạm thời nằm ở mục riêng phía trên.',
      logTail
    });
  }

  if (pathname === '/api/admin/me' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, authenticated: true });
  }

  if (pathname === '/api/admin/api-config' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      host: CONFIG.host,
      port: CONFIG.port,
      allowedOrigins: CONFIG.allowedOrigins,
      verifyUrl: `http://${req.headers.host || '127.0.0.1'}/api/verify`,
      restartRequired: false
    });
  }

  if (pathname === '/api/admin/api-config' && req.method === 'PUT') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });
    const body = await readJson(req);
    const normalized = normalizeAllowedOrigins(body.allowedOrigins ?? CONFIG.allowedOrigins);
    if (normalized.error) return sendJson(res, 400, { ok: false, error: normalized.error });

    let nextHost = CONFIG.host;
    if (body.host !== undefined) {
      if (!['127.0.0.1', '0.0.0.0'].includes(body.host)) {
        return sendJson(res, 400, { ok: false, error: 'Dia chi bind chi duoc la 127.0.0.1 hoac 0.0.0.0.' });
      }
      nextHost = body.host;
    }

    const hostChanged = nextHost !== CONFIG.host;
    CONFIG.allowedOrigins = normalized.value;
    CONFIG.host = nextHost;
    saveConfig(CONFIG);
    recordActivity('system', 'Cập nhật cấu hình API', `Bind host: ${CONFIG.host}; số origin: ${CONFIG.allowedOrigins.length}.`);

    if (hostChanged) {
      sendJson(res, 200, { ok: true, restartRequired: true, host: CONFIG.host, port: CONFIG.port, allowedOrigins: CONFIG.allowedOrigins });
      // Launcher watchdog restarts this process using the saved bind address.
      setTimeout(() => process.exit(0), 650).unref();
      return;
    }

    return sendJson(res, 200, { ok: true, restartRequired: false, host: CONFIG.host, port: CONFIG.port, allowedOrigins: CONFIG.allowedOrigins });
  }

  if (pathname === '/api/stats' && req.method === 'GET') {
    const active = store.keys.filter((key) => publicKeyStatus(key) === 'active').length;
    const banned = store.keys.filter((key) => key.status === 'banned').length;
    const devices = store.keys.reduce((sum, key) => sum + key.devices.length, 0);
    const unlimited = store.keys.filter((key) => key.maxDevices === 0).length;
    return sendJson(res, 200, { ok: true, total: store.keys.length, active, banned, devices, unlimited });
  }

  if (pathname === '/api/keys' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const statusFilter = url.searchParams.get('status') || 'all';
    const keys = store.keys
      .filter((key) => !q || key.name.toLowerCase().includes(q) || key.key.toLowerCase().includes(q))
      .filter((key) => statusFilter === 'all' || publicKeyStatus(key) === statusFilter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, { ok: true, keys });
  }

  if (pathname === '/api/keys' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });
    const body = await readJson(req);
    const application = typeof body.application === 'string' && body.application.trim()
      ? body.application.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) : '';
    const customName = typeof body.name === 'string' && body.name.trim()
      ? body.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100) : '';
    const note = typeof body.note === 'string'
      ? body.note.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250) : '';
    const level = body.level === undefined || body.level === null || body.level === '' ? 1 : Number(body.level);
    if (!Number.isSafeInteger(level) || level < 1 || level > 1000) {
      return sendJson(res, 400, { ok: false, error: 'Level phân quyền phải là số nguyên từ 1 đến 1000.' });
    }

    const customKeyRaw = typeof body.customKey === 'string' ? body.customKey.trim() : '';
    const randomize = customKeyRaw ? false : body.randomize !== false;
    const prefixRaw = typeof body.prefix === 'string' ? body.prefix.trim() : '';
    const legacyAuto = !customKeyRaw && !prefixRaw;
    const prefix = (customKeyRaw || prefixRaw || 'TAS-').toUpperCase();
    const prefixValid = customKeyRaw
      ? /^[A-Z0-9][A-Z0-9_-]{3,79}$/.test(prefix)
      : /^[A-Z0-9_-]{4,36}$/.test(prefix);
    if (!prefixValid) {
      return sendJson(res, 400, { ok: false, error: 'Prefix phải dài 4–36 ký tự; mã key tự nhập dài 4–80 ký tự. Chỉ dùng chữ, số, dấu - hoặc _.' });
    }

    const quantity = randomize ? (body.quantity === undefined ? 1 : Number(body.quantity)) : 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 500) {
      return sendJson(res, 400, { ok: false, error: 'Số lượng key phải là số nguyên từ 1 đến 500.' });
    }
    const keyLength = body.keyLength === undefined ? (legacyAuto ? 40 : 16) : Number(body.keyLength);
    if (randomize && (!Number.isSafeInteger(keyLength) || keyLength < 4 || keyLength > 80 || prefix.length > keyLength - 4)) {
      return sendJson(res, 400, { ok: false, error: 'Độ dài key phải từ 4–80 ký tự và prefix phải ngắn hơn độ dài ít nhất 4 ký tự.' });
    }
    if (!randomize && prefix.length > 80) {
      return sendJson(res, 400, { ok: false, error: 'Mã key tùy chỉnh không được dài quá 80 ký tự.' });
    }

    const hasDurationMs = body.durationMs !== undefined;
    const durationMs = hasDurationMs ? Number(body.durationMs) : 0;
    const maxDurationMs = 36500 * 24 * 60 * 60 * 1000;
    if (hasDurationMs && (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > maxDurationMs)) {
      return sendJson(res, 400, { ok: false, error: 'Thời hạn không hợp lệ.' });
    }
    const legacyExpiry = hasDurationMs ? null : parseExpiry(body.expiresAt);
    if (legacyExpiry === undefined) return sendJson(res, 400, { ok: false, error: 'Ngày hết hạn không hợp lệ.' });
    if (legacyExpiry && new Date(legacyExpiry).getTime() <= Date.now()) {
      return sendJson(res, 400, { ok: false, error: 'Ngày hết hạn phải nằm trong tương lai.' });
    }

    const hardwareLock = body.hardwareLock === true;
    const maxDevices = hardwareLock ? 1 : (body.maxDevices === '' || body.maxDevices === null || body.maxDevices === undefined ? 0 : Number(body.maxDevices));
    if (!Number.isSafeInteger(maxDevices) || maxDevices < 0 || maxDevices > 1000000) {
      return sendJson(res, 400, { ok: false, error: 'Giới hạn thiết bị phải là số nguyên từ 0 đến 1.000.000.' });
    }
    if (!randomize && quantity > 1) {
      return sendJson(res, 400, { ok: false, error: 'Key tự nhập chỉ tạo được một mã mỗi lần.' });
    }

    const used = new Set(store.keys.map((item) => String(item.key || '').toUpperCase()));
    const generated = [];
    for (let index = 0; index < quantity; index += 1) {
      const generateValue = () => randomize
        ? (legacyAuto ? createKeyValue() : createPrefixedKey(prefix, keyLength)) : prefix;
      let keyValue = generateValue();
      let attempts = 0;
      while (used.has(keyValue) && attempts < 30) {
        keyValue = generateValue();
        attempts += 1;
      }
      if (used.has(keyValue)) {
        return sendJson(res, 409, { ok: false, error: 'Không thể tạo mã key duy nhất. Hãy đổi prefix hoặc tăng độ dài key.' });
      }
      used.add(keyValue);
      const now = new Date().toISOString();
      generated.push({
        id: crypto.randomUUID(),
        key: keyValue,
        name: (customName || `${application || 'License'} · ${prefix} #${index + 1}`).slice(0, 100),
        application: application || undefined,
        prefix,
        keyLength: randomize ? keyLength : prefix.length,
        level,
        note,
        hardwareLock,
        status: 'active',
        reason: '',
        createdAt: now,
        activatedAt: null,
        pendingDurationMs: hasDurationMs ? durationMs : 0,
        expiresAt: hasDurationMs ? null : legacyExpiry,
        maxDevices,
        devices: [],
        lastUsedAt: null
      });
    }
    store.keys.push(...generated);
    await persistStore();
    const expiryLabel = hasDurationMs
      ? (durationMs > 0
        ? (durationMs % 86400000 === 0 ? `bắt đầu khi kích hoạt lần đầu (${durationMs / 86400000} ngày)` : `bắt đầu khi kích hoạt lần đầu (${durationMs / 3600000} giờ)`)
        : 'vĩnh viễn')
      : (legacyExpiry ? new Date(legacyExpiry).toLocaleString('vi-VN') : 'vĩnh viễn');
    recordActivity('license', generated.length > 1 ? 'Tạo hàng loạt License Key' : 'Tạo License Key',
      `Số lượng: ${generated.length}; ứng dụng: ${application || 'không gắn ứng dụng (API cũ)'}; thời hạn: ${expiryLabel}; HWID: ${hardwareLock ? '1 thiết bị/key' : 'không khóa'}; level: ${level}; ghi chú: ${note || 'không có'}.`);
    return sendJson(res, 201, { ok: true, key: generated[0], keys: generated, count: generated.length });
  }

  const banMatch = pathname.match(/^\/api\/keys\/([^/]+)\/(ban|unban)$/);
  if (banMatch && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });
    const key = getKeyById(decodeURIComponent(banMatch[1]));
    if (!key) return sendJson(res, 404, { ok: false, error: 'Khong tim thay key.' });
    if (banMatch[2] === 'ban') {
      const body = await readJson(req);
      key.status = 'banned';
      key.reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 250) : '';
    } else {
      key.status = 'active';
      key.reason = '';
    }
    await persistStore();
    recordActivity('license', banMatch[2] === 'ban' ? 'Khóa License Key' : 'Mở khóa License Key', `Key: ${key.name} · trạng thái: ${key.status}.`);
    return sendJson(res, 200, { ok: true, key });
  }

  const deviceMatch = pathname.match(/^\/api\/keys\/([^/]+)\/devices\/([^/]+)$/);
  if (deviceMatch && req.method === 'DELETE') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });
    const key = getKeyById(decodeURIComponent(deviceMatch[1]));
    if (!key) return sendJson(res, 404, { ok: false, error: 'Khong tim thay key.' });
    const deviceId = decodeURIComponent(deviceMatch[2]);
    const before = key.devices.length;
    key.devices = key.devices.filter((device) => device.id !== deviceId);
    if (before === key.devices.length) return sendJson(res, 404, { ok: false, error: 'Khong tim thay thiet bi.' });
    await persistStore();
    recordActivity('license', 'Gỡ thiết bị khỏi License Key', `Key: ${key.name}; thiết bị đã được gỡ khỏi danh sách kích hoạt.`);
    return sendJson(res, 200, { ok: true });
  }

  const keyMatch = pathname.match(/^\/api\/keys\/([^/]+)$/);
  if (keyMatch) {
    const key = getKeyById(decodeURIComponent(keyMatch[1]));
    if (!key) return sendJson(res, 404, { ok: false, error: 'Khong tim thay key.' });

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });
      const body = await readJson(req);
      if (body.name !== undefined) {
        if (!validString(body.name, 100)) return sendJson(res, 400, { ok: false, error: 'Ten key khong hop le.' });
        key.name = body.name.trim();
      }
      if (body.expiresAt !== undefined) {
        const expiry = parseExpiry(body.expiresAt);
        if (expiry === undefined) return sendJson(res, 400, { ok: false, error: 'Ngay het han khong hop le.' });
        if (expiry && new Date(expiry).getTime() <= Date.now()) return sendJson(res, 400, { ok: false, error: 'Ngay het han phai nam trong tuong lai.' });
        key.expiresAt = expiry;
        key.pendingDurationMs = 0;
        key.activatedAt = key.activatedAt || new Date().toISOString();
      }
      if (body.maxDevices !== undefined) {
        const limit = Number(body.maxDevices);
        if (!Number.isSafeInteger(limit) || limit < 0) return sendJson(res, 400, { ok: false, error: 'Gioi han thiet bi khong hop le.' });
        key.maxDevices = limit;
      }
      await persistStore();
      recordActivity('license', 'Chỉnh sửa License Key', `Tên hiện tại: ${key.name}; thời hạn: ${key.expiresAt ? new Date(key.expiresAt).toLocaleString('vi-VN') : 'vĩnh viễn'}.`);
      return sendJson(res, 200, { ok: true, key });
    }

    if (req.method === 'DELETE') {
      if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origin khong hop le.' });
      store.keys = store.keys.filter((item) => item.id !== key.id);
      await persistStore();
      recordActivity('license', 'Xóa License Key', `Tên key: ${key.name}.`);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { ok: false, error: 'API endpoint khong ton tai.' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp'
};
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'app.js', 'assets/tuan-anh-store-logo.webp', 'assets/tuan-anh-store-mark.webp', 'assets/tuan-anh-store-avatar.webp']);

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    }
    let relativePath;
    try {
      relativePath = (url.pathname === '/' || url.pathname === '/index.html') ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bad request');
    }
    // Chi phat cac tai nguyen giao dien; cam truy cap server.js, config.json, data va cac file noi bo.
    if (!PUBLIC_FILES.has(relativePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Not found');
    }
    const filePath = path.resolve(ROOT, relativePath);
    if (!filePath.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME[extension];
    if (!contentType) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'sha256-r1v5q1f8gjow2h1Pi5Lt5wV/eYbNh/RgYOiVJjGyT3M='; style-src 'self' 'sha256-YVOlgwZjmtTep2l4NxTu3ntzAU+UpQrn3tr6RayKE7A='; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('[SERVER ERROR]', error);
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { ok: false, error: error.statusCode ? error.message : 'Loi may chu.' });
    else res.destroy();
  }
}

const server = http.createServer(handleRequest);
server.on('error', (error) => {
  console.error(`[SERVER LISTEN ERROR] ${error.code || 'UNKNOWN'}: ${error.message}`);
  if (error.code === 'EADDRINUSE') console.error(`[SERVER LISTEN ERROR] Port ${CONFIG.port} dang duoc tien trinh khac su dung. Launcher se chon cong khac khi khoi dong lai.`);
  process.exit(1);
});
server.listen(CONFIG.port, CONFIG.host, () => {
  recordActivity('system', 'Server khởi động', `Website đang chạy tại http://${CONFIG.host}:${CONFIG.port} · phiên bản ${APP_VERSION}.`);
  console.log(`[STARTUP OK] version=${APP_VERSION} host=${CONFIG.host} port=${CONFIG.port} pid=${process.pid}`);
  console.log(`Tuan Anh Store dang chay: http://${CONFIG.host}:${CONFIG.port}`);
  console.log('Admin key manager + public license verification API: /api/verify');
  if (CONFIG.host === '127.0.0.1') console.log('De mo cho may khac: doi host thanh 0.0.0.0 trong config.json.');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
