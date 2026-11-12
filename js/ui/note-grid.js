// Pitch selection grid: rows = staff positions (high → low) that offer at least one spelling,
// columns = 𝄫 ♭ (none) ♯ 𝄪 (𝄫/𝄪 only with "rare spellings"), no header row/column. Quick selections act on offered spellings only.
import { ALTERS, fromStaffPosition, spellingId, isInsideStaff } from '../core/pitch.js';
import { noteShort, noteLabel } from '../core/names.js';
import { t } from '../i18n/i18n.js';
import { SCALE_IDS } from '../core/keys.js';

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} root
 * @param {{clef:string, language:string, notes:string[], showRareSpellings:boolean}} cfg
 * @param {{positions:Array<{pos:number, spellings:Array, registers:Array}>, registerOrder:string[]}} offered  from offeredSpellings(cfg)
 * @param {(ids:string[], select:boolean) => void} onChange
 * @param {(scaleId:string) => void} onScale  adds the notes of a scale of the selected key
 */
export function renderNoteGrid(root, cfg, offered, onChange, onScale) {
  const lang = cfg.language;
  const selected = new Set(cfg.notes);
  const columns = ALTERS.map((a, i) => ({ alter: a, index: i })).filter((c) => cfg.showRareSpellings || Math.abs(c.alter) < 2);
  const rowIds = (row) => row.spellings.filter(Boolean).map(spellingId);
  const allIds = offered.positions.flatMap(rowIds);

  root.innerHTML = '';
  const quick = el('div', { class: 'grid-quick' });
  const qb = (key, ids, select) => {
    const b = el('button', { type: 'button', class: 'btn-small', 'data-key': key }, t(key));
    b.disabled = ids.length === 0;
    b.addEventListener('click', () => onChange(ids, select));
    quick.appendChild(b);
  };
  qb('grid.all', allIds, true);
  qb('grid.none', allIds, false);
  for (const id of SCALE_IDS) {
    const b = el('button', { type: 'button', class: 'btn-small btn-scale', 'data-key': `scale-${id}` }, t(`scale.${id}`));
    b.disabled = allIds.length === 0;
    b.addEventListener('click', () => onScale(id));
    quick.appendChild(b);
  }
  quick.appendChild(el('span', { class: 'grid-count', 'aria-live': 'polite' }, t('grid.count', { n: allIds.filter((id) => selected.has(id)).length })));
  root.appendChild(quick);
  if (!offered.positions.length) return;

  // no row/column toggles: notes are learned one by one; cells carry their own names
  const table = el('table', { class: `note-grid cols-${columns.length}` });

  // registers: cells tinted per register, a caption row where the set of registers changes
  const instId = String(cfg.instrument).split('.')[0];
  const regName = (id) => t(`register.${instId}.${id}`, {}, `register.${id}`);
  const regIndex = (id) => offered.registerOrder.indexOf(id);
  let prevKey = null;

  const tbody = el('tbody');
  for (const row of offered.positions) {
    if (offered.registerOrder.length) {
      const regs = offered.registerOrder.filter((id) => row.registers.includes(id));
      const key = regs.join('|');
      if (key !== prevKey) {
        const cap = el('tr', { class: 'reg-caption' });
        cap.appendChild(el('th', { colspan: String(columns.length), scope: 'colgroup' }, regs.map(regName).join(' / ')));
        tbody.appendChild(cap);
        prevKey = key;
      }
    }
    const tr = el('tr');
    const natural = fromStaffPosition(row.pos, 0);
    if (isInsideStaff(natural, cfg.clef)) tr.className = 'in-staff';
    for (const c of columns) {
      const s = row.spellings[c.index];
      const td = el('td', s && offered.registerOrder.length ? { class: `reg-${regIndex(row.registers[c.index])}` } : {});
      if (s) {
        const id = spellingId(s);
        const b = el('button', { type: 'button', class: 'cell', 'aria-pressed': String(selected.has(id)), title: noteLabel(s, lang), 'aria-label': noteLabel(s, lang), 'data-key': id }, noteShort(s, lang));
        b.addEventListener('click', () => onChange([id], !selected.has(id)));
        td.appendChild(b);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  root.appendChild(table);
}
