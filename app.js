/* ───────────────────────────────────────────────
   BarScan – app.js
   Barcode scanner with ZXing + BarcodeDetector API
─────────────────────────────────────────────── */

// ── API Config ────────────────────────────────────
// เปลี่ยน BASE_URL ให้ตรงกับ server ที่ deploy
const API_BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ? 'http://localhost:3001'  // เปิดจาก file:// ให้ชี้มาที่ local server
  : '';                      // same-origin (เมื่อ serve ผ่าน Express หรือ public tunnel)

// ── State ────────────────────────────────────────
const state = {
  records: JSON.parse(localStorage.getItem('barscan_records') || '[]'),
  config: JSON.parse(localStorage.getItem('barscan_config') || '{"doubleScanMs": 2000, "hwGroupMs": 500}'),
  sessionCount: 0,
  isScanning: false,
  stream: null,
  facingMode: 'environment',
  videoDevices: [],
  activeDeviceId: null,
  torchOn: false,
  codeReader: null,
  filterText: '',
  toastTimer: null,
  flashTimer: null,
  isModelLocked: false,
  hasServer: false,  // true เมื่อ ping server สำเร็จ
  forceOffline: JSON.parse(localStorage.getItem('barscan_force_offline') || 'false'),
};

// ── API Helper ────────────────────────────────────
async function apiCall(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Server Sync & Detection ──────────────────────
async function syncUnsyncedRecords() {
  const unsynced = state.records.filter(r => r.unsynced);
  if (unsynced.length === 0) return;

  showToast(`กำลังซิงก์ข้อมูลออฟไลน์ (${unsynced.length} รายการ)...`, 'info');
  
  // Clone to avoid mutation and reverse to upload oldest first
  const toSync = [...unsynced].reverse();
  let successCount = 0;

  for (const record of toSync) {
    try {
      await apiCall('POST', '/api/scans', {
        serial: record.serial,
        model: record.model,
        type: record.type,
        ts: record.ts
      });
      // Remove unsynced flag in local state
      const localRec = state.records.find(r => r.id === record.id);
      if (localRec) {
        delete localRec.unsynced;
      }
      successCount++;
    } catch (err) {
      console.error('Failed to sync offline record:', record, err);
      showToast(`ซิงก์ล้มเหลวที่รายการ: ${record.serial}`, 'error');
      break;
    }
  }

  if (successCount > 0) {
    saveRecords();
    showToast(`ซิงก์ข้อมูลสำเร็จ ${successCount} รายการ`, 'success');
  }
}

async function detectServer() {
  if (state.forceOffline) {
    state.hasServer = false;
    setServerIndicator(false, true);
    return;
  }

  setServerIndicator(false, false, true); // Connecting state

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  
  try {
    await fetch(API_BASE + '/api/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    state.hasServer = true;
    setServerIndicator(true);
    
    // Sync any unsynced offline records before loading database records
    await syncUnsyncedRecords();
    
    // โหลด records จาก server แทน localStorage
    await loadRecordsFromServer();
    // sync settings จาก server
    await loadSettingsFromServer();
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('detectServer error:', err);
    state.hasServer = false;
    setServerIndicator(false, false);
  }
}

function setServerIndicator(online, forced = false, connecting = false) {
  const el = els.serverIndicator || document.getElementById('server-indicator');
  if (!el) return;
  
  if (connecting) {
    el.textContent = '🟡 Connecting...';
    el.title = 'กำลังตรวจสอบการเชื่อมต่อ... กดเพื่อบังคับ Offline';
    el.className = 'server-indicator connecting';
    return;
  }

  if (forced) {
    el.textContent = '🟡 Offline (Manual)';
    el.title = 'โหมด Offline แบบแมนนวล กดเพื่อเชื่อมต่อใหม่';
    el.className = 'server-indicator offline forced';
    return;
  }

  el.textContent = online ? '🟢 Online' : '🟡 Offline';
  el.title = online
    ? 'เชื่อมต่อเซิร์ฟเวอร์เรียบร้อย กดเพื่อบังคับ Offline'
    : 'ไม่ได้เชื่อมต่อเซิร์ฟเวอร์ — บันทึกข้อมูลลงเครื่อง กดเพื่อตรวจสอบใหม่';
  el.className = 'server-indicator ' + (online ? 'online' : 'offline');
}

async function loadRecordsFromServer() {
  try {
    const rows = await apiCall('GET', '/api/scans');
    // แปลง field ให้ตรงกับ format ที่ frontend ใช้
    const serverRecords = rows.map(r => ({
      id:     r.id,
      serial: r.serial,
      model:  r.model || '',
      type:   r.type,
      ts:     r.ts,
    }));
    
    // Preserve local unsynced records
    const unsyncedRecords = state.records.filter(r => r.unsynced);
    state.records = [...unsyncedRecords, ...serverRecords];
    
    // sync กลับลง localStorage ด้วย
    localStorage.setItem('barscan_records', JSON.stringify(state.records));
    updateStats();
    renderRecords();
  } catch (err) {
    console.warn('loadRecordsFromServer failed:', err);
  }
}

async function loadSettingsFromServer() {
  try {
    const s = await apiCall('GET', '/api/settings');
    state.config.doubleScanMs = s.double_scan_ms ?? state.config.doubleScanMs;
    state.config.hwGroupMs    = s.hw_group_ms    ?? state.config.hwGroupMs;
    localStorage.setItem('barscan_config', JSON.stringify(state.config));
  } catch (err) {
    console.warn('loadSettingsFromServer failed:', err);
  }
}

function saveConfig() {
  localStorage.setItem('barscan_config', JSON.stringify(state.config));
  // sync ขึ้น server ถ้ามี
  if (state.hasServer) {
    apiCall('PUT', '/api/settings', {
      double_scan_ms: state.config.doubleScanMs,
      hw_group_ms:    state.config.hwGroupMs,
    }).catch(err => console.warn('saveConfig to server failed:', err));
  }
}

// ── DOM refs ─────────────────────────────────────
const $ = id => document.getElementById(id);
const els = {
  video: $('camera-feed'),
  overlay: $('scan-overlay'),
  idle: $('camera-idle'),
  idleTitle: $('idle-title'),
  idleSub: $('idle-sub'),
  flashBadge: $('flash-badge'),
  btnToggle: $('btn-toggle-camera'),
  btnLabel: $('btn-camera-label'),
  btnFlip: $('btn-flip-camera'),
  btnTorch: $('btn-torch'),
  btnManual: $('btn-manual'),
  btnCapture: $('btn-capture'),
  canvas: $('scan-canvas'),
  btnExport: $('btn-export'),
  btnClearAll: $('btn-clear-all'),
  serverIndicator: $('server-indicator'),
  // Manual modal extras
  manualModelInput: $('input-manual-model'),
  // Sticky model
  stickyModelInput: $('input-sticky-model'),
  btnLockModel: $('btn-lock-model'),
  // Edit modal
  editModal: $('edit-modal'),
  editModelInput: $('input-edit-model'),
  editSerialInput: $('input-edit-serial'),
  editError: $('edit-error'),
  btnCloseEdit: $('btn-close-edit'),
  btnCancelEdit: $('btn-cancel-edit'),
  btnSubmitEdit: $('btn-submit-edit'),
  statTotal: $('stat-total'),
  statSession: $('stat-session'),
  statUnique: $('stat-unique'),
  recordsList: $('records-list'),
  emptyState: $('empty-state'),
  searchInput: $('input-search'),
  modal: $('manual-modal'),
  manualInput: $('input-manual'),
  manualError: $('manual-error'),
  btnCloseModal: $('btn-close-modal'),
  btnCancelModal: $('btn-cancel-modal'),
  btnSubmitManual: $('btn-submit-manual'),
  // Settings modal
  btnSettings: $('btn-settings'),
  settingsModal: $('settings-modal'),
  inputDelayDouble: $('input-delay-double'),
  inputDelayGroup: $('input-delay-group'),
  btnCloseSettings: $('btn-close-settings'),
  btnCancelSettings: $('btn-cancel-settings'),
  btnSaveSettings: $('btn-save-settings'),
  toast: $('toast'),
};

// ── Persist ───────────────────────────────────────
function saveRecords() {
  localStorage.setItem('barscan_records', JSON.stringify(state.records));
}

// ── Stats ─────────────────────────────────────────
function updateStats() {
  els.statTotal.textContent = state.records.length;
  els.statSession.textContent = state.sessionCount;
  const unique = new Set(state.records.map(r => r.serial)).size;
  els.statUnique.textContent = unique;
}

// ── Toast ─────────────────────────────────────────
function showToast(msg, type = '') {
  clearTimeout(state.toastTimer);
  els.toast.textContent = msg;
  els.toast.className = 'toast show' + (type ? ' ' + type : '');
  state.toastTimer = setTimeout(() => {
    els.toast.className = 'toast';
  }, 2800);
}

// ── Flash badge ───────────────────────────────────
function showFlash(text) {
  clearTimeout(state.flashTimer);
  els.flashBadge.textContent = text;
  els.flashBadge.classList.add('show');
  state.flashTimer = setTimeout(() => els.flashBadge.classList.remove('show'), 1800);
}

// ── Add record ────────────────────────────────────
async function addRecord(serial, type = 'scanned', model = '') {
  const sTrim = serial.trim();
  let finalModel = model.trim();
  
  // Apply sticky model if locked and no specific model was provided
  if (!finalModel && state.isModelLocked) {
    finalModel = els.stickyModelInput.value.trim();
  }
  
  // Unique Check: ตรวจสอบว่ามีข้อมูลนี้แล้วหรือไม่ (ป้องกันข้อมูลซ้ำแบบ Global)
  const isDuplicate = state.records.some(r => r.serial === sTrim);
  if (isDuplicate) {
    showToast('สแกนซ้ำ: มีข้อมูลนี้ในรายการแล้ว', 'error');
    showFlash('ข้อมูลซ้ำ!');
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]); // สั่นเตือนเป็นจังหวะ error
    return;
  }

  let record;

  if (state.hasServer) {
    // ── API mode ──────────────────────────────────
    try {
      record = await apiCall('POST', '/api/scans', {
        serial: sTrim,
        model:  finalModel,
        type,
      });
      // แปลง field ts จาก server
      record.ts = record.ts || new Date().toISOString();
    } catch (err) {
      console.error('addRecord API error:', err);
      showToast('Server error — บันทึก local แทน', 'error');
      // fallback to local
      record = {
        id: Date.now() + Math.random(),
        serial: sTrim,
        model: finalModel,
        type,
        ts: new Date().toISOString(),
        unsynced: true,
      };
    }
  } else {
    // ── Offline mode ──────────────────────────────
    record = {
      id: Date.now() + Math.random(),
      serial: sTrim,
      model: finalModel,
      type,
      ts: new Date().toISOString(),
      unsynced: true,
    };
  }

  state.records.unshift(record);
  state.sessionCount++;
  saveRecords();
  updateStats();
  renderRecords();
  showFlash('✓ ' + sTrim);
  showToast('Captured: ' + sTrim, 'success');

  // Flash new item
  const firstItem = els.recordsList.firstElementChild;
  if (firstItem) {
    firstItem.classList.add('new-flash');
    setTimeout(() => firstItem.classList.remove('new-flash'), 1500);
  }
}

// ── Delete record ─────────────────────────────
async function deleteRecord(id) {
  if (state.hasServer) {
    try {
      await apiCall('DELETE', `/api/scans/${id}`);
    } catch (err) {
      console.error('deleteRecord API error:', err);
      showToast('Server error: ' + err.message, 'error');
      return;
    }
  }
  state.records = state.records.filter(r => r.id !== id);
  saveRecords();
  updateStats();
  renderRecords();
  showToast('Record deleted', 'error');
}

// ── Copy serial ───────────────────────────────────
async function copySerial(serial) {
  try {
    await navigator.clipboard.writeText(serial);
    showToast('Copied to clipboard!', 'success');
  } catch {
    showToast('Copy failed', 'error');
  }
}

// ── Format date ───────────────────────────────────
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Render records ────────────────────────────────
function renderRecords() {
  const q = state.filterText.toLowerCase();
  const filtered = q
    ? state.records.filter(r => r.serial.toLowerCase().includes(q))
    : state.records;

  els.recordsList.innerHTML = '';

  if (filtered.length === 0) {
    els.emptyState.classList.add('visible');
    return;
  }
  els.emptyState.classList.remove('visible');

  filtered.forEach((rec, idx) => {
    const li = document.createElement('li');
    li.className = 'record-item';
    li.setAttribute('role', 'listitem');
    li.dataset.id = rec.id;
    const modelHtml = rec.model
      ? `<div class="record-model">${escHtml(rec.model)}</div>`
      : '';
    li.innerHTML = `
      <div class="record-index">${filtered.length - idx}</div>
      <div class="record-body">
        ${modelHtml}
        <div class="record-serial">${escHtml(rec.serial)}</div>
        <div class="record-meta">
          <span class="record-type-badge">${rec.type}</span>${fmtDate(rec.ts)}
        </div>
      </div>
      <div class="record-actions">
        <button class="rec-btn edit-btn" title="แก้ไข" aria-label="แก้ไขรายการ">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="rec-btn copy-btn" title="Copy" aria-label="Copy ${escHtml(rec.serial)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="rec-btn delete-btn" title="Delete" aria-label="Delete record">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>`;

    li.querySelector('.edit-btn').addEventListener('click', () => openEditModal(rec.id));
    li.querySelector('.copy-btn').addEventListener('click', () => copySerial(rec.serial));
    li.querySelector('.delete-btn').addEventListener('click', () => deleteRecord(rec.id));
    els.recordsList.appendChild(li);
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Camera ────────────────────────────────────────
async function updateDeviceList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.videoDevices = devices.filter(d => d.kind === 'videoinput');
    
    const activeTrack = state.stream?.getVideoTracks()[0];
    if (activeTrack) {
      const activeDevice = state.videoDevices.find(d => d.label === activeTrack.label);
      if (activeDevice) {
        state.activeDeviceId = activeDevice.deviceId;
      }
    }
  } catch (e) {
    console.warn('Failed to update device list:', e);
  }
}

async function startCamera() {
  try {
    if (state.stream) stopCamera();

    // Try to pre-populate devices list if permission is already granted
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.videoDevices = devices.filter(d => d.kind === 'videoinput');
    } catch (_) {}

    let constraints;
    if (state.activeDeviceId && state.videoDevices.some(d => d.deviceId === state.activeDeviceId)) {
      constraints = {
        video: {
          deviceId: { exact: state.activeDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
    } else {
      constraints = {
        video: {
          facingMode: { ideal: state.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
    }

    try {
      state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('Failed to start camera with ideal constraints, trying fallback...', err);
      // Fallback constraints: remove specific resolution ideal properties
      const fallbackConstraints = {
        video: (state.activeDeviceId && state.videoDevices.some(d => d.deviceId === state.activeDeviceId))
          ? { deviceId: state.activeDeviceId }
          : { facingMode: { ideal: state.facingMode } },
        audio: false,
      };
      state.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    }

    els.video.srcObject = state.stream;
    await els.video.play();
    state.isScanning = true;
    updateCameraUI(true);
    enableAuxControls();
    els.btnCapture.disabled = false;

    // Refresh devices list so that labels are loaded
    await updateDeviceList();
  } catch (err) {
    console.error('Camera error:', err);
    let msg = 'Camera access denied';
    if (err.name === 'NotFoundError') msg = 'No camera found on this device';
    if (err.name === 'NotAllowedError') msg = 'Camera permission denied – allow it in browser settings';
    setIdleState(msg, err.name === 'NotAllowedError' ? 'Grant permission and refresh the page' : 'Connect a camera and try again');
    showToast(msg, 'error');
  }
}

function stopCamera() {
  if (state.codeReader) {
    try { state.codeReader.reset(); } catch (_) {}
    state.codeReader = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  els.video.srcObject = null;
  state.isScanning = false;
  state.torchOn = false;
  updateCameraUI(false);
  disableAuxControls();
}

function updateCameraUI(active) {
  if (active) {
    els.btnLabel.textContent = 'Stop Camera';
    els.btnToggle.classList.add('stop');
    els.overlay.classList.add('active');
    els.idle.classList.add('hidden');
    els.btnCapture.disabled = false;
  } else {
    els.btnLabel.textContent = 'Start Camera';
    els.btnToggle.classList.remove('stop');
    els.overlay.classList.remove('active');
    els.idle.classList.remove('hidden');
    setIdleState('Camera Stopped', 'Tap the button below to start scanning');
    els.btnTorch.classList.remove('torch-on');
    els.btnCapture.disabled = true;
  }
}

function setIdleState(title, sub) {
  els.idleTitle.textContent = title;
  els.idleSub.textContent = sub;
}

function enableAuxControls() {
  els.btnFlip.disabled = false;
  // Torch only if supported
  const track = state.stream?.getVideoTracks()[0];
  const caps = track?.getCapabilities?.();
  els.btnTorch.disabled = !(caps && caps.torch);
}

function disableAuxControls() {
  els.btnFlip.disabled = true;
  els.btnTorch.disabled = true;
}

async function flipCamera() {
  if (!state.videoDevices || state.videoDevices.length <= 1) {
    // Fallback if we don't have multiple enumerated devices
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    state.activeDeviceId = null;
  } else {
    // Cycle to next videoinput device
    let currentIdx = state.videoDevices.findIndex(d => d.deviceId === state.activeDeviceId);
    if (currentIdx === -1) {
      // Find by active track label if index is not found
      const activeTrack = state.stream?.getVideoTracks()[0];
      if (activeTrack) {
        currentIdx = state.videoDevices.findIndex(d => d.label === activeTrack.label);
      }
    }
    const nextIdx = (currentIdx + 1) % state.videoDevices.length;
    state.activeDeviceId = state.videoDevices[nextIdx].deviceId;

    // Set facingMode state according to device label
    const label = state.videoDevices[nextIdx].label.toLowerCase();
    if (label.includes('front') || label.includes('user')) {
      state.facingMode = 'user';
    } else {
      state.facingMode = 'environment';
    }
  }

  await startCamera();

  // Show visual feedback to the user about which camera is active
  const activeTrack = state.stream?.getVideoTracks()[0];
  if (activeTrack && activeTrack.label) {
    showToast('Switched to: ' + activeTrack.label, 'success');
  }
}

async function toggleTorch() {
  const track = state.stream?.getVideoTracks()[0];
  if (!track) return;
  state.torchOn = !state.torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: state.torchOn }] });
    els.btnTorch.classList.toggle('torch-on', state.torchOn);
    showToast(state.torchOn ? 'Flashlight ON' : 'Flashlight OFF');
  } catch {
    state.torchOn = false;
    showToast('Torch not supported on this device', 'error');
  }
}

// ── Detection (Single-shot capture) ───────────────
let lastScanned = '';
let lastScannedTs = 0;

async function captureAndScan() {
  if (!state.isScanning || !state.stream) {
    showToast('Start camera first', 'error');
    return;
  }

  const video = els.video;
  if (video.readyState < video.HAVE_ENOUGH_DATA) {
    showToast('Camera not ready yet', 'error');
    return;
  }

  // Shutter flash effect
  const flash = document.createElement('div');
  flash.className = 'capture-flash';
  els.video.parentElement.appendChild(flash);
  setTimeout(() => flash.remove(), 300);

  if (navigator.vibrate) navigator.vibrate(30);

  // Capture current frame to canvas
  const canvas = els.canvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  // Run detection on the captured frame
  try {
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({
        formats: [
          'code_128','code_39','code_93','codabar',
          'ean_13','ean_8','upc_a','upc_e',
          'itf','aztec','data_matrix','pdf417','qr_code',
        ],
      });
      const barcodes = await detector.detect(canvas);
      if (barcodes.length > 0) {
        handleDetected(barcodes[0].rawValue, barcodes[0].format || 'barcode');
      } else {
        showToast('No barcode found', 'error');
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
      }
    } else if (window.ZXing) {
      if (!state.codeReader) {
        const hints = new Map();
        const formats = [
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E,
          ZXing.BarcodeFormat.QR_CODE,
          ZXing.BarcodeFormat.DATA_MATRIX,
          ZXing.BarcodeFormat.PDF_417,
          ZXing.BarcodeFormat.ITF,
        ];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        state.codeReader = new ZXing.BrowserMultiFormatReader(hints);
      }
      const result = await state.codeReader.decodeFromCanvas(canvas);
      if (result) {
        handleDetected(result.getText(), result.getBarcodeFormat?.()?.toString() || 'barcode');
      }
    } else {
      showToast('No barcode detection engine available', 'error');
    }
  } catch (e) {
    showToast('No barcode found', 'error');
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  }
}

function handleDetected(value, format) {
  if (!value || !value.trim()) return;
  const now = Date.now();
  if (value === lastScanned && now - lastScannedTs < state.config.doubleScanMs) return;
  lastScanned = value;
  lastScannedTs = now;

  // Vibrate feedback
  if (navigator.vibrate) navigator.vibrate([60, 30, 60]);

  addRecord(value.trim(), format || 'scanned');
}

// ── Export CSV ────────────────────────────────────
function exportCSV() {
  if (state.records.length === 0) { showToast('ไม่มีรายการที่จะ export', 'error'); return; }
  const rows = [['#', 'ชื่อรุ่น', 'Serial / Barcode', 'Type', 'Timestamp']];
  state.records.forEach((r, i) => {
    rows.push([i + 1, r.model || '', r.serial, r.type, new Date(r.ts).toLocaleString()]);
  });
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `barscan_${Date.now()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('Exported ' + state.records.length + ' records', 'success');
}

// ── Manual modal ──────────────────────────────────
function openModal() {
  els.modal.classList.add('open');
  els.manualInput.value = '';
  els.manualModelInput.value = '';
  els.manualError.textContent = '';
  setTimeout(() => els.manualModelInput.focus(), 350);
}

function closeModal() {
  els.modal.classList.remove('open');
}

let lastManualSubmit = '';
let lastManualSubmitTs = 0;

function submitManual() {
  const val = els.manualInput.value.trim();
  if (!val) { els.manualError.textContent = 'กรุณากรอก Serial / Barcode Number'; return; }
  if (val.length < 2) { els.manualError.textContent = 'สั้นเกินไป – ขั้นต่ำ 2 ตัวอักษร'; return; }
  
  // Software Logic (Buffer Check): ป้องกัน Hardware Scanner ยิงรัวเข้าช่อง Input
  const now = Date.now();
  if (val === lastManualSubmit && (now - lastManualSubmitTs) < state.config.doubleScanMs) {
    els.manualInput.value = '';
    els.manualInput.blur(); // Focus Management: เอา Cursor ออกเพื่อกันสแกนซ้ำ
    closeModal();
    return;
  }
  lastManualSubmit = val;
  lastManualSubmitTs = now;

  const model = els.manualModelInput.value.trim();
  addRecord(val, 'manual', model);
  
  els.manualInput.value = '';
  els.manualInput.blur(); // Focus Management: สแกนเสร็จให้ Unfocus ทันที
  closeModal();
}

// ── Edit modal ────────────────────────────────────
let editingId = null;

function openEditModal(id) {
  const rec = state.records.find(r => r.id === id);
  if (!rec) return;
  editingId = id;
  els.editModelInput.value = rec.model || '';
  els.editSerialInput.value = rec.serial || '';
  els.editError.textContent = '';
  els.editModal.classList.add('open');
  setTimeout(() => els.editModelInput.focus(), 350);
}

function closeEditModal() {
  els.editModal.classList.remove('open');
  editingId = null;
}

async function submitEdit() {
  const serial = els.editSerialInput.value.trim();
  if (!serial) { els.editError.textContent = 'กรุณากรอก Serial / Barcode Number'; return; }
  if (serial.length < 2) { els.editError.textContent = 'สั้นเกินไป – ขั้นต่ำ 2 ตัวอักษร'; return; }
  
  // Unique Check สำหรับหน้า Edit
  const isDuplicate = state.records.some(r => r.serial === serial && r.id !== editingId);
  if (isDuplicate) {
    els.editError.textContent = 'ข้อมูลซ้ำ! มี Serial นี้อยู่ในรายการแล้ว';
    return;
  }

  const model = els.editModelInput.value.trim();
  const rec = state.records.find(r => r.id === editingId);
  if (!rec) return;

  if (state.hasServer) {
    try {
      const updated = await apiCall('PUT', `/api/scans/${editingId}`, {
        serial,
        model,
        type: rec.type,
      });
      rec.serial = updated.serial;
      rec.model  = updated.model || '';
    } catch (err) {
      els.editError.textContent = 'Server error: ' + err.message;
      return;
    }
  } else {
    rec.serial = serial;
    rec.model  = model;
  }

  saveRecords();
  updateStats();
  renderRecords();
  closeEditModal();
  showToast('บันทึกเรียบร้อย', 'success');
}

// ── Hardware Scanner (External USB/Bluetooth) ───────────────────
let hwInputBuffer = '';
let hwInputTimer = null;
let lastGlobalScanned = '';
let lastGlobalScannedTs = 0;

window.addEventListener('keydown', (e) => {
  // ถ้าเคอร์เซอร์อยู่ในช่อง Input ให้ปล่อยเป็นหน้าที่ของ Event ในช่องนั้น (เช่น submitManual)
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    hwInputBuffer += e.key;
    clearTimeout(hwInputTimer);
    // ถ้ารับค่าช้ากว่าตั้งค่า ต่อตัวอักษร ถือว่าไม่ใช่เครื่องสแกนเนอร์
    hwInputTimer = setTimeout(() => {
      hwInputBuffer = ''; 
    }, state.config.hwGroupMs); 
  } else if (e.key === 'Enter' && hwInputBuffer.length >= 2) {
    e.preventDefault();
    const scannedVal = hwInputBuffer;
    hwInputBuffer = '';
    clearTimeout(hwInputTimer);

    // Buffer Check: ป้องกันการสแกนรัว (Double Scan)
    const now = Date.now();
    if (scannedVal === lastGlobalScanned && (now - lastGlobalScannedTs) < state.config.doubleScanMs) {
      showToast('ป้องกันสแกนซ้ำ (Double Scan)', 'error');
      return;
    }
    
    lastGlobalScanned = scannedVal;
    lastGlobalScannedTs = now;

    // เพิ่มข้อมูลจากเครื่องสแกนฮาร์ดแวร์
    addRecord(scannedVal, 'hw-scanner', '');
  }
});

// ── Event listeners ───────────────────────────────
els.btnToggle.addEventListener('click', () => {
  if (state.isScanning) stopCamera(); else startCamera();
});

els.btnFlip.addEventListener('click', flipCamera);
els.btnTorch.addEventListener('click', toggleTorch);
els.btnManual.addEventListener('click', openModal);
els.btnCapture.addEventListener('click', captureAndScan);
els.btnExport.addEventListener('click', exportCSV);
els.btnClearAll.addEventListener('click', () => {
  if (state.records.length === 0) { showToast('Nothing to clear', 'error'); return; }
  if (!confirm(`Delete all ${state.records.length} records?`)) return;
  state.records = [];
  saveRecords(); updateStats(); renderRecords();
  showToast('All records cleared');
});

els.searchInput.addEventListener('input', e => {
  state.filterText = e.target.value;
  renderRecords();
});

// Sticky Model Lock Event
els.btnLockModel.addEventListener('click', () => {
  const isLocked = !state.isModelLocked;
  const val = els.stickyModelInput.value.trim();
  
  if (isLocked && !val) {
    showToast('กรุณาระบุชื่อรุ่นก่อนล็อค', 'error');
    els.stickyModelInput.focus();
    return;
  }
  
  state.isModelLocked = isLocked;
  els.stickyModelInput.disabled = isLocked;
  els.btnLockModel.classList.toggle('locked', isLocked);
  
  if (isLocked) {
    els.btnLockModel.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>`;
    showToast('ล็อคชื่อรุ่นแล้ว (' + val + ')', 'success');
  } else {
    els.btnLockModel.innerHTML = `
      <svg class="icon-unlock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
      </svg>`;
    showToast('ปลดล็อคชื่อรุ่น', '');
    setTimeout(() => els.stickyModelInput.focus(), 100);
  }
});

els.btnCloseModal.addEventListener('click', closeModal);
els.btnCancelModal.addEventListener('click', closeModal);
els.btnSubmitManual.addEventListener('click', submitManual);
els.manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitManual(); });
els.modal.addEventListener('click', e => { if (e.target === els.modal) closeModal(); });

// Edit modal events
els.btnCloseEdit.addEventListener('click', closeEditModal);
els.btnCancelEdit.addEventListener('click', closeEditModal);
els.btnSubmitEdit.addEventListener('click', submitEdit);
els.editSerialInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitEdit(); });
els.editModal.addEventListener('click', e => { if (e.target === els.editModal) closeEditModal(); });

// Settings modal events
function openSettingsModal() {
  els.inputDelayDouble.value = state.config.doubleScanMs;
  els.inputDelayGroup.value = state.config.hwGroupMs;
  els.settingsModal.classList.add('open');
}

function closeSettingsModal() {
  els.settingsModal.classList.remove('open');
}

function saveSettings() {
  const doubleMs = parseInt(els.inputDelayDouble.value, 10);
  const groupMs = parseInt(els.inputDelayGroup.value, 10);
  
  if (!isNaN(doubleMs) && doubleMs >= 0) state.config.doubleScanMs = doubleMs;
  if (!isNaN(groupMs) && groupMs >= 0) state.config.hwGroupMs = groupMs;
  
  saveConfig();
  closeSettingsModal();
  showToast('บันทึกการตั้งค่าแล้ว', 'success');
}

els.btnSettings.addEventListener('click', openSettingsModal);
els.btnCloseSettings.addEventListener('click', closeSettingsModal);
els.btnCancelSettings.addEventListener('click', closeSettingsModal);
els.btnSaveSettings.addEventListener('click', saveSettings);
els.serverIndicator.addEventListener('click', () => {
  state.forceOffline = !state.forceOffline;
  localStorage.setItem('barscan_force_offline', JSON.stringify(state.forceOffline));
  
  if (state.forceOffline) {
    state.hasServer = false;
    setServerIndicator(false, true);
    showToast('โหมด Offline ถูกเปิดใช้งาน (บันทึกข้อมูลในเครื่องเท่านั้น)', 'info');
  } else {
    showToast('กำลังเชื่อมต่อเซิร์ฟเวอร์...', 'info');
    detectServer();
  }
});
els.settingsModal.addEventListener('click', e => { if (e.target === els.settingsModal) closeSettingsModal(); });

// ── Init ──────────────────────────────────────────
(async function init() {
  updateStats();
  renderRecords();
  // Check camera availability
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setIdleState('Camera Not Available', 'Your browser does not support camera access. Try Chrome on Android.');
    els.btnToggle.disabled = true;
    showToast('Camera API not supported in this browser', 'error');
  }
  // Detect server (non-blocking — UI จะ update เมื่อรู้ผล)
  setServerIndicator(false); // เริ่มต้นแสดง Offline ก่อน
  detectServer();
})();
