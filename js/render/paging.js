// Page turning instead of scrolling (test screen). Pure.

export const NARROW_WIDTH = 768;
export const MIN_SCALE = 0.75;

/** Small device held upright: tests are not possible (a bar does not reliably fit into a line). */
export const isPortraitPhone = (width, height) => width < NARROW_WIDTH && height > width;

/**
 * Display mode for the score area.
 * @param {{width:number, height:number}} viewport  window size (for the portrait check)
 * @param {number} availableHeight  height available for the score
 * @param {number} lineBox  height of one line box at scale 1
 * @returns {{kind:'portrait'} | {kind:'multi', slots:number, scale:1} | {kind:'single', slots:1, scale:number}}
 */
export function displayMode(viewport, availableHeight, lineBox) {
  if (isPortraitPhone(viewport.width, viewport.height)) return { kind: 'portrait' };
  const slots = Math.floor(availableHeight / lineBox);
  if (slots >= 2) return { kind: 'multi', slots, scale: 1 };
  return { kind: 'single', slots: 1, scale: Math.max(MIN_SCALE, Math.min(1, availableHeight / lineBox)) };
}

/**
 * Half-page turning: which line is shown in each slot while `current` is played.
 * The slots form a top half (ceil(n/2)) and a bottom half. When the first line of a half is reached,
 * the other half shows the lines that follow the current half. Lines beyond the end → null.
 * @returns {Array<number|null>} line index per slot
 */
export function halfPageSlots(current, slots, totalLines) {
  const top = Math.ceil(slots / 2);
  const line = Math.max(0, current);
  const slot = line % slots;
  const halfStart = slot < top ? 0 : top;
  const firstOfHalf = line - (slot - halfStart);
  const out = new Array(slots).fill(null);
  for (let k = 0; k < slots; k++) {
    const l = firstOfHalf + k;
    if (l < totalLines) out[l % slots] = l;
  }
  return out;
}

/**
 * Single-line pages with overlap: the page shown for an event is the LAST page containing it
 * (its bar is the first bar there), so the page turns as soon as the last bar of a page begins.
 * @param {Array<{line:number}>} copies positions of the event (one per page containing its bar)
 */
export const pageForEvent = (copies) => Math.max(...copies.map((c) => c.line));
