import { initDecoder } from './decoder.js';
import { readFrame, getScanRegion } from './detection.js';
import { buildVideoConstraints, createCameraController } from './camera.js';
import { parseLabelFields, safeHttpUrl, formatLabel, toCsv } from './core.js';
import { normalizeVolume, playScanBeep } from './sound.js';
import { createWorkspaceUI } from './ui.js';
import { historyKey, reconcileHistorySelection, selectVisibleHistory, partitionHistorySelection, paginateHistory } from './history.js';
import { createManualScanner } from './manual-scan.js';
import { normalizeScanShortcut, shortcutFromEvent, presetScanShortcut, matchesScanShortcut } from './scan-shortcuts.js';

const $ = (id) => document.getElementById(id);
// Keep the original storage namespace so the rename retains existing user data.
const HISTORY_KEY = 'scanlibre.history.v1';
const PREFS_KEY = 'scanlibre.preferences.v1';
const HISTORY_LIMIT = 500;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const ui = Object.fromEntries([
  'cameraSelect', 'formatSelect', 'startCamera', 'stopCamera', 'imageInput',
  'importImage', 'video', 'previewCanvas', 'overlayCanvas', 'viewport',
  'emptyState', 'scanStatus', 'engineStatus', 'resultText', 'detectedFormat',
  'resultTime', 'fieldCards', 'copyResult', 'openLink', 'autoCopy', 'copyMode',
  'beepEnabled', 'keepHistory', 'tryHarder', 'historyBody', 'emptyHistory',
  'historyCount', 'searchHistory', 'exportCsv', 'clearHistory', 'totalCount',
  'uniqueCount', 'toggleTheme', 'helpToggle', 'helpPanel', 'toast', 'appMessage',
  'cameraSettings', 'cameraSettingsStatus', 'cameraSettingsControls',
  'resetCameraSettings', 'cameraResolution', 'cameraFrameRate', 'cameraDetails',
  'detectionProfile', 'scanRegion', 'scanGuide', 'scanMetrics',
  'beepVolume', 'beepVolumeValue', 'testSound', 'uiScale',
  'motionPreference', 'densityPreference', 'resultPlaceholder', 'resultContent',
  'recentReads', 'emptyRecent', 'clearConfirm', 'confirmClearHistory', 'cancelClearHistory',
  'closeHelp', 'stopCameraLabel',
  'historySelection', 'selectAllHistory', 'selectAllHistoryLabel', 'selectionSummary',
  'clearSelection', 'copySelection', 'deleteSelection', 'deleteSelectionConfirm',
  'deleteSelectionTitle', 'deleteSelectionHint', 'cancelDeleteSelection', 'confirmDeleteSelection', 'historyTimezone',
  'scanMode', 'scanModeManual', 'scanModeAuto', 'manualScan', 'manualScanLabel', 'scannerHint',
  'torchToggle', 'torchLabel', 'scanGuideLabel', 'manualTimeout', 'scanShortcut',
  'shortcutLearn', 'shortcutTest', 'shortcutCancel', 'shortcutStatus',
  'historyPagePrevious', 'historyPageNext', 'historyPageStatus',
  'cameraControlPrev', 'cameraControlNext', 'cameraControlPage',
].map((id) => [id, $(id)]));

const state = {
  ready: false, starting: false, running: false, importing: false,
  stream: null, cameraToken: 0, imageToken: 0, timer: 0, toastTimer: 0,
  records: [], current: null, pendingDelete: null, seen: new Map(), visibleCodes: new Set(), audio: null,
  selectedHistory: new Set(), pendingDeleteBatch: null,
  storageWarned: false,
  cameraController: null, cameraApplying: false, scanAbort: null, imageAbort: null,
  detectionRevision: 0, scanCycle: 0, manualNotice: '', customShortcut: null,
  shortcutSession: null, shortcutTimer: 0, shortcutSelection: 'space', pressedKeys: new Set(),
  historyPage: 0, historyPageSize: 1, historyFitFrame: 0, cameraControlPage: 0,
};
const frameCanvas = document.createElement('canvas');
const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
let clipboardQueue = Promise.resolve();
let workspace;
let manualScanner;
let decoderQueue = Promise.resolve();
const historyCheckboxKeys = new WeakMap();
const historyDateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const historyClockFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });

function message(text = '', kind = 'info') {
  ui.appMessage.replaceChildren();
  ui.appMessage.textContent = text;
  ui.appMessage.hidden = !text;
  ui.appMessage.dataset.kind = kind;
  ui.appMessage.className = `app-message ${kind}`;
}

function toast(text) {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  ui.toast.classList.add('visible');
  state.toastTimer = setTimeout(() => {
    ui.toast.classList.remove('visible');
    ui.toast.hidden = true;
  }, 2800);
}

function status(text, kind = 'idle') {
  ui.scanStatus.textContent = text;
  ui.scanStatus.dataset.state = kind;
  ui.viewport.dataset.state = kind;
}

function setControls() {
  const focused = document.activeElement;
  const active = state.starting || state.running || state.importing;
  ui.startCamera.disabled = !state.ready || state.starting || state.running || state.importing;
  ui.stopCamera.disabled = !active;
  ui.startCamera.hidden = active;
  ui.stopCamera.hidden = !active;
  ui.stopCameraLabel.textContent = state.running ? 'Arrêter' : 'Annuler';
  const stopLabel = state.importing ? 'Annuler l’import d’images'
    : state.starting ? 'Annuler l’ouverture de la caméra' : 'Arrêter la caméra';
  ui.stopCamera.setAttribute('aria-label', stopLabel);
  ui.stopCamera.title = stopLabel;
  ui.importImage.disabled = !state.ready || state.importing || state.starting;
  ui.cameraSelect.disabled = state.starting || state.importing;
  ui.formatSelect.disabled = state.importing;
  ui.cameraResolution.disabled = state.starting || state.importing;
  ui.cameraFrameRate.disabled = state.starting || state.importing;
  ui.detectionProfile.disabled = state.importing;
  ui.tryHarder.disabled = state.importing;
  ui.scanRegion.disabled = state.importing;
  const manual = ui.scanMode.value !== 'auto';
  const reading = Boolean(manualScanner?.isBusy);
  document.documentElement.dataset.scanMode = manual ? 'manual' : 'auto';
  document.documentElement.dataset.scanState = state.running ? (manual && !reading ? 'aiming' : 'scanning') : 'idle';
  ui.scanModeManual.setAttribute('aria-pressed', String(manual));
  ui.scanModeAuto.setAttribute('aria-pressed', String(!manual));
  ui.scanMode.disabled = ui.scanModeManual.disabled = ui.scanModeAuto.disabled = state.starting || state.importing;
  ui.manualScan.hidden = !state.running || !manual;
  ui.manualScan.disabled = !state.running || !manual || reading || state.cameraApplying || ui.video.readyState < 2;
  ui.manualScan.setAttribute('aria-busy', String(reading));
  ui.manualScanLabel.textContent = reading ? 'Analyse…' : 'Scanner';
  ui.manualTimeout.disabled = reading;
  ui.scannerHint.textContent = state.importing ? 'Analyse des images…'
    : state.starting ? 'Ouverture de la caméra…'
      : !state.running ? (manual ? 'Active la caméra, puis vise un code.' : 'Active la caméra pour la lecture automatique.')
        : !manual ? 'Lecture automatique tant que la caméra est active.'
          : reading ? 'Recherche d’un code dans le cadre…'
            : state.manualNotice || 'Un appui lit un seul code dans le cadre.';
  renderTorchButton();
  for (const button of document.querySelectorAll('[data-action]')) {
    const control = { 'start-camera': ui.startCamera, 'stop-camera': ui.stopCamera, 'import-image': ui.importImage }[button.dataset.action];
    if (control) button.disabled = control.disabled;
  }
  workspace?.setActivity({ running: state.running, starting: state.starting, importing: state.importing });
  const nextFocus = focused === ui.startCamera && active ? (state.running && manual ? ui.manualScan : ui.stopCamera)
    : focused === ui.stopCamera && !active ? ui.startCamera : null;
  if (nextFocus && !nextFocus.disabled && nextFocus.getClientRects().length) nextFocus.focus({ preventScroll: true });
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    if (!state.storageWarned) {
      state.storageWarned = true;
      message('Le navigateur ne permet pas de mémoriser les données ici. L’historique reste disponible pendant cette session ; exporte-le en CSV pour le conserver.', 'warning');
    }
    return false;
  }
}

function savePreferences() {
  storageSet(PREFS_KEY, JSON.stringify({
    theme: document.documentElement.dataset.theme,
    mode: ui.formatSelect.value,
    autoCopy: ui.autoCopy.checked,
    copyMode: ui.copyMode?.value || 'raw',
    beep: ui.beepEnabled.checked,
    keepHistory: ui.keepHistory.checked,
    tryHarder: ui.tryHarder.checked,
    volume: normalizeVolume(ui.beepVolume.value),
    resolution: ui.cameraResolution.value,
    frameRate: ui.cameraFrameRate.value,
    detectionProfile: ui.detectionProfile.value,
    scanRegion: ui.scanRegion.value,
    uiScale: ui.uiScale.value,
    motion: ui.motionPreference.value,
    density: ui.densityPreference.value,
    scanMode: ui.scanMode.value,
    manualTimeout: Number(ui.manualTimeout.value),
    scanShortcut: ui.scanShortcut.value,
    customShortcut: state.customShortcut,
  }));
}

function persistHistory() {
  if (ui.keepHistory.checked) {
    if (!storageSet(HISTORY_KEY, JSON.stringify(state.records))) {
      ui.keepHistory.checked = false;
      if (!storageSet(HISTORY_KEY, null)) {
        message('Le navigateur ne permet ni de conserver ni d’effacer l’ancienne copie de l’historique. Ferme ScanCam et efface les données de ce fichier dans le navigateur si tu souhaites la supprimer.', 'warning');
      }
      savePreferences();
    }
  } else {
    if (!storageSet(HISTORY_KEY, null)) {
      message('L’historique est limité à cette session, mais le navigateur n’a pas permis d’effacer une éventuelle ancienne copie enregistrée. Utilise les réglages de données du navigateur pour la supprimer.', 'warning');
    }
  }
}

function loadPreferences() {
  try {
    const prefs = JSON.parse(storageGet(PREFS_KEY) || '{}');
    document.documentElement.dataset.theme = prefs.theme === 'light' ? 'light' : 'dark';
    if (['all', 'DataMatrix', 'QRCode', 'linear'].includes(prefs.mode)) ui.formatSelect.value = prefs.mode;
    ui.autoCopy.checked = prefs.autoCopy === true;
    if (ui.copyMode && ['raw', 'serial', 'product'].includes(prefs.copyMode)) ui.copyMode.value = prefs.copyMode;
    ui.beepEnabled.checked = prefs.beep !== false;
    ui.keepHistory.checked = prefs.keepHistory === true;
    ui.tryHarder.checked = prefs.tryHarder !== false;
    ui.beepVolume.value = normalizeVolume(prefs.volume);
    if (['auto', 'hd', 'fullhd', 'uhd'].includes(prefs.resolution)) ui.cameraResolution.value = prefs.resolution;
    if (['15', '30'].includes(String(prefs.frameRate))) ui.cameraFrameRate.value = String(prefs.frameRate);
    if (['fast', 'balanced', 'precision'].includes(prefs.detectionProfile)) ui.detectionProfile.value = prefs.detectionProfile;
    if (['full', 'center'].includes(prefs.scanRegion)) ui.scanRegion.value = prefs.scanRegion;
    if (['100', '125', '150', '200'].includes(String(prefs.uiScale))) ui.uiScale.value = String(prefs.uiScale);
    if (['auto', 'full', 'reduced'].includes(prefs.motion)) ui.motionPreference.value = prefs.motion;
    if (['comfortable', 'compact'].includes(prefs.density)) ui.densityPreference.value = prefs.density;
    ui.scanMode.value = prefs.scanMode === 'auto' ? 'auto' : 'manual';
    if ([1500, 3000, 5000].includes(Number(prefs.manualTimeout))) ui.manualTimeout.value = String(prefs.manualTimeout);
    state.customShortcut = normalizeScanShortcut(prefs.customShortcut);
    if (['none', 'space', 'enter', 'custom'].includes(prefs.scanShortcut)) ui.scanShortcut.value = prefs.scanShortcut;
    if (ui.scanShortcut.value === 'custom' && !state.customShortcut) ui.scanShortcut.value = 'none';
    if (ui.keepHistory.checked) {
      const records = JSON.parse(storageGet(HISTORY_KEY) || '[]');
      if (Array.isArray(records)) {
        const keys = new Set();
        state.records = records.filter((record) => {
          if (!record || typeof record.text !== 'string' || record.text.length > 100000 ||
              typeof record.format !== 'string' || record.format.length > 100 ||
              typeof record.timestamp !== 'string' || !Number.isFinite(Date.parse(record.timestamp))) return false;
          const key = `${record.format}\0${record.text}`;
          if (keys.has(key)) return false;
          keys.add(key);
          return true;
        }).slice(0, HISTORY_LIMIT).map((record) => ({
          text: record.text, format: record.format, timestamp: record.timestamp,
          count: Number.isSafeInteger(record.count) && record.count > 0 ? Math.min(record.count, 1000000) : 1,
        }));
      }
    } else {
      storageSet(HISTORY_KEY, null);
    }
  } catch {
    state.records = [];
  }
  updateThemeLabel();
  updateVolumeLabel();
  updateUiScale();
}

function updateThemeLabel() {
  const light = document.documentElement.dataset.theme === 'light';
  ui.toggleTheme.setAttribute('aria-label', light ? 'Passer au thème sombre' : 'Passer au thème clair');
  ui.toggleTheme.setAttribute('aria-pressed', String(light));
  ui.toggleTheme.title = light ? 'Thème sombre' : 'Thème clair';
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (light ? '#f4f6fb' : '#101523');
}

function displayTime(iso) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));
}

function selectedCopyText(record) {
  const fields = parseLabelFields(record.text);
  const mode = ui.copyMode?.value || 'raw';
  return fields && mode !== 'raw' ? fields[mode] || record.text : record.text;
}

function copyText(text, quiet = false) {
  const operation = clipboardQueue.then(() => performCopy(text, quiet));
  clipboardQueue = operation.catch(() => false);
  return operation;
}

async function performCopy(text, quiet = false) {
  if (quiet && !ui.autoCopy.checked) return false;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
    await navigator.clipboard.writeText(text);
  } catch {
    const previous = document.activeElement;
    const temporary = document.createElement('textarea');
    temporary.value = text;
    temporary.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0';
    temporary.setAttribute('aria-hidden', 'true');
    document.body.append(temporary);
    temporary.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Show manual fallback. */ }
    temporary.remove();
    previous?.focus({ preventScroll: true });
    if (!copied) {
      if (quiet) {
        ui.autoCopy.checked = false;
        savePreferences();
        message('Le navigateur a refusé la copie automatique ; elle a été désactivée. Utilise le bouton Copier pour récupérer le résultat.', 'warning');
        return false;
      }
      message('Le navigateur a refusé la copie. Le contenu demandé est sélectionné ci-dessous : utilise Ctrl+C.', 'warning');
      const fallback = document.createElement('textarea');
      fallback.className = 'copy-fallback';
      fallback.value = text;
      fallback.readOnly = true;
      fallback.setAttribute('aria-label', 'Contenu à copier manuellement');
      ui.appMessage.append(fallback);
      fallback.focus();
      fallback.select();
      return false;
    }
  }
  if (!quiet) toast('Copié dans le presse-papiers');
  return true;
}

async function prepareSound(force = false) {
  if (!force && !ui.beepEnabled.checked) return false;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    state.audio ??= new Audio();
    if (state.audio.state === 'suspended') await state.audio.resume();
    return state.audio.state === 'running';
  } catch { return false; }
}

function beep(force = false) {
  if (!force && !ui.beepEnabled.checked) return false;
  try {
    return playScanBeep(state.audio, ui.beepVolume.value);
  } catch { return false; }
}

function updateVolumeLabel() {
  const volume = normalizeVolume(ui.beepVolume.value);
  ui.beepVolumeValue.textContent = `${volume} %`;
  ui.beepVolume.setAttribute('aria-valuetext', volume ? `${volume} pour cent` : 'Muet');
  ui.beepVolume.style.setProperty('--range-progress', `${volume}%`);
}

function updateUiScale() {
  document.documentElement.style.setProperty('--ui-scale', String(Number(ui.uiScale.value) / 100));
  document.documentElement.dataset.scale = ui.uiScale.value;
  requestAnimationFrame(updateScanGuide);
}

function showResult(record) {
  state.current = record;
  ui.resultPlaceholder.hidden = true;
  ui.resultContent.hidden = false;
  ui.resultText.value = record.text;
  ui.detectedFormat.textContent = formatLabel(record.format);
  ui.resultTime.textContent = displayTime(record.timestamp);
  ui.copyResult.disabled = false;
  ui.fieldCards.replaceChildren();
  const fields = parseLabelFields(record.text);
  if (fields) {
    for (const [key, label] of [['serial', 'Numéro de série'], ['product', 'Référence produit']]) {
      if (!fields[key]) continue;
      const card = document.createElement('div');
      card.className = 'field-card';
      const title = document.createElement('span');
      title.className = 'field-label';
      title.textContent = label;
      const value = document.createElement('span');
      value.className = 'field-value';
      value.textContent = fields[key];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'field-copy';
      button.textContent = 'Copier';
      button.setAttribute('aria-label', `Copier : ${label}`);
      button.addEventListener('click', () => copyText(fields[key]));
      card.append(title, value, button);
      ui.fieldCards.append(card);
    }
  }
  const url = safeHttpUrl(record.text);
  ui.openLink.hidden = !url;
  if (url) ui.openLink.title = url;
  else ui.openLink.removeAttribute('title');
}

function revealResult(record) {
  showResult(record);
  workspace.notifyResult(record, { announce: false });
  workspace.navigate('result');
}

function renderRecentReads() {
  const fragment = document.createDocumentFragment();
  for (const record of state.records.slice(0, 3)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-read';
    const copy = document.createElement('span');
    copy.className = 'recent-read-copy';
    const format = document.createElement('span');
    format.className = 'recent-read-format';
    format.textContent = formatLabel(record.format);
    const value = document.createElement('span');
    value.className = 'recent-read-text';
    value.textContent = record.text;
    const time = document.createElement('span');
    time.className = 'recent-read-time';
    time.textContent = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.timestamp));
    copy.append(format, value);
    button.append(copy, time);
    button.title = record.text;
    button.addEventListener('click', () => revealResult(record));
    fragment.append(button);
  }
  ui.recentReads.replaceChildren(fragment);
  ui.emptyRecent.hidden = state.records.length > 0;
}

function filteredHistory() {
  const needle = ui.searchHistory.value.trim().toLocaleLowerCase('fr');
  return !needle ? state.records : state.records.filter((record) =>
    `${record.text} ${formatLabel(record.format)}`.toLocaleLowerCase('fr').includes(needle));
}

function currentHistoryPage() {
  return paginateHistory(filteredHistory(), state.historyPage, state.historyPageSize);
}

function scheduleHistoryFit() {
  cancelAnimationFrame(state.historyFitFrame);
  state.historyFitFrame = requestAnimationFrame(() => {
    if (workspace?.screen !== 'history') return;
    const wrapper = ui.historyBody.closest('.history-table-wrap');
    const row = ui.historyBody.querySelector('tr');
    if (!wrapper || !row || wrapper.clientHeight < 1) return;
    const css = getComputedStyle(wrapper);
    const rowHeight = parseFloat(css.getPropertyValue('--history-row-height')) || row.getBoundingClientRect().height;
    const gap = parseFloat(css.getPropertyValue('--history-row-gap')) || 0;
    const head = wrapper.querySelector('thead');
    const headerHeight = head && getComputedStyle(head).position !== 'absolute' ? head.getBoundingClientRect().height : 0;
    const capacity = Math.max(1, Math.min(100, Math.floor((wrapper.clientHeight - headerHeight + gap) / (rowHeight + gap))));
    if (capacity !== state.historyPageSize) {
      const first = state.historyPage * state.historyPageSize;
      state.historyPageSize = capacity;
      state.historyPage = Math.floor(first / capacity);
      renderHistory();
    }
  });
}

function changeHistoryPage(delta) {
  state.pendingDelete = state.pendingDeleteBatch = null;
  ui.clearConfirm.hidden = true;
  ui.clearHistory.setAttribute('aria-expanded', 'false');
  state.historyPage = Math.max(0, state.historyPage + delta);
  renderHistory();
}

function sameCode(left, right) {
  return !!left && !!right && left.format === right.format && left.text === right.text;
}

function focusHistoryAction(index) {
  const buttons = ui.historyBody.querySelectorAll('[data-delete-scan]');
  const target = index >= 0 && buttons.length
    ? buttons[Math.min(index, buttons.length - 1)] : ui.searchHistory;
  target.focus({ preventScroll: true });
}

function cancelDeleteScan() {
  const index = currentHistoryPage().rows.findIndex((record) => sameCode(record, state.pendingDelete));
  state.pendingDelete = null;
  renderHistory();
  focusHistoryAction(index);
}

function removeHistoryRecords(keys) {
  const { kept, removed } = partitionHistorySelection(state.records, keys);
  state.records = kept;
  for (const record of removed) {
    const key = `${record.format}\0${record.text}`;
    state.seen.delete(key);
    state.visibleCodes.delete(key);
  }
  if (removed.some((record) => sameCode(record, state.current))) resetResult();
  if (removed.length) persistHistory();
  renderHistory();
  return removed.length;
}

function deleteScan() {
  const target = state.pendingDelete;
  const visibleIndex = currentHistoryPage().rows.findIndex((record) => sameCode(record, target));
  const index = state.records.findIndex((record) => sameCode(record, target));
  state.pendingDelete = null;
  if (index < 0) {
    renderHistory();
    focusHistoryAction(visibleIndex);
    return;
  }
  removeHistoryRecords(new Set([historyKey(target)]));
  focusHistoryAction(visibleIndex);
  toast('Scan supprimé');
}

function cancelDeleteSelection(restoreFocus = true) {
  state.pendingDeleteBatch = null;
  renderHistory();
  if (restoreFocus) (ui.deleteSelection.disabled ? ui.searchHistory : ui.deleteSelection).focus({ preventScroll: true });
}

function deleteSelectedScans() {
  const keys = state.pendingDeleteBatch;
  if (!keys?.size) return;
  state.pendingDeleteBatch = null;
  const removed = removeHistoryRecords(keys);
  ui.searchHistory.focus({ preventScroll: true });
  if (removed) toast(`${removed} scan${removed > 1 ? 's supprimés' : ' supprimé'}`);
}

function updateHistorySelection(visible, displayed = visible) {
  state.selectedHistory = reconcileHistorySelection(state.records, state.selectedHistory);
  const selectedCount = state.selectedHistory.size;
  const visibleSelected = visible.filter((record) => state.selectedHistory.has(historyKey(record))).length;
  const hiddenCount = selectedCount - displayed.filter((record) => state.selectedHistory.has(historyKey(record))).length;
  ui.historySelection.hidden = state.records.length === 0;
  ui.selectAllHistory.disabled = visible.length === 0;
  ui.selectAllHistory.checked = visible.length > 0 && visibleSelected === visible.length;
  ui.selectAllHistory.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
  ui.selectAllHistoryLabel.textContent = ui.searchHistory.value.trim() ? 'Sélectionner les résultats' : 'Tout sélectionner';
  ui.selectionSummary.textContent = selectedCount
    ? `${selectedCount} sélectionné${selectedCount > 1 ? 's' : ''}${hiddenCount ? ` · ${hiddenCount} non affiché${hiddenCount > 1 ? 's' : ''}` : ''}`
    : 'Aucune sélection';
  ui.clearSelection.hidden = selectedCount === 0;
  ui.copySelection.disabled = ui.deleteSelection.disabled = selectedCount === 0;
  ui.exportCsv.querySelector('span').textContent = selectedCount ? 'Exporter la sélection' : 'Exporter CSV';
  ui.exportCsv.setAttribute('aria-label', selectedCount
    ? `Exporter ${selectedCount === 1 ? 'le scan sélectionné' : `les ${selectedCount} scans sélectionnés`} en CSV` : 'Exporter tout l’historique en CSV');
  ui.historyTimezone.textContent = historyClockFormat.resolvedOptions().timeZone;
  if (state.pendingDeleteBatch) {
    state.pendingDeleteBatch = reconcileHistorySelection(state.records, state.pendingDeleteBatch);
    if (!state.pendingDeleteBatch.size) state.pendingDeleteBatch = null;
  }
  const deleting = state.pendingDeleteBatch?.size || 0;
  ui.deleteSelectionConfirm.hidden = !deleting;
  ui.deleteSelection.setAttribute('aria-expanded', String(!!deleting));
  if (deleting) {
    ui.deleteSelectionTitle.textContent = `Supprimer ${deleting} scan${deleting > 1 ? 's sélectionnés' : ' sélectionné'} ?`;
    const hiddenDeleting = deleting - displayed.filter((record) => state.pendingDeleteBatch.has(historyKey(record))).length;
    ui.deleteSelectionHint.textContent = hiddenDeleting
      ? `${hiddenDeleting} ${hiddenDeleting === 1 ? 'de ces scans n’est pas affiché' : 'de ces scans ne sont pas affichés'} sur cette page.` : 'Seules les lignes sélectionnées seront supprimées.';
  }
}

function renderHistory() {
  const focusedSelection = historyCheckboxKeys.get(document.activeElement);
  const focusedConfirmation = ['cancelDeleteScan', 'confirmDeleteScan'].includes(document.activeElement?.id)
    ? document.activeElement.id : null;
  if (state.pendingDelete && !state.records.some((record) => sameCode(record, state.pendingDelete))) {
    state.pendingDelete = null;
  }
  const visible = filteredHistory();
  const page = paginateHistory(visible, state.historyPage, state.historyPageSize);
  state.historyPage = page.page;
  ui.historyPagePrevious.disabled = page.page === 0;
  ui.historyPageNext.disabled = page.page >= page.pageCount - 1;
  ui.historyPageStatus.textContent = `${page.page + 1} / ${page.pageCount}`;
  ui.historyPageStatus.setAttribute('aria-label', `Page ${page.page + 1} sur ${page.pageCount} · ${page.total ? page.start + 1 : 0} à ${page.end} sur ${page.total} codes`);
  updateHistorySelection(visible, page.rows);
  const fragment = document.createDocumentFragment();
  for (const record of page.rows) {
    const row = document.createElement('tr');
    const key = historyKey(record);
    row.classList.toggle('is-selected', state.selectedHistory.has(key));
    const selection = document.createElement('td');
    selection.className = 'history-select-cell';
    const selectionControl = document.createElement('label');
    selectionControl.className = 'history-select-control';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'history-select';
    checkbox.checked = state.selectedHistory.has(key);
    checkbox.setAttribute('aria-label', `Sélectionner : ${formatLabel(record.format)}, ${record.text.slice(0, 80)}`);
    historyCheckboxKeys.set(checkbox, key);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedHistory.add(key);
      else state.selectedHistory.delete(key);
      state.pendingDelete = state.pendingDeleteBatch = null;
      renderHistory();
    });
    selectionControl.append(checkbox);
    selection.append(selectionControl);
    const time = document.createElement('td');
    time.className = 'history-time';
    time.dataset.label = 'Date';
    const timestamp = document.createElement('time');
    const date = new Date(record.timestamp);
    timestamp.dateTime = record.timestamp;
    timestamp.title = `${displayTime(record.timestamp)} · ${historyClockFormat.resolvedOptions().timeZone}\n${record.timestamp}`;
    const day = document.createElement('span');
    day.className = 'history-date';
    day.textContent = historyDateFormat.format(date);
    const clock = document.createElement('span');
    clock.className = 'history-clock';
    clock.textContent = historyClockFormat.format(date);
    timestamp.append(day, document.createTextNode(' '), clock);
    time.append(timestamp);
    const format = document.createElement('td');
    format.className = 'history-format';
    format.dataset.label = 'Format';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = formatLabel(record.format);
    format.append(badge);
    const value = document.createElement('td');
    value.className = 'history-value';
    value.dataset.label = 'Contenu';
    value.textContent = record.text;
    value.title = record.text;
    const actions = document.createElement('td');
    actions.className = 'history-row-actions';
    if (sameCode(record, state.pendingDelete)) {
      row.classList.add('is-delete-pending');
      const confirmation = document.createElement('div');
      confirmation.className = 'history-delete-confirm';
      confirmation.setAttribute('role', 'group');
      confirmation.setAttribute('aria-label', 'Supprimer ce scan ?');
      const label = document.createElement('span');
      label.textContent = 'Supprimer ce scan ?';
      const buttons = document.createElement('div');
      buttons.className = 'history-delete-actions';
      for (const [id, text, action] of [
        ['cancelDeleteScan', 'Annuler', cancelDeleteScan],
        ['confirmDeleteScan', 'Supprimer', deleteScan],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = `table-action${id === 'confirmDeleteScan' ? ' table-action-danger' : ''}`;
        button.textContent = text;
        button.addEventListener('click', action);
        buttons.append(button);
      }
      confirmation.append(label, buttons);
      actions.append(confirmation);
    } else {
      for (const [label, action] of [
        ['Afficher', () => revealResult(record)],
        ['Copier', () => copyText(selectedCopyText(record))],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'table-action';
        button.textContent = label;
        button.addEventListener('click', action);
        actions.append(button);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'table-action table-action-danger';
      remove.dataset.deleteScan = '';
      remove.title = 'Supprimer ce scan';
      remove.setAttribute('aria-label', 'Supprimer ce scan');
      remove.append(ui.clearHistory.querySelector('svg').cloneNode(true));
      remove.addEventListener('click', () => {
        state.pendingDeleteBatch = null;
        state.pendingDelete = record;
        ui.clearConfirm.hidden = true;
        ui.clearHistory.setAttribute('aria-expanded', 'false');
        renderHistory();
        $('cancelDeleteScan')?.focus({ preventScroll: true });
        $('cancelDeleteScan')?.closest('.history-delete-confirm').scrollIntoView({ block: 'nearest', behavior: 'instant' });
      });
      actions.append(remove);
    }
    row.append(selection, time, format, value, actions);
    fragment.append(row);
  }
  ui.historyBody.replaceChildren(fragment);
  ui.emptyHistory.hidden = visible.length > 0;
  ui.emptyHistory.textContent = state.records.length ? 'Aucun résultat pour cette recherche.' : 'Les codes lus apparaîtront ici.';
  ui.historyCount.textContent = String(state.records.length);
  ui.uniqueCount.textContent = String(state.records.length);
  const total = state.records.reduce((sum, record) => sum + record.count, 0);
  ui.totalCount.textContent = String(total);
  ui.exportCsv.disabled = state.records.length === 0;
  ui.clearHistory.disabled = state.records.length === 0;
  workspace?.syncHistory({ total, unique: state.records.length });
  renderRecentReads();
  scheduleHistoryFit();
  if (focusedConfirmation) ($(focusedConfirmation) || ui.searchHistory).focus({ preventScroll: true });
  if (focusedSelection) {
    const control = [...ui.historyBody.querySelectorAll('.history-select')].find((checkbox) => historyCheckboxKeys.get(checkbox) === focusedSelection);
    (control || ui.searchHistory).focus({ preventScroll: true });
  }
}

function acceptResult(result, source = 'image') {
  if (typeof result.text !== 'string') return;
  const format = result.symbology || result.format || 'Inconnu';
  const key = `${format}\0${result.text}`;
  const now = Date.now();
  if (source === 'camera') {
    const lastSeen = state.seen.get(key);
    state.seen.set(key, now);
    if (lastSeen !== undefined && (state.visibleCodes.has(key) || now - lastSeen < 1800)) return;
    if (state.seen.size > 1000) {
      for (const [oldKey, seenAt] of state.seen) if (now - seenAt > 60000) state.seen.delete(oldKey);
    }
  }
  const index = state.records.findIndex((record) => record.format === format && record.text === result.text);
  const existing = index >= 0 ? state.records.splice(index, 1)[0] : null;
  const record = { text: result.text, format, timestamp: new Date().toISOString(), count: (existing?.count || 0) + 1 };
  state.historyPage = 0;
  state.records.unshift(record);
  state.records.length = Math.min(state.records.length, HISTORY_LIMIT);
  showResult(record);
  workspace.notifyResult({ ...record, format: formatLabel(format) });
  renderHistory();
  persistHistory();
  beep();
  if (ui.autoCopy.checked) void copyText(selectedCopyText(record), true);
}

function drawBoxes(results, width, height) {
  const canvas = ui.overlayCanvas;
  canvas.width = width;
  canvas.height = height;
  canvas.hidden = !results.length;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#56e6b5';
  context.fillStyle = 'rgba(64, 216, 159, .12)';
  context.lineWidth = Math.max(3, width / 280);
  for (const result of results) {
    const position = result.position;
    if (!position) continue;
    const points = [position.topLeft, position.topRight, position.bottomRight, position.bottomLeft];
    if (points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
    context.beginPath();
    points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.closePath();
    context.fill();
    context.stroke();
  }
}

function updateScanGuide() {
  const width = ui.video.videoWidth;
  const height = ui.video.videoHeight;
  const manual = ui.scanMode.value !== 'auto';
  ui.scanGuide.hidden = !state.running || (!manual && ui.scanRegion.value !== 'center') || !width || !height;
  ui.scanGuideLabel.textContent = manual ? 'Code à viser' : 'Zone de recherche';
  if (ui.scanGuide.hidden) return;
  // The camera may expose more pixels than the analysis budget (e.g. 8K).
  // Compute the same crop on the bounded analysis frame, then map it to video.
  const frame = cameraFrameSize(width, height);
  const crop = getScanRegion(frame.width, frame.height, 'center');
  const region = { x: crop.x * width / frame.width, y: crop.y * height / frame.height,
    width: crop.width * width / frame.width, height: crop.height * height / frame.height };
  const scale = Math.min(ui.viewport.clientWidth / width, ui.viewport.clientHeight / height);
  const left = (ui.viewport.clientWidth - width * scale) / 2;
  const top = (ui.viewport.clientHeight - height * scale) / 2;
  Object.assign(ui.scanGuide.style, {
    left: `${left + region.x * scale}px`, top: `${top + region.y * scale}px`,
    width: `${region.width * scale}px`, height: `${region.height * scale}px`,
  });
}

function cameraFrameSize(width, height) {
  const limit = { fast: 1280, balanced: 1920, precision: 2560 }[ui.detectionProfile.value] || 1920;
  const scale = Math.min(1, limit / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function isScannerSurface() {
  return workspace?.screen === 'scanner' || (workspace?.screen === 'result' && !workspace.isMobile);
}

// One decoder pipeline for camera and imported images. An aborted older request
// must settle before the next one enters the shared WASM reader.
function decodeImage(image, options) {
  const pending = decoderQueue.then(() => {
    if (options.signal?.aborted) throw new DOMException('Lecture interrompue.', 'AbortError');
    return readFrame(image, options);
  });
  decoderQueue = pending.catch(() => {});
  return pending;
}

function cancelCameraReading() {
  state.scanCycle += 1;
  clearTimeout(state.timer);
  state.scanAbort?.abort();
  state.scanAbort = null;
  manualScanner?.cancel();
}

function beginCameraReading() {
  cancelCameraReading();
  state.manualNotice = '';
  ui.overlayCanvas.hidden = true;
  if (!state.running) { setControls(); return; }
  if (ui.scanMode.value === 'auto') {
    state.scanAbort = new AbortController();
    status('Recherche d’un code…', 'scanning');
    void scanFrame(state.cameraToken, state.scanCycle);
  } else {
    status('Visée manuelle', 'aiming');
  }
  updateScanGuide();
  setControls();
  if (ui.scanMode.value !== 'auto' && isScannerSurface() &&
      [ui.startCamera, ui.stopCamera, ui.scanModeManual, ui.scanModeAuto].includes(document.activeElement) && !ui.manualScan.disabled) {
    ui.manualScan.focus({ preventScroll: true });
  }
}

function changeScanMode(value) {
  ui.scanMode.value = value === 'auto' ? 'auto' : 'manual';
  state.detectionRevision += 1;
  state.seen.clear();
  state.visibleCodes.clear();
  beginCameraReading();
  savePreferences();
}

function captureManualFrame() {
  if (!state.running || ui.scanMode.value === 'auto' || !isScannerSurface() ||
      document.hidden || ui.video.readyState < 2 || !ui.video.videoWidth) return null;
  const size = cameraFrameSize(ui.video.videoWidth, ui.video.videoHeight);
  frameCanvas.width = size.width;
  frameCanvas.height = size.height;
  frameContext.drawImage(ui.video, 0, 0, size.width, size.height);
  return {
    image: frameContext.getImageData(0, 0, size.width, size.height),
    ...size, region: getScanRegion(size.width, size.height, 'center'),
    cameraToken: state.cameraToken, revision: state.detectionRevision,
    mode: ui.formatSelect.value, profile: ui.detectionProfile.value, tryHarder: ui.tryHarder.checked,
  };
}

function manualStateChanged(event) {
  if (state.running && ui.scanMode.value !== 'auto' && isScannerSurface()) {
    if (event.status === 'scanning') {
      state.manualNotice = '';
      ui.overlayCanvas.hidden = true;
      status('Lecture en cours…', 'scanning');
    } else if (event.status === 'success') {
      state.manualNotice = 'Code lu. Prêt pour le prochain appui.';
      status('Code lu', 'success');
    } else if (event.status === 'not-found') {
      state.manualNotice = 'Aucun code lu. Ajuste la visée puis réessaie.';
      status('Aucun code dans le cadre', 'warning');
    } else if (event.status === 'error') {
      state.manualNotice = 'Lecture interrompue. Tu peux réessayer.';
      status('Lecture interrompue', 'warning');
      message('La lecture ponctuelle n’a pas abouti. Ajuste la visée puis réessaie, ou importe une image.', 'warning');
    } else if (event.status === 'cancelled') {
      state.manualNotice = '';
      status('Visée manuelle', 'aiming');
    }
  }
  setControls();
}

function triggerManualScan() {
  if (!state.ready || !state.running || state.cameraApplying || manualScanner.isBusy ||
      state.importing || document.hidden || !isScannerSurface() ||
      ui.scanMode.value === 'auto' || ui.video.readyState < 2 || !ui.helpPanel.hidden) return false;
  message();
  prepareSound();
  void manualScanner.trigger({ timeoutMs: Number(ui.manualTimeout.value) });
  return true;
}

function renderTorchButton(description = state.cameraController?.describe()) {
  const control = description?.active && description.controls.find((entry) => entry.key === 'torch');
  const on = control?.value === true;
  const available = Boolean(control && !control.disabled);
  ui.torchToggle.disabled = !available || state.cameraApplying || Boolean(manualScanner?.isBusy);
  ui.torchToggle.setAttribute('aria-pressed', String(on));
  ui.torchLabel.textContent = on ? 'Allumée' : 'Lampe';
  const label = !description?.active ? 'Active la caméra pour utiliser la lampe'
    : !available ? 'Lampe indisponible pour cette caméra ou ce navigateur'
      : on ? 'Éteindre la lampe' : 'Allumer la lampe';
  ui.torchToggle.title = label;
  ui.torchToggle.setAttribute('aria-label', label);
}

function currentShortcut() {
  return presetScanShortcut(ui.scanShortcut.value, state.customShortcut);
}

function updateShortcutControls(text) {
  const binding = currentShortcut();
  if (ui.scanShortcut.value !== 'custom' || state.customShortcut) state.shortcutSelection = ui.scanShortcut.value;
  const customOption = ui.scanShortcut.querySelector('option[value="custom"]');
  customOption.textContent = state.customShortcut ? `Touche associée : ${state.customShortcut.label}` : 'Touche associée';
  ui.shortcutCancel.hidden = !state.shortcutSession;
  ui.shortcutTest.disabled = !binding || Boolean(state.shortcutSession);
  ui.scanShortcut.disabled = Boolean(state.shortcutSession);
  ui.shortcutLearn.setAttribute('aria-pressed', String(state.shortcutSession === 'learn'));
  ui.shortcutLearn.textContent = state.shortcutSession === 'learn' ? 'En attente d’un bouton…' : 'Associer un bouton';
  if (text !== undefined) ui.shortcutStatus.textContent = text;
  else ui.shortcutStatus.textContent = binding ? `Bouton configuré : ${binding.label}. Utilisable dans Scanner, caméra active, en mode manuel.` : 'Déclenchement avec le bouton Scanner à l’écran.';
  ui.manualScan.title = binding ? `Scanner · ${binding.label}` : 'Scanner le code visé';
}

function stopShortcutSession(text) {
  clearTimeout(state.shortcutTimer);
  state.shortcutSession = null;
  state.pressedKeys.clear();
  updateShortcutControls(text);
}

function startShortcutSession(kind) {
  if (kind === 'test' && !currentShortcut()) return;
  stopShortcutSession();
  state.shortcutSession = kind;
  updateShortcutControls(kind === 'learn' ? 'Appuie sur le bouton à associer. Échap pour annuler.'
    : `Appuie sur ${currentShortcut().label} pour vérifier sa réception. Aucun scan ne sera enregistré.`);
  (kind === 'learn' ? ui.shortcutLearn : ui.shortcutTest).focus({ preventScroll: true });
  state.shortcutTimer = setTimeout(() => stopShortcutSession('Aucune touche compatible reçue. Ce bouton n’est peut-être pas transmis par le navigateur ; essaie une touche de clavier.'), 8000);
}

function handleScanShortcut(event) {
  if (event.defaultPrevented || event.isComposing) return false;
  const target = event.target;
  const key = event.code || event.key;
  const manualButton = target?.closest?.('#manualScan');
  const buttonKey = ['Enter', ' ', 'Spacebar'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  // Consume native Enter/Space as well as configured keys. Holding Enter on a
  // focused button must never generate repeated click-driven scans.
  if (manualButton && buttonKey) {
    if (event.repeat || state.pressedKeys.has(key) || manualScanner.isBusy) {
      event.preventDefault(); state.pressedKeys.add(key); return true;
    }
    if (triggerManualScan()) {
      event.preventDefault(); state.pressedKeys.add(key); return true;
    }
  }
  if (event.repeat) {
    if (state.pressedKeys.has(key) || (state.shortcutSession && target?.closest?.('#shortcutLearn, #shortcutTest'))) {
      event.preventDefault(); return true;
    }
    return false;
  }
  const editing = target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
  if (state.shortcutSession && workspace?.screen === 'settings' && workspace.settingsPage === 'trigger') {
    if (event.key === 'Escape') { event.preventDefault(); stopShortcutSession('Association annulée.'); return true; }
    if (editing || target?.closest?.('#shortcutCancel')) return false;
    const candidate = shortcutFromEvent(event);
    if (!candidate) return false;
    if (state.shortcutSession === 'test') {
      if (!matchesScanShortcut(event, currentShortcut())) {
        ui.shortcutStatus.textContent = `${candidate.label} reçu ; le bouton attendu est ${currentShortcut().label}.`;
        return false;
      }
      event.preventDefault();
      stopShortcutSession(`${candidate.label} reçu. Le déclencheur est prêt dans Scanner.`);
      return true;
    }
    event.preventDefault();
    state.customShortcut = candidate;
    ui.scanShortcut.value = 'custom';
    stopShortcutSession(`${candidate.label} associé. Utilise « Tester le bouton » pour le vérifier.`);
    savePreferences();
    return true;
  }
  const interactive = target?.closest?.('button, a, summary, [role="button"], [role="switch"], [role="checkbox"], [role="slider"]');
  if (editing || (interactive && interactive !== ui.manualScan) || document.hidden || !isScannerSurface() ||
      !state.running || ui.scanMode.value === 'auto' || !ui.helpPanel.hidden || !matchesScanShortcut(event, currentShortcut())) return false;
  if (state.pressedKeys.has(key)) { event.preventDefault(); return true; }
  if (manualScanner.isBusy || state.cameraApplying) { event.preventDefault(); state.pressedKeys.add(key); return true; }
  if (!triggerManualScan()) return false;
  event.preventDefault();
  state.pressedKeys.add(key);
  return true;
}

function cameraValueText(value, control) {
  if (value == null) return '—';
  if (control.type === 'checkbox') return value ? 'Activé' : 'Désactivé';
  const number = Number(value);
  return Number.isFinite(number) && control.type === 'range'
    ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(number)}${control.unit ? ` ${control.unit}` : ''}`
    : String(value ?? '');
}

function renderCameraSettings(description = state.cameraController?.describe()) {
  renderTorchButton(description);
  ui.cameraSettingsControls.replaceChildren();
  ui.resetCameraSettings.disabled = !description?.active || !description?.adjustable || state.cameraApplying;
  const controls = description?.active ? description.controls : [];
  const page = paginateHistory(controls, state.cameraControlPage, workspace?.isMobile ? 1 : 2);
  state.cameraControlPage = page.page;
  ui.cameraControlPrev.disabled = page.page === 0 || state.cameraApplying;
  ui.cameraControlNext.disabled = page.page >= page.pageCount - 1 || state.cameraApplying;
  ui.cameraControlPage.textContent = controls.length ? `${page.page + 1} / ${page.pageCount}` : 'Aucune commande';
  if (!description?.active) {
    ui.cameraSettingsStatus.textContent = 'Active la webcam pour afficher ses réglages disponibles.';
    ui.cameraDetails.textContent = 'Aucune caméra active';
    return;
  }
  ui.cameraDetails.textContent = description.summary;
  ui.cameraSettingsStatus.textContent = state.cameraApplying ? 'Application du réglage…'
    : description.adjustable ? 'Réglages proposés par cette caméra. Les valeurs affichées sont celles du matériel.'
      : 'Cette caméra ou ce navigateur n’expose pas de réglage manuel. Essaie une autre résolution, un éclairage plus diffus ou le mode Précision.';
  for (const control of page.rows) {
    const wrapper = document.createElement('div');
    wrapper.className = 'camera-control';
    const heading = document.createElement('div');
    heading.className = 'control-heading';
    const label = document.createElement('label');
    const id = `camera-${control.key}`;
    label.htmlFor = id;
    label.textContent = control.label;
    heading.append(label);
    let input;
    if (control.type === 'select') {
      input = document.createElement('select');
      if (control.value == null) input.append(new Option('Non communiqué', ''));
      for (const option of control.options || []) input.append(new Option(option.label, option.value));
      input.value = String(control.value ?? '');
    } else {
      input = document.createElement('input');
      input.type = control.type;
      if (control.type === 'checkbox') input.checked = Boolean(control.value);
      else {
        input.min = control.min; input.max = control.max; input.step = control.step;
        input.value = control.value ?? control.min;
        const output = document.createElement('output');
        output.htmlFor = id;
        output.textContent = cameraValueText(control.value, control);
        heading.append(output);
        input.addEventListener('input', () => { output.textContent = cameraValueText(input.value, control); });
      }
    }
    input.id = id;
    input.disabled = state.cameraApplying || Boolean(control.disabled);
    input.addEventListener('change', () => {
      const value = control.type === 'checkbox' ? input.checked : input.value;
      void applyCameraSetting(control.key, value);
    });
    wrapper.append(heading);
    if (control.type === 'select') {
      const selectWrapper = document.createElement('div');
      selectWrapper.className = 'select-control'; selectWrapper.append(input); wrapper.append(selectWrapper);
    } else wrapper.append(input);
    if (control.help) {
      const help = document.createElement('p');
      help.className = 'control-help'; help.id = `${id}-help`; help.textContent = control.help;
      input.setAttribute('aria-describedby', help.id); wrapper.append(help);
    }
    ui.cameraSettingsControls.append(wrapper);
  }
}

async function applyCameraSetting(key, value) {
  const controller = state.cameraController;
  if (!controller || state.cameraApplying) return;
  const focused = document.activeElement;
  state.cameraApplying = true;
  manualScanner?.cancel();
  setControls();
  renderCameraSettings();
  try {
    if (key === 'reset') await controller.reset();
    else await controller.set(key, value);
    if (controller === state.cameraController) toast(key === 'reset' ? 'Réglages de départ restaurés'
      : key === 'torch' ? (value ? 'Lampe allumée' : 'Lampe éteinte') : 'Réglage caméra appliqué');
  } catch (error) {
    if (controller === state.cameraController) {
      message(error?.message || 'La caméra a refusé ce réglage ; ses valeurs actuelles ont été conservées.', 'warning');
    }
  } finally {
    if (controller === state.cameraController) {
      state.cameraApplying = false;
      renderCameraSettings();
      setControls();
      const target = $(key === 'reset' ? 'resetCameraSettings' : `camera-${key}`);
      if (workspace?.screen === 'settings') target?.focus({ preventScroll: true });
      else if (focused === ui.torchToggle && !ui.manualScan.hidden && !ui.manualScan.disabled) ui.manualScan.focus({ preventScroll: true });
    }
  }
}

function releaseCamera(update = true) {
  state.cameraToken += 1;
  state.running = false;
  state.starting = false;
  state.manualNotice = '';
  cancelCameraReading();
  state.cameraController?.destroy();
  state.cameraController = null;
  state.cameraApplying = false;
  state.cameraControlPage = 0;
  state.visibleCodes.clear();
  if (state.stream) for (const track of state.stream.getTracks()) track.stop();
  state.stream = null;
  ui.video.pause();
  ui.video.srcObject = null;
  ui.video.hidden = true;
  if (!state.importing) {
    ui.overlayCanvas.hidden = true;
    ui.emptyState.hidden = !ui.previewCanvas.hidden;
  }
  if (update) status('Caméra arrêtée');
  renderCameraSettings();
  updateScanGuide();
  setControls();
}

function stopAll() {
  state.pressedKeys.clear();
  state.imageToken += 1;
  state.imageAbort?.abort();
  state.imageAbort = null;
  state.importing = false;
  releaseCamera();
  status('Lecture arrêtée');
}

function cameraError(error) {
  const messages = {
    NotAllowedError: 'L’accès à la caméra a été refusé. Autorise la caméra dans les réglages de ce site ou fichier, puis réessaie. Vérifie aussi les autorisations du navigateur dans les réglages de ton appareil.',
    NotFoundError: 'Aucune caméra disponible. Vérifie qu’elle est connectée ou utilise « Ouvrir une image ».',
    NotReadableError: 'La caméra est indisponible. Ferme l’application qui l’utilise, puis réessaie.',
    OverconstrainedError: 'Cette webcam ne prend pas en charge les réglages demandés. Sélectionne une autre caméra et réessaie.',
    SecurityError: 'Le navigateur ou une règle de ton organisation bloque la caméra. Tu peux toujours lire une image enregistrée.',
    AbortError: 'Le démarrage de la webcam a été interrompu. Réessaie.',
  };
  return messages[error?.name] || 'Impossible de démarrer la caméra. Vérifie les autorisations de ton navigateur, puis réessaie ou importe une image.';
}

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    const previous = state.stream?.getVideoTracks()[0]?.getSettings().deviceId || ui.cameraSelect.value;
    ui.cameraSelect.replaceChildren();
    const defaultOption = new Option('Caméra par défaut', '');
    ui.cameraSelect.append(defaultOption);
    devices.forEach((device, index) => {
      if (device.deviceId) ui.cameraSelect.append(new Option(device.label || `Caméra ${index + 1}`, device.deviceId));
    });
    if (devices.some((device) => device.deviceId === previous)) ui.cameraSelect.value = previous;
  } catch { /* Camera selection is optional before permission. */ }
}

async function startCamera() {
  if (!state.ready || state.importing || state.starting) return;
  if (!['scanner', 'settings'].includes(workspace.screen) && !(workspace.screen === 'result' && !workspace.isMobile)) workspace.navigate('scanner', { focus: false });
  message();
  prepareSound();
  releaseCamera(false);
  if (!navigator.mediaDevices?.getUserMedia) {
    message('L’accès caméra est indisponible dans cette fenêtre. Ouvre ScanCam directement dans ton navigateur, depuis son lien HTTPS ou le fichier HTML téléchargé. L’import d’image reste disponible.', 'warning');
    return;
  }
  state.starting = true;
  ui.previewCanvas.hidden = true;
  ui.emptyState.hidden = false;
  status('Autorise l’accès à la caméra…', 'loading');
  setControls();
  const token = state.cameraToken;
  let stream;
  try {
    const constraints = buildVideoConstraints({
      deviceId: ui.cameraSelect.value, resolution: ui.cameraResolution.value,
      frameRate: Number(ui.cameraFrameRate.value),
    });
    stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    if (token !== state.cameraToken) { stream.getTracks().forEach((track) => track.stop()); return; }
    state.stream = stream;
    ui.video.srcObject = stream;
    await ui.video.play();
    if (token !== state.cameraToken) { stream.getTracks().forEach((track) => track.stop()); return; }
    state.starting = false;
    state.running = true;
    state.seen.clear();
    ui.video.hidden = false;
    ui.emptyState.hidden = true;
    status('Préparation de la caméra…', 'loading');
    const track = stream.getVideoTracks()[0];
    const controller = createCameraController(track);
    state.cameraController = controller;
    state.cameraApplying = true;
    setControls();
    track.addEventListener('ended', () => {
      if (token === state.cameraToken) {
        releaseCamera();
        message('La webcam a été déconnectée ou son accès a été interrompu.', 'warning');
      }
    });
    try {
      const focus = controller.describe().controls.find((control) => control.key === 'focusMode');
      if (focus?.options?.some((option) => option.value === 'continuous') && focus.value !== 'continuous') {
        await controller.set('focusMode', 'continuous');
      }
    } catch { /* Autofocus support varies; preserve an otherwise valid stream. */ }
    await listCameras();
    if (token === state.cameraToken) {
      state.cameraApplying = false;
      renderCameraSettings();
      beginCameraReading();
    }
  } catch (error) {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (token !== state.cameraToken) return;
    releaseCamera();
    status('Caméra indisponible', 'error');
    message(cameraError(error), 'error');
  }
}

async function scanFrame(token, cycle) {
  const current = () => token === state.cameraToken && cycle === state.scanCycle && state.running && ui.scanMode.value === 'auto';
  if (!current()) return;
  const started = performance.now();
  try {
    if (ui.video.readyState >= 2 && ui.video.videoWidth > 0) {
      const size = cameraFrameSize(ui.video.videoWidth, ui.video.videoHeight);
      frameCanvas.width = size.width;
      frameCanvas.height = size.height;
      frameContext.drawImage(ui.video, 0, 0, frameCanvas.width, frameCanvas.height);
      const image = frameContext.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
      const revision = state.detectionRevision;
      const results = await decodeImage(image, {
        mode: ui.formatSelect.value, tryHarder: ui.tryHarder.checked,
        profile: ui.detectionProfile.value, region: ui.scanRegion.value, signal: state.scanAbort?.signal,
        budgetMs: ui.detectionProfile.value === 'precision' ? 700 : 350,
      });
      if (!current()) return;
      if (revision === state.detectionRevision) {
        drawBoxes(results, frameCanvas.width, frameCanvas.height);
        ui.scanMetrics.textContent = `${frameCanvas.width} × ${frameCanvas.height} · analyse ${Math.round(performance.now() - started)} ms`;
        results.forEach((result) => acceptResult(result, 'camera'));
        state.visibleCodes = new Set(results.map((result) => `${result.symbology || result.format || 'Inconnu'}\0${result.text}`));
        status(results.length ? `${results.length} code${results.length > 1 ? 's' : ''} détecté${results.length > 1 ? 's' : ''}` : 'Recherche d’un code…', results.length ? 'success' : 'scanning');
      }
    }
  } catch {
    if (!current()) return;
    releaseCamera();
    message('La lecture vidéo a rencontré une erreur. Réessaie la caméra ou importe une photo nette.', 'error');
    return;
  }
  if (current()) {
    state.timer = setTimeout(() => void scanFrame(token, cycle), Math.max(80, 300 - (performance.now() - started)));
  }
}

async function openBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = reject; image.src = url;
    });
    return image;
  } finally { URL.revokeObjectURL(url); }
}

async function importFiles(input) {
  if (!state.ready || state.importing) return;
  const files = Array.from(input).filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(file.name));
  if (!files.length) { message('Choisis une image PNG, JPEG, WebP ou BMP contenant un code.', 'warning'); return; }
  if (files.length > 50) { message('Sélectionne au maximum 50 images à la fois.', 'warning'); return; }
  workspace.navigate('scanner', { focus: false });
  releaseCamera(false);
  prepareSound();
  state.importing = true;
  const token = ++state.imageToken;
  state.imageAbort?.abort();
  state.imageAbort = new AbortController();
  setControls();
  message();
  let found = 0;
  const failures = [];
  for (const [index, file] of files.entries()) {
    if (token !== state.imageToken) break;
    let bitmap;
    try {
      status(`Lecture de l’image ${index + 1}/${files.length}…`, 'loading');
      if (file.size > MAX_IMAGE_BYTES) throw new Error('Image trop volumineuse (maximum 30 Mo).');
      bitmap = await openBitmap(file);
      if (token !== state.imageToken) break;
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 60000000) throw new Error('Image trop grande (maximum 60 mégapixels).');
      const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
      const canvas = ui.previewCanvas;
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      canvas.hidden = false;
      ui.video.hidden = true;
      ui.emptyState.hidden = true;
      ui.overlayCanvas.hidden = true;
      const scanStarted = performance.now();
      const results = await decodeImage(context.getImageData(0, 0, canvas.width, canvas.height), {
        mode: ui.formatSelect.value, tryHarder: ui.tryHarder.checked,
        profile: ui.detectionProfile.value, region: 'full', budgetMs: 1500,
        signal: state.imageAbort?.signal,
      });
      if (token !== state.imageToken) break;
      found += results.length;
      drawBoxes(results, canvas.width, canvas.height);
      ui.scanMetrics.textContent = `${canvas.width} × ${canvas.height} · analyse ${Math.round(performance.now() - scanStarted)} ms`;
      results.forEach((result) => acceptResult(result));
      if (!results.length) failures.push(`${file.name || 'Image collée'} : aucun code reconnu.`);
    } catch (error) {
      failures.push(`${file.name || 'Image collée'} : ${error?.message?.startsWith('Image trop') ? error.message : 'image illisible ou format non pris en charge ; essaie un JPEG ou PNG.'}`);
    } finally { bitmap?.close?.(); }
  }
  if (token !== state.imageToken) return;
  state.importing = false;
  state.imageAbort = null;
  setControls();
  status(found ? `${found} code${found > 1 ? 's' : ''} lu${found > 1 ? 's' : ''}` : 'Aucun code reconnu', found ? 'success' : 'warning');
  if (failures.length) {
    message(`${failures.slice(0, 3).join(' ')}${failures.length > 3 ? ` Et ${failures.length - 3} autre(s) image(s).` : ''} Vérifie le format sélectionné, la netteté et les reflets.`, 'warning');
  }
  if (found && workspace.isMobile && workspace.screen === 'scanner') workspace.navigate('result');
}

function exportHistory() {
  if (!state.records.length) return;
  const rows = state.selectedHistory.size
    ? partitionHistorySelection(state.records, state.selectedHistory).removed : state.records;
  if (!rows.length) return;
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ScanCam-${new Date().toISOString().slice(0, 10)}${state.selectedHistory.size ? '-selection' : ''}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(state.selectedHistory.size ? `${rows.length} scans exportés en CSV` : 'Historique exporté en CSV');
}

function resetResult() {
  state.current = null;
  ui.resultText.value = '';
  ui.detectedFormat.textContent = 'Aucun code';
  ui.resultTime.textContent = 'En attente d’une lecture';
  ui.fieldCards.replaceChildren();
  ui.copyResult.disabled = true;
  ui.openLink.hidden = true;
  ui.openLink.removeAttribute('title');
  ui.resultPlaceholder.hidden = false;
  ui.resultContent.hidden = true;
  workspace.clearResult();
}

function clearHistory() {
  stopAll();
  state.records = [];
  state.seen.clear();
  state.pendingDelete = null;
  state.pendingDeleteBatch = null;
  state.selectedHistory.clear();
  state.historyPage = 0;
  ui.searchHistory.value = '';
  resetResult();
  ui.clearConfirm.hidden = true;
  ui.clearHistory.setAttribute('aria-expanded', 'false');
  persistHistory();
  renderHistory();
  $('historyTitle')?.focus({ preventScroll: true });
  toast('Historique effacé');
}

function toggleHelp(open = ui.helpPanel.hidden) {
  ui.helpPanel.hidden = !open;
  ui.helpToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    manualScanner?.cancel();
    ui.helpPanel.scrollIntoView({ block: 'start', behavior: 'instant' });
    $('helpTitle')?.focus({ preventScroll: true });
  } else ui.helpToggle.focus({ preventScroll: true });
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const control = { 'start-camera': ui.startCamera, 'stop-camera': ui.stopCamera, 'import-image': ui.importImage }[button.dataset.action];
    if (control && !control.disabled) control.click();
  });
  ui.startCamera.addEventListener('click', () => void startCamera());
  ui.stopCamera.addEventListener('click', stopAll);
  ui.manualScan.addEventListener('click', triggerManualScan);
  ui.scanModeManual.addEventListener('click', () => changeScanMode('manual'));
  ui.scanModeAuto.addEventListener('click', () => changeScanMode('auto'));
  ui.scanMode.addEventListener('change', () => changeScanMode(ui.scanMode.value));
  ui.manualTimeout.addEventListener('change', savePreferences);
  ui.torchToggle.addEventListener('click', () => {
    const control = state.cameraController?.describe().controls.find((entry) => entry.key === 'torch');
    if (control && !control.disabled && !ui.torchToggle.disabled) void applyCameraSetting('torch', !control.value);
  });
  ui.scanShortcut.addEventListener('change', () => {
    if (ui.scanShortcut.value === 'custom' && !state.customShortcut) {
      ui.scanShortcut.value = state.shortcutSelection;
      startShortcutSession('learn');
    }
    else { stopShortcutSession(); savePreferences(); }
  });
  ui.shortcutLearn.addEventListener('click', () => startShortcutSession('learn'));
  ui.shortcutTest.addEventListener('click', () => startShortcutSession('test'));
  ui.shortcutCancel.addEventListener('click', () => stopShortcutSession('Association annulée.'));
  ui.cameraSelect.addEventListener('change', () => { if (state.running) void startCamera(); });
  for (const control of [ui.cameraResolution, ui.cameraFrameRate]) {
    control.addEventListener('change', () => {
      savePreferences();
      if (state.running) void startCamera();
    });
  }
  ui.resetCameraSettings.addEventListener('click', () => void applyCameraSetting('reset'));
  ui.cameraControlPrev.addEventListener('click', () => { state.cameraControlPage -= 1; renderCameraSettings(); });
  ui.cameraControlNext.addEventListener('click', () => { state.cameraControlPage += 1; renderCameraSettings(); });
  for (const control of [ui.scanRegion, ui.detectionProfile]) {
    control.addEventListener('change', () => {
      manualScanner.cancel();
      state.detectionRevision += 1; ui.overlayCanvas.hidden = true;
      updateScanGuide(); savePreferences();
    });
  }
  ui.uiScale.addEventListener('change', () => { updateUiScale(); savePreferences(); });
  ui.motionPreference.addEventListener('change', () => { workspace.applyMotion(ui.motionPreference.value); savePreferences(); });
  ui.densityPreference.addEventListener('change', () => { workspace.applyDensity(ui.densityPreference.value); savePreferences(); });
  ui.video.addEventListener('resize', updateScanGuide);
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateScanGuide).observe(ui.viewport);
  else window.addEventListener('resize', updateScanGuide);
  const historyWrap = ui.historyBody.closest('.history-table-wrap');
  if (typeof ResizeObserver === 'function') new ResizeObserver(scheduleHistoryFit).observe(historyWrap);
  else window.addEventListener('resize', scheduleHistoryFit);
  ui.beepVolume.addEventListener('input', updateVolumeLabel);
  ui.beepVolume.addEventListener('change', savePreferences);
  ui.testSound.addEventListener('click', async () => {
    const volume = normalizeVolume(ui.beepVolume.value);
    if (!volume) { toast('Volume à 0 % : augmente le curseur pour entendre le bip.'); return; }
    if (await prepareSound(true) && beep(true)) toast(`Test du son · ${volume} %`);
    else message('Le navigateur n’a pas pu jouer le son. Vérifie que l’onglet est autorisé à émettre du son et que la sortie audio est active.', 'warning');
  });
  ui.importImage.addEventListener('click', () => { prepareSound(); ui.imageInput.click(); });
  ui.imageInput.addEventListener('change', () => {
    const files = Array.from(ui.imageInput.files || []);
    ui.imageInput.value = '';
    if (files.length) void importFiles(files);
  });
  ui.copyResult.addEventListener('click', () => { if (state.current) void copyText(selectedCopyText(state.current)); });
  ui.openLink.addEventListener('click', () => {
    const url = state.current && safeHttpUrl(state.current.text);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });
  ui.searchHistory.addEventListener('input', () => {
    state.historyPage = 0;
    state.pendingDelete = state.pendingDeleteBatch = null;
    renderHistory();
  });
  ui.historyPagePrevious.addEventListener('click', () => changeHistoryPage(-1));
  ui.historyPageNext.addEventListener('click', () => changeHistoryPage(1));
  ui.selectAllHistory.addEventListener('change', () => {
    state.selectedHistory = selectVisibleHistory(state.records, state.selectedHistory, filteredHistory(), ui.selectAllHistory.checked);
    state.pendingDelete = state.pendingDeleteBatch = null;
    renderHistory();
  });
  ui.clearSelection.addEventListener('click', () => {
    state.selectedHistory.clear();
    state.pendingDelete = state.pendingDeleteBatch = null;
    renderHistory();
    (ui.selectAllHistory.disabled ? ui.searchHistory : ui.selectAllHistory).focus({ preventScroll: true });
  });
  ui.copySelection.addEventListener('click', () => {
    const selected = partitionHistorySelection(state.records, state.selectedHistory).removed;
    if (selected.length) void copyText(selected.map(selectedCopyText).join('\n'));
  });
  ui.deleteSelection.addEventListener('click', () => {
    if (!state.selectedHistory.size) return;
    state.pendingDelete = null;
    state.pendingDeleteBatch = new Set(state.selectedHistory);
    ui.clearConfirm.hidden = true;
    ui.clearHistory.setAttribute('aria-expanded', 'false');
    renderHistory();
    ui.cancelDeleteSelection.focus({ preventScroll: true });
    ui.deleteSelectionConfirm.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });
  ui.cancelDeleteSelection.addEventListener('click', () => cancelDeleteSelection());
  ui.confirmDeleteSelection.addEventListener('click', deleteSelectedScans);
  ui.exportCsv.addEventListener('click', exportHistory);
  ui.clearHistory.addEventListener('click', () => {
    if (!state.records.length) return;
    state.pendingDelete = state.pendingDeleteBatch = null;
    renderHistory();
    ui.clearConfirm.hidden = false;
    ui.clearHistory.setAttribute('aria-expanded', 'true');
    ui.cancelClearHistory.focus({ preventScroll: true });
    ui.clearConfirm.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });
  ui.confirmClearHistory.addEventListener('click', clearHistory);
  ui.cancelClearHistory.addEventListener('click', () => {
    ui.clearConfirm.hidden = true;
    ui.clearHistory.setAttribute('aria-expanded', 'false');
    ui.clearHistory.focus({ preventScroll: true });
  });
  ui.toggleTheme.addEventListener('click', () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    updateThemeLabel(); savePreferences();
  });
  ui.helpToggle.addEventListener('click', () => toggleHelp());
  ui.closeHelp?.addEventListener('click', () => toggleHelp(false));
  for (const control of [ui.formatSelect, ui.autoCopy, ui.copyMode, ui.beepEnabled, ui.keepHistory, ui.tryHarder].filter(Boolean)) {
    control.addEventListener('change', () => {
      savePreferences();
      if (control === ui.keepHistory) persistHistory();
      if (control === ui.beepEnabled) prepareSound();
      if (control === ui.formatSelect || control === ui.tryHarder) {
        manualScanner.cancel();
        state.detectionRevision += 1; ui.overlayCanvas.hidden = true;
      }
      if (control === ui.formatSelect) { state.seen.clear(); state.visibleCodes.clear(); }
    });
  }
  document.addEventListener('keydown', (event) => {
    if (handleScanShortcut(event)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      if (!ui.importImage.disabled) ui.importImage.click();
    }
    if (event.key === 'Escape') {
      if (state.pendingDelete) cancelDeleteScan();
      else if (state.pendingDeleteBatch) cancelDeleteSelection();
      else if (!ui.clearConfirm.hidden) ui.cancelClearHistory.click();
      else if (!ui.helpPanel.hidden) toggleHelp(false);
      else if (manualScanner.isBusy) manualScanner.cancel();
      else stopAll();
    }
  });
  document.addEventListener('keyup', (event) => state.pressedKeys.delete(event.code || event.key));
  window.addEventListener('blur', () => {
    state.pressedKeys.clear();
    if (state.shortcutSession) stopShortcutSession('Association interrompue. Relance-la pour réessayer.');
  });
  document.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault(); void importFiles(files);
    }
  });
  document.addEventListener('dragover', (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) {
      event.preventDefault();
      ui.viewport.classList.add('is-dragging');
    }
  });
  document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) ui.viewport.classList.remove('is-dragging');
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    ui.viewport.classList.remove('is-dragging');
    if (event.dataTransfer?.files?.length) void importFiles(event.dataTransfer.files);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.shortcutSession) stopShortcutSession('Association interrompue.');
    if (document.hidden && (state.running || state.starting)) {
      releaseCamera();
      status('Caméra arrêtée — fenêtre en arrière-plan');
    }
  });
  window.addEventListener('pagehide', stopAll);
  navigator.mediaDevices?.addEventListener?.('devicechange', () => void listCameras());
}

async function boot() {
  manualScanner = createManualScanner({
    capture: captureManualFrame,
    decode: async (frame, { signal, budgetMs }) => {
      const started = performance.now();
      const results = await decodeImage(frame.image, {
        mode: frame.mode, profile: frame.profile, tryHarder: frame.tryHarder,
        region: 'center', signal, budgetMs: Math.min(budgetMs, frame.profile === 'precision' ? 700 : 350),
      });
      if (!signal.aborted && frame.cameraToken === state.cameraToken && frame.revision === state.detectionRevision) {
        ui.scanMetrics.textContent = `${frame.width} × ${frame.height} · analyse ${Math.round(performance.now() - started)} ms`;
      }
      return results;
    },
    accept: (result, frame) => {
      if (!state.running || frame.cameraToken !== state.cameraToken || frame.revision !== state.detectionRevision ||
          ui.scanMode.value === 'auto' || !isScannerSurface() || document.hidden) return;
      drawBoxes([result], frame.width, frame.height);
      acceptResult(result, 'manual');
    },
    onState: manualStateChanged,
  });
  loadPreferences();
  workspace = createWorkspaceUI({
    onScreenChange: ({ screen, isMobile, reason, settingsPage }) => {
      state.pressedKeys.clear();
      if (screen !== 'scanner' && !(screen === 'result' && !isMobile)) manualScanner.cancel();
      if ((screen !== 'settings' || (settingsPage && settingsPage !== 'trigger')) && state.shortcutSession) stopShortcutSession('Association interrompue.');
      // Settings retain the same live preview so hardware adjustments stay visible.
      // Leaving it for History or a mobile result also invalidates a pending prompt.
      if ((screen === 'history' || (screen === 'result' && isMobile)) && (state.running || state.starting)) releaseCamera();
      if ((screen === 'scanner' || (screen === 'result' && !isMobile)) && state.running && ui.scanMode.value !== 'auto') status('Visée manuelle', 'aiming');
      if (reason !== 'init') {
        if (state.pendingDelete || state.pendingDeleteBatch) {
          state.pendingDelete = state.pendingDeleteBatch = null;
          renderHistory();
        }
        ui.clearConfirm.hidden = true;
        ui.clearHistory.setAttribute('aria-expanded', 'false');
        ui.helpPanel.hidden = true;
        ui.helpToggle.setAttribute('aria-expanded', 'false');
      }
      const cameraToken = state.cameraToken;
      requestAnimationFrame(() => {
        setControls();
        scheduleHistoryFit();
        if (screen === 'settings') renderCameraSettings();
        updateScanGuide();
        // Some mobile browsers pause media when its DOM container changes.
        // Resume only this still-active session, never a stopped/replaced stream.
        if (state.running && cameraToken === state.cameraToken && ui.video.paused) {
          void ui.video.play().catch(() => {
            if (state.running && cameraToken === state.cameraToken) {
              releaseCamera();
              message('La caméra a été mise en pause par le navigateur. Relance-la pour continuer.', 'warning');
            }
          });
        }
      });
    },
  });
  workspace.applyMotion(ui.motionPreference.value);
  workspace.applyDensity(ui.densityPreference.value);
  bindEvents();
  updateShortcutControls();
  renderHistory();
  if (state.records.length) {
    showResult(state.records[0]);
    workspace.notifyResult(state.records[0], { announce: false });
  }
  setControls();
  renderCameraSettings();
  status('Chargement du lecteur…', 'loading');
  ui.engineStatus.textContent = 'Chargement…';
  try {
    await initDecoder();
    state.ready = true;
    ui.engineStatus.textContent = 'Prêt · hors ligne';
    ui.engineStatus.dataset.state = 'success';
    status('Prêt à lire');
    setControls();
    void listCameras();
  } catch {
    ui.engineStatus.textContent = 'Lecteur indisponible';
    status('Erreur de chargement', 'error');
    message('Le moteur de lecture n’a pas pu démarrer. Recharge ScanCam dans une version récente de ton navigateur. Pour le fichier téléchargé, vérifie que ScanCam.html est complet.', 'error');
  }
}

void boot();
