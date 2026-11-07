'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let allKeys = [];
let isAdmin = false;
let pendingShareAction = false;
const initialPage = ['home', 'keys', 'api', 'settings', 'activity', 'lua-studio'].includes(location.hash.replace('#', ''))
  ? location.hash.replace('#', '') : 'home';
let pendingPage = initialPage;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function toast(message, isError = false) {
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`;
  node.textContent = message;
  $('#toastRegion').appendChild(node);
  setTimeout(() => node.remove(), 3400);
}

async function api(path, options = {}) {
  // GitHub Pages chỉ phục vụ file tĩnh; nó không chạy server.js/API của TA-STORE-VN.
  // Chặn sớm để hiện đúng nguyên nhân thay vì báo lỗi JSON khó hiểu khi đăng nhập.
  if (location.hostname.endsWith('.github.io')) {
    throw new Error('Bạn đang mở bản GitHub Pages chỉ có giao diện. API đăng nhập Admin chưa chạy ở đây. Hãy deploy toàn bộ project lên Railway và mở domain *.up.railway.app của website.');
  }
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new Error('Không kết nối được máy chủ TA-STORE-VN. Hãy kiểm tra domain backend và trạng thái deploy.');
  }
  let data;
  try { data = await response.json(); }
  catch { data = { error: `Máy chủ trả nội dung không phải JSON (HTTP ${response.status}). Hãy mở website từ domain backend đã deploy, không dùng GitHub Pages.` }; }
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function navigate(page) {
  const target = ['home', 'keys', 'api', 'settings', 'activity', 'lua-studio'].includes(page) ? page : 'home';
  if (!isAdmin && target !== 'home') {
    pendingPage = target;
    showModal('loginModal');
    return;
  }
  $$('.page').forEach((section) => section.classList.toggle('active', section.id === `page-${target}`));
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.page === target));
  $('.nav-links').classList.remove('open');
  if (target === 'keys' && isAdmin) loadKeys();
  if (target === 'home' && isAdmin) loadStats();
  if (target === 'api' && isAdmin) loadApiPage();
  if (isAdmin) {
    const pageActivity = {
      keys: ['page_keys_open', 'Admin mở trang quản lý License Key.'],
      api: ['page_api_open', 'Admin mở trang cấu hình API Server.'],
      settings: ['page_settings_open', 'Admin mở trang cài đặt.'],
      activity: ['page_activity_open', 'Admin mở nhật ký hoạt động.'],
      'lua-studio': ['page_lua_studio_open', 'Admin mở công cụ make script Lua.']
    }[target];
    if (pageActivity) {
      const logged = trackAdminActivity(pageActivity[0], pageActivity[1]);
      if (target === 'activity') logged.finally(loadActivity);
    }
  }
  history.replaceState(null, '', `#${target}`);
}

function setAdminState(value) {
  isAdmin = value;
  document.body.classList.toggle('auth-locked', !value);
  $('#adminLabel').textContent = value ? 'Admin đã đăng nhập' : 'Chưa đăng nhập';
  $('.admin-state').classList.toggle('signed', value);
  $('#loginOpen').classList.toggle('hidden', value);
  $('#logoutButton').classList.toggle('hidden', !value);
  $$('.admin-only').forEach((item) => item.classList.toggle('hidden', !value));
  const shareCard = $('#publicShareCard');
  if (shareCard) shareCard.classList.toggle('hidden', !value);
  if (!value) {
    const shareInput = $('#publicShareUrl');
    const copyShare = $('#copyPublicShare');
    const openShare = $('#openPublicShare');
    if (shareInput) { shareInput.value = ''; shareInput.placeholder = 'Đăng nhập Admin để xem link mời'; delete shareInput.dataset.url; }
    if (copyShare) copyShare.disabled = true;
    if (openShare) { openShare.removeAttribute('href'); openShare.classList.add('hidden'); }
    const tempInput = $('#temporaryShareUrl');
    const tempCopy = $('#copyTemporaryShare');
    const tempOpen = $('#openTemporaryShare');
    if (tempInput) { tempInput.value = ''; tempInput.placeholder = 'Đăng nhập Admin để xem link tạm thời'; delete tempInput.dataset.url; }
    if (tempCopy) tempCopy.disabled = true;
    if (tempOpen) { tempOpen.removeAttribute('href'); tempOpen.classList.add('hidden'); }
    if ($('#stopTemporaryShare')) $('#stopTemporaryShare').disabled = true;
    if ($('#temporaryShareStatus')) $('#temporaryShareStatus').textContent = 'Đăng nhập Admin để tạo và quản lý link tạm thời.';
    if ($('#temporaryShareDot')) $('#temporaryShareDot').classList.remove('is-waiting', 'is-ready');
    // Khach truy cap van duoc xem trang chu; cac trang quan tri se goi login khi duoc chon.
    $$('.page').forEach((section) => section.classList.toggle('active', section.id === 'page-home'));
    $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.page === 'home'));
    history.replaceState(null, '', '#home');
    allKeys = [];
    $('#keysTable').innerHTML = '<tr><td colspan="5" class="empty-cell">Đăng nhập admin để xem danh sách key.</td></tr>';
    $('#keyCountLabel').textContent = 'Chưa đăng nhập';
    $('#publicShareStatus').textContent = 'Đăng nhập Admin để xem và tạo link mời.';
    $('#publicShareUpdated').textContent = 'Khu vực riêng tư';
    $('#publicShareDot').classList.remove('is-waiting', 'is-ready');
    loadPublicStats();
  } else {
    // Share card is mounted only after the admin login succeeds.
    refreshPublicShareLink({ silent: true });
    refreshTemporaryShareLink({ silent: true });
  }
}

async function prepareManualLogin() {
  // Luon yeu cau nguoi dung tu nhap thong tin moi moi lan mo trang.
  // Huy cookie/session cu de khong tu dong vao bang cookie da luu tu lan truoc.
  setAdminState(false);
  const submitButton = $('#loginSubmit');
  submitButton.disabled = true;
  $('#adminUsername').value = '';
  $('#adminPassword').value = '';
  $('#loginError').textContent = '';

  try {
    await api('/api/admin/logout', { method: 'POST', body: {} });
  } catch {
    // Neu server chua san sang, form dang nhap van hien de nguoi dung thu lai.
  } finally {
    submitButton.disabled = false;
  }
}

async function loadPublicStats() {
  try {
    const stats = await api('/api/public/stats');
    $('#statTotal').textContent = Number(stats.total).toLocaleString('vi-VN');
    $('#statActive').textContent = Number(stats.active).toLocaleString('vi-VN');
    $('#statDevices').textContent = Number(stats.devices).toLocaleString('vi-VN');
    $('#statBanned').textContent = Number(stats.banned).toLocaleString('vi-VN');
  } catch {
    $('#statTotal').textContent = '—';
    $('#statActive').textContent = '—';
    $('#statDevices').textContent = '—';
    $('#statBanned').textContent = '—';
  }
}

async function loadStats() {
  if (!isAdmin) return;
  try {
    const stats = await api('/api/stats');
    $('#statTotal').textContent = Number(stats.total).toLocaleString('vi-VN');
    $('#statActive').textContent = Number(stats.active).toLocaleString('vi-VN');
    $('#statDevices').textContent = Number(stats.devices).toLocaleString('vi-VN');
    $('#statBanned').textContent = Number(stats.banned).toLocaleString('vi-VN');
  } catch (error) {
    if (error.status === 401) setAdminState(false);
    else toast(error.message, true);
  }
}

function statusFor(key) {
  if (key.status === 'banned') return 'banned';
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function formatDate(value) {
  if (!value) return 'Không hết hạn';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không xác định';
  return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function renderKeys(keys) {
  const body = $('#keysTable');
  $('#keyCountLabel').textContent = `${keys.length.toLocaleString('vi-VN')} key`;
  if (!keys.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-cell">Chưa có key phù hợp. Bấm “Tạo Key mới” để bắt đầu.</td></tr>';
    return;
  }
  body.innerHTML = keys.map((key) => {
    const status = statusFor(key);
    const statusLabel = status === 'active' ? 'Hoạt động' : status === 'banned' ? 'Đã ban' : 'Hết hạn';
    const deviceLabel = key.maxDevices === 0 ? `${key.devices.length} / ∞` : `${key.devices.length} / ${key.maxDevices}`;
    const toggleAction = status === 'banned'
      ? `<button class="action-button" data-action="unban" data-id="${escapeHtml(key.id)}">Mở ban</button>`
      : `<button class="action-button" data-action="ban" data-id="${escapeHtml(key.id)}">Ban</button>`;
    return `<tr>
      <td><div class="key-cell"><b>${escapeHtml(key.name)}</b><code>${escapeHtml(key.key)} <button class="copy-mini" data-action="copy" data-id="${escapeHtml(key.id)}" data-value="${escapeHtml(key.key)}">COPY</button></code></div></td>
      <td><span class="status-pill status-${status}">${statusLabel}</span></td>
      <td><span class="device-count">${deviceLabel}</span><button class="copy-mini" data-action="devices" data-id="${escapeHtml(key.id)}">Chi tiết</button></td>
      <td>${key.pendingDurationMs > 0 && !key.activatedAt ? 'Từ lần kích hoạt đầu' : formatDate(key.expiresAt)}</td>
      <td><div class="table-actions">${toggleAction}<button class="action-button" data-action="edit" data-id="${escapeHtml(key.id)}">Sửa</button><button class="action-button danger" data-action="delete" data-id="${escapeHtml(key.id)}">Xóa</button></div></td>
    </tr>`;
  }).join('');
}

async function loadKeys() {
  if (!isAdmin) return;
  const query = new URLSearchParams({ q: $('#keySearch').value.trim(), status: $('#statusFilter').value });
  try {
    const result = await api(`/api/keys?${query.toString()}`);
    allKeys = result.keys;
    renderKeys(allKeys);
  } catch (error) {
    if (error.status === 401) setAdminState(false);
    else toast(error.message, true);
  }
}

async function handleKeyAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === 'copy') {
    const copied = await copyText(button.dataset.value || '');
    const key = allKeys.find((item) => item.id === id);
    if (copied) await trackAdminActivity('license_key_copied', `Tên: ${key?.name || 'License Key'}; Admin đã sao chép mã key.`);
    return;
  }
  if (action === 'devices') {
    const key = allKeys.find((item) => item.id === id);
    if (key) showDevices(key);
    return;
  }
  const key = allKeys.find((item) => item.id === id);
  if (!key) return;

  try {
    if (action === 'ban') {
      const reason = window.prompt('Lý do ban key (có thể để trống):', 'Vi phạm điều khoản');
      if (reason === null) return;
      await api(`/api/keys/${encodeURIComponent(id)}/ban`, { method: 'POST', body: { reason } });
      toast('Đã ban key. API sẽ từ chối key này.');
    } else if (action === 'unban') {
      await api(`/api/keys/${encodeURIComponent(id)}/unban`, { method: 'POST', body: {} });
      toast('Đã mở ban key.');
    } else if (action === 'delete') {
      const confirmed = window.confirm(`Xóa vĩnh viễn key “${key.name}”? Thao tác này không thể hoàn tác.`);
      if (!confirmed) return;
      await api(`/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('Đã xóa key.');
    } else if (action === 'edit') {
      openEditKey(key);
      return;
    }
    await Promise.all([loadKeys(), loadStats()]);
  } catch (error) {
    toast(error.message || 'Không thể thực hiện thao tác với key.', true);
  }
}

function showDevices(key) {
  $('#detailSubtitle').textContent = `${key.name} · ${key.devices.length} thiết bị đã kích hoạt`;
  const list = $('#deviceList');
  if (!key.devices.length) {
    list.innerHTML = '<div class="empty-cell">Key này chưa có thiết bị nào.</div>';
  } else {
    list.innerHTML = key.devices.map((device) => `<div class="device-row"><div><code>${escapeHtml(device.deviceId)}</code><small>Lần đầu: ${formatDate(device.firstSeen)} · Gần nhất: ${formatDate(device.lastSeen)}</small></div><button class="action-button danger" data-action="release-device" data-key-id="${escapeHtml(key.id)}" data-device-id="${escapeHtml(device.id)}">Gỡ thiết bị</button></div>`).join('');
  }
  showModal('detailModal');
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Đã copy vào clipboard.');
    return true;
  } catch {
    const helper = document.createElement('textarea');
    helper.value = value;
    document.body.appendChild(helper);
    helper.select();
    const success = document.execCommand('copy');
    helper.remove();
    toast(success ? 'Đã copy vào clipboard.' : 'Không thể copy tự động.', !success);
    return Boolean(success);
  }
}

function localDateTimeValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function addCalendarDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function formatExpiryPreview(date) {
  return date.toLocaleString('vi-VN', { dateStyle: 'long', timeStyle: 'short' });
}

function formatTimeRemaining(targetDate, fromTime = Date.now()) {
  const delta = targetDate.getTime() - fromTime;
  if (!Number.isFinite(delta)) return 'Không xác định';
  if (delta <= 0) return 'Đã hết hạn';
  const totalMinutes = Math.ceil(delta / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Còn ${days} ngày${hours ? ` ${hours} giờ` : ''}`;
  if (hours > 0) return `Còn ${hours} giờ${minutes ? ` ${minutes} phút` : ''}`;
  return `Còn ${Math.max(1, minutes)} phút`;
}

function securePreviewChars(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(Math.max(0, length));
  if (length && window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
  else for (let i = 0; i < values.length; i += 1) values[i] = Math.floor(Math.random() * 0xffffffff);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

function updateAdvancedKeyPreview() {
  const prefixInput = $('#keyPrefix');
  const prefix = String(prefixInput.value || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 36);
  if (prefixInput.value !== prefix) prefixInput.value = prefix;
  const randomize = $('#keyRandomize').checked;
  const length = Number($('#keyLength').value);
  const validLength = Number.isInteger(length) && length >= 4 && length <= 80;
  const validPrefix = !randomize || (validLength && prefix.length <= length - 4);
  const preview = randomize && validPrefix ? `${prefix}${securePreviewChars(length - prefix.length)}` : (randomize ? 'Prefix quá dài' : prefix);
  $('#keyPreviewCode').textContent = preview || 'Nhập prefix để xem trước';
  $('#keyPreviewCount').textContent = randomize && validLength ? `${length} KÝ TỰ` : `${prefix.length} KÝ TỰ`;
  $('#keyPreviewCode').classList.toggle('is-invalid', !validPrefix || (!randomize && prefix.length < 4));
  $('#keyPrefixLabel').textContent = randomize ? 'TIỀN TỐ (PREFIX)' : 'MÃ KEY TÙY CHỈNH';
  $('#keyLength').disabled = !randomize;
  $('#keyQuantity').disabled = !randomize;
  if (!randomize) $('#keyQuantity').value = '1';
  $('#keyRandomHelp').textContent = randomize
    ? 'Bật “Tự Random” = server tự sinh phần ký tự còn lại.'
    : 'Đang tắt random: nội dung ô trên được dùng làm mã key duy nhất.';
  return { prefix, randomize, length, validLength, validPrefix };
}

function setKeyDuration(value) {
  const unit = $('#keyExpiryUnit');
  const amount = $('#keyExpiryAmount');
  if (value === 'permanent') {
    unit.value = 'permanent';
    amount.value = '30';
    amount.disabled = true;
  } else {
    const match = String(value).match(/^(\d+)(h|d)$/);
    if (!match) return;
    amount.value = match[1];
    unit.value = match[2] === 'h' ? 'hours' : 'days';
    amount.disabled = false;
  }
  updateAdvancedKeyPreview();
  updateKeyDurationNote();
  $$('[data-key-duration]').forEach((button) => button.classList.toggle('selected', button.dataset.keyDuration === value));
}

function updateKeyDurationNote() {
  const unit = $('#keyExpiryUnit').value;
  const amount = Number($('#keyExpiryAmount').value);
  const note = $('#keyDurationNote');
  const selectedPreset = unit === 'permanent' ? 'permanent' : `${amount}${unit === 'hours' ? 'h' : 'd'}`;
  $$('[data-key-duration]').forEach((button) => button.classList.toggle('selected', button.dataset.keyDuration === selectedPreset));
  $('#keyExpiryAmount').disabled = unit === 'permanent';
  if (unit === 'permanent') {
    note.textContent = '◉ Key không tự hết hạn; Admin vẫn có thể khóa hoặc xóa key.';
    return;
  }
  const max = unit === 'hours' ? 8760 : 36500;
  if (!Number.isInteger(amount) || amount < 1 || amount > max) {
    note.textContent = `◉ Nhập thời hạn hợp lệ từ 1 đến ${max.toLocaleString('vi-VN')} ${unit === 'hours' ? 'giờ' : 'ngày'}.`;
    return;
  }
  note.textContent = '◉ Thời hạn bắt đầu tính từ lần kích hoạt đầu tiên; key chưa dùng sẽ không bị trôi thời gian.';
}

function getCreateDurationMs() {
  const unit = $('#keyExpiryUnit').value;
  if (unit === 'permanent') return 0;
  const amount = Number($('#keyExpiryAmount').value);
  const max = unit === 'hours' ? 8760 : 36500;
  if (!Number.isInteger(amount) || amount < 1 || amount > max) {
    throw new Error(`Thời hạn phải là số nguyên từ 1 đến ${max.toLocaleString('vi-VN')} ${unit === 'hours' ? 'giờ' : 'ngày'}.`);
  }
  return amount * (unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
}

function openEditKey(key) {
  $('#editKeyError').textContent = '';
  $('#editKeyId').value = key.id;
  $('#editKeyCode').textContent = key.key;
  $('#editKeyName').value = key.name || '';
  $('#editKeyDevices').value = String(Number.isSafeInteger(key.maxDevices) ? key.maxDevices : 0);
  $('#editExpiryMode').value = 'keep';
  $('#editExpiryDays').value = '30';
  $('#editExpiryDate').value = '';
  const status = statusFor(key);
  const statusLabel = status === 'banned' ? 'ĐÃ BAN' : status === 'expired' ? 'ĐÃ HẾT HẠN' : 'ĐANG HOẠT ĐỘNG';
  $('#editKeyStatus').textContent = statusLabel;
  $('#editKeyStatus').className = `edit-current-status status-${status}`;
  $('#editCurrentExpiry').textContent = key.pendingDurationMs > 0 && !key.activatedAt ? 'Bắt đầu từ lần kích hoạt đầu' : formatDate(key.expiresAt);
  $('#editCurrentExpiry').dataset.expiresAt = key.expiresAt || '';
  const currentDate = key.expiresAt ? new Date(key.expiresAt) : null;
  const validCurrentDate = currentDate && !Number.isNaN(currentDate.getTime());
  if (!key.expiresAt) {
    $('#editCurrentExpiryNote').textContent = 'Key đang được đặt ở chế độ không giới hạn thời gian.';
    $('#editCurrentExpiryRemaining').textContent = '∞  Vĩnh viễn';
    $('#editCurrentExpiryRemaining').className = 'expiry-remaining-chip is-permanent';
  } else if (!validCurrentDate) {
    $('#editCurrentExpiryNote').textContent = 'Dữ liệu ngày hết hạn hiện tại không hợp lệ.';
    $('#editCurrentExpiryRemaining').textContent = 'Cần kiểm tra dữ liệu';
    $('#editCurrentExpiryRemaining').className = 'expiry-remaining-chip is-warning';
  } else if (currentDate.getTime() <= Date.now()) {
    $('#editCurrentExpiryNote').textContent = `Key đã hết hạn lúc ${formatExpiryPreview(currentDate)}. Chọn gia hạn để kích hoạt lại.`;
    $('#editCurrentExpiryRemaining').textContent = 'Đã hết hạn';
    $('#editCurrentExpiryRemaining').className = 'expiry-remaining-chip is-expired';
  } else {
    $('#editCurrentExpiryNote').textContent = 'Hạn hiện tại sẽ được dùng làm mốc nếu bạn chọn gia hạn thêm ngày.';
    $('#editCurrentExpiryRemaining').textContent = formatTimeRemaining(currentDate);
    $('#editCurrentExpiryRemaining').className = 'expiry-remaining-chip is-active';
  }
  updateEditExpiryUI();
  showModal('editKeyModal');
}

function getEditExpiryBaseInfo() {
  const raw = $('#editCurrentExpiry').dataset.expiresAt;
  if (raw) {
    const currentExpiry = new Date(raw);
    if (!Number.isNaN(currentExpiry.getTime()) && currentExpiry.getTime() > Date.now()) {
      return { date: currentExpiry, label: `Cộng từ hạn hiện tại (${formatExpiryPreview(currentExpiry)})` };
    }
  }
  return { date: new Date(), label: 'Tính từ thời điểm bạn bấm lưu vì key đã hết hạn hoặc đang không giới hạn.' };
}

function selectEditExpiryMode(mode) {
  if (!['keep', 'days', 'date', 'never'].includes(mode)) return;
  $('#editExpiryMode').value = mode;
  updateEditExpiryUI();
}

function updateEditExpiryUI() {
  const mode = $('#editExpiryMode').value;
  const dateInput = $('#editExpiryDate');
  dateInput.min = localDateTimeValue();
  $('#editExpiryDaysWrap').classList.toggle('hidden', mode !== 'days');
  $('#editExpiryDateWrap').classList.toggle('hidden', mode !== 'date');
  $('#editExpiryNeverWrap').classList.toggle('hidden', mode !== 'never');
  $$('[data-edit-expiry-mode]').forEach((button) => {
    const selected = button.dataset.editExpiryMode === mode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $$('.edit-expiry-presets [data-edit-expiry-days]').forEach((button) => {
    button.classList.toggle('selected', mode === 'days' && Number(button.dataset.editExpiryDays) === Number($('#editExpiryDays').value));
  });

  const preview = $('#editExpiryPreview');
  const title = preview.querySelector('b');
  const meta = $('#editExpiryPreviewMeta');
  preview.classList.remove('is-invalid', 'is-permanent');
  if (mode === 'keep') {
    title.textContent = 'Thời hạn hiện tại sẽ được giữ nguyên.';
    meta.textContent = 'Không thay đổi ngày hết hạn của key.';
  } else if (mode === 'never') {
    preview.classList.add('is-permanent');
    title.textContent = 'Key sẽ không còn thời điểm hết hạn.';
    meta.textContent = 'Chế độ này có thể được đổi lại bất cứ lúc nào.';
  } else if (mode === 'days') {
    const days = Number($('#editExpiryDays').value);
    if (!Number.isSafeInteger(days) || days < 1 || days > 36500) {
      preview.classList.add('is-invalid');
      title.textContent = 'Nhập số ngày gia hạn hợp lệ.';
      meta.textContent = 'Giá trị cho phép: từ 1 đến 36.500 ngày.';
      return;
    }
    const base = getEditExpiryBaseInfo();
    const expiry = addCalendarDays(base.date, days);
    title.textContent = `Hạn mới: ${formatExpiryPreview(expiry)}.`;
    meta.textContent = `${base.label} Gia hạn thêm ${days.toLocaleString('vi-VN')} ngày.`;
  } else {
    const raw = dateInput.value;
    if (!raw) {
      title.textContent = 'Chọn ngày và giờ hết hạn mới.';
      meta.textContent = 'Mốc thời gian mới phải nằm trong tương lai.';
      return;
    }
    const expiry = new Date(raw);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      preview.classList.add('is-invalid');
      title.textContent = 'Ngày hoặc giờ không hợp lệ.';
      meta.textContent = 'Hãy chọn một thời điểm trong tương lai.';
      return;
    }
    title.textContent = `Hạn mới: ${formatExpiryPreview(expiry)}.`;
    meta.textContent = `${formatTimeRemaining(expiry)} tính từ hiện tại. Mốc cũ sẽ được thay thế.`;
  }
}

function getEditExpiryValue() {
  const mode = $('#editExpiryMode').value;
  if (mode === 'keep') return undefined;
  if (mode === 'never') return null;
  if (mode === 'date') {
    const raw = $('#editExpiryDate').value;
    if (!raw) throw new Error('Hãy chọn ngày và giờ hết hạn.');
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error('Ngày hết hạn không hợp lệ.');
    if (date.getTime() <= Date.now()) throw new Error('Ngày hết hạn phải nằm trong tương lai.');
    return date.toISOString();
  }
  const days = Number($('#editExpiryDays').value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 36500) {
    throw new Error('Số ngày gia hạn phải là số nguyên từ 1 đến 36.500.');
  }
  return addCalendarDays(getEditExpiryBaseInfo().date, days).toISOString();
}

async function refreshPublicShareLink(options = {}) {
  if (!isAdmin) return false;
  const input = $('#publicShareUrl');
  const copyButton = $('#copyPublicShare');
  const openLink = $('#openPublicShare');
  const status = $('#publicShareStatus');
  const dot = $('#publicShareDot');
  const updated = $('#publicShareUpdated');
  if (!input || !copyButton || !openLink || !status || !dot) return false;

  if (!options.silent) {
    status.textContent = 'Đang kiểm tra đường dẫn công khai...';
    dot.classList.remove('is-ready', 'is-waiting');
    dot.classList.add('is-waiting');
  }
  try {
    const result = await api('/api/admin/public-link/status');
    const tokenStatus = $('#cloudflareTokenStatus');
    if (tokenStatus && typeof result.apiTokenConfigured === 'boolean') {
      tokenStatus.textContent = result.apiTokenConfigured
        ? '✓ Cloudflare API Token đã được lưu an toàn trên máy chủ. Không cần nhập Zone ID, Account ID, Tunnel ID hoặc Tunnel Token.'
        : (result.cloudflareSetupMessage || 'Chưa lưu API Token Cloudflare. Hãy tạo token với quyền Zone Read, DNS Read/Write và Cloudflare Tunnel Read/Write.');
      tokenStatus.classList.toggle('is-ready', result.apiTokenConfigured);
    }
    if (result.configuredUrl && $('#publicDomainInput') && !$('#publicDomainInput').matches(':focus')) {
      try { $('#publicDomainInput').value = new URL(result.configuredUrl).hostname; } catch { }
    }
    if (result.available && typeof result.url === 'string') {
      const parsed = new URL(result.url);
      const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
          || parsed.pathname !== '/' || parsed.search || parsed.hash
          || !parsed.hostname.includes('.') || isIpv4 || parsed.hostname === 'localhost'
          || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local')) {
        throw new Error('Server trả về link HTTPS công khai không hợp lệ.');
      }
      input.value = parsed.origin;
      input.placeholder = '';
      input.dataset.url = parsed.origin;
      input.title = parsed.origin;
      copyButton.disabled = false;
      openLink.href = parsed.origin;
      openLink.classList.remove('hidden');
      status.textContent = result.permanent
        ? 'Tên miền cố định đã được kiểm tra và đang phục vụ website Tuấn Anh Store.'
        : 'Website đã sẵn sàng cho mọi người truy cập';
      const hint = $('#publicShareHint');
      if (hint) hint.textContent = result.permanent
        ? 'Đã kiểm tra HTTPS công khai thành công. Bạn và khách có thể mở cùng đường dẫn này; website cần tiếp tục chạy trên VPS để online 24/7.'
        : 'Đây là link Quick Tunnel tạm thời; link có thể đổi và website ngừng hoạt động khi máy chủ nguồn tắt.';
      dot.classList.remove('is-waiting');
      dot.classList.add('is-ready');
      updated.textContent = `HTTPS · ${new Date().toLocaleTimeString('vi-VN')}`;
      const createButton = $('#createPublicShare');
      if (createButton) createButton.textContent = '✦ Kiểm tra và lấy link';
      $('#publicShareLogPanel')?.classList.add('hidden');
      return true;
    }

    input.value = '';
    input.placeholder = result.state === 'starting' ? 'Cloudflare đang tạo link...' : 'Chưa xác minh được link công khai';
    delete input.dataset.url;
    copyButton.disabled = true;
    openLink.removeAttribute('href');
    openLink.classList.add('hidden');
    status.textContent = result.message || 'Chưa có link công khai. Đăng nhập Admin để tạo link.';
    const hint = $('#publicShareHint');
    if (hint) hint.textContent = result.permanent
      ? 'Tên miền đã được lưu nhưng chưa vượt qua kiểm tra truy cập HTTPS từ Internet. Nút sao chép sẽ chỉ bật khi DNS + Tunnel + Published application route trỏ đúng vào website này.'
      : 'Để có link cố định và dùng được khi máy tính cá nhân tắt, hãy triển khai website lên VPS/hosting luôn bật và gắn tên miền riêng.';
    updated.textContent = result.state === 'starting'
      ? 'Đang kết nối'
      : result.permanent ? 'DOMAIN ĐÃ LƯU · CHƯA TRUY CẬP ĐƯỢC' : 'Chưa có link';
    dot.classList.toggle('is-waiting', result.state === 'starting' || result.permanent);
    dot.classList.remove('is-ready');
    if (result.state !== 'starting' && !result.permanent) dot.classList.remove('is-waiting');
    const createButton = $('#createPublicShare');
    if (createButton) createButton.textContent = result.state === 'starting'
      ? '◌ Đang kiểm tra...'
      : result.permanent ? '✦ Kiểm tra tên miền' : '✦ Kiểm tra tên miền';
    return false;
  } catch (error) {
    if (error.status === 401) setAdminState(false);
    input.value = '';
    input.placeholder = 'Chưa đọc được link công khai';
    delete input.dataset.url;
    copyButton.disabled = true;
    openLink.removeAttribute('href');
    openLink.classList.add('hidden');
    status.textContent = error.message || 'Không thể kiểm tra link công khai.';
    updated.textContent = 'Kiểm tra lại sau';
    dot.classList.remove('is-waiting', 'is-ready');
    return false;
  }
}

async function refreshTemporaryShareLink(options = {}) {
  if (!isAdmin) return false;
  const input = $('#temporaryShareUrl');
  const copyButton = $('#copyTemporaryShare');
  const openLink = $('#openTemporaryShare');
  const stopButton = $('#stopTemporaryShare');
  const status = $('#temporaryShareStatus');
  const dot = $('#temporaryShareDot');
  const updated = $('#temporaryShareUpdated');
  if (!input || !copyButton || !openLink || !status || !dot) return false;
  if (!options.silent) {
    status.textContent = 'Đang kiểm tra link tạm thời...';
    dot.classList.add('is-waiting');
    dot.classList.remove('is-ready');
  }
  try {
    const result = await api('/api/admin/temporary-link/status');
    if (result.available && typeof result.url === 'string') {
      const parsed = new URL(result.url);
      if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(parsed.hostname)
          || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error('Server trả về link Quick Tunnel không hợp lệ.');
      }
      input.value = parsed.origin;
      input.dataset.url = parsed.origin;
      copyButton.disabled = false;
      openLink.href = parsed.origin;
      openLink.classList.remove('hidden');
      if (stopButton) stopButton.disabled = false;
      status.textContent = result.message || 'Link tạm thời đang hoạt động công khai.';
      if ($('#temporaryShareHint')) $('#temporaryShareHint').textContent = 'Link tạm thời có thể đổi khi tạo lại và chỉ hoạt động khi máy chạy website/Tunnel còn bật. Dùng tên miền cố định bên dưới để chạy 24/7 trên VPS.';
      dot.classList.remove('is-waiting');
      dot.classList.add('is-ready');
      updated.textContent = `HTTPS · ${new Date().toLocaleTimeString('vi-VN')}`;
      $('#temporaryShareLogPanel')?.classList.add('hidden');
      return true;
    }
    input.value = '';
    delete input.dataset.url;
    input.placeholder = result.state === 'starting' || result.state === 'checking' ? 'Cloudflare đang tạo/kiểm tra link...' : 'Chưa tạo link tạm thời';
    copyButton.disabled = true;
    openLink.removeAttribute('href');
    openLink.classList.add('hidden');
    if (stopButton) stopButton.disabled = result.state !== 'starting' && result.state !== 'checking';
    status.textContent = result.message || 'Chưa có link tạm thời.';
    updated.textContent = result.state === 'starting' ? 'Đang tạo' : result.state === 'checking' ? 'Đang xác minh HTTPS' : result.state === 'error' ? 'Có lỗi' : 'Chưa tạo';
    dot.classList.toggle('is-waiting', result.state === 'starting' || result.state === 'checking');
    dot.classList.remove('is-ready');
    const logPanel = $('#temporaryShareLogPanel');
    const logOutput = $('#temporaryShareLog');
    if (logPanel && logOutput && result.logTail && result.state === 'error') {
      logOutput.textContent = result.logTail;
      logPanel.classList.remove('hidden');
    }
    return false;
  } catch (error) {
    if (error.status === 401) setAdminState(false);
    status.textContent = error.message || 'Không thể kiểm tra link tạm thời.';
    updated.textContent = 'Kiểm tra lại sau';
    dot.classList.remove('is-waiting', 'is-ready');
    copyButton.disabled = true;
    if (stopButton) stopButton.disabled = true;
    return false;
  }
}

async function createTemporaryShareLink() {
  if (!isAdmin) {
    pendingShareAction = true;
    pendingPage = 'home';
    $('#loginError').textContent = 'Đăng nhập Admin để tạo link tạm thời.';
    showModal('loginModal');
    return;
  }
  const button = $('#createTemporaryShare');
  button.disabled = true;
  button.textContent = '◌ Đang tạo...';
  $('#temporaryShareDot').classList.add('is-waiting');
  $('#temporaryShareDot').classList.remove('is-ready');
  $('#temporaryShareStatus').textContent = 'Đang khởi chạy Cloudflare Quick Tunnel...';
  $('#temporaryShareUpdated').textContent = 'Đang tạo URL HTTPS';
  $('#temporaryShareLogPanel')?.classList.add('hidden');
  try {
    const started = await api('/api/admin/temporary-link/start', { method: 'POST', body: {} });
    if (started.available) {
      await refreshTemporaryShareLink({ silent: true });
      toast('Link tạm thời đã sẵn sàng để chia sẻ.');
      return;
    }
    for (let attempt = 0; attempt < 190; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (await refreshTemporaryShareLink({ silent: true })) {
        toast('Đã tạo link tạm thời và xác minh truy cập HTTPS thành công.');
        return;
      }
      const state = await api('/api/admin/temporary-link/status');
      if (state.state === 'error') {
        const detail = state.logTail ? `\n\n${state.logTail}` : '';
        throw new Error(`${state.message || 'Cloudflare không tạo được link.'}${detail}`);
      }
      if (state.message) $('#temporaryShareStatus').textContent = state.message;
      $('#temporaryShareUpdated').textContent = `Đang chờ · ${attempt + 1}s`;
    }
    throw new Error('Đã chờ 190 giây nhưng link chưa xác minh được từ Internet. Kiểm tra log và kết nối TCP 7844.');
  } catch (error) {
    const parts = String(error.message || 'Không thể tạo link tạm thời.').split('\n\n');
    $('#temporaryShareStatus').textContent = parts[0];
    $('#temporaryShareUpdated').textContent = 'Tạo link thất bại';
    $('#temporaryShareDot').classList.remove('is-waiting', 'is-ready');
    if (parts[1]) {
      $('#temporaryShareLog').textContent = parts.slice(1).join('\n\n');
      $('#temporaryShareLogPanel').classList.remove('hidden');
    }
    toast(parts[0], true);
  } finally {
    button.disabled = false;
    button.textContent = $('#temporaryShareUrl').dataset.url ? '♥ Tạo link mới' : '♥ Tạo link tạm thời';
  }
}

async function stopTemporaryShareLink() {
  if (!isAdmin) return;
  const button = $('#stopTemporaryShare');
  if (button) button.disabled = true;
  try {
    await api('/api/admin/temporary-link/stop', { method: 'POST', body: {} });
    await refreshTemporaryShareLink({ silent: true });
    toast('Đã ngắt link tạm thời.');
  } catch (error) {
    if (button) button.disabled = false;
    toast(error.message || 'Không ngắt được link tạm thời.', true);
  }
}

async function createPublicShareLink() {
  if (!isAdmin) {
    pendingShareAction = true;
    pendingPage = 'home';
    $('#loginError').textContent = 'Đăng nhập Admin để tạo link chia sẻ.';
    showModal('loginModal');
    return;
  }

  const button = $('#createPublicShare');
  button.disabled = true;
  button.textContent = '◌ Đang tạo link...';
  $('#publicShareDot').classList.add('is-waiting');
  $('#publicShareDot').classList.remove('is-ready');
  $('#publicShareStatus').textContent = 'Đang kiểm tra tên miền chia sẻ...';
  $('#publicShareLogPanel')?.classList.add('hidden');
  if ($('#publicShareLog')) $('#publicShareLog').textContent = '';
  $('#publicShareUpdated').textContent = 'Đang xin URL HTTPS';
  try {
    const result = await api('/api/admin/public-link/start', { method: 'POST', body: {} });
    if (result.available && result.url) {
      await refreshPublicShareLink({ silent: true });
      toast('Tên miền đã được kiểm tra từ Internet. Bạn có thể sao chép và gửi link cho mọi người.');
      return;
    }
    if (result.permanent) {
      await refreshPublicShareLink({ silent: true });
      if (result.provisioned && !result.available) {
        $('#publicShareStatus').textContent = result.message || 'Đã cấu hình DNS và Tunnel. Đang chờ Tunnel/HTTPS sẵn sàng.';
        $('#publicShareUpdated').textContent = 'Đã cấu hình · đang xác minh';
        for (let attempt = 0; attempt < 45; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (await refreshPublicShareLink({ silent: true })) {
            toast('Tên miền đã truy cập công khai thành công. Bạn có thể sao chép link gửi mọi người.');
            return;
          }
          $('#publicShareUpdated').textContent = `Đang kiểm tra HTTPS · ${((attempt + 1) * 2)}s`;
        }
        toast('DNS và Tunnel đã được cấu hình. Link sẽ bật khi HTTPS truy cập được; kiểm tra lại sau ít phút.', true);
        return;
      }
      throw new Error(result.message || 'Tên miền đã lưu nhưng hiện chưa truy cập được từ Internet.');
    }
    $('#publicShareStatus').textContent = result.message || 'Đang chờ máy chủ tạo link...';
    // The launcher may need time to download cloudflared before it can request a URL.
    // Keep the browser waiting long enough for download + tunnel handshake, and query
    // an admin-only status endpoint so actual Cloudflare errors are shown immediately.
    for (let attempt = 0; attempt < 330; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const ready = await refreshPublicShareLink({ silent: true });
      if (ready) {
        toast('Đã tạo link chia sẻ thành công. Hãy sao chép để gửi cho mọi người.');
        return;
      }
      const current = await api('/api/admin/public-link/status');
      if (current.state === 'error') {
        const detail = current.message || 'Máy chủ chưa tạo được link.';
        const logHint = current.logTail ? `\n\nChi tiết log cuối:\n${current.logTail}` : '';
        throw new Error(`${detail}${logHint}`);
      }
      if (current.state === 'starting' && current.message) {
        $('#publicShareStatus').textContent = current.message;
        $('#publicShareUpdated').textContent = `Đang kết nối · ${attempt + 1}s`;
      }
    }
    const latest = await api('/api/admin/public-link/status').catch(() => ({}));
    const detail = latest.message || 'Chưa nhận được link trong thời gian chờ.';
    throw new Error(`${detail} Hãy kiểm tra .runtime\\cloudflared.log và thử lại.`);
  } catch (error) {
    const parts = String(error.message || 'Không thể tạo link.').split('\n\nChi tiết log cuối:\n');
    $('#publicShareStatus').textContent = parts[0];
    const logPanel = $('#publicShareLogPanel');
    const logOutput = $('#publicShareLog');
    if (logPanel && logOutput) {
      logOutput.textContent = parts[1] || '';
      logPanel.classList.toggle('hidden', !parts[1]);
    }
    $('#publicShareUpdated').textContent = 'Tạo link thất bại';
    $('#publicShareDot').classList.remove('is-waiting', 'is-ready');
    toast(parts[0], true);
  } finally {
    button.disabled = false;
    const link = $('#publicShareUrl').dataset.url;
    button.textContent = link ? '✦ Lấy link chia sẻ' : '✦ Tạo link ngay trong web';
  }
}

async function refreshApiHealth() {
  const result = await api('/api/health');
  const label = $('#apiHealthText');
  const badge = $('#apiLiveStatus');
  if (label) label.textContent = `Server ${result.version || ''} · ${result.host}:${result.port} · phản hồi tốt.`;
  if (badge) {
    badge.classList.add('is-online');
    const text = badge.querySelector('span');
    if (text) text.textContent = 'ONLINE';
  }
  const local = $('#localServerAddress');
  if (local) local.textContent = `${result.host}:${result.port}`;
  return result;
}

async function loadApiConfig() {
  if (!isAdmin) return;
  const result = await api('/api/admin/api-config');
  if ($('#apiBindHost')) $('#apiBindHost').value = result.host;
  if ($('#apiAllowedOrigins')) $('#apiAllowedOrigins').value = (result.allowedOrigins || []).join('\n');
  if ($('#apiConfigNote')) $('#apiConfigNote').textContent = `Bind hiện tại: ${result.host}:${result.port} · ${(result.allowedOrigins || []).length} origin.`;
}

async function loadApiPage() {
  try { await Promise.all([refreshApiHealth(), loadApiConfig()]); }
  catch (error) { if (error.status === 401) setAdminState(false); else toast(error.message, true); }
}

async function trackAdminActivity(action, detail = '') {
  if (!isAdmin) return;
  try { await api('/api/admin/activity', { method: 'POST', body: { action, detail } }); }
  catch (error) { if (error.status === 401) setAdminState(false); }
}

function formatActivityDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Thời gian không xác định';
  return date.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'medium' });
}

function renderActivity(events, total, today) {
  const list = $('#activityList');
  if (!list) return;
  $('#activityTotal').textContent = Number(total || 0).toLocaleString('vi-VN');
  $('#activityToday').textContent = Number(today || 0).toLocaleString('vi-VN');
  $('#activityLatest').textContent = events.length ? events[0].title : 'Chưa có';
  $('#activityLatestMeta').textContent = events.length ? formatActivityDate(events[0].at) : 'Chưa có sự kiện';
  const filter = $('#activityFilter')?.value || 'all';
  const visible = events.filter((event) => filter === 'all' || event.category === filter);
  if (!visible.length) {
    list.innerHTML = '<div class="activity-empty">Chưa có hoạt động trong nhóm này.</div>';
    return;
  }
  const iconByCategory = { license: '⚿', share: '↗', account: '♙', system: '⌘', tool: '⌁' };
  list.innerHTML = visible.map((event) => `
    <article class="activity-item">
      <span class="activity-icon activity-${escapeHtml(event.category)}">${iconByCategory[event.category] || '•'}</span>
      <div class="activity-content"><div class="activity-item-head"><b>${escapeHtml(event.title)}</b><span>${escapeHtml(formatActivityDate(event.at))}</span></div>
      <p>${escapeHtml(event.detail || 'Không có thông tin bổ sung.')}</p>
      <small>${escapeHtml(event.actor || 'ADMIN')} · ${escapeHtml(String(event.category || 'system').toUpperCase())}</small></div>
    </article>`).join('');
}

async function loadActivity() {
  if (!isAdmin) return;
  const list = $('#activityList');
  if (list) list.innerHTML = '<div class="activity-empty">Đang tải nhật ký hoạt động...</div>';
  try {
    const result = await api('/api/admin/activity?limit=250');
    renderActivity(result.events || [], result.total, result.today);
  } catch (error) {
    if (error.status === 401) setAdminState(false);
    else if (list) list.innerHTML = `<div class="activity-empty">${escapeHtml(error.message)}</div>`;
  }
}

const LUA_SOURCE_MAX_BYTES = 5 * 1024 * 1024;
const LUA_IMAGE_MAX_BYTES = 100_000_000;
const LUA_ROBLOX_UPLOAD_MAX_BYTES = 20_000_000;
const LUA_IMAGE_MAX_PIXELS = 64_000_000;
const LUA_ROBLOX_UPLOAD_MIMES = new Set(['image/png', 'image/jpeg', 'image/bmp']);
const LUA_OUTPUT_MAX_BYTES = 40 * 1024 * 1024;
const LUA_OUTPUT_PREVIEW_LIMIT = 300_000;

let luaImageDataUrl = '';
let luaImageDetails = null;
let luaRobloxUploadBlob = null;
let luaRobloxAutoUploadAttempted = false;
let luaRobloxAutoUploadRunning = false;
let luaRobloxAssetId = '95196119848155';
let luaBuiltOutput = '';
let luaOutputFilename = 'TuanAnhStore-GUI.lua';
let luaMenuActions = [
  { id: 'preset-overview-toggle', functionName: '', label: 'Hiển thị trạng thái', kind: 'toggle', enabled: true, manual: true, preset: true, tabId: 'tab-overview', defaultEnabled: true, defaultValue: 50, minValue: 0, maxValue: 100, stepValue: 1 },
  { id: 'preset-overview-button', functionName: '', label: 'Làm mới giao diện', kind: 'button', enabled: true, manual: true, preset: true, tabId: 'tab-overview', defaultEnabled: false, defaultValue: 50, minValue: 0, maxValue: 100, stepValue: 1 },
  { id: 'preset-visual-toggle', functionName: '', label: 'Hiệu ứng viền', kind: 'toggle', enabled: true, manual: true, preset: true, tabId: 'tab-visual', defaultEnabled: false, defaultValue: 70, minValue: 0, maxValue: 100, stepValue: 1 },
  { id: 'preset-visual-slider', functionName: '', label: 'Độ sáng giao diện', kind: 'slider', enabled: true, manual: true, preset: true, tabId: 'tab-visual', defaultEnabled: false, defaultValue: 75, minValue: 0, maxValue: 100, stepValue: 1 },
  { id: 'preset-tools-button', functionName: '', label: 'Kiểm tra trạng thái', kind: 'button', enabled: true, manual: true, preset: true, tabId: 'tab-tools', defaultEnabled: false, defaultValue: 50, minValue: 0, maxValue: 100, stepValue: 1 },
  { id: 'preset-settings-toggle', functionName: '', label: 'Thông báo giao diện', kind: 'toggle', enabled: true, manual: true, preset: true, tabId: 'tab-settings', defaultEnabled: true, defaultValue: 100, minValue: 0, maxValue: 100, stepValue: 1 },
  { id: 'preset-settings-slider', functionName: '', label: 'Tỷ lệ hiển thị', kind: 'slider', enabled: true, manual: true, preset: true, tabId: 'tab-settings', defaultEnabled: false, defaultValue: 100, minValue: 75, maxValue: 125, stepValue: 1 }
];
let luaActionSequence = 0;
let luaLastDetectedFunctions = [];
let luaDetectedMenuTargets = [];
let luaMenuTabs = [
  { id: 'tab-overview', label: 'TỔNG QUAN' },
  { id: 'tab-visual', label: 'HIỂN THỊ' },
  { id: 'tab-tools', label: 'TIỆN ÍCH' },
  { id: 'tab-settings', label: 'CÀI ĐẶT' }
];
let luaActiveMenuTabId = 'tab-overview';
let luaTabSequence = 0;

function invalidateLuaOutput(note = 'Thông tin đã thay đổi. Hãy MAKE SCRIPT LUA lại để tạo bản mới.') {
  if (!luaBuiltOutput) return;
  luaBuiltOutput = '';
  $('#copyLuaOutput').disabled = true;
  $('#downloadLuaOutput').disabled = true;
  $('#luaOutputStatus').textContent = note;
}

function updateLuaSourceStats() {
  const source = $('#luaSourceCode')?.value || '';
  const lines = source ? source.split(/\r?\n/).length : 0;
  const bytes = new Blob([source]).size;
  $('#luaSourceStats').textContent = `${source.length.toLocaleString('vi-VN')} ký tự · ${lines.toLocaleString('vi-VN')} dòng · ${formatLuaBytes(bytes)} / 5 MB`;
}

function formatLuaBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function sniffLuaImageMime(bytes) {
  if (!(bytes instanceof Uint8Array)) return '';
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 3) === 'PNG' && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (bytes.length >= 2 && ascii(0, 2) === 'BM') return 'image/bmp';
  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp' && /^(avif|avis)$/.test(ascii(8, 4))) return 'image/avif';
  return '';
}

async function getLuaImageMime(file) {
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const sniffed = sniffLuaImageMime(header);
  if (sniffed) return sniffed;
  const declared = String(file.type || '').toLowerCase();
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif', 'image/tga', 'image/x-tga'].includes(declared)) return declared;
  throw new Error(`Không nhận diện được định dạng ảnh của “${file.name}”. Hãy dùng PNG, JPG, WebP, GIF, BMP hoặc AVIF.`);
}

function readLuaFileAsDataUrl(file, mimeType) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      if (comma < 0 || !raw.slice(comma + 1)) return reject(new Error('File ảnh rỗng hoặc không đọc được dữ liệu.'));
      // Some Windows/browser file providers report an empty or generic MIME type.
      // Use the byte-signature MIME sniffed from the actual file instead.
      resolve(`data:${mimeType};base64,${raw.slice(comma + 1)}`);
    };
    reader.onerror = () => reject(new Error('Trình duyệt không đọc được file ảnh. Hãy chép ảnh về máy rồi chọn lại.'));
    reader.onabort = () => reject(new Error('Đã hủy đọc ảnh.'));
    reader.readAsDataURL(file);
  });
}

async function inspectLuaImage(file, dataUrl) {
  let dimensions = null;
  // createImageBitmap is more reliable for files selected from Windows/cloud folders.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      dimensions = { width: bitmap.width, height: bitmap.height };
      if (typeof bitmap.close === 'function') bitmap.close();
    } catch { /* Fall back to decoding the normalized data URL below. */ }
  }
  if (!dimensions) {
    dimensions = await new Promise((resolve, reject) => {
      const image = new Image();
      const fail = () => reject(new Error(`Chrome không giải mã được “${file.name}”. Hãy mở ảnh bằng Paint rồi Save As PNG/JPG, sau đó tải lại.`));
      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (width && height) resolve({ width, height });
        else fail();
      };
      image.onerror = fail;
      image.src = dataUrl;
      if (typeof image.decode === 'function') image.decode().then(() => {
        if (image.naturalWidth && image.naturalHeight) resolve({ width: image.naturalWidth, height: image.naturalHeight });
      }).catch(() => {});
    });
  }
  const { width, height } = dimensions;
  if (!width || !height) throw new Error('Ảnh không có kích thước hợp lệ.');
  if (width * height > LUA_IMAGE_MAX_PIXELS) {
    throw new Error(`Ảnh quá lớn về độ phân giải (${width.toLocaleString('vi-VN')} × ${height.toLocaleString('vi-VN')}). Giới hạn là 64 megapixel để tránh treo trình duyệt.`);
  }
  return dimensions;
}

async function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Không thể tối ưu ảnh trên trình duyệt.')), mimeType, quality);
  });
}

async function prepareLuaImageForRoblox(file, mimeType, dimensions) {
  const robloxFormats = new Set(['image/png', 'image/jpeg', 'image/bmp']);
  const needsOptimization = file.size > LUA_ROBLOX_UPLOAD_MAX_BYTES
    || !robloxFormats.has(mimeType)
    || dimensions.width >= 8000 || dimensions.height >= 8000;
  if (!needsOptimization) return { file, mimeType, width: dimensions.width, height: dimensions.height, optimized: false };

  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Không giải mã được ảnh để tối ưu. Hãy mở ảnh bằng Paint/Photos rồi lưu PNG hoặc JPG và thử lại.'); }
  try {
    const scale = Math.min(1, 7999 / bitmap.width, 7999 / bitmap.height);
    const width = Math.max(1, Math.floor(bitmap.width * scale));
    const height = Math.max(1, Math.floor(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Trình duyệt không tạo được canvas tối ưu ảnh.');

    // Keep transparency as PNG when it fits Roblox's upload limit.
    context.drawImage(bitmap, 0, 0, width, height);

    if (mimeType === 'image/png' || mimeType === 'image/bmp') {
      const png = await canvasToBlob(canvas, 'image/png');
      if (png.size <= LUA_ROBLOX_UPLOAD_MAX_BYTES) {
        const output = new File([png], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
        return { file: output, mimeType: 'image/png', width, height, optimized: true, note: 'đã chuyển/resize PNG' };
      }
    }

    // Roblox accepts JPEG. This fallback reduces source files over 20 MB and
    // downscales dimensions over 7999 px while keeping a generous quality.
    const opaque = document.createElement('canvas');
    opaque.width = width;
    opaque.height = height;
    const opaqueContext = opaque.getContext('2d', { alpha: false });
    opaqueContext.fillStyle = '#ffffff';
    opaqueContext.fillRect(0, 0, width, height);
    opaqueContext.drawImage(bitmap, 0, 0, width, height);
    let jpeg = null;
    for (const quality of [0.94, 0.90, 0.86, 0.82, 0.78, 0.74, 0.68, 0.62]) {
      jpeg = await canvasToBlob(opaque, 'image/jpeg', quality);
      if (jpeg.size <= LUA_ROBLOX_UPLOAD_MAX_BYTES) break;
    }
    if (!jpeg || jpeg.size > LUA_ROBLOX_UPLOAD_MAX_BYTES) {
      throw new Error('Ảnh vẫn vượt 20 MB sau khi nén. Hãy giảm kích thước hoặc chất lượng ảnh rồi thử lại.');
    }
    const output = new File([jpeg], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    return { file: output, mimeType: 'image/jpeg', width, height, optimized: true, note: 'đã nén JPEG; vùng trong suốt chuyển thành nền trắng' };
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

function updateLuaPreviewTheme() {
  const preview = $('#luaMenuPreview');
  if (!preview) return;
  const accent = /^#[0-9a-f]{6}$/i.test($('#luaMenuAccent')?.value || '') ? $('#luaMenuAccent').value : '#ff96c8';
  const surface = /^#[0-9a-f]{6}$/i.test($('#luaMenuSurface')?.value || '') ? $('#luaMenuSurface').value : '#0f1117';
  const width = Math.max(520, Math.min(1100, Number($('#luaMenuWidth')?.value) || 620));
  const height = Math.max(320, Math.min(900, Number($('#luaMenuHeight')?.value) || 420));
  preview.style.setProperty('--lua-preview-accent', accent);
  preview.style.setProperty('--lua-preview-surface', surface);
  preview.style.setProperty('--lua-preview-width', `${width}px`);
  preview.style.setProperty('--lua-preview-height', `${height}px`);
}

function readLuaMenuTabs() {
  $$('.lua-tab-edit-row').forEach((row) => {
    const tab = luaMenuTabs.find((item) => item.id === row.dataset.tabId);
    if (tab) tab.label = $('[data-tab-label]', row)?.value.trim().slice(0, 32) || tab.label;
  });
}

function renderLuaMenuTabs() {
  const list = $('#luaTabEditList');
  if (!list) return;
  list.innerHTML = luaMenuTabs.map((tab, index) => `
    <div class="lua-tab-edit-row" data-tab-id="${escapeHtml(tab.id)}">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <input class="text-input" data-tab-label maxlength="32" value="${escapeHtml(tab.label)}" aria-label="Tên tab ${index + 1}">
      <button class="lua-tab-remove" type="button" data-tab-remove aria-label="Xóa tab" ${luaMenuTabs.length <= 1 ? 'disabled' : ''}>×</button>
    </div>`).join('');
}

function refreshLuaPreviewTabs() {
  readLuaMenuTabs();
  const nav = $('#luaPreviewTabs');
  if (!nav) return;
  if (!luaMenuTabs.some((tab) => tab.id === luaActiveMenuTabId)) luaActiveMenuTabId = luaMenuTabs[0]?.id || '';
  nav.innerHTML = luaMenuTabs.map((tab) => `
    <button type="button" class="lua-preview-tab ${tab.id === luaActiveMenuTabId ? 'active' : ''}" data-preview-tab="${escapeHtml(tab.id)}" title="${escapeHtml(tab.label)}">
      <span class="lua-preview-tab-icon">${tab.label.slice(0, 1).toUpperCase()}</span><b>${escapeHtml(tab.label)}</b>
    </button>`).join('');
  const active = luaMenuTabs.find((tab) => tab.id === luaActiveMenuTabId) || luaMenuTabs[0];
  $('#luaPreviewTabEyebrow').textContent = active?.label || 'MENU';
  $('#luaPreviewTabTitle').textContent = active?.label || 'MENU';
  $('#luaPreviewFooterMeta').textContent = `${($('#luaMenuVersion').value.trim() || 'V1').toUpperCase()} · LIVE PREVIEW`;
}

function addLuaMenuTab() {
  readLuaMenuTabs();
  const id = `tab-custom-${++luaTabSequence}`;
  luaMenuTabs.push({ id, label: `TAB ${luaMenuTabs.length + 1}` });
  luaActiveMenuTabId = id;
  renderLuaMenuTabs();
  renderLuaActions();
  refreshLuaMenuPreview();
  invalidateLuaOutput();
  const rows = $$('.lua-tab-edit-row');
  $('[data-tab-label]', rows[rows.length - 1])?.focus();
}

function loadLuaMenuPreset() {
  luaMenuTabs = [
    { id: 'tab-overview', label: 'TỔNG QUAN' },
    { id: 'tab-visual', label: 'HIỂN THỊ' },
    { id: 'tab-tools', label: 'TIỆN ÍCH' },
    { id: 'tab-settings', label: 'CÀI ĐẶT' }
  ];
  luaActiveMenuTabId = 'tab-overview';
  luaMenuActions = [
    { id: 'preset-overview-toggle', functionName: '', label: 'Hiển thị trạng thái', kind: 'toggle', enabled: true, manual: true, preset: true, tabId: 'tab-overview', defaultEnabled: true, minValue: 0, maxValue: 100, stepValue: 1 },
    { id: 'preset-overview-button', functionName: '', label: 'Làm mới giao diện', kind: 'button', enabled: true, manual: true, preset: true, tabId: 'tab-overview', defaultEnabled: false, minValue: 0, maxValue: 100, stepValue: 1 },
    { id: 'preset-visual-toggle', functionName: '', label: 'Hiệu ứng viền', kind: 'toggle', enabled: true, manual: true, preset: true, tabId: 'tab-visual', defaultEnabled: false, minValue: 0, maxValue: 100, stepValue: 1 },
    { id: 'preset-visual-slider', functionName: '', label: 'Độ sáng giao diện', kind: 'slider', enabled: true, manual: true, preset: true, tabId: 'tab-visual', defaultValue: 75, minValue: 0, maxValue: 100, stepValue: 1 },
    { id: 'preset-tools-button', functionName: '', label: 'Kiểm tra trạng thái', kind: 'button', enabled: true, manual: true, preset: true, tabId: 'tab-tools', defaultEnabled: false, minValue: 0, maxValue: 100, stepValue: 1 },
    { id: 'preset-settings-toggle', functionName: '', label: 'Thông báo giao diện', kind: 'toggle', enabled: true, manual: true, preset: true, tabId: 'tab-settings', defaultEnabled: true, minValue: 0, maxValue: 100, stepValue: 1 },
    { id: 'preset-settings-slider', functionName: '', label: 'Tỷ lệ hiển thị', kind: 'slider', enabled: true, manual: true, preset: true, tabId: 'tab-settings', defaultValue: 100, minValue: 75, maxValue: 125, stepValue: 1 }
  ];
  renderLuaMenuTabs();
  renderLuaActions();
  refreshLuaMenuPreview();
  invalidateLuaOutput();
  toast('Đã nạp GUI mẫu Tuấn Anh Store.');
}

function removeLuaMenuTab(row) {
  if (luaMenuTabs.length <= 1) return;
  readLuaMenuTabs();
  const id = row?.dataset.tabId;
  const fallback = luaMenuTabs.find((tab) => tab.id !== id) || luaMenuTabs[0];
  luaMenuTabs = luaMenuTabs.filter((tab) => tab.id !== id);
  luaMenuActions.forEach((action) => { if (action.tabId === id) action.tabId = fallback.id; });
  if (luaActiveMenuTabId === id) luaActiveMenuTabId = fallback.id;
  renderLuaMenuTabs();
  renderLuaActions();
  refreshLuaMenuPreview();
  invalidateLuaOutput();
}

function setLuaPreviewImage(source) {
  const image = $('#luaPreviewImage');
  const fallback = $('#luaPreviewImageFallback');
  if (!source) {
    image.removeAttribute('src');
    image.classList.add('hidden');
    fallback.classList.remove('hidden');
    return;
  }
  image.onerror = () => {
    image.classList.add('hidden');
    fallback.classList.remove('hidden');
  };
  image.onload = () => {
    image.classList.remove('hidden');
    fallback.classList.add('hidden');
  };
  image.src = source;
}

function humanizeLuaFunctionName(name) {
  const leaf = String(name || '').split('.').pop() || String(name || 'ChucNang');
  return leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Chức năng';
}

function maskLuaCommentsAndStrings(source) {
  const chars = String(source || '').split('');
  const blank = (from, to) => {
    for (let index = from; index < to; index++) {
      if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
    }
  };
  let index = 0;
  while (index < chars.length) {
    const current = chars[index];
    const next = chars[index + 1];
    if (current === '-' && next === '-') {
      const longOpen = source.slice(index + 2).match(/^\[(=*)\[/);
      if (longOpen) {
        const close = `]${longOpen[1]}]`;
        const contentStart = index + 2 + longOpen[0].length;
        const closeAt = source.indexOf(close, contentStart);
        const end = closeAt < 0 ? chars.length : closeAt + close.length;
        blank(index, end);
        index = end;
        continue;
      }
      let end = index + 2;
      while (end < chars.length && chars[end] !== '\n') end++;
      blank(index, end);
      index = end;
      continue;
    }
    if (current === "'" || current === '"') {
      const quote = current;
      let end = index + 1;
      while (end < chars.length) {
        if (chars[end] === '\\') { end += 2; continue; }
        if (chars[end] === quote) { end++; break; }
        end++;
      }
      blank(index, Math.min(end, chars.length));
      index = end;
      continue;
    }
    if (current === '[') {
      const longOpen = source.slice(index).match(/^\[(=*)\[/);
      if (longOpen) {
        const close = `]${longOpen[1]}]`;
        const contentStart = index + longOpen[0].length;
        const closeAt = source.indexOf(close, contentStart);
        const end = closeAt < 0 ? chars.length : closeAt + close.length;
        blank(index, end);
        index = end;
        continue;
      }
    }
    index++;
  }
  return chars.join('');
}

function detectLuaFunctions(source) {
  const code = maskLuaCommentsAndStrings(source);
  const found = new Set();
  const patterns = [
    /(?:^|[\r\n;])[ \t]*(?:local\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\(/g,
    /(?:^|[\r\n;])[ \t]*(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=\s*function\s*\(/g,
    /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=\s*function\s*\(/g,
    /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\(/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1];
      if (name && !name.startsWith('__TA_STORE_') && validateLuaFunctionReference(name)) found.add(name);
      if (found.size >= 80) break;
    }
    if (found.size >= 80) break;
  }
  return [...found];
}

function hasLuaTopLevelReturn(source) {
  const code = maskLuaCommentsAndStrings(source);
  const blocks = [];
  const tokens = code.matchAll(/\b(function|if|for|while|do|repeat|end|until|return)\b/g);
  for (const match of tokens) {
    const token = match[1];
    if (token === 'function' || token === 'if' || token === 'repeat') {
      blocks.push(token);
    } else if (token === 'for' || token === 'while') {
      blocks.push('loop-pending');
    } else if (token === 'do') {
      if (blocks[blocks.length - 1] === 'loop-pending') blocks[blocks.length - 1] = 'loop';
      else blocks.push('do');
    } else if (token === 'end') {
      if (blocks.length) blocks.pop();
    } else if (token === 'until') {
      const repeatIndex = blocks.lastIndexOf('repeat');
      if (repeatIndex >= 0) blocks.splice(repeatIndex, 1);
    } else if (token === 'return' && blocks.length === 0) {
      return true;
    }
  }
  return false;
}

function stripLegacyLuaGeneratedBlocks(source) {
  let output = String(source || '');
  const pairs = [
    ['-- >>> TUAN ANH STORE GENERATED MENU BEGIN >>>', '-- <<< TUAN ANH STORE GENERATED MENU END <<<'],
    ['-- >>> TUAN ANH STORE AUTO MENU REGISTRATION >>>', '-- <<< TUAN ANH STORE AUTO MENU REGISTRATION <<<']
  ];
  for (const [begin, end] of pairs) {
    let guard = 0;
    while (guard++ < 8) {
      const startAt = output.indexOf(begin);
      if (startAt < 0) break;
      const endAt = output.indexOf(end, startAt + begin.length);
      if (endAt < 0) throw new Error(`Tìm thấy marker MAKE cũ nhưng thiếu marker kết thúc: ${end}`);
      let removeStart = startAt;
      const previousNewline = output.lastIndexOf('\n', startAt - 1);
      if (previousNewline >= 0 && output.slice(previousNewline + 1, startAt).trim() === '') removeStart = previousNewline + 1;
      let removeEnd = endAt + end.length;
      if (output[removeEnd] === '\r') removeEnd++;
      if (output[removeEnd] === '\n') removeEnd++;
      output = output.slice(0, removeStart) + output.slice(removeEnd);
    }
  }
  return output;
}

function parseLuaFunctionRanges(source) {
  const code = maskLuaCommentsAndStrings(String(source || ''));
  const keywordPattern = /\b(function|if|for|while|do|repeat|end|until)\b/g;
  const stack = [];
  const functions = [];
  let match;

  const findHeaderClose = (keywordEnd) => {
    const open = code.indexOf('(', keywordEnd);
    if (open < 0) return -1;
    const between = code.slice(keywordEnd, open);
    if (!/^\s*(?:[A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)*)?\s*$/.test(between)) return -1;
    let depth = 0;
    for (let index = open; index < code.length; index++) {
      if (code[index] === '(') depth++;
      else if (code[index] === ')') {
        depth--;
        if (depth === 0) return index;
      }
    }
    return -1;
  };

  while ((match = keywordPattern.exec(code)) !== null) {
    const token = match[1];
    const tokenStart = match.index;
    const tokenEnd = tokenStart + token.length;

    if (token === 'function') {
      const statementStart = Math.max(code.lastIndexOf('\n', tokenStart - 1), code.lastIndexOf(';', tokenStart - 1)) + 1;
      const prefix = code.slice(statementStart, tokenStart);
      const after = code.slice(tokenEnd);
      const declaredName = after.match(/^\s*([A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)*)\s*\(/);
      let name = declaredName ? declaredName[1].replace(/:/g, '.') : '';
      let isLocal = /^\s*local\s*$/.test(prefix);
      if (!name) {
        const assignedName = prefix.match(/^\s*(local\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=\s*$/);
        if (assignedName) {
          name = assignedName[2];
          isLocal = Boolean(assignedName[1]);
        }
      }
      const headerClose = findHeaderClose(tokenEnd);
      const node = name && headerClose >= 0 ? {
        name,
        isLocal,
        start: tokenStart,
        bodyStart: headerClose + 1,
        endStart: -1,
        endEnd: -1,
        line: code.slice(0, tokenStart).split('\n').length
      } : null;
      stack.push({ type: 'function', node });
      if (node) functions.push(node);
    } else if (token === 'if' || token === 'repeat') {
      stack.push({ type: token });
    } else if (token === 'for' || token === 'while') {
      stack.push({ type: 'loop-pending' });
    } else if (token === 'do') {
      if (stack.length && stack[stack.length - 1].type === 'loop-pending') stack[stack.length - 1].type = 'loop';
      else stack.push({ type: 'do' });
    } else if (token === 'end') {
      const frame = stack.pop();
      if (frame?.type === 'function' && frame.node) {
        frame.node.endStart = tokenStart;
        frame.node.endEnd = tokenEnd;
      }
    } else if (token === 'until') {
      for (let index = stack.length - 1; index >= 0; index--) {
        const frame = stack.pop();
        if (frame.type === 'repeat') break;
      }
    }
  }
  return functions.filter((node) => node.endStart >= node.bodyStart && node.endEnd > node.endStart);
}

function detectLuaMenuTargets(source) {
  const cleanSource = stripLegacyLuaGeneratedBlocks(source);
  const code = maskLuaCommentsAndStrings(cleanSource);
  const uiCuePatterns = [
    /\bcreatewindow\b/gi, /\bmakewindow\b/gi, /\bcreatemenu\b/gi, /\bmakemenu\b/gi,
    /\bcreatescreengui\b/gi, /\binstance\s*\.\s*new\b/gi, /\baddtab\b/gi,
    /\baddsection\b/gi, /\baddbutton\b/gi, /\baddtoggle\b/gi, /\baddslider\b/gi,
    /\bcreateframe\b/gi, /\bcreatetextbutton\b/gi, /\bcreateelement\b/gi,
    /\bmakefolder\b/gi, /\bcreategui\b/gi
  ];
  const candidates = [];
  const occurrences = new Map();
  for (const node of parseLuaFunctionRanges(cleanSource)) {
    const name = node.name;
    if (!name || name.startsWith('__TA_STORE_') || !validateLuaFunctionReference(name)) continue;
    const leaf = name.split('.').pop().toLowerCase();
    const lowerName = name.toLowerCase();
    const nameLooksLikeMenu = /(menu|gui|ui|window|interface|panel|hud|screen)/i.test(name);
    const body = code.slice(node.bodyStart, node.endStart);
    let cueCount = 0;
    for (const pattern of uiCuePatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(body)) cueCount++;
    }
    const isConventionalMenuName = /^(main)?(create|build|init|setup|load|open|make)?(menu|gui|ui|window)$/i.test(leaf);
    const hasBuilderVerb = /^(main|start|run|launch|create|build|init|setup|load|open|make|show|mount|render)/i.test(leaf);
    if (!nameLooksLikeMenu && !(hasBuilderVerb && cueCount >= 2)) continue;
    if (!isConventionalMenuName && cueCount === 0) continue;
    let score = nameLooksLikeMenu ? 45 : 0;
    if (isConventionalMenuName) score += 35;
    if (hasBuilderVerb) score += 12;
    score += Math.min(cueCount, 5) * 8;
    if (/main.*(menu|gui|ui|window)/i.test(lowerName)) score += 10;
    if (/^(local\s+)?function\s+/i.test(cleanSource.slice(Math.max(0, node.start - 16), node.start))) score += 1;
    const occurrence = occurrences.get(name) || 0;
    occurrences.set(name, occurrence + 1);
    candidates.push({ ...node, score, cueCount, occurrence, key: `${encodeURIComponent(name)}::${occurrence}` });
  }
  return candidates.sort((a, b) => b.score - a.score || a.start - b.start);
}

function refreshLuaReplaceTarget(source) {
  const select = $('#luaReplaceTarget');
  const status = $('#luaReplaceTargetStatus');
  if (!select || !status) return;
  const previous = select.value;
  luaDetectedMenuTargets = detectLuaMenuTargets(source);
  if (!luaDetectedMenuTargets.length) {
    select.innerHTML = '<option value="">Không tìm thấy hàm menu an toàn</option>';
    select.value = '';
    status.textContent = 'Không thấy hàm dựng menu đủ rõ để thay thế. MAKE sẽ không chèn code vào cuối file hoặc đoán nhầm hàm gameplay. Hãy dùng tên như BuildMenu / CreateMenu / MainMenu hoặc một hàm UI có lệnh tạo cửa sổ.';
    return;
  }
  select.innerHTML = luaDetectedMenuTargets.map((target) => `<option value="${escapeHtml(target.key)}">${escapeHtml(target.name)} · dòng ${target.line} · ${target.cueCount} dấu hiệu UI</option>`).join('');
  const selected = luaDetectedMenuTargets.find((target) => target.key === previous) || luaDetectedMenuTargets[0];
  select.value = selected.key;
  status.textContent = `Tự dò ${luaDetectedMenuTargets.length} hàm UI/menu. Đang chọn ${selected.name} (dòng ${selected.line}). MAKE chỉ thay phần thân hàm này; giữ nguyên các hàm khác và không nối code cuối file.`;
}

function syncLuaDetectedFunctions(source, force = false) {
  readLuaMenuActions();
  const cleanScanSource = stripLegacyLuaGeneratedBlocks(source);
  const discovered = detectLuaFunctions(cleanScanSource);
  refreshLuaReplaceTarget(cleanScanSource);
  luaLastDetectedFunctions = discovered;
  const existing = new Map(luaMenuActions.map((item) => [item.functionName, item]));
  const manual = luaMenuActions.filter((item) => item.manual && !item.preset && (!item.functionName || !discovered.includes(item.functionName)));
  // Generic sample controls are useful before a source file is loaded, but should
  // not be mixed with actual functions once the user's Lua file is scanned.
  const keepPreset = discovered.length === 0;
  const presets = keepPreset ? luaMenuActions.filter((item) => item.preset) : [];
  const detected = discovered.map((name) => existing.get(name) || ({
    id: `lua-action-${++luaActionSequence}`,
    functionName: name,
    label: humanizeLuaFunctionName(name),
    kind: 'button', enabled: true, manual: false, tabId: luaMenuTabs[0]?.id || 'tab-general', defaultEnabled: false, defaultValue: 50
  }));
  luaMenuActions = [...detected, ...manual, ...presets];
  renderLuaActions();
  if (force) toast(discovered.length ? `Đã phát hiện ${discovered.length} hàm có tên.` : 'Không tìm thấy hàm có tên theo cú pháp phổ biến. Bạn có thể thêm mục thủ công.');
}

function renderLuaActions() {
  const list = $('#luaActionList');
  if (!list) return;
  if (!luaMenuActions.length) {
    list.innerHTML = '<div class="lua-action-empty">Chưa có control. Bấm “Thêm mục” để dựng menu; handler Lua là tùy chọn.</div>';
  } else {
    list.innerHTML = luaMenuActions.map((item, index) => `
      <article class="lua-action-row" data-action-id="${escapeHtml(item.id)}">
        <div class="lua-action-row-top">
          <label class="lua-action-enabled"><input type="checkbox" data-action-field="enabled" ${item.enabled ? 'checked' : ''}><span>Hiển thị control ${index + 1}</span></label>
          <span class="lua-action-origin">${item.manual ? 'TỰ THÊM' : 'TỰ PHÁT HIỆN'}</span>
          <button class="lua-action-remove" type="button" data-action-remove aria-label="Xóa mục">×</button>
        </div>
        <div class="lua-action-fields lua-action-fields-v34">
          <label><span>TÊN HIỂN THỊ</span><input class="text-input" data-action-field="label" maxlength="70" value="${escapeHtml(item.label)}" placeholder="Ví dụ: Hiển thị trạng thái"></label>
          <label><span>HANDLER (KHÔNG XUẤT TỰ ĐỘNG)</span><input class="text-input" data-action-field="functionName" maxlength="100" list="luaFunctionOptions" value="${escapeHtml(item.functionName)}" placeholder="Để trống = UI only"></label>
          <label><span>LOẠI CONTROL</span><select class="text-input" data-action-field="kind"><option value="button" ${item.kind === 'button' ? 'selected' : ''}>Button</option><option value="toggle" ${item.kind === 'toggle' ? 'selected' : ''}>Toggle</option><option value="slider" ${item.kind === 'slider' ? 'selected' : ''}>Slider</option></select></label>
          <label><span>ĐẶT TRONG TAB</span><select class="text-input" data-action-field="tabId">${luaMenuTabs.map((tab) => `<option value="${escapeHtml(tab.id)}" ${item.tabId === tab.id ? 'selected' : ''}>${escapeHtml(tab.label)}</option>`).join('')}</select></label>
        </div>
        <div class="lua-action-slider-fields" ${item.kind === 'slider' ? '' : 'hidden'}>
          <label><span>GIÁ TRỊ NHỎ NHẤT</span><input class="text-input" data-action-field="minValue" type="number" min="-1000000" max="1000000" step="any" value="${escapeHtml(item.minValue ?? 0)}"></label>
          <label><span>GIÁ TRỊ LỚN NHẤT</span><input class="text-input" data-action-field="maxValue" type="number" min="-1000000" max="1000000" step="any" value="${escapeHtml(item.maxValue ?? 100)}"></label>
          <label><span>GIÁ TRỊ MẶC ĐỊNH</span><input class="text-input" data-action-field="defaultValue" type="number" min="-1000000" max="1000000" step="any" value="${escapeHtml(item.defaultValue ?? 50)}"></label>
          <label><span>BƯỚC NHẢY</span><input class="text-input" data-action-field="stepValue" type="number" min="0.001" max="1000000" step="any" value="${escapeHtml(item.stepValue ?? 1)}"></label>
        </div>
        <div class="lua-action-default-fields" ${item.kind === 'toggle' ? '' : 'hidden'}><label><input type="checkbox" data-action-field="defaultEnabled" ${item.defaultEnabled ? 'checked' : ''}> <span>Bật sẵn khi mở menu</span></label></div>
      </article>`).join('');
  }
  const datalist = $('#luaFunctionOptions');
  if (datalist) datalist.innerHTML = luaLastDetectedFunctions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
  const enabled = luaMenuActions.filter((item) => item.enabled).length;
  $('#luaActionSummary').textContent = `${enabled} control hiển thị · UI only`;
  refreshLuaMenuPreviewActions();
}
function readLuaMenuActions() {
  $$('.lua-action-row').forEach((row) => {
    const item = luaMenuActions.find((entry) => entry.id === row.dataset.actionId);
    if (!item) return;
    item.enabled = $('[data-action-field="enabled"]', row)?.checked ?? item.enabled;
    item.functionName = $('[data-action-field="functionName"]', row)?.value.trim() || '';
    item.label = $('[data-action-field="label"]', row)?.value.trim() || (item.functionName ? humanizeLuaFunctionName(item.functionName) : item.label);
    const selectedKind = $('[data-action-field="kind"]', row)?.value;
    item.kind = ['button', 'toggle', 'slider'].includes(selectedKind) ? selectedKind : 'button';
    item.tabId = $('[data-action-field="tabId"]', row)?.value || item.tabId || luaMenuTabs[0]?.id;
    item.minValue = Number($('[data-action-field="minValue"]', row)?.value ?? item.minValue ?? 0);
    item.maxValue = Number($('[data-action-field="maxValue"]', row)?.value ?? item.maxValue ?? 100);
    item.defaultValue = Number($('[data-action-field="defaultValue"]', row)?.value ?? item.defaultValue ?? 50);
    item.stepValue = Number($('[data-action-field="stepValue"]', row)?.value ?? item.stepValue ?? 1);
    item.defaultEnabled = $('[data-action-field="defaultEnabled"]', row)?.checked ?? item.defaultEnabled ?? false;
  });
}
function refreshLuaMenuPreviewActions() {
  const preview = $('#luaPreviewActions');
  if (!preview) return;
  readLuaMenuTabs();
  const allActions = luaMenuActions.filter((item) => item.enabled);
  const actions = allActions.filter((item) => (item.tabId || luaMenuTabs[0]?.id) === luaActiveMenuTabId);
  const count = $('#luaPreviewActionCount');
  if (count) count.textContent = `${allActions.length} chức năng`;
  refreshLuaPreviewTabs();
  if (!actions.length) {
    preview.innerHTML = '<div class="lua-preview-empty"><b>CHƯA CÓ CONTROL TRONG TAB NÀY</b><span>Thêm Button, Toggle hoặc Slider ở phần thiết kế bên dưới. Mỗi control sẽ xuất hiện đúng vị trí trong menu hoàn chỉnh.</span></div>';
    return;
  }
  preview.innerHTML = actions.map((item, index) => {
    const displayName = String(item.label || '').trim() || (item.functionName ? humanizeLuaFunctionName(item.functionName) : 'Control');
    const handlerLine = item.functionName
      ? `<small class="lua-preview-function-name" title="Tên hàm Lua đầy đủ: ${escapeHtml(item.functionName)}">Lua: ${escapeHtml(item.functionName)}</small>`
      : '<small>UI-only · chưa gắn hàm</small>';
    const copy = `<span class="lua-preview-control-copy"><b title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</b>${handlerLine}</span>`;
    if (item.kind === 'toggle') {
      const on = Boolean(item.previewEnabled ?? item.defaultEnabled);
      return `<div class="lua-preview-control-row"><span class="lua-preview-row-index">${String(index + 1).padStart(2, '0')}</span>${copy}<button type="button" class="lua-preview-switch ${on ? 'is-on' : ''}" data-preview-toggle="${escapeHtml(item.id)}" aria-pressed="${on}" aria-label="Bật tắt ${escapeHtml(item.label)}"><i></i></button></div>`;
    }
    if (item.kind === 'slider') {
      const min = Number.isFinite(item.minValue) ? item.minValue : 0;
      const max = Number.isFinite(item.maxValue) && item.maxValue > min ? item.maxValue : min + 100;
      const step = Number.isFinite(item.stepValue) && item.stepValue > 0 ? item.stepValue : 1;
      const raw = Number.isFinite(item.previewValue) ? item.previewValue : Number.isFinite(item.defaultValue) ? item.defaultValue : min;
      const value = Math.max(min, Math.min(max, raw));
      return `<div class="lua-preview-control-row lua-preview-slider-row"><span class="lua-preview-row-index">${String(index + 1).padStart(2, '0')}</span>${copy}<span class="lua-preview-slider-wrap"><output data-slider-output="${escapeHtml(item.id)}">${escapeHtml(value)}</output><input type="range" data-preview-slider="${escapeHtml(item.id)}" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(value)}"></span></div>`;
    }
    return `<div class="lua-preview-control-row lua-preview-button-row"><span class="lua-preview-row-index">${String(index + 1).padStart(2, '0')}</span>${copy}<button type="button" class="lua-preview-run-button" data-preview-button="${escapeHtml(item.id)}">OPEN</button></div>`;
  }).join('');
}

function handleLuaPreviewInteraction(event) {
  const toggle = event.target.closest('[data-preview-toggle]');
  const slider = event.target.closest('[data-preview-slider]');
  const button = event.target.closest('[data-preview-button]');
  if (toggle) {
    const item = luaMenuActions.find((entry) => entry.id === toggle.dataset.previewToggle);
    if (item) { item.previewEnabled = !Boolean(item.previewEnabled ?? item.defaultEnabled); refreshLuaMenuPreviewActions(); }
  } else if (slider) {
    const item = luaMenuActions.find((entry) => entry.id === slider.dataset.previewSlider);
    if (item) {
      item.previewValue = Number(slider.value);
      const output = $(`[data-slider-output="${CSS.escape(item.id)}"]`);
      if (output) output.textContent = slider.value;
    }
  } else if (button) {
    const item = luaMenuActions.find((entry) => entry.id === button.dataset.previewButton);
    if (item) { button.classList.add('was-preview-clicked'); button.textContent = 'PREVIEW'; setTimeout(() => { if (button.isConnected) { button.classList.remove('was-preview-clicked'); button.textContent = 'OPEN'; } }, 700); }
  }
}
function addLuaMenuAction() {
  readLuaMenuActions();
  luaMenuActions.push({ id: `lua-action-${++luaActionSequence}`, functionName: '', label: 'Control mới', kind: 'toggle', enabled: true, manual: true, tabId: luaActiveMenuTabId || luaMenuTabs[0]?.id, defaultEnabled: false, defaultValue: 50, minValue: 0, maxValue: 100, stepValue: 1 });
  renderLuaActions();
  const rows = $$('.lua-action-row');
  rows[rows.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('[data-action-field="label"]', rows[rows.length - 1] || document)?.focus();
}

function removeLuaMenuAction(row) {
  const id = row?.dataset.actionId;
  luaMenuActions = luaMenuActions.filter((item) => item.id !== id);
  renderLuaActions();
  invalidateLuaOutput();
}

function validateLuaFunctionReference(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(name)) return false;
  // This editor builds ordinary Roblox Studio UI controls only; it does not
  // expose common exploit/cheat handlers as menu actions.
  const normalized = String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ').toLowerCase();
  const blocked = [
    /\bsilent\s*aim\b/, /\baim\s*bot\b/, /\baim\s*assist\b/, /\bauto\s*kill\b/,
    /\bdistance\s*pull\b/, /\bwall\s*hack\b/, /\besp\b/, /\btrigger\s*bot\b/,
    /\bnoclip\b/, /\bspeed\s*hack\b/, /\bteleport\s*player\b/, /\banti\s*cheat\s*bypass\b/,
    /\brapid\s*fire\b/, /\binfinite\s*ammo\b/
  ];
  return !blocked.some((pattern) => pattern.test(normalized)) && !/^esp[A-Z0-9_]/i.test(name);
}

function refreshLuaMenuPreview() {
  const title = ($('#luaMenuTitle').value.trim() || 'TUAN ANH STORE').slice(0, 80);
  const subtitle = ($('#luaMenuSubtitle').value.trim() || 'BLUE NEON EDITION').slice(0, 120);
  $('#luaPreviewTitle').textContent = title;
  $('#luaPreviewSubtitle').textContent = subtitle;
  $('#luaPreviewVersion').textContent = ($('#luaMenuVersion')?.value.trim() || 'V1').slice(0, 12).toUpperCase();
  $('#luaPreviewUserName').textContent = ($('#luaMenuUserName')?.value.trim() || 'User').slice(0, 40);
  $('#luaPreviewUserRole').textContent = ($('#luaMenuUserRole')?.value.trim() || 'Member').slice(0, 50);
  const url = $('#luaImageUrl').value.trim();
  let image = luaImageDataUrl;
  if (!image && url) {
    try { const parsed = new URL(url); if (parsed.protocol === 'https:') image = parsed.href; } catch { }
  }
  if (!image && luaRobloxAssetId) image = `https://www.roblox.com/asset-thumbnail/image?assetId=${encodeURIComponent(luaRobloxAssetId)}&width=420&height=420&format=png`;
  setLuaPreviewImage(image);
  updateLuaPreviewTheme();
  refreshLuaPreviewTabs();
  refreshLuaMenuPreviewActions();
}
function luaQuote(value) {
  return '"' + String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
}

function buildLuaOutput() {
  const scriptName = ($('#luaScriptName').value.trim() || 'TuanAnhStore-GUI')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 70) || 'TuanAnhStore-GUI';
  const title = ($('#luaMenuTitle').value.trim() || 'TuanAnh').slice(0, 80);
  const subtitle = ($('#luaMenuSubtitle').value.trim() || 'VIP Hub').slice(0, 120);
  const version = ($('#luaMenuVersion').value.trim() || 'V1').slice(0, 12);
  const userName = ($('#luaMenuUserName').value.trim() || 'Player').slice(0, 40);
  const userRole = ($('#luaMenuUserRole').value.trim() || 'Member').slice(0, 50);
  const width = Math.max(520, Math.min(1100, Number($('#luaMenuWidth').value) || 620));
  const height = Math.max(320, Math.min(900, Number($('#luaMenuHeight').value) || 420));
  const accentHex = /^#[0-9a-f]{6}$/i.test($('#luaMenuAccent').value) ? $('#luaMenuAccent').value : '#ff96c8';
  const surfaceHex = /^#[0-9a-f]{6}$/i.test($('#luaMenuSurface').value) ? $('#luaMenuSurface').value : '#0f1117';
  const toRgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [ar, ag, ab] = toRgb(accentHex);
  const [sr, sg, sb] = toRgb(surfaceHex);
  const rawAssetId = String($('#luaRobloxAssetId').value || '').trim();
  const assetMatch = rawAssetId.match(/^(?:rbxassetid:\/\/)?(\d{1,24})$/i);
  if (rawAssetId && !assetMatch) throw new Error('Roblox Asset ID không hợp lệ. Chỉ nhập số hoặc rbxassetid://ID.');
  luaRobloxAssetId = assetMatch ? assetMatch[1] : '';
  const imageId = luaRobloxAssetId ? `rbxassetid://${luaRobloxAssetId}` : '';
  const hasPreviewOnlyImage = Boolean(luaImageDataUrl || $('#luaImageUrl').value.trim());
  if (hasPreviewOnlyImage && !imageId) {
    throw new Error('Ảnh hiện chỉ có trong preview. Hãy upload ảnh lên Roblox hoặc nhập Roblox Asset ID hợp lệ trước khi Build để ảnh được gắn vào LocalScript.');
  }

  readLuaMenuTabs();
  readLuaMenuActions();
  const tabs = luaMenuTabs.slice(0, 12);
  if (!tabs.length) throw new Error('Hãy tạo ít nhất một tab.');
  if (luaMenuTabs.length > 12) throw new Error('Tối đa 12 tab cho một GUI.');
  const enabledActions = luaMenuActions.filter((item) => item.enabled).slice(0, 80);
  if (luaMenuActions.filter((item) => item.enabled).length > 80) throw new Error('Tối đa 80 control được xuất trong một GUI.');
  for (const action of enabledActions) {
    if (!action.label.trim()) throw new Error('Tên control không được để trống.');
    if (!['button', 'toggle', 'slider'].includes(action.kind)) throw new Error(`Loại control không hợp lệ: ${action.label}`);
    if (action.kind === 'slider') {
      const min = Number(action.minValue), max = Number(action.maxValue), step = Number(action.stepValue);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || min >= max || step <= 0) {
        throw new Error(`Slider “${action.label}” cần min < max và step > 0.`);
      }
    }
    if (!tabs.some((tab) => tab.id === action.tabId)) action.tabId = tabs[0].id;
  }

  const L = [];
  const push = (...items) => L.push(...items);
  push(
    '-- TUAN ANH STORE · LUA STUDIO V36',
    '-- Generated as a normal Roblox Studio LocalScript.',
    '-- Place in StarterPlayerScripts or StarterGui. UI controls are visual-only by default.',
    '-- This file does not include executor APIs, anti-cheat bypasses, or gameplay exploits.',
    '',
    'local Players = game:GetService("Players")',
    'local UserInputService = game:GetService("UserInputService")',
    'local player = Players.LocalPlayer',
    'local playerGui = player:WaitForChild("PlayerGui")',
    '',
    `local GUI_NAME = ${luaQuote(scriptName)}`,
    `local ACCENT = Color3.fromRGB(${ar}, ${ag}, ${ab})`,
    `local SURFACE = Color3.fromRGB(${sr}, ${sg}, ${sb})`,
    `local LOGO_IMAGE = ${luaQuote(imageId)}`,
    '',
    'local previous = playerGui:FindFirstChild(GUI_NAME)',
    'if previous then previous:Destroy() end',
    '',
    'local function make(className, props, parent)',
    '    local object = Instance.new(className)',
    '    for key, value in pairs(props or {}) do object[key] = value end',
    '    object.Parent = parent',
    '    return object',
    'end',
    '',
    'local function corner(parent, radius)',
    '    make("UICorner", { CornerRadius = UDim.new(0, radius or 8) }, parent)',
    'end',
    '',
    'local gui = make("ScreenGui", { Name = GUI_NAME, ResetOnSpawn = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling }, playerGui)',
    'local miniRestore = make("ImageButton", { Name = "MiniRestore", Size = UDim2.fromOffset(55, 55), Position = UDim2.new(0, 30, 0.5, -27), BackgroundColor3 = SURFACE, BackgroundTransparency = 0.08, Image = LOGO_IMAGE, ScaleType = Enum.ScaleType.Crop, Visible = false, AutoButtonColor = true }, gui)',
    'corner(miniRestore, 28)',
    'make("UIStroke", { Color = ACCENT, Thickness = 2 }, miniRestore)',
    'make("TextLabel", { Name = "MiniFallback", Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "TA", TextColor3 = Color3.new(1,1,1), Font = Enum.Font.GothamBold, TextSize = 16, Visible = LOGO_IMAGE == "" }, miniRestore)',
    `local window = make("Frame", { Name = "MainWindow", AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(${width}, ${height}), BackgroundColor3 = SURFACE, BorderSizePixel = 0 }, gui)`,
    'miniRestore.MouseButton1Click:Connect(function() window.Visible = true; miniRestore.Visible = false end)',
    'corner(window, 12)',
    'make("UIStroke", { Color = ACCENT, Thickness = 1.5, Transparency = 0.12 }, window)',
    'make("UISizeConstraint", { MinSize = Vector2.new(520, 320), MaxSize = Vector2.new(1100, 900) }, window)',
    '',
    'local sidebar = make("Frame", { Name = "Sidebar", Size = UDim2.new(0, 175, 1, 0), BackgroundColor3 = Color3.fromRGB(math.max(0, ' + String(Math.max(0, sr-3)) + '), ' + String(sg) + ', ' + String(Math.min(255, sb+5)) + '), BorderSizePixel = 0 }, window)',
    'corner(sidebar, 12)',
    'local header = make("Frame", { Name = "Header", Size = UDim2.new(1, -185, 0, 48), Position = UDim2.new(0, 180, 0, 0), BackgroundTransparency = 1 }, window)',
    'local logo',
    'if LOGO_IMAGE ~= "" then',
    '    logo = make("ImageLabel", { Name = "Logo", Size = UDim2.fromOffset(34, 34), Position = UDim2.fromOffset(12, 7), BackgroundTransparency = 1, Image = LOGO_IMAGE, ScaleType = Enum.ScaleType.Crop }, sidebar)',
    '    corner(logo, 17)',
    'else',
    '    logo = make("TextLabel", { Name = "LogoFallback", Size = UDim2.fromOffset(34, 34), Position = UDim2.fromOffset(12, 7), BackgroundColor3 = ACCENT, Text = "TA", TextColor3 = Color3.new(1,1,1), Font = Enum.Font.GothamBold, TextSize = 12 }, sidebar)',
    '    corner(logo, 17)',
    'end',
    `local brandTitle = make("TextLabel", { Name = "BrandTitle", Size = UDim2.new(1, -70, 0, 20), Position = UDim2.fromOffset(52, 9), BackgroundTransparency = 1, Text = ${luaQuote(title)}, TextColor3 = Color3.fromRGB(255,255,255), Font = Enum.Font.GothamBold, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd }, sidebar)`,
    `local brandSubtitle = make("TextLabel", { Name = "BrandSubtitle", Size = UDim2.new(1, -70, 0, 14), Position = UDim2.fromOffset(52, 28), BackgroundTransparency = 1, Text = ${luaQuote(subtitle)}, TextColor3 = Color3.fromRGB(145,150,168), Font = Enum.Font.GothamMedium, TextSize = 10, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd }, sidebar)`,
    `local version = make("TextLabel", { Name = "Version", Size = UDim2.fromOffset(34, 18), Position = UDim2.new(1, -42, 0, 14), BackgroundColor3 = ACCENT, Text = ${luaQuote(version)}, TextColor3 = Color3.new(1,1,1), Font = Enum.Font.GothamBold, TextSize = 9 }, sidebar)`,
    'corner(version, 6)',
    'local nav = make("Frame", { Name = "TabList", Size = UDim2.new(1, -16, 1, -125), Position = UDim2.fromOffset(8, 58), BackgroundTransparency = 1 }, sidebar)',
    'make("UIListLayout", { Padding = UDim.new(0, 5), SortOrder = Enum.SortOrder.LayoutOrder }, nav)',
    `local profile = make("Frame", { Name = "ProfileCard", Size = UDim2.new(1, -16, 0, 48), Position = UDim2.new(0, 8, 1, -56), BackgroundColor3 = Color3.fromRGB(${Math.max(0, sr-2)}, ${Math.min(255, sg+2)}, ${Math.min(255, sb+8)}), BorderSizePixel = 0 }, sidebar)`,
    'corner(profile, 8)',
    'make("UIStroke", { Color = Color3.fromRGB(55, 48, 60), Transparency = 0.45 }, profile)',
    'local avatarImage = make("ImageLabel", { Name = "ProfileAvatar", Size = UDim2.fromOffset(32, 32), Position = UDim2.fromOffset(8, 8), BackgroundColor3 = ACCENT, BackgroundTransparency = 0.08, Image = "rbxthumb://type=AvatarHeadShot&id=" .. tostring(player.UserId) .. "&w=150&h=150", ScaleType = Enum.ScaleType.Crop }, profile)',
    'corner(avatarImage, 16)',
    'make("TextLabel", { Size = UDim2.new(1, -55, 0, 16), Position = UDim2.fromOffset(46, 8), BackgroundTransparency = 1, Text = ' + luaQuote(userName) + ', TextColor3 = Color3.fromRGB(240,240,250), Font = Enum.Font.GothamBold, TextSize = 10, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd }, profile)',
    'make("TextLabel", { Size = UDim2.new(1, -55, 0, 14), Position = UDim2.fromOffset(46, 24), BackgroundTransparency = 1, Text = ' + luaQuote(userRole) + ', TextColor3 = ACCENT, Font = Enum.Font.GothamMedium, TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left }, profile)',
    '',
    'make("Frame", { Name = "WindowBar", Size = UDim2.new(1, 0, 0, 28), BackgroundColor3 = Color3.fromRGB(9, 10, 15), BackgroundTransparency = 0.18, BorderSizePixel = 0 }, header)',
    'make("TextLabel", { Size = UDim2.new(1, -120, 1, 0), Position = UDim2.fromOffset(12, 0), BackgroundTransparency = 1, Text = "TUAN ANH STORE  /  GUI", TextColor3 = ACCENT, Font = Enum.Font.GothamBold, TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left }, header)',
    'local closeButton = make("TextButton", { Name = "Close", Size = UDim2.fromOffset(26, 22), Position = UDim2.new(1, -32, 0, 3), BackgroundColor3 = Color3.fromRGB(75, 35, 53), Text = "×", TextColor3 = Color3.new(1,1,1), Font = Enum.Font.GothamBold, TextSize = 14, AutoButtonColor = true }, header)',
    'corner(closeButton, 6)',
    'local minimizeButton = make("TextButton", { Name = "Minimize", Size = UDim2.fromOffset(26, 22), Position = UDim2.new(1, -62, 0, 3), BackgroundColor3 = Color3.fromRGB(42, 43, 55), Text = "−", TextColor3 = Color3.new(1,1,1), Font = Enum.Font.GothamBold, TextSize = 14, AutoButtonColor = true }, header)',
    'corner(minimizeButton, 6)',
    'minimizeButton.MouseButton1Click:Connect(function() window.Visible = false; miniRestore.Visible = true end)',
    'closeButton.MouseButton1Click:Connect(function() gui:Destroy() end)',
    'local content = make("Frame", { Name = "Content", Size = UDim2.new(1, -190, 1, -58), Position = UDim2.fromOffset(180, 52), BackgroundTransparency = 1 }, window)',
    'local pageTitle = make("TextLabel", { Name = "PageTitle", Size = UDim2.new(1, -16, 0, 24), Position = UDim2.fromOffset(8, 5), BackgroundTransparency = 1, Text = "TỔNG QUAN", TextColor3 = Color3.fromRGB(250,245,250), Font = Enum.Font.GothamBold, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left }, content)',
    'local pageSubtitle = make("TextLabel", { Name = "PageSubtitle", Size = UDim2.new(1, -16, 0, 18), Position = UDim2.fromOffset(8, 29), BackgroundTransparency = 1, Text = "Roblox Studio · Local GUI", TextColor3 = Color3.fromRGB(135,130,148), Font = Enum.Font.Gotham, TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left }, content)',
    'local controlArea = make("Frame", { Name = "Controls", Size = UDim2.new(1, -12, 1, -82), Position = UDim2.fromOffset(6, 53), BackgroundTransparency = 1, BorderSizePixel = 0, ClipsDescendants = true }, content)',
    'local status = make("TextLabel", { Name = "Status", Size = UDim2.new(1, -12, 0, 18), Position = UDim2.new(0, 6, 1, -22), BackgroundTransparency = 1, Text = "Sẵn sàng · UI only", TextColor3 = Color3.fromRGB(140,145,158), Font = Enum.Font.Gotham, TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left }, content)',
    '',
    'local pages = {}',
    'local activeSliderState = nil',
    'local function updateSliderFromX(state, x)',
    '    if not state or not state.track.Parent then return end',
    '    local width = math.max(state.track.AbsoluteSize.X, 1)',
    '    local fraction = math.clamp((x - state.track.AbsolutePosition.X) / width, 0, 1)',
    '    local rawValue = state.min + fraction * (state.max - state.min)',
    '    local value = state.min + math.floor(((rawValue - state.min) / state.step) + 0.5) * state.step',
    '    value = math.clamp(value, state.min, state.max)',
    '    local alpha = (value - state.min) / (state.max - state.min)',
    '    state.fill.Size = UDim2.new(alpha, 0, 1, 0)',
    '    state.knob.Position = UDim2.new(alpha, -6, 0.5, -6)',
    '    state.valueLabel.Text = tostring(value)',
    '    state.status.Text = state.label .. " · " .. tostring(value)',
    'end',
    'local function addControl(parent, item, index)',
    '    local row = make("Frame", { Name = "Control_" .. tostring(index), Size = UDim2.new(1, -8, 0, 42), BackgroundColor3 = Color3.fromRGB(22, 23, 31), BorderSizePixel = 0, LayoutOrder = index }, parent)',
    '    corner(row, 8)',
    '    make("UIStroke", { Color = Color3.fromRGB(48, 42, 55), Transparency = 0.35 }, row)',
    '    local labelWidth = item.kind == "slider" and -180 or -115',
    '    make("TextLabel", { Size = UDim2.new(1, labelWidth, 1, 0), Position = UDim2.fromOffset(12, 0), BackgroundTransparency = 1, Text = item.label, TextColor3 = Color3.fromRGB(230,225,238), Font = Enum.Font.GothamMedium, TextSize = 10, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd }, row)',
    '    if item.kind == "toggle" then',
    '        local on = item.defaultEnabled == true',
    '        local toggle = make("TextButton", { Size = UDim2.fromOffset(38, 20), Position = UDim2.new(1, -50, 0.5, -10), BackgroundColor3 = on and ACCENT or Color3.fromRGB(53, 54, 64), Text = on and "ON" or "OFF", TextColor3 = Color3.new(1,1,1), Font = Enum.Font.GothamBold, TextSize = 8 }, row)',
    '        corner(toggle, 10)',
    '        toggle.MouseButton1Click:Connect(function() on = not on; toggle.BackgroundColor3 = on and ACCENT or Color3.fromRGB(53,54,64); toggle.Text = on and "ON" or "OFF"; status.Text = item.label .. (on and " · ON" or " · OFF") end)',
    '    elseif item.kind == "slider" then',
    '        local minValue = tonumber(item.min) or 0',
    '        local maxValue = tonumber(item.max) or 100',
    '        local stepValue = math.max(tonumber(item.step) or 1, 0.000001)',
    '        local initialValue = math.clamp(tonumber(item.defaultValue) or minValue, minValue, maxValue)',
    '        local initialAlpha = (initialValue - minValue) / (maxValue - minValue)',
    '        local track = make("Frame", { Name = "SliderTrack", Active = true, Size = UDim2.fromOffset(104, 6), Position = UDim2.new(1, -151, 0.5, -3), BackgroundColor3 = Color3.fromRGB(58, 56, 69), BorderSizePixel = 0 }, row)',
    '        corner(track, 4)',
    '        local fill = make("Frame", { Name = "SliderFill", Size = UDim2.new(initialAlpha, 0, 1, 0), BackgroundColor3 = ACCENT, BorderSizePixel = 0 }, track)',
    '        corner(fill, 4)',
    '        local knob = make("Frame", { Name = "SliderKnob", Size = UDim2.fromOffset(12, 12), Position = UDim2.new(initialAlpha, -6, 0.5, -6), BackgroundColor3 = Color3.new(1,1,1), BorderSizePixel = 0 }, track)',
    '        corner(knob, 6)',
    '        make("UIStroke", { Color = ACCENT, Thickness = 1.2 }, knob)',
    '        local valueLabel = make("TextLabel", { Size = UDim2.fromOffset(38, 24), Position = UDim2.new(1, -42, 0.5, -12), BackgroundTransparency = 1, Text = tostring(initialValue), TextColor3 = ACCENT, Font = Enum.Font.GothamBold, TextSize = 9, TextXAlignment = Enum.TextXAlignment.Right }, row)',
    '        local state = { track = track, fill = fill, knob = knob, valueLabel = valueLabel, min = minValue, max = maxValue, step = stepValue, label = item.label, status = status }',
    '        track.InputBegan:Connect(function(input) if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then activeSliderState = state; updateSliderFromX(state, input.Position.X) end end)',
    '    else',
    '        local action = make("TextButton", { Size = UDim2.fromOffset(70, 24), Position = UDim2.new(1, -82, 0.5, -12), BackgroundColor3 = ACCENT, Text = "OPEN", TextColor3 = Color3.new(1,1,1), Font = Enum.Font.GothamBold, TextSize = 8 }, row)',
    '        corner(action, 6)',
    '        action.MouseButton1Click:Connect(function() status.Text = item.label .. " · UI action"; action.Text = "DONE"; task.delay(0.7, function() if action.Parent then action.Text = "OPEN" end end) end)',
    '    end',
    'end',
    'local sliderMoveConnection = UserInputService.InputChanged:Connect(function(input)',
    '    if activeSliderState and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then updateSliderFromX(activeSliderState, input.Position.X) end',
    'end)',
    'local sliderEndConnection = UserInputService.InputEnded:Connect(function(input)',
    '    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then activeSliderState = nil end',
    'end)',
    'gui.Destroying:Connect(function() activeSliderState = nil; sliderMoveConnection:Disconnect(); sliderEndConnection:Disconnect() end)',
    '',
    'local tabDefinitions = {'
  );
  for (const tab of tabs) {
    push(`    { id = ${luaQuote(tab.id)}, label = ${luaQuote(tab.label)} },`);
  }
  push('}', 'local function showTab(tabId)', '    for id, page in pairs(pages) do page.Visible = (id == tabId) end', '    for _, button in ipairs(nav:GetChildren()) do', '        if button:IsA("TextButton") then', '            local selected = button:GetAttribute("TabId") == tabId', '            button.BackgroundColor3 = selected and Color3.fromRGB(64, 39, 57) or Color3.fromRGB(22, 23, 31)', '            button.TextColor3 = selected and Color3.new(1,1,1) or Color3.fromRGB(160,155,172)', '        end', '    end', '    for _, tab in ipairs(tabDefinitions) do if tab.id == tabId then pageTitle.Text = tab.label end end', 'end', '', 'for index, tab in ipairs(tabDefinitions) do', '    local button = make("TextButton", { Name = "Tab_" .. tostring(index), Size = UDim2.new(1, 0, 0, 34), BackgroundColor3 = Color3.fromRGB(22, 23, 31), Text = tab.label, TextColor3 = Color3.fromRGB(160,155,172), Font = Enum.Font.GothamBold, TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left, AutoButtonColor = false, LayoutOrder = index }, nav)', '    button:SetAttribute("TabId", tab.id)', '    corner(button, 7)', '    make("UIPadding", { PaddingLeft = UDim.new(0, 10) }, button)', '    local page = make("ScrollingFrame", { Name = "Page_" .. tostring(index), Size = UDim2.new(1, 0, 1, 0), BackgroundTransparency = 1, BorderSizePixel = 0, ScrollBarThickness = 3, ScrollBarImageColor3 = ACCENT, CanvasSize = UDim2.new(), Visible = false }, controlArea)', '    local pageLayout = make("UIListLayout", { Padding = UDim.new(0, 7), SortOrder = Enum.SortOrder.LayoutOrder }, page)', '    pageLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function() page.CanvasSize = UDim2.fromOffset(0, pageLayout.AbsoluteContentSize.Y + 12) end)', '    pages[tab.id] = page', '    button.MouseButton1Click:Connect(function() showTab(tab.id) end)', 'end', '', 'local actions = {');
  for (const action of enabledActions) {
    const actionTab = tabs.some((tab) => tab.id === action.tabId) ? action.tabId : tabs[0].id;
    push(`    { tabId = ${luaQuote(actionTab)}, label = ${luaQuote(action.label.slice(0, 70))}, kind = ${luaQuote(action.kind)}, defaultEnabled = ${action.defaultEnabled ? 'true' : 'false'}, defaultValue = ${Number.isFinite(action.defaultValue) ? action.defaultValue : 50}, min = ${Number.isFinite(action.minValue) ? action.minValue : 0}, max = ${Number.isFinite(action.maxValue) ? action.maxValue : 100}, step = ${Number.isFinite(action.stepValue) ? action.stepValue : 1} },`);
  }
  push('}', 'for index, item in ipairs(actions) do', '    local page = pages[item.tabId]', '    if page then addControl(page, item, index) end', 'end', 'if tabDefinitions[1] then showTab(tabDefinitions[1].id) end', '', '-- Drag the window using its top bar.', 'local dragging = false', 'local dragStart, startPosition', 'header.InputBegan:Connect(function(input)', '    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then', '        dragging = true; dragStart = input.Position; startPosition = window.Position', '        input.Changed:Connect(function() if input.UserInputState == Enum.UserInputState.End then dragging = false end end)', '    end', 'end)', 'UserInputService.InputChanged:Connect(function(input)', '    if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then', '        local delta = input.Position - dragStart', '        window.Position = UDim2.new(startPosition.X.Scale, startPosition.X.Offset + delta.X, startPosition.Y.Scale, startPosition.Y.Offset + delta.Y)', '    end', 'end)', '', 'print("[Tuấn Anh Store] GUI loaded:", GUI_NAME)');

  const output = L.join('\n') + '\n';
  const outputBytes = new Blob([output]).size;
  if (outputBytes > LUA_OUTPUT_MAX_BYTES) throw new Error('File xuất vượt giới hạn 40 MB.');
  luaBuiltOutput = output;
  luaOutputFilename = `${scriptName}.lua`;
  $('#luaOutputCode').value = output;
  const imageNote = imageId ? ` · logo asset ${luaRobloxAssetId}` : ' · chưa gắn Roblox Asset ID';
  $('#luaOutputStatus').textContent = `Đã build ${luaOutputFilename} · ${formatLuaBytes(outputBytes)} · ${tabs.length} tab · ${enabledActions.length} control${imageNote}. File chỉ chứa GUI Roblox Studio độc lập.`;
  $('#copyLuaOutput').disabled = false;
  $('#downloadLuaOutput').disabled = false;
}


function luaDecodeEscapes(source) {
  return source.replace(/(['"])(?:\\.|(?!\1)[^\\])*?\1/g, (literal) => {
    const quote = literal[0];
    let body = literal.slice(1, -1);
    body = body.replace(/\\(\d{1,3})/g, (m, number) => {
      const value = Number(number);
      return value <= 255 ? String.fromCharCode(value) : m;
    });
    body = body.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    body = body.replace(/\\z\s*/g, '').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\'/g, "'");
    const printable = [...body].every((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
    });
    if (!printable) return literal;
    const escaped = body.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(new RegExp(quote, 'g'), `\\${quote}`);
    return quote + escaped + quote;
  });
}

function decodeLuaStatic(source) {
  let output = String(source || '').replace(/^\uFEFF/, '');
  const changes = [];
  let count = 0;
  const replaceAllSafe = (pattern, transform, label) => {
    output = output.replace(pattern, (...args) => {
      const replacement = transform(...args);
      if (typeof replacement === 'string' && replacement !== args[0]) { count++; if (!changes.includes(label)) changes.push(label); return replacement; }
      return args[0];
    });
  };

  // Expand constant string.char(65, 66, ...) calls only; never evaluates Lua.
  replaceAllSafe(/\bstring\s*\.\s*char\s*\(\s*((?:0x[\da-fA-F]+|\d{1,3})(?:\s*,\s*(?:0x[\da-fA-F]+|\d{1,3})){1,255})\s*\)/g, (whole, args) => {
    const numbers = args.split(',').map((part) => /^0x/i.test(part.trim()) ? parseInt(part.trim(), 16) : Number(part.trim()));
    if (numbers.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return whole;
    const decoded = String.fromCharCode(...numbers);
    if (![...decoded].every((c) => { const n=c.charCodeAt(0); return n===9||n===10||n===13||(n>=32&&n<=126); })) return whole;
    return luaQuote(decoded);
  }, 'string.char() constants');

  // Resolve string.reverse("literal") / ("literal"):reverse() constants.
  replaceAllSafe(/\bstring\s*\.\s*reverse\s*\(\s*(['"])([^'"\r\n]{1,12000})\1\s*\)/g, (whole, q, value) => luaQuote([...value].reverse().join('')), 'string.reverse() constants');
  replaceAllSafe(/\(\s*(['"])([^'"\r\n]{1,12000})\1\s*\)\s*:\s*reverse\s*\(\s*\)/g, (whole, q, value) => luaQuote([...value].reverse().join('')), 'method reverse() constants');

  // Decode literal Base64 only when directly passed to loadstring/load.
  replaceAllSafe(/\b(loadstring|load)\s*\(\s*(['"])([A-Za-z0-9+/=\r\n]{32,})\2\s*\)/g, (whole, loader, q, encoded) => {
    try {
      const bytes = atob(encoded.replace(/\s+/g, ''));
      const decoded = decodeURIComponent([...bytes].map((ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
      if (!/(local\s|function\s|return\s|game:|Instance\.new|print\s*\()/i.test(decoded)) return whole;
      const commentedPayload = decoded.split(/\r?\n/).map((line) => `-- | ${line}`).join('\n');
      return `-- [STATIC DECODED ${loader} PAYLOAD]\n${commentedPayload}\n-- [END STATIC PAYLOAD]\nnil`;
    } catch { return whole; }
  }, 'Base64 literal payloads');

  // Decode Lua decimal/hex escapes inside literals while keeping the result as a quoted Lua string.
  const escaped = luaDecodeEscapes(output);
  if (escaped !== output) { output = escaped; count++; changes.push('Lua string escapes'); }

  const binaryHeader = output.charCodeAt(0) === 0x1b || /\x1bLua/.test(output.slice(0, 8));
  const suspicious = [
    ['loadstring/load', /\b(loadstring|load)\s*\(/i],
    ['HTTP/dynamic fetch', /\b(HttpGet|HttpGetAsync|request|http_request|syn\.request)\b/i],
    ['executor environment', /\b(getgenv|gethui|hookmetamethod|cloneref|Drawing\.new)\b/i],
    ['file system access', /\b(writefile|readfile|delfile|listfiles)\b/i]
  ].filter(([, pattern]) => pattern.test(output)).map(([label]) => label);
  const report = {
    count,
    changes: [...new Set(changes)],
    binaryHeader,
    suspicious,
    incomplete: binaryHeader || suspicious.length > 0 || /\bwhile\s+true\s+do\b/i.test(output)
  };
  return { output, report };
}

function runLuaDecode() {
  const input = $('#luaDecodeInput').value;
  const outputField = $('#luaDecodeOutput');
  const reportNode = $('#luaDecodeReport');
  if (!input.trim()) { reportNode.textContent = 'Hãy dán mã Lua đầu vào trước.'; outputField.value = ''; $('#luaDecodeCopy').disabled = true; $('#luaDecodeDownload').disabled = true; return; }
  if (new Blob([input]).size > LUA_SOURCE_MAX_BYTES) { reportNode.textContent = 'Mã đầu vào vượt 5 MB.'; return; }
  const result = decodeLuaStatic(input);
  outputField.value = result.output;
  const details = result.report.changes.length ? result.report.changes.join(', ') : 'Không tìm thấy phép biến đổi tĩnh được hỗ trợ';
  const warnings = [];
  if (result.report.binaryHeader) warnings.push('Phát hiện header bytecode Lua/Luau; không thể khôi phục source gốc chỉ từ bytecode.');
  if (result.report.suspicious.length) warnings.push(`Có dấu hiệu code động/quyền truy cập nhạy cảm: ${result.report.suspicious.join(', ')}. Chỉ nên kiểm tra tĩnh.`);
  if (/\bwhile\s+true\s+do\b/i.test(result.output)) warnings.push('Có vòng lặp vô hạn; chưa được thực thi hoặc mô phỏng.');
  if (!result.report.count) warnings.push('Có thể script dùng VM obfuscator, thuật toán mã hóa riêng, key ngoài hoặc payload tải từ server. Công cụ không tự chạy các đoạn đó để giải tiếp.');
  reportNode.innerHTML = `<b>${result.report.count} phép biến đổi tĩnh</b><span>${escapeHtml(details)}</span>${warnings.map((warning) => `<em>${escapeHtml(warning)}</em>`).join('')}`;
  $('#luaDecodeCopy').disabled = false;
  $('#luaDecodeDownload').disabled = false;
}

function downloadLuaOutput() {
  if (!luaBuiltOutput) return;
  const blob = new Blob([luaBuiltOutput], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = luaOutputFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  trackAdminActivity('lua_output_downloaded', `File: ${luaOutputFilename}.`);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function maybeAutoUploadLuaImage() {
  if (!$('#luaRobloxAutoUpload')?.checked || !luaImageDetails || !luaRobloxUploadBlob || luaRobloxAutoUploadAttempted || luaRobloxAutoUploadRunning || luaRobloxAssetId) return;
  const apiKey = $('#luaRobloxApiKey').value.trim();
  const creatorId = $('#luaRobloxCreatorId').value.trim();
  if (!apiKey || !/^\d{1,20}$/.test(creatorId)) {
    $('#luaRobloxUploadStatus').textContent = 'Ảnh đã sẵn sàng. Điền API Key và User/Group ID; công cụ sẽ tự upload khi đủ thông tin.';
    return;
  }
  luaRobloxAutoUploadAttempted = true;
  luaRobloxAutoUploadRunning = true;
  try { await uploadLuaImageToRoblox({ automatic: true }); }
  finally { luaRobloxAutoUploadRunning = false; }
}

async function uploadLuaImageToRoblox(options = {}) {
  const status = $('#luaRobloxUploadStatus');
  const button = $('#luaRobloxUpload');
  const apiKeyField = $('#luaRobloxApiKey');
  const apiKey = apiKeyField.value.trim();
  const creatorType = $('#luaRobloxCreatorType').value;
  const creatorId = $('#luaRobloxCreatorId').value.trim();
  const displayName = ($('#luaRobloxAssetName').value.trim() || $('#luaMenuTitle').value.trim() || 'Tuan Anh Store Image').slice(0, 50);
  const description = $('#luaRobloxAssetDescription').value.trim().slice(0, 1000);
  if (!isAdmin) { status.textContent = 'Phiên Admin đã hết hạn. Hãy đăng nhập lại.'; return; }
  if (!luaImageDataUrl || !luaImageDetails || !luaRobloxUploadBlob) { status.textContent = 'Hãy chọn ảnh từ máy trước khi upload.'; if (!options.automatic) toast('Chưa chọn ảnh để upload Roblox.', true); return false; }
  if (!LUA_ROBLOX_UPLOAD_MIMES.has(luaImageDetails.mimeType)) {
    status.textContent = 'Roblox Open Cloud nhận PNG, JPG hoặc BMP ở công cụ này. Hãy lưu WebP/GIF/AVIF thành PNG rồi chọn lại.';
    toast('Định dạng ảnh này chưa được hỗ trợ upload Roblox.', true);
    return;
  }
  if (!apiKey) { status.textContent = 'Hãy nhập Roblox Open Cloud API Key.'; if (!options.automatic) apiKeyField.focus(); return false; }
  if (!/^\d{1,20}$/.test(creatorId)) { status.textContent = 'Hãy nhập User ID hoặc Group ID chỉ gồm chữ số.'; if (!options.automatic) $('#luaRobloxCreatorId').focus(); return false; }
  if (luaImageDetails.width >= 8000 || luaImageDetails.height >= 8000) { status.textContent = 'Ảnh phải nhỏ hơn 8000 × 8000 pixel. Hãy chọn lại ảnh để công cụ tự resize.'; return false; }
  const comma = luaImageDataUrl.indexOf(',');
  const imageBase64 = comma >= 0 ? luaImageDataUrl.slice(comma + 1) : '';
  if (!imageBase64) { status.textContent = 'Không đọc được dữ liệu ảnh. Hãy chọn lại file.'; return; }
  button.disabled = true;
  button.textContent = 'ĐANG UPLOAD & CHỜ ROBLOX...';
  status.textContent = `${options.automatic ? 'Tự động upload' : 'Đang upload'} ${luaImageDetails.name} (${formatLuaBytes(luaImageDetails.size)}) tới Roblox Open Cloud. Không đóng trang lúc này.`;
  try {
    const response = await fetch('/api/admin/roblox/assets', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, creatorType, creatorId, displayName, description, fileName: luaRobloxUploadBlob.name || luaImageDetails.name, mimeType: luaImageDetails.mimeType, imageBase64 })
    });
    let result;
    try { result = await response.json(); } catch { result = { error: 'Server trả phản hồi không hợp lệ.' }; }
    if (!response.ok) {
      if (response.status === 401) setAdminState(false);
      throw new Error(result.error || `Upload thất bại (HTTP ${response.status}).`);
    }
    const assetId = String(result.assetId || '').trim();
    if (!/^\d{1,24}$/.test(assetId)) throw new Error('Roblox không trả Asset ID hợp lệ.');
    luaRobloxAssetId = assetId;
    $('#luaRobloxAssetId').value = assetId;
    $('#luaImageUrl').value = '';
    status.textContent = `✓ Upload xong · Asset ID: ${assetId} · URI: rbxassetid://${assetId} · Moderation: ${result.moderationState || 'chưa có trạng thái'}. ID đã được gắn vào cấu hình MAKE.`;
    refreshLuaMenuPreview();
    invalidateLuaOutput('Đã cập nhật Roblox Asset ID. Hãy MAKE SCRIPT LUA lại để nhận ID mới.');
    toast(`Đã lấy Roblox Asset ID ${assetId}.`);
    return true;
  } catch (error) {
    status.textContent = `Upload không thành công: ${error.message}`;
    toast(error.message, true);
    return false;
  } finally {
    apiKeyField.value = '';
    button.disabled = false;
    button.textContent = '⇧ UPLOAD LÊN ROBLOX & LẤY ID';
  }
}

function bindPointerEffects() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const glow = $('#cursorGlow');
  if (!glow) return;
  let framePending = false;
  let lastEvent = null;
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    lastEvent = event;
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      if (lastEvent) {
        document.documentElement.style.setProperty('--pointer-x', `${lastEvent.clientX}px`);
        document.documentElement.style.setProperty('--pointer-y', `${lastEvent.clientY}px`);
        const target = lastEvent.target;
        const card = target instanceof Element ? target.closest('.quick-card, .showcase-card, .panel-card, .public-share-card, .hero') : null;
        if (card) {
          const rect = card.getBoundingClientRect();
          card.style.setProperty('--glow-x', `${Math.max(0, Math.min(100, ((lastEvent.clientX - rect.left) / rect.width) * 100))}%`);
          card.style.setProperty('--glow-y', `${Math.max(0, Math.min(100, ((lastEvent.clientY - rect.top) / rect.height) * 100))}%`);
        }
        document.body.classList.add('pointer-active');
      }
      framePending = false;
    });
  }, { passive: true });
  document.addEventListener('pointerleave', () => document.body.classList.remove('pointer-active'));
}

function bindEvents() {
  $$('[data-lua-studio-pane]').forEach((button) => button.addEventListener('click', () => {
    const pane = button.dataset.luaStudioPane;
    $$('[data-lua-studio-pane]').forEach((item) => item.classList.toggle('active', item === button));
    $$('[data-lua-studio-content]').forEach((section) => section.classList.toggle('active', section.dataset.luaStudioContent === pane));
  }));
  $('#luaDecodeRun').addEventListener('click', runLuaDecode);
  $('#luaDecodeClear').addEventListener('click', () => { $('#luaDecodeInput').value = ''; $('#luaDecodeOutput').value = ''; $('#luaDecodeReport').textContent = 'Đã xóa nội dung.'; $('#luaDecodeCopy').disabled = true; $('#luaDecodeDownload').disabled = true; });
  $('#luaDecodeCopy').addEventListener('click', () => { if ($('#luaDecodeOutput').value) copyText($('#luaDecodeOutput').value); });
  $('#luaDecodeDownload').addEventListener('click', () => {
    const text = $('#luaDecodeOutput').value;
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'decoded-static.lua'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.page)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
  $('#refreshActivity').addEventListener('click', loadActivity);
  $('#activityFilter').addEventListener('change', loadActivity);
  $('#clearActivity').addEventListener('click', async () => {
    if (!isAdmin) return;
    if (!window.confirm('Xóa toàn bộ nhật ký hoạt động đã lưu? Thao tác này không thể hoàn tác.')) return;
    try { await api('/api/admin/activity', { method: 'DELETE', body: {} }); toast('Đã xóa nhật ký hoạt động.'); await loadActivity(); }
    catch (error) { toast(error.message, true); }
  });
  $('#luaSourceFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(lua|txt)$/i.test(file.name) || file.size > LUA_SOURCE_MAX_BYTES) { toast('Chỉ nhận file .lua/.txt tối đa 5 MB.', true); event.target.value = ''; return; }
    try {
      const text = await file.text();
      $('#luaSourceCode').value = text;
      $('#luaFileName').textContent = `${file.name} · ${formatLuaBytes(file.size)}`;
      $('#luaScriptName').value = file.name.replace(/\.(lua|txt)$/i, '').slice(0, 80);
      updateLuaSourceStats();
      syncLuaDetectedFunctions('');
      luaBuiltOutput = '';
      $('#luaOutputCode').value = '';
      $('#luaOutputStatus').textContent = 'Source đã tải để xem / phân tích. Build tạo GUI độc lập từ Designer.';
      $('#copyLuaOutput').disabled = true;
      $('#downloadLuaOutput').disabled = true;
      trackAdminActivity('lua_source_loaded', `File: ${file.name}; dung lượng: ${file.size} byte. Không lưu nội dung mã nguồn.`);
      toast('Đã tải script Lua vào trình soạn thảo.');
    } catch (error) { toast(`Không đọc được file: ${error.message}`, true); }
  });
  $('#luaSourceCode').addEventListener('input', () => { updateLuaSourceStats(); invalidateLuaOutput('Source đã thay đổi. File build GUI độc lập không ghép source này.'); });
  $('#luaSourceCode').addEventListener('change', () => {
    const source = $('#luaSourceCode').value;
    if (source.trim()) trackAdminActivity('lua_source_edited', `Script được chỉnh sửa trong trình duyệt; ${source.length} ký tự. Không lưu nội dung mã nguồn.`);
  });
  $('#clearLuaSource').addEventListener('click', () => {
    $('#luaSourceCode').value = ''; $('#luaSourceFile').value = ''; $('#luaFileName').textContent = 'Hỗ trợ .lua / .txt · tối đa 5 MB';
    updateLuaSourceStats(); syncLuaDetectedFunctions(''); luaBuiltOutput = ''; $('#luaOutputCode').value = ''; $('#luaOutputStatus').textContent = 'Đã xóa nội dung nguồn.';
    $('#copyLuaOutput').disabled = true; $('#downloadLuaOutput').disabled = true;
  });
  ['luaScriptName', 'luaMenuTitle', 'luaMenuSubtitle', 'luaImageUrl', 'luaMenuVersion', 'luaMenuUserName', 'luaMenuUserRole', 'luaMenuWidth', 'luaMenuHeight', 'luaMenuAccent', 'luaMenuSurface'].forEach((id) => {
    const element = $(`#${id}`);
    const eventName = element?.type === 'color' || element?.type === 'number' ? 'change' : 'input';
    element?.addEventListener(eventName, () => {
      if (id === 'luaImageUrl') { luaImageDataUrl = ''; luaImageDetails = null; luaRobloxUploadBlob = null; $('#luaImageFile').value = ''; $('#luaImageStatus').textContent = 'Đang dùng URL ảnh (nếu hợp lệ). URL không tự upload Roblox.'; }
      refreshLuaMenuPreview();
      invalidateLuaOutput();
    });
  });
  $('#luaImageFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size <= 0 || file.size > LUA_IMAGE_MAX_BYTES) {
      toast(`Ảnh gốc phải có dung lượng từ 1 byte đến ${formatLuaBytes(LUA_IMAGE_MAX_BYTES)}.`, true);
      event.target.value = '';
      return;
    }
    const status = $('#luaImageStatus');
    const button = $('#buildLuaScript');
    luaRobloxAssetId = '';
    luaRobloxAutoUploadAttempted = false;
    luaRobloxUploadBlob = null;
    $('#luaRobloxAssetId').value = '';
    $('#luaRobloxUploadStatus').textContent = 'Đang chuẩn bị ảnh cho Roblox...';
    button.disabled = true;
    status.textContent = `Đang kiểm tra ảnh gốc ${file.name} (${formatLuaBytes(file.size)})...`;
    try {
      const mimeType = await getLuaImageMime(file);
      const dimensions = await inspectLuaImage(file, '');
      const prepared = await prepareLuaImageForRoblox(file, mimeType, dimensions);
      const dataUrl = await readLuaFileAsDataUrl(prepared.file, prepared.mimeType);
      luaImageDataUrl = dataUrl;
      luaRobloxUploadBlob = prepared.file;
      luaImageDetails = {
        name: file.name,
        size: prepared.file.size,
        originalSize: file.size,
        mimeType: prepared.mimeType,
        width: prepared.width,
        height: prepared.height,
        optimized: prepared.optimized,
        optimizationNote: prepared.note || ''
      };
      $('#luaImageUrl').value = '';
      const optimizationText = prepared.optimized
        ? ` · đã tối ưu ${formatLuaBytes(file.size)} → ${formatLuaBytes(prepared.file.size)} (${prepared.note || 'chuẩn Roblox'})`
        : ' · giữ nguyên file gốc';
      status.textContent = `✓ Ảnh đã sẵn sàng · ${prepared.mimeType} · ${prepared.width.toLocaleString('vi-VN')} × ${prepared.height.toLocaleString('vi-VN')} px${optimizationText}. Có thể preview ngay; Roblox nhận tối đa 20 MB và dưới 8000 × 8000 px.`;
      $('#luaRobloxUploadStatus').textContent = 'Ảnh đã chọn. Nếu ô Auto Upload đang bật và API Key + Creator ID đã nhập, công cụ sẽ tự gửi lên Roblox để lấy Asset ID.';
      refreshLuaMenuPreview();
      invalidateLuaOutput();
      toast('Đã thêm ảnh vào menu preview.');
      await maybeAutoUploadLuaImage();
    } catch (error) {
      status.textContent = `Không thêm được ảnh: ${error.message}`;
      event.target.value = '';
      luaImageDataUrl = '';
      luaImageDetails = null;
      luaRobloxUploadBlob = null;
      refreshLuaMenuPreview();
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $('#clearLuaImage').addEventListener('click', () => {
    luaImageDataUrl = '';
    luaImageDetails = null;
    luaRobloxUploadBlob = null;
    luaRobloxAutoUploadAttempted = false;
    luaRobloxAssetId = '';
    $('#luaRobloxAssetId').value = '';
    $('#luaImageFile').value = '';
    $('#luaImageStatus').textContent = 'Đã xóa ảnh. Có thể chọn ảnh khác hoặc dùng URL HTTPS.';
    $('#luaRobloxUploadStatus').textContent = 'Chọn ảnh PNG/JPG/BMP để upload lên Roblox.';
    refreshLuaMenuPreview();
    invalidateLuaOutput();
    toast('Đã xóa ảnh khỏi cấu hình menu.');
  });
  $('#luaRobloxAssetId').addEventListener('input', () => {
    const raw = $('#luaRobloxAssetId').value.trim();
    const match = raw.match(/^(?:rbxassetid:\/\/)?(\d{1,24})$/i);
    luaRobloxAssetId = match ? match[1] : '';
    if (raw && !match) $('#luaRobloxUploadStatus').textContent = 'Asset ID phải là số hoặc rbxassetid://ID.';
    refreshLuaMenuPreview();
    invalidateLuaOutput();
  });
  $('#luaRobloxUpload').addEventListener('click', uploadLuaImageToRoblox);
  $('#luaMenuTitle').addEventListener('change', () => { if (!$('#luaRobloxAssetName').value.trim() || $('#luaRobloxAssetName').value === 'Tuan Anh Store Image') $('#luaRobloxAssetName').value = $('#luaMenuTitle').value.trim().slice(0, 50); });
  $('#luaAddAction').addEventListener('click', addLuaMenuAction);
  $('#luaAddTab').addEventListener('click', addLuaMenuTab);
  $('#luaLoadMenuPreset').addEventListener('click', loadLuaMenuPreset);
  $('#luaTabEditList').addEventListener('input', (event) => {
    if (event.target.matches('[data-tab-label]')) { readLuaMenuTabs(); refreshLuaMenuPreview(); invalidateLuaOutput(); }
  });
  $('#luaTabEditList').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-tab-remove]');
    if (remove) removeLuaMenuTab(remove.closest('.lua-tab-edit-row'));
  });
  $('#luaPreviewTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-preview-tab]');
    if (!tab) return;
    readLuaMenuActions();
    luaActiveMenuTabId = tab.dataset.previewTab;
    refreshLuaMenuPreviewActions();
  });
  $('#luaPreviewActions').addEventListener('click', handleLuaPreviewInteraction);
  $('#luaPreviewActions').addEventListener('input', handleLuaPreviewInteraction);
  ['luaRobloxApiKey', 'luaRobloxCreatorId', 'luaRobloxCreatorType', 'luaRobloxAssetName'].forEach((id) => {
    const element = $(`#${id}`);
    element?.addEventListener('change', () => { luaRobloxAutoUploadAttempted = false; maybeAutoUploadLuaImage(); });
  });
  $('#luaRobloxAutoUpload').addEventListener('change', () => {
    luaRobloxAutoUploadAttempted = false;
    if ($('#luaRobloxAutoUpload').checked) maybeAutoUploadLuaImage();
  });

  $('#luaRescanActions').addEventListener('click', () => { readLuaMenuActions(); toast('Control GUI đã được làm mới. Source không được quét để gắn handler.'); });
  $('#luaReplaceTarget').addEventListener('change', () => { $('#luaReplaceTargetStatus').textContent = 'Source chỉ dùng để xem và phân tích tĩnh. Build luôn xuất GUI độc lập, không sửa hoặc thay thế hàm trong source.'; invalidateLuaOutput(); });
  $('#luaActionList').addEventListener('input', (event) => {
    if (event.target.matches('[data-action-field]')) { readLuaMenuActions(); refreshLuaMenuPreviewActions(); invalidateLuaOutput(); }
  });
  $('#luaActionList').addEventListener('change', (event) => {
    if (event.target.matches('[data-action-field]')) {
      readLuaMenuActions();
      if (event.target.dataset.actionField === 'kind' || event.target.dataset.actionField === 'tabId') renderLuaActions();
      else refreshLuaMenuPreviewActions();
      invalidateLuaOutput();
    }
  });
  $('#luaActionList').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-action-remove]');
    if (remove) removeLuaMenuAction(remove.closest('.lua-action-row'));
  });
  $('#buildLuaScript').addEventListener('click', () => {
    const error = $('#luaBuildError'); error.textContent = '';
    try { buildLuaOutput(); trackAdminActivity('lua_script_made', `File: ${luaOutputFilename}; ${luaBuiltOutput.length} ký tự; ${luaMenuActions.filter((item) => item.enabled).length} mục GUI. Xuất GUI Roblox Studio độc lập.`); toast('Đã build LocalScript GUI Roblox Studio.'); }
    catch (failure) { error.textContent = failure.message; }
  });
  $('#copyLuaOutput').addEventListener('click', () => { if (luaBuiltOutput) copyText(luaBuiltOutput); });
  $('#downloadLuaOutput').addEventListener('click', downloadLuaOutput);
  const dropzone = $('.lua-dropzone');
  ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('is-dragover'); }));
  ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('is-dragover'); }));
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer(); transfer.items.add(file); $('#luaSourceFile').files = transfer.files;
    $('#luaSourceFile').dispatchEvent(new Event('change', { bubbles: true }));
  });
  $$('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.scroll);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $('#mobileMenu').addEventListener('click', () => $('.nav-links').classList.toggle('open'));
  $('#loginOpen').addEventListener('click', () => { pendingPage = 'home'; showModal('loginModal'); });
  $('#createKeyOpen').addEventListener('click', () => {
    if (!isAdmin) return showModal('loginModal');
    $('#createError').textContent = '';
    $('#keyApp').value = 'TA-STORE-VN';
    $('#keyAppCustom').value = '';
    $('#keyAppCustom').classList.add('hidden');
    $('#keyQuantity').value = '100';
    $('#keyExpiryAmount').value = '30';
    $('#keyExpiryUnit').value = 'days';
    $('#keyPrefix').value = 'TAS-';
    $('#keyLength').value = '16';
    $('#keyRandomize').checked = true;
    $('#keyLevel').value = '1';
    $('#keyNote').value = '';
    $('#keyHwidLock').checked = true;
    setKeyDuration('30d');
    updateAdvancedKeyPreview();
    showModal('createModal');
  });
  $('#keyApp').addEventListener('change', () => {
    $('#keyAppCustom').classList.toggle('hidden', $('#keyApp').value !== 'Custom');
  });
  ['keyPrefix', 'keyLength', 'keyRandomize'].forEach((id) => $(`#${id}`).addEventListener('input', updateAdvancedKeyPreview));
  $('#keyRandomize').addEventListener('change', updateAdvancedKeyPreview);
  $('#keyExpiryAmount').addEventListener('input', updateKeyDurationNote);
  $('#keyExpiryUnit').addEventListener('change', updateKeyDurationNote);
  $$('[data-key-duration]').forEach((button) => button.addEventListener('click', () => setKeyDuration(button.dataset.keyDuration)));
  $$('[data-edit-expiry-mode]').forEach((button) => button.addEventListener('click', () => selectEditExpiryMode(button.dataset.editExpiryMode)));
  $('#editExpiryDays').addEventListener('input', updateEditExpiryUI);
  $('#editExpiryDate').addEventListener('input', updateEditExpiryUI);
  $$('.edit-expiry-presets [data-edit-expiry-days]').forEach((button) => button.addEventListener('click', () => {
    $('#editExpiryDays').value = button.dataset.editExpiryDays;
    selectEditExpiryMode('days');
  }));
  $$('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)));
  $$('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal(backdrop.id);
  }));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $$('.modal-backdrop.show').forEach((modal) => closeModal(modal.id));
  });

  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#loginSubmit');
    const errorLabel = $('#loginError');
    button.disabled = true;
    errorLabel.textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: { username: $('#adminUsername').value.trim(), password: $('#adminPassword').value } });
      $('#adminPassword').value = '';
      setAdminState(true);
      closeModal('loginModal');
      toast('Đăng nhập admin thành công.');
      navigate(pendingPage || initialPage);
      pendingPage = 'home';
      if (pendingShareAction) {
        pendingShareAction = false;
        setTimeout(() => createPublicShareLink(), 120);
      }
    } catch (error) {
      errorLabel.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $('#logoutButton').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST', body: {} }); } catch { /* phiên có thể đã hết hạn */ }
    setAdminState(false);
    $('#adminUsername').value = '';
    $('#adminPassword').value = '';
    $('#loginError').textContent = '';
    toast('Đã đăng xuất. Trang chủ vẫn mở công khai.');
  });

  $('#createForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#createSubmit');
    const errorLabel = $('#createError');
    button.disabled = true;
    errorLabel.textContent = '';
    try {
      const preview = updateAdvancedKeyPreview();
      const quantity = Number($('#keyQuantity').value);
      const level = Number($('#keyLevel').value);
      const appChoice = $('#keyApp').value;
      const appName = appChoice === 'Custom' ? $('#keyAppCustom').value.trim() : appChoice;
      if (!appName) throw new Error('Hãy nhập tên ứng dụng.');
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new Error('Số lượng key phải từ 1 đến 500.');
      if (!preview.prefix) throw new Error('Hãy nhập prefix hoặc mã key.');
      if (!preview.randomize && preview.prefix.length < 4) throw new Error('Mã key tùy chỉnh phải có ít nhất 4 ký tự.');
      if (preview.randomize && (!preview.validLength || !preview.validPrefix)) throw new Error('Độ dài key phải từ 4–80 ký tự và prefix phải ngắn hơn độ dài ít nhất 4 ký tự.');
      if (!Number.isInteger(level) || level < 1 || level > 1000) throw new Error('Level phân quyền phải từ 1 đến 1000.');
      const durationMs = getCreateDurationMs();
      const result = await api('/api/keys', {
        method: 'POST',
        body: {
          quantity: preview.randomize ? quantity : 1,
          application: appName,
          prefix: preview.prefix,
          keyLength: preview.length,
          randomize: preview.randomize,
          durationMs,
          level,
          note: $('#keyNote').value.trim(),
          hardwareLock: $('#keyHwidLock').checked,
          maxDevices: $('#keyHwidLock').checked ? 1 : 0
        }
      });
      const createdKeys = Array.isArray(result.keys) ? result.keys : (result.key ? [result.key] : []);
      if (!createdKeys.length) throw new Error('Server không trả về key đã tạo.');
      closeModal('createModal');
      const keyText = createdKeys.map((item) => item.key).join('\n');
      await Promise.all([loadKeys(), loadStats()]);
      navigate('keys');
      const copied = await copyText(keyText);
      if (copied) await trackAdminActivity('license_key_copied', `Đã sao chép ${createdKeys.length} key vừa tạo vào clipboard; ứng dụng: ${appName}.`);
      toast(`Đã sinh ${createdKeys.length} key${copied ? ' và copy vào clipboard' : ''}.`);
    } catch (error) {
      errorLabel.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $('#editKeyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#editKeySubmit');
    const errorLabel = $('#editKeyError');
    button.disabled = true;
    errorLabel.textContent = '';
    try {
      const name = $('#editKeyName').value.trim();
      if (!name) throw new Error('Tên key không được để trống.');
      const rawLimit = $('#editKeyDevices').value;
      const maxDevices = rawLimit === '' ? 0 : Number(rawLimit);
      if (!Number.isSafeInteger(maxDevices) || maxDevices < 0 || maxDevices > 1000000) {
        throw new Error('Số thiết bị phải là số nguyên từ 0 đến 1.000.000.');
      }
      const body = { name, maxDevices };
      const expiresAt = getEditExpiryValue();
      if (expiresAt !== undefined) body.expiresAt = expiresAt;
      await api(`/api/keys/${encodeURIComponent($('#editKeyId').value)}`, { method: 'PATCH', body });
      closeModal('editKeyModal');
      toast('Đã lưu thay đổi License Key.');
      await Promise.all([loadKeys(), loadStats()]);
    } catch (error) {
      errorLabel.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $('#keysTable').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) handleKeyAction(button);
  });
  document.addEventListener('copy', () => {
    if (!isAdmin) return;
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';
    const anchor = selection?.anchorNode;
    const host = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const keyCell = host?.closest?.('.key-cell');
    const keyText = keyCell?.querySelector('code')?.firstChild?.textContent?.trim() || '';
    if (keyCell && keyText && selectedText.includes(keyText)) {
      const name = keyCell.querySelector('b')?.textContent?.trim() || 'License Key';
      trackAdminActivity('license_key_copied', `Tên: ${name}; Admin sao chép key bằng thao tác bàn phím.`);
    }
  });
  $('#deviceList').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action="release-device"]');
    if (!button) return;
    if (!window.confirm('Gỡ thiết bị này khỏi key? Thiết bị có thể đăng ký lại ở lần xác thực sau nếu còn slot.')) return;
    try {
      await api(`/api/keys/${encodeURIComponent(button.dataset.keyId)}/devices/${encodeURIComponent(button.dataset.deviceId)}`, { method: 'DELETE' });
      const key = allKeys.find((item) => item.id === button.dataset.keyId);
      if (key) {
        key.devices = key.devices.filter((device) => device.id !== button.dataset.deviceId);
        showDevices(key);
      }
      await loadKeys();
      toast('Đã gỡ thiết bị khỏi key.');
    } catch (error) { toast(error.message, true); }
  });

  let searchTimer;
  $('#keySearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadKeys, 220);
  });
  $('#statusFilter').addEventListener('change', loadKeys);
  $('#refreshKeys').addEventListener('click', () => Promise.all([loadKeys(), loadStats()]));
  $('#refreshApiStatus').addEventListener('click', async () => {
    try { await refreshApiHealth(); toast('API server đang phản hồi tốt.'); }
    catch (error) { toast(`Không kết nối được API: ${error.message}`, true); }
  });
  $('#copyApiAbsolute').addEventListener('click', () => copyText(`${location.origin}/api/verify`));
  $('#saveCloudflareApiToken').addEventListener('click', async () => {
    if (!isAdmin) { toast('Đăng nhập Admin để kết nối Cloudflare.', true); return; }
    const input = $('#cloudflareApiTokenInput');
    const button = $('#saveCloudflareApiToken');
    const status = $('#cloudflareTokenStatus');
    const token = input.value.trim();
    if (!token) { toast('Hãy dán Cloudflare API Token trước.', true); input.focus(); return; }
    button.disabled = true;
    button.textContent = 'Đang xác minh...';
    if (status) status.textContent = 'Đang xác minh API Token với Cloudflare...';
    try {
      const result = await api('/api/admin/public-link/cloudflare-token', {
        method: 'POST',
        body: { token }
      });
      input.value = '';
      if (status) {
        status.textContent = '✓ API Token đã được xác minh và lưu riêng trên máy chủ. Bạn không cần nhập lại.';
        status.classList.add('is-ready');
      }
      toast(result.message || 'Đã lưu Cloudflare API Token an toàn.');
      await refreshPublicShareLink({ silent: true });
    } catch (error) {
      if (status) status.textContent = error.message || 'Không thể xác minh API Token.';
      toast(error.message || 'Không thể lưu Cloudflare API Token.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Lưu token an toàn';
    }
  });

  $('#publicDomainForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isAdmin) { toast('Đăng nhập Admin để cài đặt tên miền.', true); return; }
    const input = $('#publicDomainInput');
    const button = $('#savePublicDomain');
    const value = input.value.trim();
    if (!value) { toast('Hãy nhập tên miền bạn sở hữu.', true); input.focus(); return; }
    button.disabled = true;
    button.textContent = 'Đang lưu...';
    try {
      const result = await api('/api/admin/public-link/domain', { method: 'POST', body: { url: value } });
      input.value = new URL(result.configuredUrl || result.url || `https://${value}`).hostname;
      await refreshPublicShareLink({ silent: true });
      toast(result.available
        ? 'Tên miền đã sẵn sàng; bạn và khách có thể truy cập cùng một link.'
        : (result.message || 'Đã cấu hình DNS và Tunnel; hãy đợi DNS cập nhật rồi kiểm tra lại.'), !result.available && !result.provisioned);
    } catch (error) {
      toast(error.message || 'Không lưu được tên miền.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Lưu tên miền';
    }
  });
  $('#copyPublicShare').addEventListener('click', async () => {
    const url = $('#publicShareUrl').dataset.url;
    if (url) await copyText(url);
  });
  $('#createPublicShare').addEventListener('click', createPublicShareLink);
  $('#createTemporaryShare').addEventListener('click', createTemporaryShareLink);
  $('#refreshTemporaryShare').addEventListener('click', async () => {
    await refreshTemporaryShareLink();
    toast('Đã kiểm tra trạng thái link tạm thời.');
  });
  $('#copyTemporaryShare').addEventListener('click', async () => {
    const url = $('#temporaryShareUrl').dataset.url;
    if (url) await copyText(url);
  });
  $('#stopTemporaryShare').addEventListener('click', stopTemporaryShareLink);
  $('#refreshPublicShare').addEventListener('click', async () => {
    await refreshPublicShareLink();
    toast('Đã kiểm tra trạng thái đường dẫn website.');
  });

  $('#apiTestForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#apiTestSubmit');
    const output = $('#apiTestResult');
    const status = $('#apiTestHttpStatus');
    button.disabled = true;
    status.textContent = 'Đang gửi...';
    output.textContent = 'Đang chờ phản hồi từ server...';
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: $('#apiTestKey').value.trim(), deviceId: $('#apiTestDevice').value.trim(), application: $('#apiTestApplication').value.trim() })
      });
      const payload = await response.json();
      status.textContent = `HTTP ${response.status} · ${payload.status || (payload.ok ? 'ok' : 'error')}`;
      status.className = payload.ok ? 'result-ok' : 'result-error';
      output.textContent = JSON.stringify(payload, null, 2);
      if (payload.ok) {
        toast('API xác thực thành công và đã ghi nhận thiết bị.');
        await Promise.all([loadKeys(), loadStats()]);
      } else {
        toast(payload.error || 'API đã nhận request nhưng key không hợp lệ.', true);
      }
    } catch (error) {
      status.textContent = 'NETWORK ERROR';
      status.className = 'result-error';
      output.textContent = error.message;
      toast(`Không gọi được API: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  });

  $('#apiConfigForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#saveApiConfig');
    button.disabled = true;
    $('#apiConfigNote').textContent = 'Đang lưu cấu hình API...';
    const allowedOrigins = $('#apiAllowedOrigins').value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    try {
      const result = await api('/api/admin/api-config', {
        method: 'PUT',
        body: { host: $('#apiBindHost').value, allowedOrigins }
      });
      if (result.restartRequired) {
        $('#apiConfigNote').textContent = 'Đã lưu. Server đang khởi động lại để áp dụng bind LAN; đợi trạng thái API chuyển ONLINE.';
        toast('Đã lưu. Server đang khởi động lại để mở kết nối LAN.');
        setTimeout(async () => {
          for (let attempt = 0; attempt < 20; attempt += 1) {
            try { await refreshApiHealth(); await loadApiConfig(); return; }
            catch { await new Promise((resolve) => setTimeout(resolve, 700)); }
          }
          $('#apiConfigNote').textContent = 'Chưa thấy server hoạt động lại. Hãy kiểm tra cửa sổ watchdog / log server.';
        }, 900);
      } else {
        $('#apiConfigNote').textContent = `Đã lưu trên server. Bind: ${result.host}:${result.port} · ${result.allowedOrigins.length} origin.`;
        toast('Đã lưu cấu hình CORS/API.');
      }
    } catch (error) {
      $('#apiConfigNote').textContent = error.message;
      toast(error.message || 'Không thể lưu cấu hình API.', true);
    } finally {
      button.disabled = false;
    }
  });
  $$('[data-copy]').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copy)));
  $('#verifyEndpoint').textContent = `${location.origin}/api/verify`;
  $('#apiAbsoluteUrl').textContent = `${location.origin}/api/verify`;
}

renderLuaMenuTabs();
bindEvents();
updateLuaSourceStats();
syncLuaDetectedFunctions($('#luaSourceCode')?.value || '');
refreshLuaMenuPreview();
bindPointerEffects();
prepareManualLogin();
// The private invite card is refreshed after Admin login; guests never request its URL.
setInterval(() => {
  const shareUrl = $('#publicShareUrl')?.dataset.url;
  if (isAdmin && !shareUrl) refreshPublicShareLink({ silent: true });
  if (isAdmin) refreshTemporaryShareLink({ silent: true });
  if (isAdmin && $('#page-activity')?.classList.contains('active')) loadActivity();
}, 5000);

if (initialPage !== 'home') {
  pendingPage = initialPage;
  showModal('loginModal');
} else {
  loadPublicStats();
}
refreshApiHealth().catch(() => {});
