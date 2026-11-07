'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_BASE = 'https://api.cloudflare.com/client/v4';
const AUTO_TUNNEL_NAME = 'tuan-anh-store-public';

function getCloudflareSetupState(env = process.env) {
  const token = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  const configured = token.length >= 20 && !/^PASTE_|^CHANGE_/i.test(token);
  return {
    configured,
    missing: configured ? [] : ['Cloudflare API Token'],
    message: configured
      ? 'Đã lưu Cloudflare API Token. Hệ thống có thể tự tìm Zone, tạo Named Tunnel và cấu hình DNS.'
      : 'Cần kết nối Cloudflare một lần bằng API Token có quyền Zone Read, DNS Read/Write và Cloudflare Tunnel Read/Write (một số giao diện cũ hiển thị Write là Edit). Không cần nhập Zone ID, Account ID, Tunnel ID hoặc Tunnel Token riêng.'
  };
}

async function cloudflareRequest(token, endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    if (error && error.name === 'TimeoutError') throw new Error('Cloudflare API hết thời gian chờ (25 giây). Kiểm tra Internet trên máy chủ.');
    throw new Error(`Không kết nối được Cloudflare API: ${error.message}`);
  }

  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`Cloudflare API trả phản hồi không hợp lệ (HTTP ${response.status}).`); }
  if (!response.ok || payload.success !== true) {
    const details = Array.isArray(payload.errors)
      ? payload.errors.map((item) => item && item.message).filter(Boolean).join('; ')
      : '';
    throw new Error(`Cloudflare API từ chối thao tác: ${details || `HTTP ${response.status}`}`);
  }
  return payload.result;
}

async function verifyCloudflareApiToken(token) {
  const clean = String(token || '').trim();
  if (clean.length < 20 || clean.length > 512 || /\s/.test(clean)) {
    throw new Error('API Token không đúng định dạng. Hãy dán nguyên token Cloudflare, không có khoảng trắng.');
  }
  const result = await cloudflareRequest(clean, '/user/tokens/verify');
  if (!result || result.status !== 'active') {
    throw new Error(`Cloudflare API Token không hoạt động (trạng thái: ${result && result.status ? result.status : 'không rõ'}).`);
  }
  return { id: result.id, status: result.status, expiresOn: result.expires_on || null };
}

function assertHostBelongsToZone(hostname, zoneName) {
  const zone = String(zoneName || '').toLowerCase().replace(/\.$/, '');
  if (!zone || !(hostname === zone || hostname.endsWith(`.${zone}`))) {
    throw new Error(`Tên miền ${hostname} không nằm trong Cloudflare Zone ${zoneName}. Hãy nhập domain/subdomain bạn sở hữu.`);
  }
}

async function discoverZone(token, hostname, env) {
  if (env.CLOUDFLARE_ZONE_ID) {
    const zone = await cloudflareRequest(token, `/zones/${encodeURIComponent(env.CLOUDFLARE_ZONE_ID)}`);
    if (!zone || !zone.name) throw new Error('Không tìm thấy Cloudflare Zone theo Zone ID đã cấu hình.');
    assertHostBelongsToZone(hostname, zone.name);
    if (zone.status !== 'active') throw new Error(`Cloudflare Zone ${zone.name} chưa Active. Hãy hoàn tất đổi nameserver sang Cloudflare.`);
    return zone;
  }

  const labels = hostname.toLowerCase().split('.');
  for (let index = 0; index < labels.length - 1; index += 1) {
    const candidate = labels.slice(index).join('.');
    const query = new URLSearchParams({ name: candidate, per_page: '50' });
    const zones = await cloudflareRequest(token, `/zones?${query.toString()}`);
    const exact = Array.isArray(zones)
      ? zones.find((item) => String(item.name || '').toLowerCase() === candidate)
      : null;
    if (exact) {
      assertHostBelongsToZone(hostname, exact.name);
      if (exact.status !== 'active') {
        throw new Error(`Tên miền ${exact.name} đã có trong Cloudflare nhưng Zone đang ở trạng thái ${exact.status || 'chưa rõ'}. Hãy hoàn tất đổi nameserver và chờ Zone Active.`);
      }
      if (!exact.account || !exact.account.id) throw new Error('Cloudflare không trả Account ID của Zone. Kiểm tra quyền Zone Read.');
      return exact;
    }
  }
  throw new Error(`Không tìm thấy domain gốc chứa ${hostname} trong Cloudflare. Bạn phải sở hữu domain, thêm domain vào Cloudflare và đổi nameserver trước.`);
}

async function getOrCreateTunnel(token, accountId, env) {
  const configuredId = String(env.CLOUDFLARE_TUNNEL_ID || '').trim();
  const tunnelName = String(env.CLOUDFLARE_TUNNEL_NAME || AUTO_TUNNEL_NAME).trim();
  let tunnel = null;
  let generatedToken = '';
  let created = false;

  if (configuredId) {
    tunnel = await cloudflareRequest(token, `/accounts/${accountId}/cfd_tunnel/${encodeURIComponent(configuredId)}`);
  } else {
    const query = new URLSearchParams({ name: tunnelName, is_deleted: 'false', per_page: '100' });
    const tunnels = await cloudflareRequest(token, `/accounts/${accountId}/cfd_tunnel?${query.toString()}`);
    tunnel = Array.isArray(tunnels)
      ? tunnels.find((item) => item && item.name === tunnelName && !item.deleted_at)
      : null;

    if (!tunnel) {
      tunnel = await cloudflareRequest(token, `/accounts/${accountId}/cfd_tunnel`, {
        method: 'POST',
        body: { name: tunnelName, config_src: 'cloudflare' }
      });
      created = true;
      generatedToken = String(tunnel && tunnel.token || '').trim();
    }
  }

  if (!tunnel || !tunnel.id) throw new Error('Không tạo hoặc tìm được Named Cloudflare Tunnel. Kiểm tra quyền Cloudflare Tunnel Edit.');
  if (tunnel.remote_config === false || (tunnel.config_src && tunnel.config_src !== 'cloudflare')) {
    throw new Error('Tunnel được chọn không phải loại remotely-managed. Hãy dùng tunnel có config_src=cloudflare.');
  }

  let tokenValue = String(env.CLOUDFLARE_TUNNEL_TOKEN || generatedToken).trim();
  if (!tokenValue) {
    tokenValue = String(await cloudflareRequest(token, `/accounts/${accountId}/cfd_tunnel/${tunnel.id}/token`)).trim();
  }
  if (!tokenValue) throw new Error('Cloudflare không trả Tunnel Token. Kiểm tra quyền Cloudflare Tunnel Edit.');

  return { tunnel, token: tokenValue, created };
}

function writePrivateTokenFile(filePath, token) {
  const destination = String(filePath || '').trim();
  if (!destination) throw new Error('Máy chủ chưa cấu hình vị trí lưu Tunnel Token an toàn. Hãy dùng Docker Compose V24 hoặc cấu hình CLOUDFLARE_TUNNEL_TOKEN_FILE.');
  const resolved = path.resolve(destination);
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temp = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(temp, 0o600); } catch { }
  fs.renameSync(temp, resolved);
  try { fs.chmodSync(resolved, 0o600); } catch { }
}

/**
 * Automatically discovers the Cloudflare zone, creates/reuses one remotely-managed
 * Tunnel, retrieves its connector token, configures the public hostname route, and
 * upserts the CNAME. The API token and Tunnel token never leave the server.
 */
async function provisionCloudflareHostname({ hostname, origin, env = process.env }) {
  const setup = getCloudflareSetupState(env);
  if (!setup.configured) throw new Error(setup.message);

  const token = String(env.CLOUDFLARE_API_TOKEN).trim();
  const service = String(origin || '').trim();
  let serviceUrl;
  try { serviceUrl = new URL(service); } catch { throw new Error('TA_STORE_TUNNEL_ORIGIN không phải URL hợp lệ.'); }
  if (!['http:', 'https:'].includes(serviceUrl.protocol) || serviceUrl.username || serviceUrl.password || serviceUrl.search || serviceUrl.hash) {
    throw new Error('TA_STORE_TUNNEL_ORIGIN chỉ được là URL HTTP/HTTPS nội bộ hợp lệ.');
  }

  // A hostname may be a subdomain. Discover the authoritative Cloudflare zone
  // by testing each parent suffix instead of asking the user for Zone ID.
  const zone = await discoverZone(token, hostname, env);
  const zoneId = zone.id;
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || zone.account && zone.account.id || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('Không lấy được Account ID từ Cloudflare Zone.');

  // Refuse ambiguous DNS state before changing any Cloudflare resource.
  const dnsQuery = new URLSearchParams({ name: hostname, per_page: '100' });
  const dnsResult = await cloudflareRequest(token, `/zones/${zoneId}/dns_records?${dnsQuery.toString()}`);
  const records = Array.isArray(dnsResult) ? dnsResult : [];
  const nonCname = records.filter((record) => String(record.type).toUpperCase() !== 'CNAME');
  if (nonCname.length) {
    throw new Error(`Hostname ${hostname} đang có bản ghi ${nonCname.map((record) => record.type).join(', ')}. Hãy kiểm tra DNS hiện tại trước; hệ thống không xóa A/AAAA/MX/TXT để tránh làm gián đoạn dịch vụ khác.`);
  }
  if (records.length > 1) throw new Error(`Có nhiều CNAME cho ${hostname}. Hãy giữ lại một bản ghi duy nhất trong Cloudflare DNS.`);

  const { tunnel, token: tunnelToken, created } = await getOrCreateTunnel(token, accountId, env);
  const tunnelId = tunnel.id;
  const target = `${tunnelId}.cfargotunnel.com`;
  if (records.length === 1) {
    const existingTarget = String(records[0].content || '').toLowerCase().replace(/\.$/, '');
    if (existingTarget !== target.toLowerCase()) {
      throw new Error(`Hostname ${hostname} đang trỏ tới ${records[0].content}, không phải Tunnel của Tuấn Anh Store. Hãy đổi/xóa CNAME cũ trong Cloudflare DNS rồi thử lại.`);
    }
  }

  // Keep other tunnel hostnames unchanged and ensure the catch-all rule stays last.
  const current = await cloudflareRequest(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`);
  const currentConfig = current && current.config && typeof current.config === 'object' ? current.config : {};
  const oldIngress = Array.isArray(currentConfig.ingress) ? currentConfig.ingress : [];
  const sameHostRules = oldIngress.filter((rule) => rule && String(rule.hostname || '').toLowerCase() === hostname);
  const matchingRoot = sameHostRules.find((rule) => !rule.path);
  const conflictingServices = sameHostRules.filter((rule) => rule.service && rule.service !== service);
  if (conflictingServices.length) {
    throw new Error(`Hostname ${hostname} đã được sử dụng bởi route khác. Hãy chọn subdomain riêng hoặc đổi route cũ trước.`);
  }
  const unrelatedRules = oldIngress.filter((rule) => rule && String(rule.hostname || '').toLowerCase() !== hostname && rule.service !== 'http_status:404');
  const catchAllRules = oldIngress.filter((rule) => rule && rule.service === 'http_status:404');
  const nextIngress = [
    ...unrelatedRules,
    ...sameHostRules.filter((rule) => Boolean(rule.path)),
    { ...(matchingRoot || {}), hostname, service, originRequest: (matchingRoot && matchingRoot.originRequest) || {} },
    ...(catchAllRules.length ? catchAllRules : [{ service: 'http_status:404' }])
  ];
  await cloudflareRequest(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: 'PUT', body: { config: { ...currentConfig, ingress: nextIngress } }
  });

  const dnsBody = { type: 'CNAME', name: hostname, content: target, proxied: true, ttl: 1 };
  if (records.length === 1) {
    const existing = records[0];
    if (existing.content !== target || existing.proxied !== true) {
      await cloudflareRequest(token, `/zones/${zoneId}/dns_records/${existing.id}`, { method: 'PUT', body: dnsBody });
    }
  } else {
    await cloudflareRequest(token, `/zones/${zoneId}/dns_records`, { method: 'POST', body: dnsBody });
  }

  const tokenFile = env.CLOUDFLARE_TUNNEL_TOKEN_FILE;
  writePrivateTokenFile(tokenFile, tunnelToken);

  return {
    hostname,
    url: `https://${hostname}`,
    zone: zone.name,
    zoneId,
    accountId,
    tunnelId,
    tunnelName: tunnel.name,
    tunnelCreated: created,
    tunnelTokenSaved: true,
    cnameTarget: target,
    service,
    routeConfigured: true,
    dnsConfigured: true
  };
}

module.exports = {
  getCloudflareSetupState,
  verifyCloudflareApiToken,
  provisionCloudflareHostname
};
