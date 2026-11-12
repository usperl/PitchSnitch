// Test screen: draws the exercise, runs countdown → count-in → notes on the audio clock,
// moves the arrow, turns pages, evaluates and draws results.
import { TIME_SIGNATURES, tempoById, transpositionById } from '../core/music.js';
import { buildTimeline, itemIndexAt } from '../core/timeline.js';
import { flatEvents } from '../core/generator.js';
import { evaluateFrames, spellNear } from '../core/evaluation.js';
import { resultAccidental } from '../core/accidentals.js';
import { midiOf } from '../core/pitch.js';
import { ScoreView } from '../render/vexflow-adapter.js';
import { displayMode, halfPageSlots, pageForEvent } from '../render/paging.js';
import { AudioClock } from '../audio/clock.js';
import { MicInput, micErrorKind, FRAME_SIZE } from '../audio/mic.js';
import { createDetector } from '../audio/detector.js';
import { FrameStore, frameCenterTime, evaluationDelay } from '../audio/frames.js';
import { frequencyToWritten } from '../core/evaluation.js';
import { t } from '../i18n/i18n.js';

const $ = (id) => document.getElementById(id);

export class TestRunner {
  /**
   * @param {object} p
   * @param {(phase:string) => void} p.onPhase  'requestingMic'|'countdown'|'countIn'|'running'
   * @param {(reason:string, detail?:string) => void} p.onStopped  detail: mic error kind for reason 'micError'
   * @param {(event, item) => object[] | null} [p.framesFor] simulated detector (dev); null → microphone
   */
  constructor({ onPhase, onStopped, framesFor = null }) {
    this.viewport = $('score-viewport');
    this.sheet = $('score-sheet');
    this.overlay = $('score-overlay');
    this.rotateHint = $('rotate-hint');
    this.view = new ScoreView(this.sheet);
    this.onPhase = onPhase;
    this.onStopped = onStopped;
    this.framesFor = framesFor;
    this.store = new FrameStore();
    this.results = new Map();
    this.raf = 0;
    this.running = false;
    this.currentLine = 0;
    this.showAll = false; // result view after stopping: all lines stacked and scrollable
  }

  /** Draws an exercise (new or repeated); clears results. */
  prepare(exercise, cfg) {
    this.exercise = exercise;
    this.cfg = cfg;
    this.ts = TIME_SIGNATURES[cfg.timeSignature];
    this.tempo = tempoById(cfg.tempo);
    this.timeline = buildTimeline(exercise, this.ts, this.tempo.bpm);
    this.events = flatEvents(exercise);
    this.results.clear();
    this.evaluated = 0;
    this.currentLine = 0;
    this.showAll = false;
    this.draw();
  }

  /** Lays out and draws for the current window size; decides the display mode. */
  draw() {
    const tr = transpositionById(this.cfg.transposition);
    const drawAt = (width, overlap) => this.view.draw({
      exercise: this.exercise,
      clef: this.cfg.clef,
      timeSignatureId: this.cfg.timeSignature,
      width,
      overlap,
      tempo: { name: this.tempo.name, bpm: this.tempo.bpm },
      transpositionLabel: tr && tr.id !== 'none' ? t(`transposition.short.${tr.id}`) : null,
      rareSpellings: this.cfg.showRareSpellings,
    });
    const width = this.viewport.clientWidth || window.innerWidth;
    let layout = drawAt(width, false);
    const available = Math.max(120, window.innerHeight - this.viewport.getBoundingClientRect().top - 12);
    this.mode = displayMode({ width: window.innerWidth, height: window.innerHeight }, available, layout.lineBox);
    if (this.mode.kind === 'single') layout = drawAt(width / this.mode.scale, true);
    this.layout = layout;
    this.viewport.dataset.mode = this.mode.kind;
    this.rotateHint.hidden = this.mode.kind !== 'portrait';
    this.sheet.hidden = this.mode.kind === 'portrait';
    for (const [id, r] of this.results) this.view.showResult(id, r);
    this.arrange();
  }

  /** Re-layout after resize/orientation change; keeps results and running state. */
  relayout() {
    if (!this.exercise) return;
    this.draw();
  }

  get isPortrait() { return this.mode?.kind === 'portrait'; }

  /**
   * Places the line boxes: while running (or before start) as pages, otherwise all lines
   * stacked and freely scrollable (result view).
   */
  arrange() {
    if (!this.layout || this.mode.kind === 'portrait') return;
    const box = this.layout.lineBox;
    const scale = this.mode.scale;
    const els = this.view.lineEls;
    this.sheet.style.transform = scale === 1 ? '' : `scale(${scale})`;
    this.sheet.style.width = scale === 1 ? '' : `${100 / scale}%`;
    this.viewport.classList.toggle('manual', this.showAll);
    if (this.showAll) {
      els.forEach((el, i) => { el.hidden = false; el.style.top = `${i * box}px`; });
      this.sheet.style.height = `${els.length * box}px`;
      this.viewport.style.height = `${(this.mode.kind === 'multi' ? this.mode.slots : 1) * box * scale}px`;
      return;
    }
    this.sheet.style.height = '';
    if (this.mode.kind === 'multi') {
      const slots = halfPageSlots(this.currentLine, this.mode.slots, els.length);
      els.forEach((el) => { el.hidden = true; });
      slots.forEach((line, s) => { if (line != null) { els[line].hidden = false; els[line].style.top = `${s * box}px`; } });
      this.viewport.style.height = `${this.mode.slots * box}px`;
    } else {
      els.forEach((el, i) => { el.hidden = i !== this.currentLine; el.style.top = '0px'; });
      this.viewport.style.height = `${box * scale}px`;
    }
  }

  /** Line (or page) to show for timeline item i. */
  lineForItem(i) {
    const idx = Math.min(Math.max(i, 0), this.events.length - 1);
    const copies = this.view.linesOf(this.events[idx].id);
    if (!copies.length) return 0;
    return this.mode.kind === 'single' ? pageForEvent(copies) : copies[0].line;
  }

  async start() {
    this.stopLoop();
    this.results.clear();
    this.evaluated = 0;
    this.currentLine = 0;
    this.showAll = false;
    this.running = true;
    this.draw();
    this.viewport.scrollTop = 0;
    this.onPhase('requestingMic');
    this.clock = new AudioClock();
    let audioRunning = await this.clock.start();
    if (!this.running) return;
    this.delay = 0;
    if (!this.framesFor) {
      // real detection: microphone before the countdown
      try {
        await this.startMic();
      } catch (err) {
        this.stop('micError', micErrorKind(err));
        return;
      }
      if (!this.running) return;
      // without a user gesture (URL parameter autostart) the audio clock may stay suspended
      if (!audioRunning) audioRunning = await this.waitForGesture();
      if (!this.running) return;
    }
    this.countInStart = this.clock.now() + (this.cfg.countdown ?? 10);
    this.phase = null;
    this.loop();
  }

  async startMic() {
    this.store.clear();
    this.mic = new MicInput();
    const tr = transpositionById(this.cfg.transposition)?.semitones ?? 0;
    const concertA = this.cfg.concertA;
    let detect = null, latency = 0;
    await this.mic.start(this.clock.ctx, (frame, endTime) => {
      if (this.countInStart == null) return; // before the countdown has been anchored
      detect ||= createDetector(FRAME_SIZE, this.mic.sampleRate);
      const freq = detect(frame);
      this.store.push({
        time: frameCenterTime(endTime, FRAME_SIZE, this.mic.sampleRate, latency) - this.countInStart,
        writtenMidi: freq ? frequencyToWritten(freq, concertA, tr).midi : null,
      });
    });
    latency = this.mic.inputLatency;
    this.delay = evaluationDelay(FRAME_SIZE, this.mic.sampleRate, latency);
  }

  /** Shows "tap to start" until a click or key press allows the audio clock to run. */
  waitForGesture() {
    this.showOverlay(t('test.tapToStart'), '', 'tap');
    return new Promise((resolve) => {
      const go = async () => {
        document.removeEventListener('pointerdown', go, true);
        document.removeEventListener('keydown', go, true);
        this.showOverlay(null);
        resolve(await this.clock.resume());
      };
      document.addEventListener('pointerdown', go, true);
      document.addEventListener('keydown', go, true);
    });
  }

  setPhase(p) {
    if (this.phase === p) return;
    this.phase = p;
    this.onPhase(p);
  }

  loop = () => {
    if (!this.running) return;
    const now = this.clock.now();
    const tl = this.timeline;
    const tRel = now - this.countInStart;
    if (tRel < 0) {
      this.setPhase('countdown');
      this.showOverlay(String(Math.ceil(-tRel)), t('test.countdown'));
    } else if (tRel < tl.countInDuration) {
      this.setPhase('countIn');
      this.showOverlay(String(Math.floor(tRel / tl.beatSeconds) + 1), '', 'count-in');
    } else {
      this.setPhase('running');
      this.showOverlay(null);
      // a note is evaluated once its frames have arrived (latency + half a frame)
      this.evaluateUpTo(tRel - this.delay);
      const i = itemIndexAt(tl, tRel);
      if (i >= 0 && i < this.events.length) {
        const line = this.lineForItem(i);
        if (line !== this.currentLine) { this.currentLine = line; this.arrange(); }
        this.view.showArrow(this.events[i].id, line);
      } else if (i >= this.events.length) this.view.showArrow(null);
      if (tRel >= tl.end + this.delay) {
        this.evaluateUpTo(Infinity);
        this.stop('completed');
        return;
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  evaluateUpTo(tRel) {
    const items = this.timeline.items;
    while (this.evaluated < items.length && items[this.evaluated].evalTo <= tRel) {
      const item = items[this.evaluated];
      const event = this.events[this.evaluated];
      this.evaluated++;
      const frames = this.framesFor ? this.framesFor(event, item) : this.store.between(item.evalFrom, item.evalTo);
      const r = evaluateFrames(midiOf(event.spelling), frames);
      const result = { outcome: r.outcome };
      if (r.outcome === 'wrong') {
        const played = spellNear(r.playedMidi, event.spelling);
        if (played) {
          const bar = this.exercise.measures[event.measure].events.map((e) => e.spelling);
          result.playedSpelling = played;
          result.accidental = resultAccidental(played, bar, this.exercise.measures[event.measure].events.indexOf(event), this.exercise.keyFifths ?? 0);
        }
      }
      this.results.set(event.id, result);
      this.view.showResult(event.id, result);
    }
  }

  showOverlay(big, small = '', cls = '') {
    if (big == null) { this.overlay.hidden = true; return; }
    this.overlay.hidden = false;
    this.overlay.className = `score-overlay ${cls}`;
    this.overlay.querySelector('.big').textContent = big;
    this.overlay.querySelector('.small').textContent = small;
  }

  stop(reason, detail) {
    if (!this.running) return;
    this.running = false;
    this.stopLoop();
    this.showOverlay(null);
    this.view.showArrow(null);
    this.mic?.stop();
    this.mic = null;
    this.countInStart = null;
    this.clock?.close();
    this.showAll = true;
    this.arrange();
    if (this.layout && !this.isPortrait) this.viewport.scrollTop = this.currentLine * this.layout.lineBox * this.mode.scale;
    this.onStopped(reason, detail);
  }

  stopLoop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
