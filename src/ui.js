const SCREENS = new Set(['scanner', 'result', 'history', 'settings']);
const SETTINGS_PAGES = {
  home: 'Réglages', reading: 'Lecture', trigger: 'Déclenchement', camera: 'Caméra',
  hardware: 'Commandes caméra', sound: 'Son', data: 'Copie et historique', appearance: 'Interface',
};
const SCREEN_COPY = {
  scanner: { title: 'Scanner', subtitle: 'Caméra ou image' },
  result: { title: 'Résultat', subtitle: 'Contenu du dernier code' },
  history: { title: 'Historique', subtitle: 'Codes lus' },
  settings: { title: 'Réglages', subtitle: 'Caméra, son et affichage' },
};
const LEGACY_ROUTES = {
  main: 'scanner', scannerPanel: 'scanner', resultPanel: 'result',
  historyPanel: 'history', cameraSettings: 'settings', settingsPanel: 'settings',
};

function screenFromHash(hash) {
  let value;
  try { value = decodeURIComponent(String(hash || '').replace(/^#/, '')); }
  catch { return null; }
  if (value.startsWith('settings/') && Object.hasOwn(SETTINGS_PAGES, value.slice(9))) return 'settings';
  return SCREENS.has(value) ? value : Object.hasOwn(LEGACY_ROUTES, value) ? LEGACY_ROUTES[value] : null;
}

function settingsFromHash(hash) {
  if (hash === '#cameraSettings') return 'hardware';
  const name = String(hash || '').replace(/^#settings\/?/, '');
  return Object.hasOwn(SETTINGS_PAGES, name) ? name : 'home';
}

function countText(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(number))).toLocaleString('fr-FR')
    : '0';
}

/**
 * The screen controller owns presentation only. Camera lifetime, decoded data,
 * preferences and clipboard actions remain in app.js.
 */
export function createWorkspaceUI({ onScreenChange } = {}) {
  const root = document.documentElement;
  const byId = (id) => document.getElementById(id);
  const mobileQuery = window.matchMedia('(max-width: 900px)');
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const panels = [...document.querySelectorAll('[data-screen-panel]')];
  const readerPanels = [...document.querySelectorAll('[data-mobile-panel]')];
  const notice = byId('mobileResultNotice');
  const noticePreview = byId('mobileResultPreview');
  const resultPanel = byId('resultPanel');
  const previewStage = byId('previewStage');
  const scannerPreviewSlot = byId('scannerPreviewSlot');
  const cameraPreviewSlot = byId('cameraPreviewSlot');
  const hardwarePreviewSlot = byId('hardwarePreviewSlot');
  const settingsPanels = [...byId('settingsPanel').querySelectorAll('[data-settings-page]')];
  const scrollPositions = new Map();
  const focusPositions = new Map();
  const removers = [];
  const originalScrollRestoration = window.history.scrollRestoration;
  let current = screenFromHash(window.location.hash) || 'scanner';
  let settingsPage = settingsFromHash(window.location.hash);
  let resultPage = 'raw';
  let helpPage = 0;
  let mobile = mobileQuery.matches;
  let motionPreference = 'auto';
  let hasResult = false;
  let unreadResult = false;
  let disposed = false;
  let navigationRevision = 0;
  let navigationFrame = 0;
  let entryTimer = 0;
  let resultTimer = 0;
  let activeSurface = null;
  let touchY = null;

  // The document is fixed; each screen restores focus rather than a page offset.
  try { window.history.scrollRestoration = 'manual'; } catch { /* Optional on file URLs. */ }

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }

  function listenMedia(query, handler) {
    if (query.addEventListener) listen(query, 'change', handler);
    else {
      query.addListener(handler);
      removers.push(() => query.removeListener(handler));
    }
  }

  function groupFor(screen) {
    return screen === 'scanner' || screen === 'result' ? 'reader' : screen;
  }

  function positionKey(screen = current, isMobile = mobile) {
    return `${isMobile ? 'mobile' : 'desktop'}:${isMobile ? screen : groupFor(screen)}`;
  }

  function focusKey(screen = current, isMobile = mobile) {
    return `${isMobile ? 'mobile' : 'desktop'}:${screen}${screen === 'settings' ? `:${settingsPage}` : ''}`;
  }

  function visible(element) {
    return element?.isConnected && !element.closest('[hidden]') &&
      !element.disabled && element.getClientRects().length > 0;
  }

  function screenHeading() {
    const id = { scanner: 'scannerTitle', result: 'resultTitle', history: 'historyTitle', settings: 'pageTitle' }[current];
    return [byId(id), byId('pageTitle')].find(visible) || null;
  }

  function rememberPosition() {
    scrollPositions.set(positionKey(), 0);
    const focused = document.activeElement;
    if (focused && activeSurface?.contains(focused)) focusPositions.set(focusKey(), focused);
  }

  function snapScroll(top) {
    // Do not animate through another screen's old scroll position.
    const previous = root.style.getPropertyValue('scroll-behavior');
    const priority = root.style.getPropertyPriority('scroll-behavior');
    root.style.setProperty('scroll-behavior', 'auto', 'important');
    window.scrollTo({ left: 0, top: Math.max(0, top), behavior: 'auto' });
    if (previous) root.style.setProperty('scroll-behavior', previous, priority);
    else root.style.removeProperty('scroll-behavior');
  }

  function writeRoute(screen, replace = false) {
    try {
      const oldState = window.history.state;
      const state = oldState && typeof oldState === 'object' && !Array.isArray(oldState) ? { ...oldState } : {};
      state.scanlibreScreen = screen;
      state.scancamSettingsPage = settingsPage;
      const route = screen === 'settings' && settingsPage !== 'home' ? `settings/${settingsPage}` : screen;
      window.history[replace ? 'replaceState' : 'pushState'](state, '', `#${route}`);
    } catch { /* Screen navigation remains usable when history writes are blocked. */ }
  }

  function updateNotice() {
    root.dataset.hasResult = String(hasResult);
    if (notice) notice.hidden = !(mobile && current === 'scanner' && hasResult && unreadResult);
    for (const item of document.querySelectorAll('[data-result-indicator]')) {
      item.hidden = !(hasResult && unreadResult);
    }
  }

  function applyMotion(value = 'auto') {
    motionPreference = ['auto', 'full', 'reduced'].includes(value) ? value : 'auto';
    root.dataset.motionPreference = motionPreference;
    root.dataset.motion = motionPreference === 'reduced' || (motionPreference === 'auto' && reducedQuery.matches)
      ? 'reduced' : 'full';
    if (root.dataset.motion === 'reduced') {
      clearTimeout(entryTimer);
      clearTimeout(resultTimer);
      for (const element of [...panels, ...readerPanels, notice, resultPanel].filter(Boolean)) {
        element.classList.remove('screen-enter', 'is-result-new');
      }
    }
    return motionPreference;
  }

  function applyDensity(value = 'comfortable') {
    const density = value === 'compact' ? 'compact' : 'comfortable';
    root.dataset.density = density;
    return density;
  }

  function paint({ reason, previous, focus = false, restore = false }) {
    if (disposed) return;
    const revision = ++navigationRevision;
    cancelAnimationFrame(navigationFrame);
    const focusedBefore = document.activeElement;
    const group = groupFor(current);
    const oldSurface = activeSurface;
    root.dataset.screen = current;
    root.dataset.layout = mobile ? 'mobile' : 'desktop';
    root.dataset.settingsPage = settingsPage;
    byId('settingsBack').hidden = current !== 'settings' || settingsPage === 'home';
    for (const panel of settingsPanels) panel.hidden = panel.dataset.settingsPage !== settingsPage;

    // Keep the exact same video/canvas nodes, stream and decoded image when the
    // user opens camera settings. Nothing is copied or decoded a second time.
    const previewSlot = current === 'settings'
      ? settingsPage === 'hardware' ? hardwarePreviewSlot : cameraPreviewSlot : scannerPreviewSlot;
    if (previewStage && previewSlot && previewStage.parentElement !== previewSlot) previewSlot.append(previewStage);

    for (const panel of panels) panel.hidden = panel.dataset.screenPanel !== group;
    for (const panel of readerPanels) panel.hidden = mobile && panel.dataset.mobilePanel !== current;
    activeSurface = mobile && group === 'reader'
      ? readerPanels.find((panel) => panel.dataset.mobilePanel === current)
      : current === 'settings' ? settingsPanels.find((panel) => panel.dataset.settingsPage === settingsPage)
        : panels.find((panel) => panel.dataset.screenPanel === group);

    // On desktop both reader panels share the same workspace and navigation item.
    const activeNav = !mobile && current === 'result' ? 'scanner' : current;
    for (const item of document.querySelectorAll('[data-nav]')) {
      const active = item.dataset.nav === activeNav;
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
      if (item.getAttribute('role') === 'tab') item.setAttribute('aria-selected', String(active));
    }
    const copy = SCREEN_COPY[activeNav];
    const title = current === 'settings' ? SETTINGS_PAGES[settingsPage] : copy.title;
    if (byId('pageTitle')) byId('pageTitle').textContent = title;
    if (byId('pageSubtitle')) byId('pageSubtitle').textContent = copy.subtitle;
    document.title = `ScanCam — ${title}`;

    if (current === 'result' || (!mobile && group === 'reader')) unreadResult = false;
    updateNotice();

    if (oldSurface !== activeSurface) {
      clearTimeout(entryTimer);
      for (const panel of [...panels, ...readerPanels, ...settingsPanels]) panel.classList.remove('screen-enter');
      if (root.dataset.motion === 'full' && reason !== 'layout' && activeSurface) {
        const entering = activeSurface;
        entering.classList.add('screen-enter');
        entryTimer = setTimeout(() => entering.classList.remove('screen-enter'), 520);
      }
    }

    onScreenChange?.({ screen: current, previous, isMobile: mobile, reason, settingsPage });

    navigationFrame = requestAnimationFrame(() => {
      if (disposed || revision !== navigationRevision) return;
      snapScroll(0);
      // A passive breakpoint change only repairs focus if its previous element
      // has become hidden. It never steals focus from a still-visible control.
      const focused = document.activeElement;
      const focusMoved = focused !== focusedBefore && focused !== document.body && visible(focused);
      const repairFocus = focusedBefore && focusedBefore !== document.body && !visible(focusedBefore);
      if (!focusMoved && (focus || repairFocus)) {
        const remembered = focusPositions.get(focusKey());
        const heading = screenHeading();
        const target = visible(remembered) ? remembered : heading;
        if (target && visible(target)) {
          if (target === heading && !target.hasAttribute('tabindex')) target.tabIndex = -1;
          target.focus({ preventScroll: true });
          if (!mobile && current === 'result') target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
      }
    });
  }

  function navigate(screen, { focus = true, replace = false } = {}) {
    if (disposed || !SCREENS.has(screen)) return false;
    const previous = current;
    const changed = screen !== current;
    const settingsChanged = screen === 'settings' && settingsPage !== 'home';
    if (changed || settingsChanged) rememberPosition();
    current = screen;
    if (screen === 'settings') settingsPage = 'home';
    if (changed || settingsChanged || replace) writeRoute(screen, replace);
    paint({ reason: 'navigation', previous, focus, restore: changed });
    return true;
  }

  function navigateSettings(page) {
    if (disposed || !Object.hasOwn(SETTINGS_PAGES, page)) return false;
    const previous = current;
    rememberPosition();
    current = 'settings';
    settingsPage = page;
    writeRoute(current);
    paint({ reason: 'settings-page', previous, focus: true });
    return true;
  }

  function paintResultPage(page = resultPage) {
    const hasFields = byId('fieldCards').childElementCount > 0;
    resultPage = page === 'fields' && hasFields ? 'fields' : 'raw';
    byId('resultFieldsTab').hidden = !hasFields;
    for (const panel of document.querySelectorAll('[data-result-page]')) panel.hidden = panel.dataset.resultPage !== resultPage;
    for (const button of document.querySelectorAll('[data-result-nav]')) button.setAttribute('aria-pressed', String(button.dataset.resultNav === resultPage));
  }

  function paintHelpPage() {
    const pages = [...document.querySelectorAll('.help-item')];
    helpPage = Math.max(0, Math.min(pages.length - 1, helpPage));
    pages.forEach((page, index) => { page.hidden = index !== helpPage; });
    byId('helpPrevious').disabled = helpPage === 0;
    byId('helpNext').disabled = helpPage >= pages.length - 1;
    byId('helpPageStatus').textContent = `${helpPage + 1} / ${pages.length}`;
  }

  function notifyResult(record, { announce = true } = {}) {
    if (disposed || !record || typeof record.text !== 'string') return;
    hasResult = true;
    paintResultPage('raw');
    const text = record.text.replace(/\s+/g, ' ').trim();
    const characters = Array.from(text);
    const preview = characters.length > 90 ? `${characters.slice(0, 89).join('')}…` : text;
    if (noticePreview) noticePreview.textContent = preview || 'Code sans texte';
    if (notice) notice.setAttribute('aria-label', `Voir le résultat : ${preview || 'code sans texte'}`);
    if (announce) unreadResult = !(current === 'result' || (!mobile && groupFor(current) === 'reader'));
    updateNotice();
    if (announce && root.dataset.motion === 'full') {
      clearTimeout(resultTimer);
      for (const element of [resultPanel, notice].filter(Boolean)) element.classList.add('is-result-new');
      resultTimer = setTimeout(() => {
        for (const element of [resultPanel, notice].filter(Boolean)) element.classList.remove('is-result-new');
      }, 720);
    }
  }

  function clearResult() {
    hasResult = false;
    unreadResult = false;
    paintResultPage('raw');
    clearTimeout(resultTimer);
    for (const element of [resultPanel, notice].filter(Boolean)) element.classList.remove('is-result-new');
    if (noticePreview) noticePreview.textContent = '';
    if (notice) notice.removeAttribute('aria-label');
    updateNotice();
  }

  function syncHistory({ total = 0, unique = 0 } = {}) {
    if (byId('sessionTotal')) byId('sessionTotal').textContent = countText(total);
    if (byId('sessionUnique')) byId('sessionUnique').textContent = countText(unique);
    for (const count of document.querySelectorAll('[data-history-count]')) {
      count.textContent = countText(unique);
      count.dataset.empty = String(Number(unique) === 0);
    }
  }

  function setActivity({ running = false, starting = false, importing = false } = {}) {
    const activity = importing ? 'importing' : starting ? 'starting' : running ? 'running' : 'idle';
    root.dataset.activity = activity;
    const label = byId('activityLabel');
    if (label) label.textContent = {
      idle: 'Caméra arrêtée', starting: 'Ouverture de la caméra…',
      running: 'Caméra active', importing: 'Analyse de l’image…',
    }[activity];
  }

  listen(document, 'click', (event) => {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const settingsTrigger = event.target?.closest?.('[data-settings-nav]');
    if (settingsTrigger) { event.preventDefault(); navigateSettings(settingsTrigger.dataset.settingsNav); return; }
    const resultTrigger = event.target?.closest?.('[data-result-nav]');
    if (resultTrigger) { event.preventDefault(); paintResultPage(resultTrigger.dataset.resultNav); return; }
    const trigger = event.target?.closest?.('[data-nav], a[href^="#"]');
    if (!trigger || trigger.hasAttribute('download') || trigger.getAttribute('target') === '_blank') return;
    const href = trigger.getAttribute('href');
    if (trigger.classList.contains('skip-link') && href === '#main') {
      const content = byId('main');
      if (!content) return;
      event.preventDefault();
      if (!content.hasAttribute('tabindex')) content.tabIndex = -1;
      content.focus({ preventScroll: true });
      content.scrollIntoView({ block: 'start', behavior: 'auto' });
      return;
    }
    const target = trigger.dataset.nav || screenFromHash(href);
    if (!SCREENS.has(target)) return;
    event.preventDefault();
    if (href === '#cameraSettings' && byId('cameraSettings')) byId('cameraSettings').open = true;
    navigate(target);
  });

  listen(document, 'focusin', (event) => {
    if (activeSurface?.contains(event.target)) focusPositions.set(focusKey(), event.target);
  });

  // Fixed viewport CSS handles modern browsers. This bounded touch guard also
  // prevents rubber-banding in mobile browsers that ignore overscroll-behavior.
  // Pinch zoom, text selection and native input gestures remain available.
  listen(document, 'touchstart', (event) => {
    touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  listen(document, 'touchmove', (event) => {
    if (!mobile || event.touches.length !== 1 || (window.visualViewport?.scale || 1) > 1.01) {
      touchY = null;
      return;
    }
    const y = event.touches[0].clientY;
    const delta = touchY == null ? 0 : y - touchY;
    touchY = y;
    if (event.target?.closest?.('input[type="range"], textarea, select')) return;
    const boundary = event.target?.closest?.('#helpPanel, #appMessage');
    if (boundary && !boundary.hidden) {
      let element = event.target;
      while (element && boundary.contains(element)) {
        const remaining = element.scrollHeight - element.clientHeight;
        const scrollable = remaining > 1 && /auto|scroll/.test(getComputedStyle(element).overflowY);
        if (scrollable && ((delta > 0 && element.scrollTop > 0) || (delta < 0 && element.scrollTop < remaining - 1))) return;
        if (element === boundary) break;
        element = element.parentElement;
      }
    }
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  listen(document, 'touchend', () => { touchY = null; }, { passive: true });
  listen(document, 'touchcancel', () => { touchY = null; }, { passive: true });

  function restoreRoute() {
    const target = screenFromHash(window.location.hash) || 'scanner';
    const targetSettings = settingsFromHash(window.location.hash);
    if (target === current && (target !== 'settings' || targetSettings === settingsPage)) return;
    const previous = current;
    rememberPosition();
    current = target;
    settingsPage = targetSettings;
    if (window.location.hash === '#cameraSettings' && byId('cameraSettings')) byId('cameraSettings').open = true;
    paint({ reason: 'history', previous, focus: true, restore: true });
  }
  listen(window, 'popstate', restoreRoute);
  listen(window, 'hashchange', restoreRoute);
  listenMedia(mobileQuery, () => {
    rememberPosition();
    mobile = mobileQuery.matches;
    paint({ reason: 'layout', previous: current });
  });
  listenMedia(reducedQuery, () => { if (motionPreference === 'auto') applyMotion('auto'); });
  listen(byId('helpPrevious'), 'click', () => { helpPage -= 1; paintHelpPage(); });
  listen(byId('helpNext'), 'click', () => { helpPage += 1; paintHelpPage(); });

  if (window.location.hash === '#cameraSettings' && byId('cameraSettings')) byId('cameraSettings').open = true;
  applyMotion(byId('motionPreference')?.value || 'auto');
  applyDensity(byId('densityPreference')?.value || 'comfortable');
  paintHelpPage();
  paintResultPage();
  writeRoute(current, true);
  paint({ reason: 'init', previous: null });

  return {
    navigate, navigateSettings, notifyResult, clearResult, syncHistory, setActivity, applyMotion, applyDensity,
    get screen() { return current; },
    get settingsPage() { return settingsPage; },
    get isMobile() { return mobile; },
    destroy() {
      disposed = true;
      navigationRevision += 1;
      cancelAnimationFrame(navigationFrame);
      clearTimeout(entryTimer);
      clearTimeout(resultTimer);
      for (const remove of removers) remove();
      try { window.history.scrollRestoration = originalScrollRestoration; } catch { /* Optional. */ }
    },
  };
}
