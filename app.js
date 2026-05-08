/* ───────────────────────────────────────────────
   BarScan – app.js
   Barcode scanner with ZXing + BarcodeDetector API
─────────────────────────────────────────────── */

// ── State ────────────────────────────────────────
const state = {
  records: JSON.parse(localStorage.getItem('barscan_records') || '[]'),
  config: JSON.parse(localStorage.getItem('barscan_config') || '{"doubleScanMs": 2000, "hwGroupMs": 500}'),
  sessionCount: 0,
  isScanning: false,
  stream: null,
  facingMode: 'environment',
  torchOn: false,
  codeReader: null,
  filterText: '',
  toastTimer: null,
  flashTimer: null,
  isModelLocked: false,
};

function saveConfig() {
  localStorage.setItem('barscan_config', JSON.stringify(state.config));
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
  scanLine: $('scan-line'),
  btnToggle: $('btn-toggle-camera'),
  btnLabel: $('btn-camera-label'),
  btnFlip: $('btn-flip-camera'),
  btnTorch: $('btn-torch'),
  btnManual: $('btn-manual'),
  btnExport: $('btn-export'),
  btnClearAll: $('btn-clear-all'),
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
function addRecord(serial, type = 'scanned', model = '') {
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

  const record = {
    id: Date.now() + Math.random(),
    serial: sTrim,
    model: finalModel,
    type,
    ts: new Date().toISOString(),
  };
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

// ── Delete record ─────────────────────────────────
function deleteRecord(id) {
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
async function startCamera() {
  try {
    if (state.stream) stopCamera();
    const constraints = {
      video: {
        facingMode: state.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    els.video.srcObject = state.stream;
    await els.video.play();
    state.isScanning = true;
    updateCameraUI(true);
    enableAuxControls();
    startDetection();
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
  stopDetection();
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
  } else {
    els.btnLabel.textContent = 'Start Camera';
    els.btnToggle.classList.remove('stop');
    els.overlay.classList.remove('active');
    els.idle.classList.remove('hidden');
    setIdleState('Camera Stopped', 'Tap the button below to start scanning');
    els.btnTorch.classList.remove('torch-on');
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
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
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

// ── Detection ─────────────────────────────────────
let detectionActive = false;
let lastScanned = '';
let lastScannedTs = 0;

function startDetection() {
  detectionActive = true;
  // Try native BarcodeDetector first
  if ('BarcodeDetector' in window) {
    runNativeDetection();
  } else if (window.ZXing) {
    runZxingDetection();
  } else {
    showToast('No barcode detection engine available', 'error');
  }
}

function stopDetection() {
  detectionActive = false;
  if (state.codeReader) {
    try { state.codeReader.reset(); } catch (_) {}
    state.codeReader = null;
  }
}

// Native BarcodeDetector (Chrome Android / Desktop)
async function runNativeDetection() {
  let detector;
  try {
    detector = new BarcodeDetector({
      formats: [
        'code_128','code_39','code_93','codabar',
        'ean_13','ean_8','upc_a','upc_e',
        'itf','aztec','data_matrix','pdf417','qr_code',
      ],
    });
  } catch {
    detector = new BarcodeDetector();
  }

  const tick = async () => {
    if (!detectionActive) return;
    if (els.video.readyState === els.video.HAVE_ENOUGH_DATA) {
      try {
        const barcodes = await detector.detect(els.video);
        if (barcodes.length > 0) {
          const code = barcodes[0];
          handleDetected(code.rawValue, code.format || 'barcode');
        }
      } catch (_) { /* ignore */ }
    }
    if (detectionActive) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ZXing fallback
function runZxingDetection() {
  try {
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
    state.codeReader.decodeFromVideoElement(els.video, (result, err) => {
      if (!detectionActive) return;
      if (result) handleDetected(result.getText(), result.getBarcodeFormat?.()?.toString() || 'barcode');
    });
  } catch (e) {
    console.error('ZXing error', e);
    showToast('Barcode engine failed to load', 'error');
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

function submitEdit() {
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
  rec.serial = serial;
  rec.model = model;
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
els.settingsModal.addEventListener('click', e => { if (e.target === els.settingsModal) closeSettingsModal(); });

// ── Init ──────────────────────────────────────────
(function init() {
  updateStats();
  renderRecords();
  // Check camera availability
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setIdleState('Camera Not Available', 'Your browser does not support camera access. Try Chrome on Android.');
    els.btnToggle.disabled = true;
    showToast('Camera API not supported in this browser', 'error');
  }
})();
