// Exactly one saved configuration in localStorage, written only on explicit user action.
import { sanitize, toStored } from '../core/config.js';

export const STORAGE_KEY = 'pitchsnitch.config';

function store() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export const storageAvailable = () => store() !== null;

export function hasSaved() {
  try { return store()?.getItem(STORAGE_KEY) != null; } catch { return false; }
}

export function save(cfg) {
  store().setItem(STORAGE_KEY, JSON.stringify(toStored(cfg)));
}

/** @returns {{config:object, replaced:string[]} | null} */
export function load() {
  const raw = store()?.getItem(STORAGE_KEY);
  if (raw == null) return null;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* invalid → defaults */ }
  return sanitize(parsed);
}

export function remove() {
  store()?.removeItem(STORAGE_KEY);
}
