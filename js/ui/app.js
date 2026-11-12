// App state machine: Config ↔ Test{requestingMic, countdown, countIn, running} / stopped(reason).
import { defaultConfig, validate, selectedSpellings, normalize, changeInstrument } from '../core/config.js';
import { TIME_SIGNATURES } from '../core/music.js';
import { generateExercise, newSeed } from '../core/generator.js';
import { setLanguage, t, translateDom } from '../i18n/i18n.js';
import { fontsReady } from '../render/vexflow-adapter.js';
import { createSimulatedDetector } from '../audio/simulated-detector.js';
import { initConfigScreen } from './config-screen.js';
import { TestRunner } from './test-screen.js';
import { isPortraitPhone } from '../render/paging.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// URL parameters: autoload, autostart (implies autoload), simulate (development only)
const URL_FLAGS = {
  autoload: params.has('autoload') || params.has('autostart'),
  autostart: params.has('autostart'),
  simulate: params.has('simulate'),
};

let config = defaultConfig();
let state = 'config'; // config | requestingMic | countdown | countIn | running | stopped
let stopReason = null;
let stopDetail = null; // mic error kind
let exercise = null;
let wakeLock = null;

const inTest = () => ['requestingMic', 'countdown', 'countIn', 'running'].includes(state);

// ---- config screen ------------------------------------------------------------
const configScreen = initConfigScreen({
  getConfig: () => config,
  update: (patch, opts) => {
    if ('instrument' in patch) {
      // instrument change: keep playable notes, transposed to the new notation
      const { instrument, ...rest } = patch;
      config = changeInstrument({ ...config, ...rest }, instrument);
      opts = { ...opts, rareAuto: !!config.rareSpellingsEnabled };
    } else {
      config = { ...config, ...patch };
      if ('showRareSpellings' in patch) opts = { rareAuto: false, ...opts };
      // filters changed → fix registers and drop notes that are no longer offered (no transposition)
      if (['registers', 'clef', 'transposition', 'showRareSpellings'].some((k) => k in patch)) config = normalize(config);
    }
    if (patch.language) { setLanguage(config.language); checkSupport(); }
    configScreen.render(opts);
  },
  onStart: () => startFromConfig(),
  onLoaded: (cfg) => {
    config = cfg;
    setLanguage(config.language);
    checkSupport();
    configScreen.render();
  },
});

// ---- test runner ----------------------------------------------------------------
const runner = new TestRunner({
  onPhase: (phase) => setState(phase),
  onStopped: (reason, detail) => { stopReason = reason; stopDetail = detail; setState('stopped'); },
});

function makeExercise() {
  return generateExercise({
    notes: selectedSpellings(config),
    durations: config.durations,
    timeSignature: TIME_SIGNATURES[config.timeSignature],
    allowSyncopation: config.allowSyncopation,
    bars: Number(config.bars),
    keyFifths: config.keySignature,
    seed: newSeed(),
  });
}

function startRun(newExercise) {
  if (portrait()) return;
  if (newExercise || !exercise) exercise = makeExercise();
  runner.framesFor = URL_FLAGS.simulate ? createSimulatedDetector(exercise.seed) : null;
  runner.prepare(exercise, config);
  runner.start();
}

const portrait = () => isPortraitPhone(window.innerWidth, window.innerHeight);

function startFromConfig() {
  if (validate(config).length || portrait()) return;
  showScreen('test');
  history.pushState({ screen: 'test' }, '');
  startRun(true);
}

function toConfig() {
  if (inTest()) runner.stop('aborted');
  setState('config');
  showScreen('config');
  configScreen.render();
}

function showScreen(name) {
  $('config-screen').hidden = name !== 'config';
  $('test-screen').hidden = name !== 'test';
  window.scrollTo(0, 0);
}

function setState(s) {
  state = s;
  const testing = inTest();
  $('btn-abort').hidden = !testing;
  $('btn-repeat').hidden = s !== 'stopped';
  $('btn-new').hidden = s !== 'stopped';
  $('btn-repeat').disabled = portrait();
  $('btn-new').disabled = portrait();
  $('btn-to-config').hidden = s !== 'stopped';
  $('footer').hidden = testing;
  document.body.dataset.state = s;
  let status = s === 'stopped' ? t(`test.state.stopped.${stopReason}`) : testing ? t('test.state.running') : '';
  if (s === 'stopped' && stopReason === 'micError' && stopDetail) status += ' ' + t(`mic.${stopDetail}`);
  $('test-status').textContent = status;
  if (testing) acquireWakeLock(); else releaseWakeLock();
}

// ---- wake lock --------------------------------------------------------------------
async function acquireWakeLock() {
  if (wakeLock || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* not allowed or unsupported: ignore silently */ }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// ---- events -----------------------------------------------------------------------
$('btn-abort').addEventListener('click', () => runner.stop('aborted'));
$('btn-repeat').addEventListener('click', () => startRun(false));
$('btn-new').addEventListener('click', () => startRun(true));
$('btn-to-config').addEventListener('click', () => history.back());

window.addEventListener('popstate', () => {
  if (state !== 'config') toConfig();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && inTest()) runner.stop('hidden');
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state === 'config') { configScreen.render(); return; }
    runner.relayout();
    // turning a small device upright stops a running test
    if (inTest() && runner.isPortrait) runner.stop('portrait');
    setState(state);
  }, 150);
});

// ---- boot -------------------------------------------------------------------------
function checkSupport() {
  const missing = [];
  if (!(globalThis.AudioContext || globalThis.webkitAudioContext)) missing.push('Web Audio');
  if (!navigator.mediaDevices?.getUserMedia) missing.push(location.protocol === 'https:' || location.hostname === 'localhost' ? 'getUserMedia' : 'HTTPS');
  $('unsupported').hidden = missing.length === 0;
  $('unsupported').textContent = missing.length ? t('unsupported', { features: missing.join(', ') }) : '';
}

await fontsReady();
setLanguage(config.language);
translateDom();
configScreen.render();
checkSupport();
setState('config');
if (URL_FLAGS.autoload) {
  // same as the "Laden" button; autostart only if a startable configuration was loaded
  if (configScreen.load() && URL_FLAGS.autostart && !validate(config).length) startFromConfig();
}
document.body.classList.add('ready');
