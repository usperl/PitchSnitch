// Config screen: fills the static form in index.html from the config and reports changes.
import { DURATION_IDS, TIME_SIGNATURE_IDS, TEMPI, TRANSPOSITIONS, CONCERT_A_VALUES, transpositionById } from '../core/music.js';
import { KEY_FIFTHS, keyLabel, soundingFifths, scaleSpellings } from '../core/keys.js';
import { validate, selectedSpellings, LANGUAGES, CLEF_IDS, COUNTDOWN_VALUES } from '../core/config.js';
import { parseSpellingId, spellingId, isRareSpelling } from '../core/pitch.js';
import { INSTRUMENTS, CUSTOM, offeredSpellings, selectionById } from '../core/instruments.js';
import { t, translateDom } from '../i18n/i18n.js';
import { renderNoteGrid } from './note-grid.js';
import { drawNoteList } from '../render/vexflow-adapter.js';
import * as storage from './storage.js';
import { isPortraitPhone } from '../render/paging.js';

const $ = (id) => document.getElementById(id);

function fillSelect(sel, options, value) {
  sel.innerHTML = '';
  for (const { value: v, label } of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = String(value);
}

function fillInstrumentSelect(sel, value) {
  sel.innerHTML = '';
  const custom = document.createElement('option');
  custom.value = CUSTOM;
  custom.textContent = t('instrument.custom');
  sel.appendChild(custom);
  for (const inst of INSTRUMENTS) {
    const group = document.createElement('optgroup');
    group.label = t(`instrument.${inst.id}`);
    for (const n of inst.notations) {
      const o = document.createElement('option');
      o.value = `${inst.id}.${n.id}`;
      o.textContent = `${t(`instrument.${inst.id}`)} – ${t(`notation.${n.id}`)}`;
      group.appendChild(o);
    }
    sel.appendChild(group);
  }
  sel.value = value;
}

/** Register checkboxes of the selected instrument (at least one stays checked). */
function renderRegisters(cfg, update) {
  const sel = selectionById(cfg.instrument);
  $('registers-box').hidden = !sel;
  const box = $('registers');
  box.innerHTML = '';
  if (!sel) return;
  for (const r of sel.instrument.registers) {
    const label = document.createElement('label');
    label.className = 'check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = cfg.registers.includes(r.id);
    cb.dataset.key = `register-${r.id}`;
    cb.addEventListener('change', () => {
      const set = new Set(cfg.registers);
      if (cb.checked) set.add(r.id); else if (set.size > 1) set.delete(r.id); else { cb.checked = true; return; }
      update({ registers: sel.instrument.registers.map((x) => x.id).filter((id) => set.has(id)) });
    });
    label.append(cb, ' ', registerLabel(sel.instrument.id, r.id));
    box.appendChild(label);
  }
}

export const registerLabel = (instId, regId) => t(`register.${instId}.${regId}`, {}, `register.${regId}`);

export function issueText(issue, cfg) {
  switch (issue.code) {
    case 'cannotFillBar': return t('issue.cannotFillBar', { ts: cfg.timeSignature });
    case 'noteTooShort': return t('issue.noteTooShort', { duration: t(`duration.${issue.params.duration}`), ms: issue.params.ms });
    default: return t(`issue.${issue.code}`);
  }
}

/**
 * @param {object} p
 * @param {() => object} p.getConfig
 * @param {(patch: object) => void} p.update  merges the patch into the config and re-renders
 * @param {() => void} p.onStart
 * @param {(cfg: object, replaced: string[]) => void} p.onLoaded
 */
export function initConfigScreen({ getConfig, update, onStart, onLoaded }) {
  const status = (msg) => { $('storage-status').textContent = msg; };

  $('language').addEventListener('change', (e) => update({ language: e.target.value }));
  $('clef').addEventListener('change', (e) => update({ clef: e.target.value }));
  $('instrument').addEventListener('change', (e) => update({ instrument: e.target.value }));
  $('showRareSpellings').addEventListener('change', (e) => update({ showRareSpellings: e.target.checked }));
  $('concertA').addEventListener('change', (e) => update({ concertA: Number(e.target.value) }));
  $('transposition').addEventListener('change', (e) => update({ transposition: e.target.value }));
  $('keySignature').addEventListener('change', (e) => update({ keySignature: Number(e.target.value) }));

  /** Scale button: adds the scale notes within the offered range; switches rare spellings on if needed. */
  function addScale(scaleId) {
    const cfg = getConfig();
    const withRare = offeredSpellings({ ...cfg, showRareSpellings: true });
    const ids = scaleSpellings(cfg.keySignature, scaleId).map(spellingId).filter((id) => withRare.ids.has(id));
    const needRare = !cfg.showRareSpellings && ids.some((id) => isRareSpelling(parseSpellingId(id)));
    const notes = [...new Set([...cfg.notes, ...ids])];
    update(needRare ? { notes, showRareSpellings: true } : { notes }, needRare ? { rareAuto: true } : {});
  }
  $('allowSyncopation').addEventListener('change', (e) => update({ allowSyncopation: e.target.checked }));
  $('timeSignature').addEventListener('change', (e) => update({ timeSignature: e.target.value }));
  $('tempo').addEventListener('change', (e) => update({ tempo: e.target.value }));
  $('countdown').addEventListener('change', (e) => update({ countdown: Number(e.target.value) }));
  $('bars').addEventListener('input', (e) => update({ bars: e.target.value }, { keepBarsInput: true }));
  $('start').addEventListener('click', () => { if (!validate(getConfig()).length) onStart(); });

  $('btn-save').addEventListener('click', () => {
    try { storage.save(getConfig()); status(t('storage.saved')); } catch { status(t('storage.unavailable')); }
    render();
  });
  /** Loads the saved configuration (button "Laden", URL parameter autoload). Returns false if none could be loaded. */
  function load() {
    const res = storage.load();
    if (!res) return false;
    onLoaded(res.config, res.replaced);
    status(res.replaced.length ? t('storage.loadedReplaced', { fields: res.replaced.map((f) => (f === '*' ? '–' : t(`field.${f}`))).join(', ') }) : t('storage.loaded'));
    return !res.replaced.includes('*');
  }
  $('btn-load').addEventListener('click', load);
  $('btn-delete').addEventListener('click', () => { storage.remove(); status(t('storage.deleted')); render(); });

  let previewWidth = 0;
  new ResizeObserver(() => {
    const w = $('note-preview').clientWidth;
    if (Math.abs(w - previewWidth) > 20) { previewWidth = w; renderPreview(); }
  }).observe($('note-preview'));

  function renderPreview() {
    const cfg = getConfig();
    const spellings = selectedSpellings(cfg);
    $('note-preview-empty').hidden = spellings.length > 0;
    drawNoteList($('note-preview-staff'), spellings, cfg.clef, Math.max(200, $('note-preview').clientWidth), cfg.keySignature);
  }

  let rareHint = false; // "rare spellings were switched on automatically" stays until the next instrument change or filter toggle

  function render({ keepBarsInput = false, rareAuto } = {}) {
    if (rareAuto !== undefined) rareHint = rareAuto;
    $('rare-hint').hidden = !rareHint;
    const cfg = getConfig();
    // keep keyboard focus across re-render (grid cells and register checkboxes are rebuilt)
    const focusKey = document.activeElement?.dataset?.key;
    const focusInRegisters = focusKey?.startsWith('register-');
    translateDom();
    document.title = `${t('appTitle')} – ${t('appSubtitle')}`;
    fillSelect($('language'), LANGUAGES.map((l) => ({ value: l, label: t(`lang.${l}`) })), cfg.language);
    fillSelect($('clef'), CLEF_IDS.map((c) => ({ value: c, label: t(`clef.${c}`) })), cfg.clef);
    fillSelect($('concertA'), CONCERT_A_VALUES.map((v) => ({ value: v, label: `${v} Hz` })), cfg.concertA);
    fillSelect($('transposition'), TRANSPOSITIONS.map((tr) => ({ value: tr.id, label: t(`transposition.${tr.id}`) })), cfg.transposition);
    const tr = transpositionById(cfg.transposition);
    fillSelect($('keySignature'), KEY_FIFTHS.map((f) => {
      let label = keyLabel(f, cfg.language);
      if (tr && tr.semitones !== 0) label += ` – ${t('key.sounds')} ${keyLabel(soundingFifths(f, tr.steps, tr.semitones), cfg.language, false)}`;
      return { value: f, label };
    }), cfg.keySignature);
    fillSelect($('timeSignature'), TIME_SIGNATURE_IDS.map((v) => ({ value: v, label: v })), cfg.timeSignature);
    fillSelect($('tempo'), TEMPI.map((tp) => ({ value: tp.id, label: t('tempo.option', { name: tp.name, bpm: tp.bpm, character: t(`tempo.${tp.id}`) }) })), cfg.tempo);
    fillSelect($('countdown'), COUNTDOWN_VALUES.map((v) => ({ value: v, label: t('countdown.option', { n: v }) })), cfg.countdown);
    $('allowSyncopation').checked = cfg.allowSyncopation;
    $('showRareSpellings').checked = cfg.showRareSpellings;
    fillInstrumentSelect($('instrument'), cfg.instrument);
    const fixed = cfg.instrument !== CUSTOM;
    $('clef').disabled = fixed;
    $('transposition').disabled = fixed;
    $('instrument-hint').textContent = t(fixed ? 'field.instrument.hintFixed' : 'field.instrument.hintCustom');
    renderRegisters(cfg, update);
    if (!keepBarsInput) $('bars').value = String(cfg.bars);

    // note values
    const durBox = $('durations');
    durBox.innerHTML = '';
    for (const id of DURATION_IDS) {
      const label = document.createElement('label');
      label.className = 'check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = cfg.durations.includes(id);
      cb.addEventListener('change', () => {
        const set = new Set(getConfig().durations);
        if (cb.checked) set.add(id); else set.delete(id);
        update({ durations: DURATION_IDS.filter((d) => set.has(d)) });
      });
      label.append(cb, ' ', t(`duration.${id}`));
      durBox.appendChild(label);
    }

    // pitch grid (keep keyboard focus across re-render)
    const offered = offeredSpellings(cfg);
    $('filter-hint').hidden = !offered.clipped;
    $('filter-hint').textContent = offered.clipped ? t(offered.positions.length ? 'filter.clipped' : 'filter.nothing') : '';
    renderNoteGrid($('note-grid'), cfg, offered, (ids, select) => {
      const set = new Set(getConfig().notes);
      for (const id of ids) { if (select) set.add(id); else set.delete(id); }
      update({ notes: [...set].map(parseSpellingId).filter(Boolean).map(spellingId) });
    }, addScale);
    if (focusKey) (focusInRegisters ? $('registers') : $('note-grid')).querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
    renderPreview();

    // validation
    const issues = validate(cfg);
    // not a config problem, but tests need landscape on small devices
    if (isPortraitPhone(window.innerWidth, window.innerHeight)) issues.push({ code: 'portrait', field: null });
    const barsIssue = issues.find((i) => i.code === 'barsInvalid');
    $('bars-error').textContent = barsIssue ? t('issue.barsInvalid') : '';
    $('bars').setAttribute('aria-invalid', String(!!barsIssue));
    const list = $('issues');
    list.innerHTML = '';
    for (const issue of issues) {
      const li = document.createElement('li');
      li.textContent = issueText(issue, cfg);
      list.appendChild(li);
    }
    $('issues-box').hidden = issues.length === 0;
    $('start').disabled = issues.length > 0;

    const saved = storage.hasSaved();
    $('btn-load').disabled = !saved;
    $('btn-delete').disabled = !saved;
    $('btn-save').disabled = !storage.storageAvailable();
  }

  return { render, load };
}
