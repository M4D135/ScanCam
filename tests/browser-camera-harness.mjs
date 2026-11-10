/**
 * Development-only browser camera simulation.
 * Run after `npm run build`: node tests/browser-camera-harness.mjs
 * Open dist/camera-check.html through the managed local preview.
 * This generator never changes the source reader, its build, or production ZIP.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'dist/ScanCam.html');
const html = await readFile(sourcePath, 'utf8');
const sha256 = createHash('sha256').update(html).digest('hex');
const assets = Object.fromEntries(await Promise.all([
  ['qr', 'qr-demo.png'], ['datamatrix', 'datamatrix-demo.png'], ['pale', 'data-matrix-pale.png'],
].map(async ([name, file]) => [name, `data:image/png;base64,${(await readFile(join(root, 'examples', file))).toString('base64')}`])));

function installCameraHarness(assets, buildSha256) {
  'use strict';
  const width = 1920;
  const height = 1080;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const context = source.getContext('2d');
  const tracks = new Set();
  const properties = new WeakMap();
  const images = {};
  let scene = 'qr';
  let nextTorchMode = 'supported';
  let opens = 0;
  let stops = 0;
  let applications = 0;
  let frameNumber = 0;
  let drawTimer = null;
  let installError = '';
  const media = new EventTarget();

  const ready = Promise.all(Object.entries(assets).map(([name, url]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images[name] = image; resolve(); };
    image.onerror = () => reject(new Error(`Image fictive illisible : ${name}`));
    image.src = url;
  })));
  // Keep an image-loading rejection observed even when no camera is opened.
  ready.catch((error) => { installError = error.message; updateStatus(); });

  function updateStatus() {
    const current = [...tracks].at(-1);
    const settings = current && properties.get(current);
    const values = {
      qaOpenCount: opens, qaActiveCount: tracks.size, qaStopCount: stops,
      qaConstraintCount: applications, qaTorchValue: settings?.mode === 'unsupported' ? 'indisponible' : settings ? String(settings.torch) : '—',
      qaZoomValue: settings?.zoom ?? '—', qaBrightnessValue: settings?.brightness ?? '—',
      qaTrackMode: settings?.mode || '—', qaLastError: installError || 'Aucune',
    };
    for (const [id, value] of Object.entries(values)) {
      const output = document.getElementById(id);
      if (output) output.textContent = String(value);
    }
  }

  function drawImage(name, x, y, sizeX, sizeY = sizeX) {
    if (images[name]) context.drawImage(images[name], x, y, sizeX, sizeY);
  }

  function draw() {
    const lit = [...tracks].some((track) => properties.get(track)?.torch);
    const settings = properties.get([...tracks].at(-1));
    const zoom = settings?.zoom || 1;
    const brightness = settings?.brightness || 0;
    context.fillStyle = lit ? '#fff' : '#e1e7ed';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    context.save();
    context.translate(width / 2, height / 2);
    context.scale(zoom, zoom);
    context.translate(-width / 2, -height / 2);
    if (scene === 'qr') drawImage('qr', 696, 276, 528);
    else if (scene === 'datamatrix') drawImage('datamatrix', 720, 300, 480);
    else if (scene === 'pale') drawImage('pale', 480, 180, 960, 720);
    else if (scene === 'two') {
      drawImage('qr', 762, 342, 396);
      drawImage('datamatrix', 290, 380, 320);
    } else if (scene === 'outside') {
      // Entire code ends at x = 184, outside the central crop's x = 230.
      drawImage('datamatrix', 8, 452, 176);
    }
    context.restore();
    if (brightness) {
      context.fillStyle = `rgba(${brightness > 0 ? '255,255,255' : '0,0,0'},${Math.abs(brightness) * 0.12})`;
      context.fillRect(0, 0, width, height);
    }
    context.fillStyle = '#294052';
    context.font = '24px system-ui';
    context.fillText(`SIMULATION · ${scene} · lampe ${lit ? 'allumée' : 'éteinte'} · zoom ×${zoom} · luminosité ${brightness}`, 28, height - 42);
    context.fillText(String(++frameNumber), width - 110, height - 42);
  }

  function stopDrawingIfIdle() {
    if (!tracks.size && drawTimer !== null) {
      clearInterval(drawTimer);
      drawTimer = null;
    }
  }

  const clone = (value) => JSON.parse(JSON.stringify(value || {}));
  async function getUserMedia(request = {}) {
    if (installError) throw new DOMException(installError, 'NotReadableError');
    if (!request.video || request.audio) throw new DOMException('Le banc simule uniquement une piste vidéo.', 'NotSupportedError');
    await ready;
    draw();
    if (typeof source.captureStream !== 'function') throw new DOMException('canvas.captureStream indisponible.', 'NotSupportedError');
    const stream = source.captureStream(15);
    const track = stream.getVideoTracks()[0];
    const nativeStop = track.stop.bind(track);
    const state = { mode: nextTorchMode, torch: false, zoom: 1, brightness: 0, constraints: clone(typeof request.video === 'object' ? request.video : {}) };
    properties.set(track, state);
    tracks.add(track);
    opens += 1;
    Object.defineProperties(track, {
      label: { configurable: true, value: 'Caméra simulée' },
      getCapabilities: { configurable: true, value: () => ({
        width: { min: width, max: width }, height: { min: height, max: height },
        frameRate: { min: 15, max: 15 }, facingMode: ['environment'], deviceId: 'scancam-synthetic-camera',
        zoom: { min: 1, max: 4, step: 0.5 }, brightness: { min: -2, max: 2, step: 0.5 },
        ...(state.mode === 'unsupported' ? {} : { torch: [false, true] }),
      }) },
      getSettings: { configurable: true, value: () => ({
        width, height, frameRate: 15, aspectRatio: width / height, facingMode: 'environment', deviceId: 'scancam-synthetic-camera',
        zoom: state.zoom, brightness: state.brightness,
        ...(state.mode === 'unsupported' ? {} : { torch: state.torch }),
      }) },
      getConstraints: { configurable: true, value: () => clone(state.constraints) },
      applyConstraints: { configurable: true, value: async (constraints = {}) => {
        applications += 1;
        const requested = { ...constraints };
        for (const item of constraints.advanced || []) Object.assign(requested, item);
        const rangeValues = {};
        for (const [key, min, max] of [['zoom', 1, 4], ['brightness', -2, 2]]) {
          if (requested[key] === undefined) continue;
          const value = typeof requested[key] === 'object' ? requested[key]?.exact ?? requested[key]?.ideal : requested[key];
          if (!Number.isFinite(value) || value < min || value > max || !Number.isInteger((value - min) / 0.5)) {
            updateStatus();
            throw new DOMException(`${key} hors des valeurs simulées.`, 'OverconstrainedError');
          }
          rangeValues[key] = value;
        }
        const torch = requested.torch;
        if (typeof torch === 'boolean') {
          if (state.mode === 'refused' || state.mode === 'unsupported') {
            updateStatus();
            throw new DOMException('Commande lampe refusée par la caméra simulée.', 'NotSupportedError');
          }
          if (state.mode !== 'ignored') state.torch = torch;
        }
        Object.assign(state, rangeValues);
        state.constraints = clone(constraints);
        draw();
        updateStatus();
      } },
      stop: { configurable: true, value: () => {
        if (tracks.delete(track)) stops += 1;
        state.torch = false;
        nativeStop();
        stopDrawingIfIdle();
        updateStatus();
      } },
    });
    if (drawTimer === null) drawTimer = setInterval(draw, 1000 / 15);
    updateStatus();
    return stream;
  }

  Object.assign(media, {
    getUserMedia,
    enumerateDevices: async () => [{
      kind: 'videoinput', deviceId: 'scancam-synthetic-camera', groupId: 'scancam-synthetic', label: 'Caméra simulée',
    }],
    getSupportedConstraints: () => ({ width: true, height: true, frameRate: true, facingMode: true, deviceId: true, torch: true, zoom: true, brightness: true }),
  });
  try {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
  } catch (error) {
    installError = `Simulation non installée : ${error.message}`;
    // Fail closed: this diagnostic page must never open a physical webcam.
    document.addEventListener('click', (event) => {
      if (event.target.closest?.('#startCamera, [data-action="start-camera"]')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
  }

  function addPanel() {
    const panel = document.createElement('details');
    panel.id = 'qaPanel';
    panel.innerHTML = `
      <summary>TEST · caméra simulée</summary>
      <div class="qa-content">
        <p><strong>Banc de test local.</strong> Images fictives transmises au véritable décodeur. Lampe, zoom et luminosité simulés ; aucune webcam physique.</p>
        <label for="qaScene">Scène vidéo</label>
        <select id="qaScene">
          <option value="qr">QR centré</option><option value="datamatrix">Data Matrix centré</option>
          <option value="pale">Data Matrix pâle</option><option value="two">Deux codes · QR au centre</option>
          <option value="outside">Data Matrix hors du viseur</option><option value="blank">Sans code</option>
        </select>
        <label for="qaTorchMode">Lampe au prochain démarrage</label>
        <select id="qaTorchMode">
          <option value="supported">Disponible</option><option value="unsupported">Indisponible</option>
          <option value="refused">Commande refusée</option><option value="ignored">Commande ignorée</option>
        </select>
        <button id="qaDisconnect" type="button">Simuler une déconnexion</button>
        <div id="qaStatus" role="status" aria-label="État de la caméra simulée">
          <dl><dt>Ouvertures</dt><dd id="qaOpenCount">0</dd><dt>Pistes actives</dt><dd id="qaActiveCount">0</dd>
          <dt>Arrêts</dt><dd id="qaStopCount">0</dd><dt>Commandes</dt><dd id="qaConstraintCount">0</dd>
          <dt>Lampe</dt><dd id="qaTorchValue">—</dd><dt>Profil actif</dt><dd id="qaTrackMode">—</dd>
          <dt>Zoom simulé</dt><dd id="qaZoomValue">—</dd><dt>Luminosité simulée</dt><dd id="qaBrightnessValue">—</dd>
          <dt>Erreur du banc</dt><dd id="qaLastError">Aucune</dd></dl>
        </div>
        <small id="qaBuild"></small>
      </div>`;
    document.body.append(panel);
    document.getElementById('qaBuild').textContent = `HTML compilé · SHA-256 ${buildSha256}`;
    document.getElementById('qaScene').addEventListener('change', (event) => { scene = event.target.value; draw(); });
    document.getElementById('qaTorchMode').addEventListener('change', (event) => { nextTorchMode = event.target.value; });
    document.getElementById('qaDisconnect').addEventListener('click', () => {
      for (const track of [...tracks]) {
        track.stop();
        track.dispatchEvent(new Event('ended'));
      }
      updateStatus();
    });
    updateStatus();
    void ready.then(draw, () => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addPanel, { once: true });
  else addPanel();
  window.addEventListener('pagehide', () => { for (const track of [...tracks]) track.stop(); });
}

const script = `(${installCameraHarness.toString()})(${JSON.stringify(assets)},${JSON.stringify(sha256)});`;
new vm.Script(script, { filename: 'camera-harness-inline.js' });
const style = `
#qaPanel{position:fixed;z-index:100000;right:8px;top:8px;width:min(292px,calc(100vw - 16px));box-sizing:border-box;font:12px/1.45 system-ui;color:#14231a;background:#f4fff7;border:2px solid #3c8854;border-radius:10px;box-shadow:0 4px 18px #0005}
#qaPanel:not([open]){width:auto}
#qaPanel>summary{padding:9px 12px;cursor:pointer;font-weight:750;min-height:36px;box-sizing:border-box;touch-action:manipulation}
#qaPanel .qa-content{padding:0 12px 12px;max-height:calc(100dvh - 70px);overflow:auto;overscroll-behavior:contain;touch-action:pan-y}
#qaPanel p{margin:5px 0 10px;color:inherit;font:inherit}
#qaPanel label{display:block;font-weight:700;margin-top:8px;color:inherit;font:inherit}
#qaPanel select,#qaPanel button{display:block;width:100%;min-height:40px;height:auto;padding:7px;margin:4px 0 8px;border:1px solid #9db9a5;border-radius:6px;background:#fff;color:#14231a;font:13px system-ui;box-sizing:border-box}
#qaPanel dl{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;margin:10px 0}
#qaPanel dd,#qaPanel dt{margin:0;font:inherit;overflow-wrap:anywhere}
#qaPanel dd{font-weight:700}
#qaPanel small{display:block;font:10px/1.4 ui-monospace,monospace;overflow-wrap:anywhere;color:#476650}
`;
if (html.split('</head>').length !== 2) throw new Error('HTML compilé non reconnu.');
const injection = `<style id="qa-camera-style">${style}</style><script>${script.replace(/<\/script/gi, '<\\/script')}</script>`;
const generated = html.replace('</head>', () => `${injection}\n</head>`);
const output = join(root, 'dist/camera-check.html');
await writeFile(output, generated, 'utf8');
console.log(`Generated ${output}`);
console.log(`Original compiled reader SHA-256 ${sha256}; ${Buffer.byteLength(generated)} bytes; simulation script syntax checked.`);
